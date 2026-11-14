import { createSession as createAppSession, type SessionDeps } from '../../src/renderer/src/app/session';
import { createSimState, type SimState } from '../../src/renderer/src/sim/state';
import { createFixtureAuthority } from './authorityFixture';
export { DEFAULT_SEED } from '../../src/renderer/src/app/session';

/** Existing session scenarios explicitly adopt an owner; production exposes only its replica. */
export function createSession(deps: SessionDeps) {
  let sampledNow = 0;
  let owner: SimState | null = null, core: ReturnType<typeof createFixtureAuthority> | null = null;
  const session = createAppSession({ ...deps, now: () => sampledNow, authorityFactory: (authorityDeps) => {
    let attachment: { link: Parameters<NonNullable<typeof core>['attach']>[0]; players: readonly number[] } | null = null;
    return {
      attach(link, players) { attachment = { link, players }; return () => {}; },
      start(init) {
        owner = createSimState(authorityDeps.resolveLayout(init.layoutId), init.playerCount, init.seed, init.characters, { unlocked: init.unlocked, quirk: init.quirk });
        core = createFixtureAuthority({ ...authorityDeps, init }, owner);
        if (attachment) core.attach(attachment.link, attachment.players);
      },
      pump() { core!.pump(); }, dispose() { core?.dispose(); }
    };
  } });
  return new Proxy(session, { get(target, key, receiver) {
    if (key === 'state') return owner;
    if (key === 'frame') return () => {
      sampledNow = deps.now();
      // Fixture mutations are published before any controller decisions. Corruption tests
      // intentionally make snapshotting fail; the authority records the faulting tick.
      try { core?.publishCompletedState(); } catch { /* deliberate corrupt fixture */ }
      session.pump(); session.frame();
    };
    return Reflect.get(target, key, receiver);
  } });
}
