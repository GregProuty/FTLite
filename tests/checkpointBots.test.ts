import { expect, it } from 'vitest';
import { createHeadlessRunner } from '../src/renderer/src/headless/runner';
import { hashState } from '../src/renderer/src/sim/hash';
import { LAYOUT } from './helpers/sim';
it('restores bot cursor/repeat memory and continues through the public headless owner', () => {
  const init = { layout: LAYOUT, playerCount: 1, seed: 17, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, runId: 'bots' };
  const a = createHeadlessRunner(init), b = createHeadlessRunner(init);
  try {
    for (let t = 0; t < 40; t++) a.advanceBots();
    const checkpoint = a.checkpoint(); b.restore(checkpoint);
    expect(b.ui).toEqual(checkpoint.botControllers[0]);
    a.setPaused(false); b.setPaused(false);
    for (let t = 0; t < 60; t++) { a.advanceBots(); b.advanceBots(); expect(hashState(b.view())).toBe(hashState(a.view())); }
    expect(b.ui).toEqual(a.ui);
    expect(b.checkpoint().commandHighWater).toEqual(a.checkpoint().commandHighWater);
  } finally { a.dispose(); b.dispose(); }
});
it('periodic crash baselines retain current host bot controller memory', () => {
  const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 1, seed: 17, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  try {
    for (let t = 0; t < 301; t++) runner.advanceBots();
    const baseline = runner.replay().checkpoint;
    expect(baseline.snapshot.header.tick).toBe(300);
    expect(baseline.botControllers[0]!.players[0]!.botDecisionTick).toBe(299);
  } finally { runner.dispose(); }
});
it('initial crash baseline includes default bot producer sequences before the first publication', () => {
  const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 1, seed: 17, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  try { expect(runner.replay().checkpoint.botControllers[0]!.players[0]!.nextSequence).toBe(1); }
  finally { runner.dispose(); }
});
