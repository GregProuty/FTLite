// The UI store (React UI spec §2): one vanilla zustand store, written from plain TypeScript (the actions, main.ts) and
// read by components through selectors. UI-ii and UI-iii add the per-frame hud, duel and flight slices.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ControlSection } from '../app/controlsList';
import { DEFAULT_CRT, type CrtSetting } from '../render/crt';
import { DEFAULT_SHAKE, type ShakeSetting } from '../render/shake';
import { INITIAL_BROWSER, INITIAL_MENU, type BrowserSlice, type LayoutSlice, type ShipChoice, type UiState } from './menuState';

export type UiStore = StoreApi<UiState>;
export interface UiStoreInit {
  onlineAvailable: boolean;
  browser?: Partial<BrowserSlice>;
  settings?: { master: number; music: number; effects: number; fullscreenAvailable: boolean; controls: readonly ControlSection[]; shake?: ShakeSetting; ships?: readonly ShipChoice[]; soloShip?: string; valkyrnLaserFit?: boolean };
}
export function createUiStore(init: UiStoreInit): UiStore {
  return createStore<UiState>()(() => ({
    menu: INITIAL_MENU,
    online: { available: init.onlineAvailable, status: null, receivedAt: 0 },
    settings: init.settings ? { available: true, shake: DEFAULT_SHAKE, ships: [], soloShip: '', valkyrnLaserFit: false, ...init.settings }
      : { available: false, master: 1, music: 1, effects: 1, fullscreenAvailable: false, controls: [], shake: DEFAULT_SHAKE, ships: [], soloShip: '', valkyrnLaserFit: false },
    layout: { stripHeight: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1 },
    browser: { ...INITIAL_BROWSER, ...init.browser },
    duel: null, flight: null, hud: null, latency: null, epochs: { duel: 0, flight: 0, hud: 0 }, crt: DEFAULT_CRT
  }));
}

/** The letterbox and dpr from main.ts's resize (spec §4); writes only a change. */
export function setLayout(store: UiStore, patch: Partial<Omit<LayoutSlice, 'stripHeight'>>): void {
  const cur = store.getState().layout;
  if ((Object.keys(patch) as (keyof typeof patch)[]).every((k) => cur[k] === patch[k])) return;
  store.setState((s) => ({ layout: { ...s.layout, ...patch } }));
}

/** The CRT strength setting (CRT map spec section 4); writes only a change. */
export function setCrtSetting(store: UiStore, crt: CrtSetting): void {
  if (store.getState().crt !== crt) store.setState({ crt });
}
