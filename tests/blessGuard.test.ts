import { describe, expect, it, vi } from 'vitest';
import { blessRefusal } from '../scripts/golden/blessGuard';

const ok = { ok: true, message: 'identical' }, bad = { ok: false, message: 'golden replay differs at tick 5' };

describe('the bless guard', () => {
  it('allows a version bump when the re-run comparison is ok', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, verify: () => ok })).toBeUndefined();
  });
  it('refuses a version bump when the comparison is not ok, quoting why', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, verify: () => bad })).toMatch(/differs at tick 5/);
  });
  it('refuses a version bump with no baseline (the comparison reports it)', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, verify: () => ({ ok: false, message: 'no baseline' }) })).toMatch(/no baseline/);
  });
  it('allows a same-version bless without running the comparison', () => {
    const verify = vi.fn(() => bad);
    expect(blessRefusal({ storedVersion: 36, currentVersion: 36, verify })).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });
  it('a version-only re-bless always runs the comparison', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, verify: () => bad, versionOnly: true })).toBeDefined();
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, verify: () => ok, versionOnly: true })).toBeUndefined();
  });
});
