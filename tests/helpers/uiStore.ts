// A UI store and its actions with fake router callbacks (React UI spec §8). No React: node and jsdom tests share it.
import { vi } from 'vitest';
import { createUiStore } from '../../src/renderer/src/ui/store';
import { createUiActions, type UiActionDeps } from '../../src/renderer/src/ui/actions';
import type { OnlineStatus } from '../../src/shared/onlineSession';
import type { ControlSection } from '../../src/renderer/src/app/controlsList';

export const idle: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect', 'forget-seat'] };
/** Let settled promises run their continuations (an invoke's await, finally and then). */
export const flush = async (): Promise<void> => { for (let k = 0; k < 6; k++) await Promise.resolve(); };

export interface FixtureOptions {
  /** The preload API's methods; null for an app with no online bridge. */
  api?: Record<string, unknown> | null;
  deps?: Partial<Omit<UiActionDeps, 'store'>>;
  /** null for no Settings dependency. */
  settings?: { master?: number; music?: number; effects?: number; controls?: ControlSection[] } | null;
}
export function makeUi(o: FixtureOptions = {}) {
  const store = createUiStore({ onlineAvailable: o.api !== null,
    settings: o.settings === null ? undefined : { master: o.settings?.master ?? 1, music: o.settings?.music ?? 1, effects: o.settings?.effects ?? 1, fullscreenAvailable: !!o.deps?.fullscreen, controls: o.settings?.controls ?? [] } });
  const deps = { store, api: (o.api === null ? undefined : (o.api ?? {})) as UiActionDeps['api'],
    single: vi.fn(), online: vi.fn(), pause: vi.fn(), home: vi.fn(), setVolume: vi.fn(), quit: vi.fn(), ...o.deps };   // perfNow: the real performance.now(), the clock MirrorLine reads
  return { store, deps, actions: createUiActions(deps) };
}
