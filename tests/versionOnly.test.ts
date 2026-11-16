import { describe, expect, it } from 'vitest';
import { basicVersionFromText, duelVersionFromText } from '../scripts/golden/storedVersion';
import { canonical, canonicalValues, dirFor, judgeUnchanged, judgeVersionOnly, type Trace } from '../scripts/golden/versionOnly';
import { makeState } from './helpers/sim';
import { disposeSimState } from '../src/renderer/src/sim/state';
import { Health } from '../src/renderer/src/sim/components';
import { flatten } from '../src/renderer/src/sim/flatten';

/** The flattened values of a fresh two-crew state, disposed before returning. */
function freshValues(): Float64Array {
  const state = makeState(2);
  try { return Float64Array.from(flatten(state)); } finally { disposeSimState(state); }
}

describe('stored version readers', () => {
  const basic = (pad: number) => JSON.stringify({ pad: 'x'.repeat(pad), replay: { version: 2, init: { simVersion: 37 } }, header: { simVersion: 99 } });
  it('reads the replay.init version even beyond 4096 bytes', () => {
    expect(basic(10_000).indexOf('"simVersion":37')).toBeGreaterThan(4096);
    expect(basicVersionFromText(basic(10_000))).toBe(37);
    expect(basicVersionFromText(basic(0))).toBe(37);
  });
  it('throws when an existing file has no version or is malformed', () => {
    expect(() => basicVersionFromText('{"replay":{"init":{}}}')).toThrow(/no simVersion/);
    expect(() => basicVersionFromText('{"hashes":[]}')).toThrow(/no simVersion/);
    expect(() => basicVersionFromText('{"replay":')).toThrow(/not valid JSON/);
    expect(() => duelVersionFromText('{"seed":1}')).toThrow(/no simVersion/);
    expect(() => duelVersionFromText('nope')).toThrow(/not valid JSON/);
    expect(duelVersionFromText('{"simVersion":37,"seed":1}')).toBe(37);
  });
});

const mk = (over: Partial<Trace> = {}): Trace => ({ simVersion: 37, cwd: '/repo', head: 'abc', golden: ['a', 'b', 'c'], determinism: { r1: ['x', 'y'], r2: ['p', 'q'] }, ...over });
const ROOT = '/repo';

describe('the same-version check can fail', () => {
  it('passes identical traces and names the recorded HEAD', () => {
    const r = judgeUnchanged(mk(), () => mk(), ROOT);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/baseline HEAD abc/);
  });
  it('fails one changed golden tick, naming it', () => {
    const r = judgeUnchanged(mk(), () => mk({ golden: ['a', 'X', 'c'] }), ROOT);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/golden replay differs at tick 2/);
  });
  it('fails a missing run, an extra run and a shorter now trace', () => {
    expect(judgeUnchanged(mk(), () => mk({ determinism: { r1: ['x', 'y'] } }), ROOT).message).toMatch(/r2 differs/);
    expect(judgeUnchanged(mk(), () => mk({ determinism: { r1: ['x', 'y'], r2: ['p', 'q'], r3: ['z'] } }), ROOT).message).toMatch(/r3 differs/);
    const shorter = judgeUnchanged(mk(), () => mk({ golden: ['a', 'b'] }), ROOT);
    expect(shorter.ok).toBe(false);
    expect(shorter.message).toMatch(/golden replay differs at tick 3/);
  });
  it('refuses when the version moved, with no baseline, and from another repo root', () => {
    expect(judgeUnchanged(mk(), () => mk({ simVersion: 38 }), ROOT).message).toMatch(/use `check` for a bump/);
    expect(judgeUnchanged(undefined, () => mk(), ROOT).message).toMatch(/no baseline/);
    const other = judgeUnchanged(mk({ cwd: '/elsewhere' }), () => mk(), ROOT);
    expect(other.ok).toBe(false);
    expect(other.message).toMatch(/recorded from \/elsewhere \(HEAD abc\), not from \/repo/);
    expect(judgeUnchanged(mk({ cwd: undefined }), () => mk(), ROOT).ok).toBe(false);
  });
});

describe('the bump check', () => {
  it('passes a version-only move, fails a changed tick, a stale baseline and another repo root', () => {
    expect(judgeVersionOnly(mk({ simVersion: 36 }), () => mk(), ROOT).ok).toBe(true);
    expect(judgeVersionOnly(mk({ simVersion: 36 }), () => mk({ golden: ['a', 'b', 'Z'] }), ROOT).message).toMatch(/tick 3/);
    expect(judgeVersionOnly(mk(), () => mk(), ROOT).message).toMatch(/stale/);
    expect(judgeVersionOnly(mk({ simVersion: 36, cwd: '/x' }), () => mk(), ROOT).ok).toBe(false);
    expect(judgeVersionOnly(undefined, () => mk(), ROOT).ok).toBe(false);
  });
});

describe('the canonical hash', () => {
  it('ignores only the version value (flatten index 0)', () => {
    const v = freshValues();
    const bumped = Float64Array.from(v); bumped[0] = v[0]! + 1;
    expect(canonicalValues(bumped)).toBe(canonicalValues(v));
    const other = Float64Array.from(v); other[1] = v[1]! + 1;
    expect(canonicalValues(other)).not.toBe(canonicalValues(v));
  });
  it('changes when one crew Health.cur changes', () => {
    const state = makeState(2);
    try {
      const before = canonical(state);
      expect(canonical(state)).toBe(before);
      const eid = state.crew[0]!; Health.cur[eid] = Health.cur[eid]! - 1;
      expect(canonical(state)).not.toBe(before);
    } finally { disposeSimState(state); }
  });
  it('keys the baseline folder by repo root', () => {
    expect(dirFor('/a')).not.toBe(dirFor('/b'));
    expect(dirFor('/a')).toBe(dirFor('/a'));
  });
});
