import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { blessRefusal, writeAllOrNothing } from '../scripts/golden/blessGuard';

const ok = { ok: true, message: 'identical' }, bad = { ok: false, message: 'golden replay differs at tick 5' };

describe('the bless guard', () => {
  it('allows a version bump when the re-run comparison is ok', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ok, duel: () => ok })).toBeUndefined();
  });
  it('refuses a version bump when the comparison is not ok, quoting why', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => bad, duel: () => ok })).toMatch(/differs at tick 5/);
  });
  it('refuses a version bump with no baseline (the comparison reports it)', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ({ ok: false, message: 'no baseline' }), duel: () => ok })).toMatch(/no baseline/);
  });
  it('allows a same-version bless without running the comparison', () => {
    const verify = vi.fn(() => bad);
    expect(blessRefusal({ storedVersions: [36, 36, 36], currentVersion: 36, verify, duel: verify })).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });
  it('a mixed state, one golden already at the new version and another artifact not, still requires the comparison', () => {
    for (const storedVersions of [[37, 36, 36], [37, 37, 36], [36, 37, 37], [37, undefined, 36]]) {
      const verify = vi.fn(() => bad);
      expect(blessRefusal({ storedVersions, currentVersion: 37, verify, duel: () => ok, fresh: true }), JSON.stringify(storedVersions)).toMatch(/36 → 37/);
      expect(verify).toHaveBeenCalledTimes(1);
    }
    expect(blessRefusal({ storedVersions: [37, 37, undefined], currentVersion: 37, verify: () => bad, duel: () => ok, fresh: true })).toBeUndefined();
  });
  it('refuses a bump from goldens two versions back (or more) before running either proof', () => {
    for (const storedVersions of [[36, 36, 36], [37, 36, 37], [38, 37, 35]]) {
      const verify = vi.fn(() => ok), duel = vi.fn(() => ok);
      expect(blessRefusal({ storedVersions, currentVersion: 38, verify, duel }), JSON.stringify(storedVersions)).toMatch(/a bump must come from sim version 37, but artifacts are stored at (36|35)/);
      expect(verify).not.toHaveBeenCalled();
      expect(duel).not.toHaveBeenCalled();
    }
    expect(blessRefusal({ storedVersions: [39, 39, 39], currentVersion: 38, verify: () => ok, duel: () => ok })).toMatch(/stored at 39/);
  });
  it('refuses when a pinned artifact is missing unless --fresh is given, naming it', () => {
    const verify = vi.fn(() => ok), duel = vi.fn(() => ok), names = ['basic.json', 'duel-1.json', 'determinism-v2.json'];
    expect(blessRefusal({ storedVersions: [37, undefined, 37], currentVersion: 38, verify, duel, names })).toMatch(/pinned artifact\(s\) missing \(duel-1\.json\)[\s\S]*--fresh/);
    expect(blessRefusal({ storedVersions: [undefined, undefined, undefined], currentVersion: 38, verify, duel, names })).toMatch(/missing \(basic\.json, duel-1\.json, determinism-v2\.json\)/);
    expect(verify).not.toHaveBeenCalled();
    expect(blessRefusal({ storedVersions: [undefined, undefined, undefined], currentVersion: 38, verify, duel, fresh: true })).toBeUndefined();
    expect(blessRefusal({ storedVersions: [38, undefined, 38], currentVersion: 38, verify, duel, fresh: true })).toBeUndefined();
  });
  it('a bump also needs the duel migration oracle: a sector proof alone never re-blesses duel-1.json', () => {
    const duelBad = { ok: false, message: 'scripted-4: first difference at tick 812 (fields)' };
    expect(blessRefusal({ storedVersions: [37, 37, 37], currentVersion: 38, verify: () => ok, duel: () => duelBad })).toMatch(/duel migration oracle failed[\s\S]*tick 812/);
    expect(blessRefusal({ storedVersions: [38, 37, 38], currentVersion: 38, verify: () => ok, duel: () => duelBad })).toMatch(/37 → 38/);
    const duel = vi.fn(() => ok);
    expect(blessRefusal({ storedVersions: [37, 37, 37], currentVersion: 38, verify: () => bad, duel })).toMatch(/canonical comparison failed/);
    expect(duel).not.toHaveBeenCalled();
    expect(blessRefusal({ storedVersions: [37, 37, 37], currentVersion: 38, verify: () => ok, duel })).toBeUndefined();
    expect(duel).toHaveBeenCalledTimes(1);
  });
  it('npm run bless passes the real duel oracle, re-run on every bump', () => {
    const source = readFileSync('scripts/bless-golden.ts', 'utf8');
    expect(source).toMatch(/import \{ verifyDuelOracle \} from '\.\/golden\/duelOracle';/);
    expect(source).toMatch(/blessRefusal\(\{ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly, duel: verifyDuelOracle, fresh: process\.argv\.includes\('--fresh'\), names: \[BASIC, DUEL_GOLDEN, DETERMINISM_FIXTURE, DUEL_REMATCH_GOLDEN\] \}\)/);   // the rematch golden joined the pinned set (H-2)
  });
});

describe('writing the pinned artifacts', () => {
  it('stages every artifact before writing any, in order', () => {
    const order: string[] = [], write = vi.fn((path: string) => { order.push(`write ${path}`); });
    const stage = (path: string) => ({ path, stage: () => { order.push(`stage ${path}`); return { content: path.toUpperCase(), message: `blessed ${path}` }; } });
    expect(writeAllOrNothing([stage('a'), stage('b'), stage('c')], write)).toEqual(['blessed a', 'blessed b', 'blessed c']);
    expect(order).toEqual(['stage a', 'stage b', 'stage c', 'write a', 'write b', 'write c']);
    expect(write).toHaveBeenCalledWith('b', 'B');
  });
  it('a failure while staging the third artifact writes nothing', () => {
    const write = vi.fn();
    const good = (path: string) => ({ path, stage: () => ({ content: 'x', message: path }) });
    expect(() => writeAllOrNothing([good('basic'), good('duel'), { path: 'fixture', stage: () => { throw new Error('not version-only: sample 3'); } }], write)).toThrow(/not version-only/);
    expect(write).not.toHaveBeenCalled();
  });
});
