// The art import (Art-i spec section 3): cut frames out of bought packs, remap every pixel to the house palette in OKLab,
// and write sheets into public/assets/paid/ plus a contact sheet at .art/contact.png. Validates everything before writing anything.
// Scripts only (pngjs is a dev dependency); the renderer never imports this file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { z } from 'zod';
import paletteFile from '../../src/renderer/src/render/palette.json';
import { parsePalette, type Palette } from '../../src/renderer/src/render/palette';

const rect = z.object({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().positive(), h: z.number().int().positive() });
const output = z.object({
  /** The pack file, relative to the asset source folder. */
  pack: z.string().min(1),
  /** Frames to cut, in sheet order. */
  frames: z.array(rect).min(1),
  /** The sheet to write, relative to the repo root; must be under public/assets/paid/. */
  output: z.string().min(1),
  /** Sheet layout: frames left to right, `columns` per row, each in a cell as big as the largest frame. */
  columns: z.number().int().positive()
});
export const importConfig = z.object({ $comment: z.string().optional(), outputs: z.array(output) });
export type ImportConfig = z.infer<typeof importConfig>;
export type ImportOutput = z.infer<typeof output>;

/** The asset source folder: FTLITE_ASSETS, else the owner's folder (never inside the repo). */
export function sourceFolder(env: Record<string, string | undefined>): string { return env.FTLITE_ASSETS || 'C:\\Users\\djuar\\FTLite-assets'; }

// ---- colour -------------------------------------------------------------------------------------------------------------

export type Lab = readonly [number, number, number];
const lin = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
/** sRGB bytes to OKLab (Bjorn Ottosson's matrices). */
export function toOklab(r: number, g: number, b: number): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}

/** Nearest palette colour in OKLab by squared distance; a tie goes to the colour earlier in the palette. Returns the colour as a number. */
export function createRemap(colours: readonly number[]): (r: number, g: number, b: number) => number {
  const labs = colours.map((c) => toOklab((c >> 16) & 255, (c >> 8) & 255, c & 255));
  const cache = new Map<number, number>();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b, hit = cache.get(key);
    if (hit !== undefined) return hit;
    const [L, A, B] = toOklab(r, g, b);
    let best = 0, bestD = Infinity;
    labs.forEach(([l, a, bb], i) => { const d = (L - l) ** 2 + (A - a) ** 2 + (B - bb) ** 2; if (d < bestD) { bestD = d; best = i; } });
    cache.set(key, colours[best]!); return colours[best]!;
  };
}

/** Remap an RGBA buffer in place: alpha below 128 becomes fully transparent (0,0,0,0), the rest opaque in the nearest palette colour. */
export function remapPixels(data: Uint8Array, remap: (r: number, g: number, b: number) => number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; continue; }
    const c = remap(data[i]!, data[i + 1]!, data[i + 2]!);
    data[i] = (c >> 16) & 255; data[i + 1] = (c >> 8) & 255; data[i + 2] = c & 255; data[i + 3] = 255;
  }
}

// ---- images -------------------------------------------------------------------------------------------------------------

export interface Image { width: number; height: number; data: Uint8Array }
const blank = (width: number, height: number): Image => ({ width, height, data: new Uint8Array(width * height * 4) });
export function readPng(path: string): Image { const p = PNG.sync.read(readFileSync(path)); return { width: p.width, height: p.height, data: new Uint8Array(p.data) }; }
/** PNG bytes for an image: always 8-bit RGBA with pngjs's fixed defaults, so the same pixels give the same bytes. */
export function encodePng(img: Image): Buffer {
  const p = new PNG({ width: img.width, height: img.height }); Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength).copy(p.data);
  return PNG.sync.write(p, { colorType: 6, inputColorType: 6, bitDepth: 8 });
}
function blit(src: Image, sx: number, sy: number, w: number, h: number, dst: Image, dx: number, dy: number, scale = 1): void {
  for (let y = 0; y < h * scale; y++) for (let x = 0; x < w * scale; x++) {
    const s = ((sy + Math.floor(y / scale)) * src.width + sx + Math.floor(x / scale)) * 4, d = ((dy + y) * dst.width + dx + x) * 4;
    if (src.data[s + 3] === 0) continue;
    dst.data.set(src.data.subarray(s, s + 4), d);
  }
}

