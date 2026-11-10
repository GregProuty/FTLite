import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseManifest, boundNames, type ManifestEntry } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, requiredNames, isKnownName } from '../src/renderer/src/render/assetNames';
import { pngSize } from '../src/renderer/src/render/png';

const ASSETS = 'public/assets';
const EXEMPT = /\.(txt|md)$|^\.gitkeep$/i;   // pack licence/readme files and dir placeholders need no manifest entry

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); }
  return out;
}
const manifest = parseManifest(JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8')));
const path = (e: ManifestEntry): string => join(ASSETS, e.file);
const present = (e: ManifestEntry): boolean => existsSync(path(e));

describe('asset manifest', () => {
  it('manifests every file under raw/ and art/ (text files exempt)', () => {
    const files = [...walk(join(ASSETS, 'raw')), ...walk(join(ASSETS, 'art'))].map((p) => relative(ASSETS, p).replace(/[\\]/g, '/')).filter((p) => !EXEMPT.test(p.split('/').pop()!));
    const manifested = new Set(manifest.map((e) => e.file));
    expect(files.filter((f) => !manifested.has(f))).toEqual([]);
  });
  it('every required file exists; optional files absent are reported as warnings', () => {
    expect(manifest.filter((e) => e.required && !present(e)).map((e) => e.file)).toEqual([]);
    const absent = manifest.filter((e) => !e.required && !present(e)).map((e) => e.file);
    if (absent.length) console.warn(`optional art not yet present (placeholders in use): ${absent.join(', ')}`);
  });
  it('every sheet grid divides its PNG exactly and every frame index is in range', () => {
    for (const e of manifest) {
      if (!e.sheet || !present(e)) continue;
      const { width, height } = pngSize(new Uint8Array(readFileSync(path(e))));
      expect(width % e.sheet.frameW, `${e.file} width`).toBe(0); expect(height % e.sheet.frameH, `${e.file} height`).toBe(0);
      const count = (width / e.sheet.frameW) * (height / e.sheet.frameH);
      for (const [n, i] of Object.entries(e.sheet.frames)) expect(i, `${e.file} ${n}`).toBeLessThan(count);
      for (const [n, a] of Object.entries(e.sheet.animations)) for (const i of a.frames) expect(i, `${e.file} ${n}`).toBeLessThan(count);
    }
  });
  it('nineSlice borders fit inside the image', () => {
    for (const e of manifest) {
      if (!e.nineSlice || !present(e)) continue;
      const { width, height } = pngSize(new Uint8Array(readFileSync(path(e))));
      expect(e.nineSlice.left + e.nineSlice.right).toBeLessThan(width); expect(e.nineSlice.top + e.nineSlice.bottom).toBeLessThan(height);
    }
  });
  it('binds every required name exactly once, no name twice, and only known names', () => {
    const bound = new Map<string, string[]>();
    for (const e of manifest) for (const n of boundNames(e)) bound.set(n, [...(bound.get(n) ?? []), e.file]);
    expect([...bound].filter(([, files]) => files.length > 1)).toEqual([]);
    expect([...bound.keys()].filter((n) => !isKnownName(n))).toEqual([]);
    expect(requiredNames().filter((n) => !bound.has(n))).toEqual([]);
    const optionalUnbound = Object.keys(ASSET_NAMES).filter((n) => ASSET_NAMES[n] === 'optional' && !bound.has(n));
    if (optionalUnbound.length) console.warn(`optional names unbound: ${optionalUnbound.join(', ')}`);
  });
  it('font entries are TTF/OTF files and every OFL licenseFile exists', () => {
    for (const e of manifest) {
      if (e.name?.startsWith('font.')) expect(e.file).toMatch(/\.(ttf|otf)$/i);
      if (e.licenseFile) expect(existsSync(join(ASSETS, e.licenseFile)), e.licenseFile).toBe(true);
    }
  });
});
