// The UI's store and actions for components (React UI spec §2): selectors return a store reference or a primitive,
// never a fresh object (zustand 5 loops on those).
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { UiActions } from './actions';
import type { UiState } from './menuState';
import type { UiStore } from './store';

export const UiContext = createContext<{ store: UiStore; actions: UiActions } | null>(null);
function useUiContext(): { store: UiStore; actions: UiActions } {
  const value = useContext(UiContext); if (!value) throw Error('ui-context-missing'); return value;
}
export function useUi<T>(selector: (s: UiState) => T): T { return useStore(useUiContext().store, selector); }
export function useActions(): UiActions { return useUiContext().actions; }
