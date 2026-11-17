// The HUD image cache (React UI spec §4): the names the HUD may draw (only for features whose art is all present), each
// extracted once, a failed extraction omitted with one warning.
import { describe, expect, it, vi } from 'vitest';
import { buildImageCache, hudImageNames } from '../src/renderer/src/ui/images';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { ICON_KINDS } from '../src/renderer/src/render/roomIconModel';

describe('hudImageNames', () => {
  it('lists every icon and prompt glyph when their features are complete, none of a feature with a missing name', () => {
    const all = hudImageNames([]);
    for (const n of [...FEATURE_NAMES.icons, ...FEATURE_NAMES.glyphs]) expect(all).toContain(n);
    expect(hudImageNames(['prompt.kb.E']).some((n) => n.startsWith('prompt.'))).toBe(false);
    expect(hudImageNames(['icon.fire']).some((n) => n.startsWith('icon.'))).toBe(false);
  });
});

describe('buildImageCache', () => {
  it('extracts each name and glyph kind once, keys glyphs glyph.<kind> and omits failures with a warning', async () => {
    const texture = vi.fn(async (n: string) => n === 'icon.bad' ? null : { url: `data:${n}`, w: 16, h: 16 });
    const glyph = vi.fn(async (k: string) => { if (k === 'doors') throw Error('x'); return { url: `data:g.${k}`, w: 20, h: 20 }; });
    const warn = vi.fn();
    const cache = await buildImageCache(['icon.fire', 'icon.bad'], ICON_KINDS, { texture, glyph }, warn);
    expect(cache.get('icon.fire')).toEqual({ url: 'data:icon.fire', w: 16, h: 16 }); expect(cache.has('icon.bad')).toBe(false);
    expect(cache.get('glyph.navigation')!.w).toBe(20); expect(cache.has('glyph.doors')).toBe(false);
    expect(texture).toHaveBeenCalledTimes(2); expect(glyph).toHaveBeenCalledTimes(ICON_KINDS.length); expect(warn).toHaveBeenCalledTimes(2);
  });
});
