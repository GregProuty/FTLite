import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { encodeIntent, decodeIntent } from './helpers/legacyIntentCodec';
import type { ReplayV2 } from '../src/renderer/src/sim/replay';
import { runSemanticReplay } from './helpers/semanticReplay';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { LAYOUT } from './helpers/sim';
import { scriptedSemanticReplay } from './helpers/script';

const GOLDEN = 'tests/golden/basic.json';
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { replay: ReplayV2; hashes: string[]; finalHash: string };
const trace = golden.replay;
// Header-only fixture adaptation: source changes alter the digest, never canonical values or expected hashes.
trace.initial.header.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
trace.init.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
trace.checkpoint.init.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
trace.checkpoint.snapshot.header.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
const observations: number[] = [];
const result = runSemanticReplay(LAYOUT, trace, 60, __GAMEPLAY_CONTENT_DIGEST__, state => observations.push(state.tick));

describe('replay', () => {
  it('encode/decode round-trips an intent', () => {
    const i = { ...NEUTRAL_INTENT, moveX: 0.5, interactPressed: true, cancelPressed: true };
    expect(decodeIntent(encodeIntent(i))).toEqual(i);
  });
  it('matches the golden hashes (run `npm run bless` to update deliberately)', () => {
    expect(existsSync(GOLDEN)).toBe(true);
    const firstDiff = result.hashes.findIndex((h, i) => h !== golden.hashes[i]);
    expect(firstDiff, `first divergence at tick ${(firstDiff + 1) * 60}`).toBe(-1);
    expect(result.finalHash).toBe(golden.finalHash);
  });
  it('replays the whole semantic golden: 7200 ticks from a tick-0 snapshot (V2)', () => {
    expect(observations).toHaveLength(120);
    expect(trace.initial.header.tick).toBe(0);
    expect(trace.initial.values.length).toBeGreaterThan(0);
    expect(trace.version).toBe(2);
    expect(trace.frames.filter(frame => frame.action.kind === 'tick')).toHaveLength(7200);
  });
  it('rejects a replay from another sim version or layout hash', () => {
    const base = scriptedSemanticReplay(1, 1, 5);
    expect(() => runSemanticReplay(LAYOUT, { ...base, checkpoint: { ...base.checkpoint, snapshot: { ...base.initial, header: { ...base.initial.header, simVersion: 999 } } } })).toThrow(/sim version/);
    expect(() => runSemanticReplay(LAYOUT, { ...base, checkpoint: { ...base.checkpoint, snapshot: { ...base.initial, header: { ...base.initial.header, layoutHash: 'deadbeef' } } } })).toThrow(/snapshot layout does not match/);
    expect(() => runSemanticReplay(LAYOUT, base)).not.toThrow();
  });
});
