import { describe, expect, it } from 'vitest';
import { blessRefusal } from '../scripts/golden/blessGuard';

describe('the bless guard', () => {
  it('refuses a version bump without a marker', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, markerVersion: undefined })).toMatch(/canonical-trace\.ts check/);
  });
  it('allows a version bump with a marker for the current version', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, markerVersion: 36 })).toBeUndefined();
  });
  it('refuses a version bump with a stale marker', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, markerVersion: 35 })).toMatch(/is for version 35/);
  });
  it('allows a same-version bless without a marker', () => {
    expect(blessRefusal({ storedVersion: 36, currentVersion: 36, markerVersion: undefined })).toBeUndefined();
  });
  it('always requires the marker for a version-only re-bless', () => {
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, markerVersion: undefined, versionOnly: true })).toBeDefined();
    expect(blessRefusal({ storedVersion: 35, currentVersion: 36, markerVersion: 36, versionOnly: true })).toBeUndefined();
  });
});
