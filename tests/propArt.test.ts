import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, PROP_ART_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { PROP_SIZE } from '../src/renderer/src/render/propModel';
import { countColours, packReader } from '../scripts/art/buildPalette';
import { sourceFolder } from '../scripts/art/importCore';

describe('the prop art: names, outputs, manifest and palette (Art-iii spec section 1)', () => {
  const cfg = JSON.parse(readFileSync('art/import.json', 'utf8')) as { outputs: { pack: string; frames: { x: number; y: number; w: number; h: number }[]; output: string; columns: number }[] };
  const file = (n: string): string => `paid/maru/${n.replaceAll('.', '-')}.png`;
  it('seven optional names grouped as propArt', () => {
    expect(PROP_ART_NAMES).toEqual(['prop.bunk.a', 'prop.bunk.b', 'prop.seats', 'prop.couch', 'prop.locker.a', 'prop.locker.b', 'prop.crate']);
    for (const n of PROP_ART_NAMES) expect(ASSET_NAMES[n]).toBe('optional');
    expect(FEATURE_NAMES.propArt).toEqual([...PROP_ART_NAMES]);
  });
  it('each prop is its own one-frame output of a rectangle another output already lists', () => {
    for (const n of PROP_ART_NAMES) {
      const o = cfg.outputs.find((x) => x.output === `public/assets/${file(n)}`)!;
      expect(o.frames, n).toHaveLength(1); expect(o.columns).toBe(1);
      const f = o.frames[0]!;
      expect([f.w, f.h], n).toEqual([...PROP_SIZE[n]]);
      const elsewhere = cfg.outputs.filter((x) => !x.output.includes('/prop-')).some((x) => x.pack === o.pack && x.frames.some((g) => g.x === f.x && g.y === f.y && g.w === f.w && g.h === f.h));
      expect(elsewhere, n).toBe(true);
    }
  });
  it('the manifest binds the seven by name as paid Maru-98 art', () => {
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    for (const n of PROP_ART_NAMES) {
      const e = real.find((x) => x.name === n)!;
      expect(e.file).toBe(file(n));
      expect([e.license, e.required, e.source, e.retrieved, e.credit]).toEqual(['paid', false, 'https://maru-98.itch.io/', '2026-11-16', 'Mars colony pixel art by Maru-98 (maru-98.itch.io)']);
    }
  });
  const packs = sourceFolder(process.env);
  it.runIf(existsSync(packs))('countColours gives the same counts with and without the prop outputs (the owner\'s packs)', () => {
    const raw = packReader(packs), memo = new Map<string, ReturnType<typeof raw>>();
    const read = (p: string): ReturnType<typeof raw> => { if (!memo.has(p)) memo.set(p, raw(p)); return memo.get(p)!; };   // decode each pack once
    const without = { outputs: cfg.outputs.filter((x) => !x.output.includes('/prop-')) };
    const a = countColours(cfg, read), b = countColours(without, read);
    expect([...a.counts].sort((x, y) => x[0] - y[0])).toEqual([...b.counts].sort((x, y) => x[0] - y[0]));
    expect([...a.kept].sort()).toEqual([...b.kept].sort());
  }, 30_000);
});
