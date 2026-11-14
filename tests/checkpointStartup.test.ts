import { expect, it } from 'vitest';
import { createAuthority } from '../src/renderer/src/authority/authority';
import { createCardUiState } from '../src/renderer/src/clientControl/cardController';
import type { LifecyclePause } from '../src/renderer/src/net/contracts';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { LAYOUT } from './helpers/sim';

function startupRig() {
  let fail: 'throw' | 'invalid' | undefined, callback: ((control: LifecyclePause) => void) | null = null;
  const timers = new Set<() => void>(), registrations = new Set<(control: LifecyclePause) => void>();
  const init = { runId: 'baseline-startup', seed: 1, playerCount: 1, characters: [0], unlocked: [], layoutId: LAYOUT.id,
    layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ };
  const authority = createAuthority({ clock: { nowMs: () => 0 }, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT,
    scheduler: { schedule(_delay, next) { timers.add(next); return () => { timers.delete(next); }; } }, onCrash(record) { throw Error(record.error); },
    botControllers() {
      if (fail === 'throw') throw Error('bot state failed');
      const ui = createCardUiState(init.runId, 1); if (fail === 'invalid') ui.players[0]!.nextSequence = 0;
      return [ui];
    },
    bindLifecyclePause(next) {
      registrations.add(next); callback = next;
      return () => { registrations.delete(next); if (callback === next) callback = null; };
    }
  });
  return { authority, init, timers, registrations, callback: () => callback, fail(value: typeof fail) { fail = value; } };
}
it.each(['throw', 'invalid'] as const)('releases every registration after %s initial bot baseline failure', failure => {
  const h = startupRig(); h.fail(failure);
  try {
    expect(() => h.authority.start(h.init)).toThrow();
    expect(h.timers.size).toBe(0); expect(h.registrations.size).toBe(0); expect(h.callback()).toBeNull();
  } finally { h.authority.dispose(); }
  expect(h.timers.size).toBe(0); expect(h.registrations.size).toBe(0); expect(h.callback()).toBeNull();
});
it.each(['throw', 'invalid'] as const)('preserves the existing owner and lifecycle callback after %s replacement baseline failure', failure => {
  const h = startupRig(); h.authority.start(h.init);
  try {
    const before = h.authority.checkpoint([]), callback = h.callback(); h.fail(failure);
    expect(() => h.authority.start(h.init)).toThrow();
    expect(h.authority.checkpoint([])).toEqual(before);
    expect(h.timers.size).toBe(1); expect(h.registrations.size).toBe(1); expect(h.callback()).toBe(callback);
    h.callback()!({ paused: true, reason: 'old-owner-blur' }); h.authority.pump();
    expect(h.authority.checkpoint([])).toMatchObject({ phase: 'paused', pauseReason: 'old-owner-blur', controlRevision: 1 });
  } finally { h.authority.dispose(); }
  expect(h.timers.size).toBe(0); expect(h.registrations.size).toBe(0); expect(h.callback()).toBeNull();
});
