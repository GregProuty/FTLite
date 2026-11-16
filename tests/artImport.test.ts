import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRemap, encodePng, readPng, remapPixels, runImport, sourceFolder, toOklab, type Image } from '../scripts/art/importCore';
import { PALETTE } from '../src/renderer/src/render/palette';
const committed = JSON.parse(readFileSync('art/import.json', 'utf8')) as { outputs: unknown[] };

/** The art import (Art-i spec section 3). Fixtures are PNGs generated into a temp dir; the owner's asset folder is never read. */
const rgba = (w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Image => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(px(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};
/** A 32 x 16 pack: a colour gradient with a half-transparent band, so every alpha and many colours occur. */
const pack = rgba(32, 16, (x, y) => [x * 8, y * 16, (x * y) & 255, y < 4 ? 40 : y < 8 ? 127 : y < 12 ? 128 : 255]);
const output = (over: Record<string, unknown> = {}) => ({ pack: 'Pack/sheet.png', frames: [{ x: 0, y: 0, w: 16, h: 16 }, { x: 16, y: 0, w: 16, h: 16 }], output: 'public/assets/paid/pack/sheet.png', columns: 2, ...over });

let root = '', repo = '', source = '';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ftlite-art-import-')); repo = join(root, 'repo'); source = join(root, 'assets');
  mkdirSync(join(source, 'Pack'), { recursive: true }); mkdirSync(repo);
  writeFileSync(join(source, 'Pack', 'sheet.png'), encodePng(pack));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the OKLab remap', () => {
  it('maps each palette colour to itself and a near colour to its neighbour, ties to the earlier palette colour', () => {
    const colours = [0x000000, 0xffffff, 0xff0000];
    const remap = createRemap(colours);
    expect(remap(0, 0, 0)).toBe(0x000000); expect(remap(255, 255, 255)).toBe(0xffffff); expect(remap(250, 10, 10)).toBe(0xff0000);
    expect(remap(30, 30, 30)).toBe(0x000000); expect(remap(220, 220, 220)).toBe(0xffffff);
    const twins = createRemap([0x808080, 0x808080]);   // equal distance: the first wins
    expect(twins(128, 128, 128)).toBe(0x808080);
    expect(toOklab(255, 255, 255)[0]).toBeCloseTo(1, 4); expect(toOklab(0, 0, 0)[0]).toBeCloseTo(0, 9);
  });
  it('makes alpha 0 or 255 at the 128 threshold and every opaque pixel a palette colour', () => {
    const img = rgba(4, 1, (x) => [200, 10 * x, 30, [0, 127, 128, 255][x]!]);
    remapPixels(img.data, createRemap(PALETTE.colours));
    expect([3, 7, 11, 15].map((i) => img.data[i])).toEqual([0, 0, 255, 255]);
    expect([...img.data.subarray(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const set = new Set(PALETTE.colours);
    for (const i of [8, 12]) expect(set.has((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!)).toBe(true);
  });
});

describe('runImport', () => {
  it('writes the sheet and the contact sheet; every output pixel is a palette colour or transparent', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output()] } });
    expect(r.problems).toEqual([]);
    expect(r.written).toEqual([join(repo, 'public', 'assets', 'paid', 'pack', 'sheet.png'), join(repo, '.art', 'contact.png')]);
    const sheet = readPng(r.written[0]!), set = new Set(PALETTE.colours);
    expect([sheet.width, sheet.height]).toEqual([32, 16]);
    for (let i = 0; i < sheet.data.length; i += 4) {
      const a = sheet.data[i + 3]!;
      expect(a === 0 || a === 255).toBe(true);
      if (a === 255) expect(set.has((sheet.data[i]! << 16) | (sheet.data[i + 1]! << 8) | sheet.data[i + 2]!)).toBe(true);
    }
    const contact = readPng(r.written[1]!);
    expect([contact.width, contact.height]).toEqual([64, 32]);
    const bg = PALETTE.roles.background;
    expect([...contact.data.subarray(0, 4)]).toEqual([(bg >> 16) & 255, (bg >> 8) & 255, bg & 255, 255]);   // pixel (0,0) of the pack has alpha 40: the background shows
  });
  it('packs frames by columns with cells as large as the largest frame', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output({ frames: [{ x: 0, y: 0, w: 8, h: 8 }, { x: 8, y: 8, w: 4, h: 4 }, { x: 0, y: 8, w: 8, h: 8 }], columns: 2 })] } });
    expect(r.problems).toEqual([]);
    const sheet = readPng(r.written[0]!);
    expect([sheet.width, sheet.height]).toEqual([16, 16]);
  });
  it('is deterministic: the same input bytes give the same output bytes', () => {
    const a = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output()] } });
    const first = a.written.map((p) => readFileSync(p));
    const b = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output()] } });
    b.written.forEach((p, i) => expect(readFileSync(p).equals(first[i]!)).toBe(true));
  });
  it('a missing source folder: one line, nothing written', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: join(root, 'nowhere'), config: { outputs: [output()] } });
    expect(r.problems).toEqual([`source folder ${join(root, 'nowhere')} does not exist (set FTLITE_ASSETS)`]); expect(r.written).toEqual([]);
    expect(existsSync(join(repo, 'public'))).toBe(false); expect(existsSync(join(repo, '.art'))).toBe(false);
  });
  it('a missing pack file, a frame outside its image and an output outside public/assets/paid/: every problem listed, nothing written', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [
      output({ pack: 'Pack/missing.png' }),
      output({ frames: [{ x: 0, y: 0, w: 16, h: 16 }, { x: 24, y: 8, w: 16, h: 16 }] }),
      output({ output: 'public/assets/raw/sheet.png' }),
      output({ output: 'public/assets/paid/../escape.png' })
    ] } });
    expect(r.problems).toEqual([
      `outputs[0]: pack file Pack/missing.png not found in ${source}`,
      'outputs[1].frames[1]: rectangle 24,8 16x16 is outside Pack/sheet.png (32x16)',
      'outputs[2]: output public/assets/raw/sheet.png is outside public/assets/paid/',
      'outputs[3]: output public/assets/paid/../escape.png is outside public/assets/paid/'
    ]);
    expect(r.written).toEqual([]); expect(existsSync(join(repo, 'public'))).toBe(false); expect(existsSync(join(repo, '.art'))).toBe(false);
  });
  it('a malformed config is reported, not thrown', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [{ pack: 'x.png' }] } });
    expect(r.problems.length).toBeGreaterThan(0); expect(r.problems[0]).toMatch(/^art\/import\.json: outputs\.0\.frames/);
  });
  it('the source folder defaults to the owner folder unless FTLITE_ASSETS is set', () => {
    expect(sourceFolder({})).toBe('C:\\Users\\djuar\\FTLite-assets'); expect(sourceFolder({ FTLITE_ASSETS: 'D:\\packs' })).toBe('D:\\packs');
  });
  it('the committed art/import.json parses and lists no outputs yet (Art-ii fills it)', () => {
    expect(committed.outputs).toEqual([]);
    expect(runImport({ repoRoot: repo, sourceRoot: source, config: committed })).toEqual({ problems: [], written: [] });
  });
});
