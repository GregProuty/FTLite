import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildPalette, countColours, kmeansCentres, packReader, PALETTE_SIZE } from '../scripts/art/buildPalette';
import { encodePng, type Image } from '../scripts/art/importCore';
import { parsePalette, RAMPS, ROLES } from '../src/renderer/src/render/palette';
import current from '../src/renderer/src/render/palette.json';

/** Generated packs only (Art-ii spec section 4): never the owner's asset folder. */
let root = '';
const png = (rel: string, colours: readonly number[], w = 16): void => {
  const h = Math.ceil(colours.length / w), img: Image = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  colours.forEach((c, i) => img.data.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], i * 4));
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, encodePng(img));
};
/** n distinct colours spread over the RGB cube, deterministic. */
const spread = (n: number, salt: number): number[] => Array.from({ length: n }, (_, i) => (((i * 97 + salt) * 2654435761) >>> 8) & 0xffffff);
const KEPT = [0xfffff0, 0xfeef98, 0xf8ca1c, 0xfaae1e, 0xf68420, 0x944510, 0x596686, 0x3a3a50, 0xe06715];
const out = (pack: string, n: number) => ({ pack, frames: [{ x: 0, y: 0, w: 16, h: Math.ceil(n / 16) }], output: `public/assets/paid/t/${pack.replace(/\W/g, '')}.png`, columns: 1 });
const config = { outputs: [out('maru/a.png', 160), out('maru/a.png', 160), out('limezu/b.png', 96), out('pimen-explosions/c.png', KEPT.length)] };
const overrides = {
  roles: { flash: '#fffff0', fireFallback: '#f68420', lampOn: '#f8ca1c', heldTick: '#f8ca1c', ventSpeck: '#fffff0', alert: '#e06715', breach: '#944510', failed: '#e06715' },
  ramps: { fire: ['#fffff0', '#feef98', '#f8ca1c', '#faae1e', '#f68420', '#944510', '#596686', '#3a3a50'], plasma: { 0: '#fffff0' }, electric: { 0: '#fffff0' }, vent: { 0: '#fffff0' } }
};
const run = (cfg: unknown = config, ov: unknown = overrides) => buildPalette({ config: cfg, read: packReader(root), current, overrides: ov });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ftlite-palette-'));
  png('maru/a.png', spread(160, 1)); png('limezu/b.png', spread(96, 7)); png('pimen-explosions/c.png', KEPT);
});
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe('the palette builder (Art-ii spec section 4)', () => {
  it('rejects a frame rectangle outside its pack, and a ramp override past the ramp end', () => {
    const bad = { outputs: [{ pack: 'maru/a.png', frames: [{ x: 8, y: 0, w: 16, h: 1 }], output: 'public/assets/paid/t/bad.png', columns: 1 }] };
    expect(() => run(bad)).toThrow('art:palette: rectangle 8,0 16x1 is outside maru/a.png (16x10)');
    expect(() => run(config, { ...overrides, ramps: { ...overrides.ramps, electric: { 7: '#fffff0' } } })).toThrow(/override ramp electric\[7\] is past the end/);
  });
  it('is deterministic: the same packs, config, palette and overrides give the same bytes', () => {
    expect(run().text).toBe(run().text);
  });
  it('keeps every explosion colour exactly and fills the rest with k = 48 minus the kept count', () => {
    const r = run(), colours = r.file.colours.map((h) => parseInt(h.slice(1), 16));
    for (const c of KEPT) expect(colours, c.toString(16)).toContain(c);
    expect(r.kept).toBe(KEPT.length);
    expect(colours).toHaveLength(PALETTE_SIZE);
    expect(new Set(colours).size).toBe(PALETTE_SIZE);
    expect(kmeansCentres(countColours(config, packReader(root)))).toHaveLength(PALETTE_SIZE - KEPT.length);
  });
  it('counts a frame used twice (same pack and rectangle) once', () => {
    const once = countColours({ outputs: [config.outputs[0]] }, packReader(root)), twice = countColours({ outputs: config.outputs.slice(0, 2) }, packReader(root));
    expect([...twice.counts]).toEqual([...once.counts]);
  });
  it('applies the overrides and every role and ramp colour is in the palette', () => {
    const r = run();
    expect(() => parsePalette(r.file)).not.toThrow();
    expect(r.file.roles.failed).toBe('#e06715'); expect(r.file.roles.flash).toBe('#fffff0'); expect(r.file.roles.lampOn).toBe('#f8ca1c');
    expect(r.file.ramps.fire).toEqual(overrides.ramps.fire);
    for (const name of ['plasma', 'electric', 'vent'] as const) { expect(r.file.ramps[name]![0]).toBe('#fffff0'); expect(r.file.ramps[name]!.length).toBeGreaterThanOrEqual(5); }
    expect(Object.keys(r.file.roles)).toEqual([...ROLES]); expect(Object.keys(r.file.ramps)).toEqual([...RAMPS]);
    const colours = new Set(r.file.colours);
    for (const h of [...Object.values(r.file.roles), ...Object.values(r.file.ramps).flat()]) expect(colours.has(h), h).toBe(true);
  });
  it('sorts the palette by OKLab lightness, darkest first', () => {
    const c = run().file.colours;
    expect(c[0]).not.toBe('#fffff0'); expect(c.at(-1)).toBe('#fffff0');
  });
  it('refuses an override colour that is not in the palette', () => {
    expect(() => run(config, { roles: { flash: '#010203' } })).toThrow(/override role flash #010203 is not in the palette/);
  });
  it('fails with 48 or more kept colours', () => {
    png('pimen-explosions/many.png', spread(48, 3));
    expect(() => run({ outputs: [out('maru/a.png', 160), out('pimen-explosions/many.png', 48)] })).toThrow(/48 kept colours leave no room/);
  });
});
