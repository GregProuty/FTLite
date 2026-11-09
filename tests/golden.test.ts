import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { runReplay, encodeIntent, decodeIntent } from '../src/renderer/src/sim/replay';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { LAYOUT } from './helpers/sim';
import { scriptedReplay } from './helpers/script';

const GOLDEN = 'tests/golden/basic.json';

describe('replay', () => {
  it('encode/decode round-trips an intent', () => {
    const i = { ...NEUTRAL_INTENT, moveX: 0.5, interactPressed: true, cancelPressed: true };
    expect(decodeIntent(encodeIntent(i))).toEqual(i);
  });
  it('matches the golden hashes (run `npm run bless` to update deliberately)', () => {
    expect(existsSync(GOLDEN)).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { replay: ReturnType<typeof scriptedReplay>; hashes: string[]; finalHash: string };
    const result = runReplay(LAYOUT, golden.replay);
    const firstDiff = result.hashes.findIndex((h, i) => h !== golden.hashes[i]);
    expect(firstDiff, `first divergence at tick ${(firstDiff + 1) * 60}`).toBe(-1);
    expect(result.finalHash).toBe(golden.finalHash);
  });
  it('rejects a replay from another sim version or layout hash', () => {
    const base = scriptedReplay(1, 1, 5);
    expect(() => runReplay(LAYOUT, { ...base, simVersion: 999 })).toThrow(/sim version/);
    expect(() => runReplay(LAYOUT, { ...base, layoutHash: 'deadbeef' })).toThrow(/layout hash/);
    expect(() => runReplay(LAYOUT, base)).not.toThrow();
  });
});
