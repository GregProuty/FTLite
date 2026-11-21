import { Assets, Texture, Rectangle, BitmapFont, loadTextures } from 'pixi.js';
import { assetKind, parseManifest, type ManifestEntry } from './manifest';
import { isAudioName } from '../audio/soundBank';
import { ASSET_NAMES } from './assetNames';
import { sliceGrid } from './sheet';

export interface GameAnimation { textures: Texture[]; fps: number; loop: boolean }
export interface GameNineSlice { texture: Texture; left: number; top: number; right: number; bottom: number }
/** An audio entry's manifest name and absolute URL (Audio-i spec section 2). */
export interface SoundSource { name: string; url: string }
export interface GameAssets {
  has(name: string): boolean;
  texture(name: string): Texture;
  animation(name: string): GameAnimation;
  nineSlice(name: string): GameNineSlice;
  missing: string[];
  fontFamily: string;
  /** The audio entries, which app/audio.ts fetches and decodes in the background; loadAssets never loads them. */
  sounds?: readonly SoundSource[];
  /** UI round Part 3: a loaded named image's absolute URL and pixel size (the React windows draw it as an SVG image), or
   *  null when it did not load. Optional, so test fakes without it read as "no image". */
  image?(name: string): GameImage | null;
}
/** A named image as the React windows use it. */
export interface GameImage { url: string; w: number; h: number }

/** A required file could not be loaded: startup stops (spec §7). `files` lists every failed required file. */
export class AssetError extends Error {
  constructor(message: string, public readonly files: string[]) { super(message); this.name = 'AssetError'; }
}

export const FONT_FAMILY = 'm5x7';
const FONT_SIZE = 16;
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

async function loadImage(url: string): Promise<Texture> {
  const tex = await Assets.load<Texture>({ src: url, parser: 'loadTextures' });
  tex.source.scaleMode = 'nearest';
  return tex;
}

async function loadFont(url: string): Promise<void> {
  await Assets.load({ src: url, data: { family: FONT_FAMILY } });
  BitmapFont.install({ name: FONT_FAMILY, style: { fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, fill: 0xffffff }, chars: ASCII, resolution: 1, textureStyle: { scaleMode: 'nearest' } });
}

/** fetch() first; XMLHttpRequest if the packaged app's file:// origin refuses fetch (Chromium does, some Electron versions allow it). */
async function loadJson(url: string): Promise<unknown> {
  try { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); }
  catch (fetchErr) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('GET', url); xhr.responseType = 'text';
      xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); } };
      xhr.onerror = () => reject(new AssetError(`Cannot load ${url}: ${String(fetchErr)}`, [url]));
      xhr.send();
    });
  }
}

/** A file's bytes (Audio-i spec section 2): fetch() first, then XMLHttpRequest as an arraybuffer when the packaged app's
 *  file:// origin refuses fetch (a file:// XHR reports status 0 on success). */
