import type { Cue } from '../events/audioCues';
import type { SoundSource } from '../render/assets';
import { CUE_RECIPES } from '../audio/cueRecipes';
import { sfxKeyOf, type SfxKey, type SoundRequest } from '../audio/soundBank';
import { admitVoice, createVoicePool, detuneCents, pickVariant } from '../audio/voices';

export type { SoundSource } from '../render/assets';

/** Spec Demo-ii section 5, Audio-i spec section 3: the only file that touches AudioContext. Every call is guarded; with no
 *  AudioContext (tests, headless) every function is a no-op. */
/** The synth tones' level inside the effects bus: the old MASTER_GAIN, so the fallback tones keep today's loudness. */
export const SYNTH_GAIN = 0.25;
/** The buses' mix under the player's volumes (tune by ear). */
export const MUSIC_LEVEL = 0.45, EFFECTS_LEVEL = 0.9;
/** The fade at the end of a cut (`dur`) voice, seconds. */
export const CUT_FADE_S = 0.03;

/** One tone: oscillator type, start/end frequency (a sweep when they differ), offset and duration in seconds, peak gain. */
interface Tone { type: OscillatorType; f0: number; f1: number; at: number; dur: number; gain: number }
const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain = 0.8): Tone => ({ type, f0, f1, at, dur, gain });

/** The synth fallback (Demo-ii): every cue's tones, played when its recipe is null or not decoded. */
const CUES: Record<Cue, Tone[]> = {
  alarm: [tone('square', 440, 440, 0, 0.09), tone('square', 660, 660, 0.12, 0.09)],
  impact: [tone('sawtooth', 110, 110, 0, 0.18, 1)],
  shot: [tone('square', 880, 880, 0, 0.06)],
  hit: [tone('triangle', 1320, 1320, 0, 0.05)],
  ready: [tone('sine', 523, 523, 0, 0.12), tone('sine', 784, 784, 0.12, 0.12)],
  jump: [tone('sine', 220, 880, 0, 0.4)],
  upgrade: [tone('triangle', 392, 392, 0, 0.08), tone('triangle', 587, 587, 0.09, 0.08), tone('triangle', 784, 784, 0.18, 0.12)],
  victory: [tone('sine', 523, 523, 0, 0.15), tone('sine', 659, 659, 0.15, 0.15), tone('sine', 784, 784, 0.3, 0.15)],
  defeat: [tone('sawtooth', 220, 110, 0, 0.6)],
  callout: [tone('triangle', 988, 988, 0, 0.05, 0.6), tone('triangle', 1319, 1319, 0.07, 0.07, 0.6)]
};

/** The three volumes, each 0 (off) to 1 (Audio-i spec section 6). */
export interface Volumes { master: number; music: number; effects: number }
/** What the views hand the audio (the duel scene, the sector session). */
export interface AudioOut {
  /** A cue: its sample recipe, or its synth tones when the recipe is null or not all decoded. */
  play(cue: Cue): void;
  /** Sample requests from a view's pure sound model. */
  sounds(list: readonly SoundRequest[]): void;
}
export interface Audio extends AudioOut {
  unlock(): void;
  suspend(): void;
  setVolumes(v: Volumes): void;
  /** Fetch and decode the audio entries in the background (spec section 2): the effects first, then the music. */
  load(sources: readonly SoundSource[], fetchBytes: (url: string) => Promise<ArrayBuffer>): Promise<void>;
}
export interface AudioOptions { context?: () => AudioContext | null; random?: () => number; log?: (m: string) => void }

function defaultContext(): AudioContext | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  return Ctor ? new Ctor() : null;
}
const level = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
const panOf = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

