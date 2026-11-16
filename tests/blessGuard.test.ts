import { describe, expect, it, vi } from 'vitest';
import { blessRefusal, writeAllOrNothing } from '../scripts/golden/blessGuard';

const ok = { ok: true, message: 'identical' }, bad = { ok: false, message: 'golden replay differs at tick 5' };

describe('the bless guard', () => {
  it('allows a version bump when the re-run comparison is ok', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ok })).toBeUndefined();
  });
  it('refuses a version bump when the comparison is not ok, quoting why', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => bad })).toMatch(/differs at tick 5/);
  });
  it('refuses a version bump with no baseline (the comparison reports it)', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ({ ok: false, message: 'no baseline' }) })).toMatch(/no baseline/);
  });
  it('allows a same-version bless without running the comparison', () => {
    const verify = vi.fn(() => bad);
    expect(blessRefusal({ storedVersions: [36, 36, 36], currentVersion: 36, verify })).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });
  it('a mixed state, one golden already at the new version and another artifact not, still requires the comparison', () => {
    for (const storedVersions of [[37, 36, 36], [37, 37, 36], [36, 37, 37], [37, undefined, 36]]) {
      const verify = vi.fn(() => bad);
      expect(blessRefusal({ storedVersions, currentVersion: 37, verify }), JSON.stringify(storedVersions)).toMatch(/36 → 37/);
      expect(verify).toHaveBeenCalledTimes(1);
    }
    expect(blessRefusal({ storedVersions: [37, 37, undefined], currentVersion: 37, verify: () => bad })).toBeUndefined();
  });
  it('a version-only re-bless always runs the comparison', () => {
    expect(blessRefusal({ storedVersions: [35], currentVersion: 36, verify: () => bad, versionOnly: true })).toBeDefined();
    expect(blessRefusal({ storedVersions: [35], currentVersion: 36, verify: () => ok, versionOnly: true })).toBeUndefined();
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