/** Cut the frames into one sheet: `columns` per row, each cell as large as the largest frame, frames at the cell's top-left. */
export function packSheet(src: Image, o: ImportOutput): Image {
  const cw = Math.max(...o.frames.map((f) => f.w)), ch = Math.max(...o.frames.map((f) => f.h));
  const cols = Math.min(o.columns, o.frames.length), rows = Math.ceil(o.frames.length / o.columns);
  const sheet = blank(cols * cw, rows * ch);
  o.frames.forEach((f, i) => blit(src, f.x, f.y, f.w, f.h, sheet, (i % o.columns) * cw, Math.floor(i / o.columns) * ch));
  return sheet;
}

/** Every output at 2x, stacked top to bottom with a 4 px gap, on the palette's background role. */
export function contactSheet(sheets: readonly Image[], background: number): Image {
  const gap = 4, width = Math.max(...sheets.map((s) => s.width * 2)), height = sheets.reduce((n, s) => n + s.height * 2, 0) + gap * (sheets.length - 1);
  const out = blank(width, height);
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = (background >> 16) & 255; out.data[i + 1] = (background >> 8) & 255; out.data[i + 2] = background & 255; out.data[i + 3] = 255; }
  let y = 0;
  for (const s of sheets) { blit(s, 0, 0, s.width, s.height, out, 0, y, 2); y += s.height * 2 + gap; }
  return out;
}

// ---- the run ------------------------------------------------------------------------------------------------------------

export interface ImportRun { repoRoot: string; sourceRoot: string; config: unknown; palette?: Palette }
export interface ImportResult { problems: string[]; written: string[] }

/** Validate every output, then (only if nothing is wrong) write the sheets and the contact sheet. Problems come back one line each. */
export function runImport(run: ImportRun): ImportResult {
  const palette = run.palette ?? parsePalette(paletteFile);
  const parsed = importConfig.safeParse(run.config);
  if (!parsed.success) return { problems: parsed.error.issues.map((i) => `art/import.json: ${i.path.join('.') || '(root)'}: ${i.message}`), written: [] };
  const problems: string[] = [], sources: Image[] = [];
  const paidRoot = resolve(run.repoRoot, 'public', 'assets', 'paid') + sep;
  const haveSource = existsSync(run.sourceRoot);
  if (!haveSource) problems.push(`source folder ${run.sourceRoot} does not exist (set FTLITE_ASSETS)`);
  parsed.data.outputs.forEach((o, i) => {
    if (!resolve(run.repoRoot, o.output).startsWith(paidRoot)) problems.push(`outputs[${i}]: output ${o.output} is outside public/assets/paid/`);
    if (!haveSource) return;
    const packPath = join(run.sourceRoot, o.pack);
    if (!existsSync(packPath)) { problems.push(`outputs[${i}]: pack file ${o.pack} not found in ${run.sourceRoot}`); return; }
    const img = readPng(packPath); sources[i] = img;
    o.frames.forEach((f, j) => {
      if (f.x + f.w > img.width || f.y + f.h > img.height) problems.push(`outputs[${i}].frames[${j}]: rectangle ${f.x},${f.y} ${f.w}x${f.h} is outside ${o.pack} (${img.width}x${img.height})`);
    });
  });
  if (problems.length) return { problems, written: [] };
  const remap = createRemap(palette.colours), written: string[] = [], sheets: Image[] = [];
  parsed.data.outputs.forEach((o, i) => {
    const sheet = packSheet(sources[i]!, o); remapPixels(sheet.data, remap); sheets.push(sheet);
    const path = resolve(run.repoRoot, o.output); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, encodePng(sheet)); written.push(path);
  });
  if (sheets.length) {
    const path = resolve(run.repoRoot, '.art', 'contact.png'); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(contactSheet(sheets, palette.roles.background))); written.push(path);
  }
  return { problems: [], written };
}
