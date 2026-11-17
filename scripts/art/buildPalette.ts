// The house palette builder (Art-ii spec section 4), canonical from Art-ii on: every opaque pixel of every distinct frame
// in art/import.json, counted per colour; the explosion pack's colours kept exactly; k-means in OKLab over the rest for
// 48 colours in all; the roles and ramps of the current palette mapped onto the new colours; art/palette-overrides.json
// applied last. Deterministic: the same packs, config, current palette and overrides give the same bytes.
// Scripts only (pngjs is a dev dependency); the renderer never imports this file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { importConfig, nearestIndex, readPng, toOklab, type Image, type Lab } from './importCore';
import { RAMPS, ROLES, parsePalette, type PaletteFile } from '../../src/renderer/src/render/palette';

/** The palette's size: kept colours plus k-means centres. */
export const PALETTE_SIZE = 48;
/** Outputs whose pack path starts with this keep their colours exactly (the explosion pack: fire, flash, lamp). */
export const KEPT_PACK_PREFIX = 'pimen-explosions/';
export const LLOYD_ITERATIONS = 12;
const RAMP_MIN = 5;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
/** Overrides: a role by name; a ramp by name, either whole (an array) or entry by entry ({ "0": "#fffff0" }). */
export const paletteOverrides = z.object({
  $comment: z.string().optional(),
  roles: z.record(z.enum(ROLES), hex).default({}),
  ramps: z.record(z.enum(RAMPS), z.union([z.array(hex).min(RAMP_MIN).max(8), z.record(z.string().regex(/^\d$/), hex)])).default({})
}).strict();
export type PaletteOverrides = z.infer<typeof paletteOverrides>;

const toHex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const labOf = (c: number): Lab => toOklab((c >> 16) & 255, (c >> 8) & 255, c & 255);
const dist2 = (a: Lab, b: Lab): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export interface ColourCounts { counts: Map<number, number>; kept: Set<number> }

/** Step 1: count every opaque pixel (alpha >= 128) of every distinct frame (same pack and rectangle counted once) per
 *  RGB colour; colours of outputs under KEPT_PACK_PREFIX are kept. `read` loads a pack (cached per pack). */
