// Mounts the UI into its element over the canvas (React UI spec §1). Returns the unmount.
import { createRoot } from 'react-dom/client';
import type { UiActions } from './actions';
import { UiContext } from './context';
import type { UiStore } from './store';
import { UiRoot } from './UiRoot';

export function mountUi(opts: { el: HTMLElement; store: UiStore; actions: UiActions }): () => void {
  const root = createRoot(opts.el), value = { store: opts.store, actions: opts.actions };
  root.render(<UiContext.Provider value={value}><UiRoot /></UiContext.Provider>);
  return () => root.unmount();
}