export function createAudio(options: AudioOptions = {}): Audio {
  const random = options.random ?? Math.random, log = options.log ?? ((m: string): void => console.info(m));
  let ctx: AudioContext | null = null;
  try { ctx = (options.context ?? defaultContext)(); } catch { ctx = null; }
  if (!ctx) return { play() {}, sounds() {}, unlock() {}, suspend() {}, setVolumes() {}, async load() {} };
  const c = ctx;
  const safe = (f: () => void): void => { try { f(); } catch { /* audio unavailable: never disturb the game */ } };

  // The buses (spec section 3): voice -> panner -> effects -> master -> destination; music -> music bus -> master.
  const master = c.createGain(), musicBus = c.createGain(), effects = c.createGain(), synthBus = c.createGain();
  master.connect(c.destination); musicBus.connect(master); effects.connect(master); synthBus.connect(effects);
  master.gain.value = 1; musicBus.gain.value = MUSIC_LEVEL; effects.gain.value = EFFECTS_LEVEL; synthBus.gain.value = SYNTH_GAIN;

  const buffers = new Map<SfxKey, AudioBuffer[]>(), tracks = new Map<string, AudioBuffer>();
  const pool = createVoicePool(), live = new Map<number, AudioBufferSourceNode>(), lastVariant = new Map<string, number>();

  function synth(cue: Cue, t0: number): void {
    for (const t of CUES[cue]) {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = t.type; osc.frequency.setValueAtTime(t.f0, t0 + t.at);
      if (t.f1 !== t.f0) osc.frequency.linearRampToValueAtTime(t.f1, t0 + t.at + t.dur);
      g.gain.setValueAtTime(t.gain, t0 + t.at); g.gain.exponentialRampToValueAtTime(0.001, t0 + t.at + t.dur);   // fast decay, no click at the end
      osc.connect(g); g.connect(synthBus); osc.start(t0 + t.at); osc.stop(t0 + t.at + t.dur + 0.02);
    }
  }

  /** One sample voice (spec section 3): variant rotation, detune, filter sweep, cut, pan, the per-key cap. */
  function playRequest(r: SoundRequest, t0: number): void {
    const list = buffers.get(r.key);
    if (!list || list.length === 0) return;
    const v = r.variant !== undefined ? Math.max(0, Math.min(r.variant, list.length - 1)) : pickVariant(lastVariant, r.key, list.length, random);
    const buf = list[v]!, rate = r.rate ?? 1, start = t0 + (r.at ?? 0);
    const len = Math.min(r.dur ?? Number.POSITIVE_INFINITY, buf.duration / rate), sweep = r.sweep ?? len;
    const { id, steal } = admitVoice(pool, r.key, start, start + len);
    for (const s of steal) { try { live.get(s)?.stop(); } catch { /* already stopped */ } live.delete(s); }
    const src = c.createBufferSource(); src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, start);
    if (r.rateTo !== undefined) src.playbackRate.linearRampToValueAtTime(r.rateTo, start + sweep);
    if (r.detune !== false) src.detune.value = detuneCents(random);
    let tail: AudioNode = src;
    if (r.filter) {
      const f = c.createBiquadFilter(); f.type = r.filter.type; f.frequency.setValueAtTime(r.filter.from, start);
      if (r.filter.to !== undefined) f.frequency.exponentialRampToValueAtTime(r.filter.to, start + sweep);
      if (r.filter.q !== undefined) f.Q.value = r.filter.q;
      tail.connect(f); tail = f;
    }
    const g = c.createGain(), peak = r.gain ?? 1;
    g.gain.setValueAtTime(peak, start);
    if (r.dur !== undefined) { g.gain.setValueAtTime(peak, Math.max(start, start + len - CUT_FADE_S)); g.gain.linearRampToValueAtTime(0, start + len); }
    const p = c.createStereoPanner(); p.pan.value = panOf(r.pan);
    tail.connect(g); g.connect(p); p.connect(effects);
    src.onended = () => { live.delete(id); };
    src.start(start); src.stop(start + len + 0.02);
    live.set(id, src);
  }

  return {
    play(cue) {
      safe(() => {
        const recipe = CUE_RECIPES[cue], t0 = c.currentTime;
        if (recipe && recipe.every((r) => (buffers.get(r.key)?.length ?? 0) > 0)) for (const r of recipe) playRequest(r, t0);
        else synth(cue, t0);
      });
    },
    sounds(list) { safe(() => { const t0 = c.currentTime; for (const r of list) playRequest(r, t0); }); },
    unlock() { safe(() => { void c.resume().catch(() => { /* rejected resume: ignore */ }); }); },
    suspend() { safe(() => { void c.suspend().catch(() => { /* rejected suspend: ignore */ }); }); },
    setVolumes(v) {
      safe(() => { master.gain.value = level(v.master); musicBus.gain.value = MUSIC_LEVEL * level(v.music); effects.gain.value = EFFECTS_LEVEL * level(v.effects); });
    },
    async load(sources, fetchBytes) {
      const decode = async (s: SoundSource): Promise<AudioBuffer | null> => {
        try { return await c.decodeAudioData(await fetchBytes(s.url)); }
        catch (err) { console.warn(`[audio] could not load ${s.url}`, err); return null; }
      };
      let ok = 0;
      const effectList = sources.filter((s) => !s.name.startsWith('music.')), trackList = sources.filter((s) => s.name.startsWith('music.'));
      const decoded = await Promise.all(effectList.map(decode));
      const staged = new Map<SfxKey, AudioBuffer[]>();
      effectList.forEach((s, k) => {
        const buf = decoded[k], id = sfxKeyOf(s.name);
        if (!buf || !id) return;
        ok++;
        const list = staged.get(id.key) ?? []; list[id.index] = buf; staged.set(id.key, list);
      });
      for (const [key, list] of staged) buffers.set(key, list.filter((b): b is AudioBuffer => !!b));   // a failed middle variant leaves no hole
      await Promise.all(trackList.map(async (s) => { const buf = await decode(s); if (buf) { ok++; tracks.set(s.name, buf); } }));
      log(`[audio] decoded ${ok}/${sources.length} files`);
    }
  };
}
