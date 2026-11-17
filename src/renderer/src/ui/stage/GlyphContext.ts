import { createContext, useContext } from 'react';
import type { GlyphAtlas } from '../glyphs';
/** The atlas mountUi built, or null (tests, or a failed build): PixelText then renders an empty canvas. */
export const GlyphContext = createContext<GlyphAtlas | null>(null);
export function useGlyphs(): GlyphAtlas | null { return useContext(GlyphContext); }
