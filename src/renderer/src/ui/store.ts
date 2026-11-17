// The UI store (React UI spec §2): one vanilla zustand store, written from plain TypeScript (the actions, main.ts) and
// read by components through selectors. UI-ii and UI-iii add the per-frame hud, duel and flight slices.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ControlSection } from '../app/controlsList';
import { INITIAL_MENU, type LayoutSlice, type UiState } from './menuState';

export type UiStore = StoreApi<UiState>;
export interface UiStoreInit {
  onlineAvailable: boolean;
  settings?: { volume: number; fullscreenAvailable: boolean; controls: readonly ControlSection[] };
}
export function createUiStore(init: UiStoreInit): UiStore {
  return createStore<UiState>()(() => ({
    menu: INITIAL_MENU,
    online: { available: init.onlineAvailable, status: null, receivedAt: 0 },
    settings: init.settings ? { available: true, ...init.settings } : { available: false, volume: 1, fullscreenAvailable: false, controls: [] },
    layout: { stripHeight: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1 },
    duel: null, flight: null, hud: null, epochs: { duel: 0, flight: 0, hud: 0 }
  }));
}

/** The letterbox and dpr from main.ts's resize (spec §4); writes only a change. */
export function setLayout(store: UiStore, patch: Partial<Omit<LayoutSlice, 'stripHeight'>>): void {
  const cur = store.getState().layout;
  if ((Object.keys(patch) as (keyof typeof patch)[]).every((k) => cur[k] === patch[k])) return;
  store.setState((s) => ({ layout: { ...s.layout, ...patch } }));
}
