import { describe, expect, it, vi } from 'vitest';
import { createSession } from './helpers/sessionFixture';
import { createOnlineRendererSession } from '../src/renderer/src/app/onlineSession';
import { ownTestCleanup } from './helpers/simLifetime';
import { LAYOUT } from './helpers/sim';

describe('the sector sessions clear their HUD on dispose', () => {
  it('couch session: dispose calls hud.clear once, and frame() afterwards does not update', () => {
    const hud = { update: vi.fn(), clear: vi.fn() };
    const session = createSession({ layout: LAYOUT, sampleDevices: () => [], renderer: null, hud, now: () => 0, saveCrash() {} });
    session.frame(); expect(hud.update).toHaveBeenCalled();
    session.dispose(); expect(hud.clear).toHaveBeenCalledTimes(1);
    hud.update.mockClear(); session.frame(); expect(hud.update).not.toHaveBeenCalled();
  });
  it('online renderer session: dispose calls hud.clear once, and frame() afterwards does not update', () => {
    const hud = { update: vi.fn(), clear: vi.fn() };
    const session = createOnlineRendererSession({ contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT, now: () => 0, scheduler: { schedule: () => () => {} },
      sampleDevices: () => [], resetInput() {}, renderer: { reset() {}, recordPrev() {}, draw() {} }, hud, api: { viewState: async () => ({ ok: true as const }) } });
    ownTestCleanup(() => session.dispose());
    session.frame();
    session.dispose(); expect(hud.clear).toHaveBeenCalledTimes(1);
    hud.update.mockClear(); session.frame(); expect(hud.update).not.toHaveBeenCalled();
  });
});
