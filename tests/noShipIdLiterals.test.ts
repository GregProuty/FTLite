// Valkyrn spec §3.2: no code branches on a ship or class id. The quoted ids appear only in the data files that define them.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(process.cwd(), 'src', 'renderer', 'src');
const ALLOWED = new Set(['sim/tactical/defs.ts', 'sim/duel/tuning.ts', 'render/battlemapModel.ts', 'render/tactical/hullModel.ts', 'render/assetNames.ts', 'sim/ship/fleet.ts', 'render/credits.generated.ts']);
const SHIP_ID_LITERAL = /(['"])(hound|cutter|valkyrn|valkyrnLaser|scout)\1/;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });

describe('no ship or class id literals outside the data files (Valkyrn spec §3.2)', () => {
  it('the pattern catches both quote styles and leaves the ai profile alone', () => {
    for (const s of [`x === 'cutter'`, `"valkyrnLaser"`, `hull: 'scout'`]) expect(SHIP_ID_LITERAL.test(s), s).toBe(true);
    for (const s of [`ai === 'hunter'`, `'ship.hound.map'`, `'valkyrns'`]) expect(SHIP_ID_LITERAL.test(s), s).toBe(false);
  });
  it('src/renderer/src has none outside the allowed files', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).split(sep).join('/');
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, k) => { if (SHIP_ID_LITERAL.test(line)) offenders.push(`${rel}:${k + 1}: ${line.trim()}`); });
    }
    expect(offenders).toEqual([]);
  });
});
