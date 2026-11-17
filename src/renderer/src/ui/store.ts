// The UI store (React UI spec §2): one vanilla zustand store, written from plain TypeScript (the actions, main.ts) and
// read by components through selectors. UI-ii and UI-iii add the per-frame hud, duel and flight slices.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ControlSection } from '../app/controlsList';
import { INITIAL_MENU, type UiState } from './menuState';

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
    layout: { stripHeight: 0 }
  }));
}