export function countColours(config: unknown, read: (pack: string) => Image): ColourCounts {
  const parsed = importConfig.parse(config), counts = new Map<number, number>(), kept = new Set<number>(), seen = new Set<string>(), packs = new Map<string, Image>();
  for (const o of parsed.outputs) {
    const keep = o.pack.startsWith(KEPT_PACK_PREFIX);
    let img = packs.get(o.pack);
    if (!img) { img = read(o.pack); packs.set(o.pack, img); }
    for (const f of o.frames) {
      const key = `${o.pack}|${f.x}|${f.y}|${f.w}|${f.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3]! < 128) continue;
        const c = (img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!;
        counts.set(c, (counts.get(c) ?? 0) + 1);
        if (keep) kept.add(c);
      }
    }
  }
  return { counts, kept };
}

/** Step 2: k-means in OKLab over the non-kept colours, k = size minus the kept count. Farthest-point start from the most
 *  frequent colour, weighting (squared distance to the nearest centre, kept colours included) by ln(1 + count); ties to
 *  the earlier colour in (count descending, RGB ascending) order. Then up to 12 Lloyd iterations, each centre snapping to
 *  the member colour nearest its cluster's weighted mean; an empty cluster keeps its centre; stops when nothing moves. */
export function kmeansCentres({ counts, kept }: ColourCounts, size = PALETTE_SIZE): number[] {
  if (kept.size >= size) throw new Error(`art:palette: ${kept.size} kept colours leave no room for k-means (the palette holds ${size}; fewer than ${size} kept colours are needed)`);
  const k = size - kept.size;
  const order = [...counts.keys()].filter((c) => !kept.has(c)).sort((a, b) => counts.get(b)! - counts.get(a)! || a - b);
  if (order.length <= k) return order;
  const labs = order.map(labOf), weight = order.map((c) => Math.log(1 + counts.get(c)!));
  const near = labs.map((l) => Math.min(Infinity, ...[...kept].map((c) => dist2(l, labOf(c)))));
  const centres: number[] = [];   // indices into order
  const take = (i: number): void => { centres.push(i); labs.forEach((l, j) => { near[j] = Math.min(near[j]!, dist2(l, labs[i]!)); }); };
  take(0);
  while (centres.length < k) {
    let best = -1, bestScore = 0;
    for (let j = 0; j < order.length; j++) { const s = near[j]! * weight[j]!; if (s > bestScore) { best = j; bestScore = s; } }
    if (best < 0) break;   // every colour is already a centre
    take(best);
  }
  for (let it = 0; it < LLOYD_ITERATIONS; it++) {
    const centreLabs = centres.map((i) => labs[i]!), members: number[][] = centres.map(() => []);
    labs.forEach((l, j) => members[nearestIndex(centreLabs, l)]!.push(j));
    let moved = false;
    const next = centres.map((c, m) => {
      const list = members[m]!;
      if (!list.length) return c;
      let w = 0; const mean = [0, 0, 0];
      for (const j of list) { const cw = counts.get(order[j]!)!; w += cw; for (let a = 0; a < 3; a++) mean[a]! += labs[j]![a]! * cw; }
      const target: Lab = [mean[0]! / w, mean[1]! / w, mean[2]! / w];
      const snapped = list[nearestIndex(list.map((j) => labs[j]!), target)]!;
      if (snapped !== c) moved = true;
      return snapped;
    });
    centres.splice(0, centres.length, ...next);
    if (!moved) break;
  }
  return centres.map((i) => order[i]!);
}

/** Step 3: centres plus kept colours, deduplicated, sorted by OKLab lightness (then RGB). */
export function paletteColours(centres: readonly number[], kept: ReadonlySet<number>): number[] {
  return [...new Set([...centres, ...kept])].sort((a, b) => labOf(a)[0] - labOf(b)[0] || a - b);
}

/** Drops repeats, then pads to 5 with the palette colours nearest the last entry (palette order breaks ties). */
function tidyRamp(ramp: readonly number[], colours: readonly number[]): number[] {
  const out = [...new Set(ramp)];
  if (out.length >= RAMP_MIN) return out;
  const last = labOf(out[out.length - 1]!);
  const rest = colours.filter((c) => !out.includes(c)).map((c, i) => ({ c, i, d: dist2(labOf(c), last) })).sort((a, b) => a.d - b.d || a.i - b.i);
  for (const r of rest) { if (out.length >= RAMP_MIN) break; out.push(r.c); }
  return out;
}

/** Steps 4-5: each current role and ramp colour mapped to its nearest palette colour, ramps tidied; then the overrides
 *  (every override colour must be in the palette). */
export function mapRoles(current: PaletteFile, colours: readonly number[], overrides: PaletteOverrides): { roles: Record<string, string>; ramps: Record<string, string[]> } {
  const labs = colours.map(labOf), near = (h: string): number => colours[nearestIndex(labs, labOf(parseInt(h.slice(1), 16)))]!;
  const inPalette = new Set(colours), problems: string[] = [];
  const pick = (where: string, h: string): number => { const n = parseInt(h.slice(1), 16); if (!inPalette.has(n)) problems.push(`${where} ${h} is not in the palette`); return n; };
  const roles: Record<string, number> = {};
  for (const r of ROLES) { const h = current.roles[r]; if (h === undefined) throw new Error(`art:palette: the current palette has no role ${r}`); roles[r] = near(h); }
  const ramps: Record<string, number[]> = {};
  for (const name of RAMPS) ramps[name] = tidyRamp((current.ramps[name] ?? []).map(near), colours);
  for (const [r, h] of Object.entries(overrides.roles)) roles[r] = pick(`override role ${r}`, h!);
  for (const [name, o] of Object.entries(overrides.ramps)) {
    if (Array.isArray(o)) ramps[name] = o.map((h, i) => pick(`override ramp ${name}[${i}]`, h));
    else { const ramp = [...ramps[name]!]; for (const [i, h] of Object.entries(o)) ramp[Number(i)] = pick(`override ramp ${name}[${i}]`, h); ramps[name] = tidyRamp(ramp, colours); }
  }
  if (problems.length) throw new Error(`art:palette: ${problems.join('; ')}`);
  return {
    roles: Object.fromEntries(ROLES.map((r) => [r, toHex(roles[r]!)])),
    ramps: Object.fromEntries(RAMPS.map((n) => [n, ramps[n]!.map(toHex)]))
  };
}

export interface PaletteRun { config: unknown; read: (pack: string) => Image; current: PaletteFile; overrides: unknown; size?: number }

/** The whole build: returns the palette file (checked by parsePalette) and its exact bytes. */
export function buildPalette(run: PaletteRun): { file: PaletteFile & { name: string; source: string }; text: string; kept: number } {
  const counted = countColours(run.config, run.read);
  const colours = paletteColours(kmeansCentres(counted, run.size ?? PALETTE_SIZE), counted.kept);
  const { roles, ramps } = mapRoles(run.current, colours, paletteOverrides.parse(run.overrides));
  const file = {
    name: `FTLite house palette (${colours.length} colours, built by npm run art:palette from the art/import.json frames)`,
    source: 'k-means in OKLab over the art/import.json frames (scripts/art/buildPalette.ts); explosion colours kept exact; roles and ramps mapped from the previous palette; art/palette-overrides.json applied (Art-ii)',
    colours: colours.map(toHex), roles, ramps
  };
  parsePalette(file);
  return { file, text: `${JSON.stringify(file, null, 2)}\n`, kept: counted.kept.size };
}

/** Reads packs from the asset source folder; a missing pack is an error naming it. */
export function packReader(sourceRoot: string): (pack: string) => Image {
  return (pack) => {
    const p = join(sourceRoot, pack);
    if (!existsSync(p)) throw new Error(`art:palette: pack file ${pack} not found in ${sourceRoot} (set FTLITE_ASSETS)`);
    return readPng(p);
  };
}
