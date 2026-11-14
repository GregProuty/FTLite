import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { encodeIntent, decodeIntent } from '../src/renderer/src/sim/replay';
import { convertLegacyReplay } from './helpers/legacyReplay';
import { runSemanticReplay, type SemanticTrace } from './helpers/semanticReplay';
import { firstDifference, projectGameplay } from './helpers/gameplayTrace';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { LAYOUT } from './helpers/sim';
import { scriptedReplay, scriptedSemanticReplay } from './helpers/script';

const GOLDEN = 'tests/golden/basic.json';
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { replay: SemanticTrace | ReturnType<typeof scriptedReplay>; hashes: string[]; finalHash: string };
// Pre-cutover saved input is converted solely in this test; blessing saves semantic input.
const trace = 'intents' in golden.replay ? convertLegacyReplay(LAYOUT, golden.replay) : golden.replay;
// Header-only fixture adaptation: source changes alter the digest, never canonical values or expected hashes.
trace.initial.header.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
const observations: { tick: number; state: Record<string, unknown> }[] = [];
const result = runSemanticReplay(LAYOUT, trace, 60, __GAMEPLAY_CONTENT_DIGEST__, state => observations.push({ tick: state.tick, state: projectGameplay(state) }));

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
  it('matches independent task-1 gameplay projections at every 60-tick checkpoint and final state', () => {
    const pinned = JSON.parse(readFileSync('tests/fixtures/net1a-baseline.json', 'utf8')) as { scenarios: { name: string; observations: typeof observations }[] };
    const expected = pinned.scenarios.find(s => s.name === 'golden-2026-four-7200')!.observations.filter(o => o.tick > 0);
    expect(observations).toHaveLength(120);
    expect(firstDifference(expected, observations)).toBeNull();
    expect(trace.initial.header.tick).toBe(0);
    expect(trace.initial.values.length).toBeGreaterThan(0);
    expect(trace.ticks.every(input => Object.keys(input).sort().join(',') === 'commands,held')).toBe(true);
  });
  it('rejects a replay from another sim version or layout hash', () => {
    const base = scriptedSemanticReplay(1, 1, 5);
    expect(() => runSemanticReplay(LAYOUT, { ...base, initial: { ...base.initial, header: { ...base.initial.header, simVersion: 999 } } })).toThrow(/sim version/);
    expect(() => runSemanticReplay(LAYOUT, { ...base, initial: { ...base.initial, header: { ...base.initial.header, layoutHash: 'deadbeef' } } })).toThrow(/snapshot layout does not match/);
    expect(() => runSemanticReplay(LAYOUT, base)).not.toThrow();
  });
});