export async function loadBytes(url: string): Promise<ArrayBuffer> {
  try { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`); return await res.arrayBuffer(); }
  catch (fetchErr) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('GET', url); xhr.responseType = 'arraybuffer';
      xhr.onload = () => { if ((xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) && xhr.response) resolve(xhr.response as ArrayBuffer); else reject(new Error(`Cannot load ${url}: HTTP ${xhr.status}`)); };
      xhr.onerror = () => reject(new Error(`Cannot load ${url}: ${String(fetchErr)}`));
      xhr.send();
    });
  }
}

/** Pixi's Assets.init, started once for the page (it warns when called twice). */
let assetsInit: Promise<void> | undefined;

export async function loadAssets(manifestUrl: string): Promise<GameAssets> {
  // The packaged app runs from file://, where Chromium refuses fetch(); Pixi's default ImageBitmap path uses fetch, so take the <img> path everywhere.
  if (loadTextures.config) loadTextures.config.preferCreateImageBitmap = false;
  const manifestAbs = new URL(manifestUrl, document.baseURI);
  const manifest = parseManifest(await loadJson(manifestAbs.href));   // throws "Invalid asset manifest: ..." (spec §7)
  const base = new URL('.', manifestAbs);                              // the directory holding manifest.json: .../assets/
  const textures = new Map<string, Texture>();
  const animations = new Map<string, GameAnimation>();
  const nines = new Map<string, GameNineSlice>();
  const failedRequired: string[] = [];
  const sounds: SoundSource[] = [];

  // Perf-i spec §2.5: every image and the font start loading at once (the browser runs the requests side by side), then
  // each is bound, and each failure reported, in manifest order, as when they loaded one at a time. Pixi's Assets is
  // initialised first: its first load does that itself, but loads started beside it would not wait for it to finish.
  await (assetsInit ??= Assets.init());
  const loads: { e: ManifestEntry; load: Promise<Texture | null> }[] = [];
  for (const e of manifest) {
    const url = new URL(e.file, base).href;
    const kind = assetKind(e);
    if (kind === 'audio') { sounds.push({ name: e.name!, url }); continue; }   // Audio-i spec section 2: decoded later, never blocks boot
    const load = kind === 'font' ? loadFont(url).then(() => null) : loadImage(url);
    load.catch(() => {});   // the loop below reports it; this only keeps an early failure from being an unhandled rejection
    loads.push({ e, load });
  }
  const images = new Map<string, GameImage>();   // UI round Part 3: a named image's URL and size, for the React windows
  for (const { e, load } of loads) {
    try {
      const tex = await load;
      if (tex) bind(e, tex, textures, animations, nines);
      if (tex && e.name !== undefined) images.set(e.name, { url: new URL(e.file, base).href, w: tex.width, h: tex.height });
    } catch (err) {
      if (e.required) { failedRequired.push(e.file); console.error(`required asset failed: ${e.file}`, err); }
      else console.warn(`optional asset missing, placeholder in use: ${e.file}`);
    }
  }
  if (failedRequired.length) throw new AssetError(`Required assets failed to load:\n${failedRequired.join('\n')}`, failedRequired);

  const has = (n: string): boolean => textures.has(n) || animations.has(n) || (n === 'font.m5x7');
  // Every optional name that did not end up loaded, whether its file failed or it was never bound in the manifest. Audio
  // names are the audio's to report (app/audio.ts logs what it decoded).
  const missing = Object.keys(ASSET_NAMES).filter((n) => ASSET_NAMES[n] === 'optional' && !isAudioName(n) && !has(n));
  return {
    has, missing, sounds, fontFamily: FONT_FAMILY,
    image: (n) => images.get(n) ?? null,
    texture(n) { const t = textures.get(n); if (!t) throw new Error(`no texture bound to ${n}`); return t; },
    animation(n) { const a = animations.get(n); if (!a) throw new Error(`no animation bound to ${n}`); return a; },
    nineSlice(n) { const s = nines.get(n); if (!s) throw new Error(`no nineSlice for ${n}`); return s; }
  };
}

function bind(e: ManifestEntry, tex: Texture, textures: Map<string, Texture>, animations: Map<string, GameAnimation>, nines: Map<string, GameNineSlice>): void {
  if (e.name !== undefined) {
    textures.set(e.name, tex);
    if (e.nineSlice) nines.set(e.name, { texture: tex, ...e.nineSlice });
    return;
  }
  const s = e.sheet!;
  const frames = sliceGrid(tex.width, tex.height, s.frameW, s.frameH).map((r) => new Texture({ source: tex.source, frame: new Rectangle(r.x, r.y, r.w, r.h) }));
  const at = (i: number): Texture => { const t = frames[i]; if (!t) throw new Error(`${e.file}: frame ${i} out of range (${frames.length})`); return t; };
  for (const [n, i] of Object.entries(s.frames)) textures.set(n, at(i));
  for (const [n, a] of Object.entries(s.animations)) animations.set(n, { textures: a.frames.map(at), fps: a.fps, loop: a.loop });
}
