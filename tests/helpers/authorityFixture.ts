import { createAuthorityCore } from '../../src/renderer/src/authority/core';
import type { AuthorityDeps } from '../../src/renderer/src/authority/authority';
import type { SimState } from '../../src/renderer/src/sim/state';
import type { RunInit } from '../../src/renderer/src/net/contracts';
import { createHeadlessRunner } from '../../src/renderer/src/headless/runner';
import { flatten } from '../../src/renderer/src/sim/flatten';

/** Sole test-only owner adoption seam. Production always allocates its own state. */
export function createFixtureAuthority(deps: AuthorityDeps & { init: RunInit }, state: SimState) {
  return createAuthorityCore(deps, state);
}
export function createFixtureRunner(state: SimState, contentDigest = __GAMEPLAY_CONTENT_DIGEST__) {
  let core: ReturnType<typeof createFixtureAuthority>;
  const runner = createHeadlessRunner({ layout: state.layout, playerCount: state.playerCount, seed: 1, contentDigest }, (deps) => {
    let attached: { link: Parameters<typeof core.attach>[0]; players: readonly number[] } | null = null;
    return {
      attach(link, players) { attached = { link, players }; return () => {}; },
      start(init) { core = createFixtureAuthority({ ...deps, init }, state); if (attached) core.attach(attached.link, attached.players); },
      pump() { core.pump(); }, dispose() { core.dispose(); }
    };
  });
  return { ...runner, refresh() {
    // Repeated bot decisions in one tick need one publication unless a fixture
    // changed in between. Compare canonical values, including ECS-backed fields.
    const owner = flatten(state), replica = flatten(runner.view());
    if (owner.length === replica.length && owner.every((value, i) => value === replica[i])) return;
    core.publishCompletedState(); runner.drain();
  } };
}
