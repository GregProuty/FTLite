// Mounts the UI into its element over the canvas (React UI spec §1, §4). It awaits the m5x7 font (already registered by
// loadAssets) and builds the glyph atlas first; on failure the atlas falls back to monospace with one warning.
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { UiActions } from './actions';
import { UiContext } from './context';
import { buildGlyphAtlas } from './glyphs';
import { ImagesContext } from './stage/ImagesContext';
import type { UiImages } from './images';
import { GlyphContext } from './stage/GlyphContext';
import type { UiStore } from './store';
import { UiRoot } from './UiRoot';

export async function mountWith(opts: { el: HTMLElement; store: UiStore; actions: UiActions; images?: UiImages }, page: ReactElement): Promise<() => void> {
  let family = 'm5x7';
  try { await document.fonts.load('16px m5x7'); } catch { /* checked below */ }
  if (!document.fonts.check('16px m5x7')) { family = 'monospace'; console.warn('[ui] m5x7 is not available; HUD text falls back to monospace'); }
  const make = (w: number, h: number): HTMLCanvasElement => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const atlas = buildGlyphAtlas(make, family);
  if (!atlas) console.warn('[ui] glyph atlas unavailable; HUD text will not draw');
  const root = createRoot(opts.el), value = { store: opts.store, actions: opts.actions };
  root.render(<UiContext.Provider value={value}><GlyphContext.Provider value={atlas}><ImagesContext.Provider value={opts.images ?? new Map()}>{page}</ImagesContext.Provider></GlyphContext.Provider></UiContext.Provider>);
  return () => root.unmount();
}

export function mountUi(opts: { el: HTMLElement; store: UiStore; actions: UiActions; menu?: boolean; images?: UiImages }): Promise<() => void> { return mountWith(opts, <UiRoot menu={opts.menu ?? true} />); }
