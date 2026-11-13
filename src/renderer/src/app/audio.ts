import type { Cue } from './audioCues';

/** Spec Demo-ii section 5: the only file that touches AudioContext. Every call is guarded; with no AudioContext (tests, headless) both functions are no-ops. */
export const MASTER_GAIN = 0.25;

/** One tone: oscillator type, start/end frequency (a sweep when they differ), offset and duration in seconds, peak gain. */
interface Tone { type: OscillatorType; f0: number; f1: number; at: number; dur: number; gain: number }
const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain = 0.8): Tone => ({ type, f0, f1, at, dur, gain });

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

export function createAudio(): { play(cue: Cue): void; unlock(): void } {
  let ctx: AudioContext | null = null; let master: GainNode | null = null;
  try {
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (Ctor) { ctx = new Ctor(); master = ctx.createGain(); master.gain.value = MASTER_GAIN; master.connect(ctx.destination); }
  } catch { ctx = null; master = null; }
  if (!ctx || !master) return { play() { /* no audio */ }, unlock() { /* no audio */ } };
  const c = ctx, m = master;
  return {
    play(cue) {
      try {
        const t0 = c.currentTime;
        for (const t of CUES[cue]) {
          const osc = c.createOscillator(), g = c.createGain();
          osc.type = t.type; osc.frequency.setValueAtTime(t.f0, t0 + t.at);
          if (t.f1 !== t.f0) osc.frequency.linearRampToValueAtTime(t.f1, t0 + t.at + t.dur);
          g.gain.setValueAtTime(t.gain, t0 + t.at); g.gain.exponentialRampToValueAtTime(0.001, t0 + t.at + t.dur);   // fast decay, no click at the end
          osc.connect(g); g.connect(m); osc.start(t0 + t.at); osc.stop(t0 + t.at + t.dur + 0.02);
        }
      } catch { /* audio unavailable: never disturb the game */ }
    },
    unlock() {
      try { void c.resume().catch(() => { /* rejected resume: ignore */ }); } catch { /* ignore */ }
    }
  };
}
