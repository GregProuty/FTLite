// The HUD's images (React UI spec §4): data URLs extracted once at mount from Pixi's textures and the station glyphs.
// A feature whose art is not all present contributes nothing (hud.ts's featureReady rule); a failed extraction is
// omitted with one warning, and <Icon> then draws nothing, as the Pixi HUD drew no sprite.
import { ASSET_NAMES } from '../render/assetNames';
import { FEATURE_NAMES, featureReady } from '../render/fallback';

export interface UiImage { url: string; w: number; h: number }
export type UiImages = ReadonlyMap<string, UiImage>;
export interface ImageSource { texture(name: string): Promise<UiImage | null>; glyph(kind: string): Promise<UiImage | null> }

export function hudImageNames(missing: readonly string[]): string[] {
  const gone = new Set(missing), out: string[] = [];
  if (featureReady(gone, 'icons')) out.push(...Object.keys(ASSET_NAMES).filter((n) => n.startsWith('icon.') && !gone.has(n)));
  if (featureReady(gone, 'glyphs')) out.push(...FEATURE_NAMES.glyphs);
  return out;
}

export async function buildImageCache(names: readonly string[], glyphKinds: readonly string[], source: ImageSource, warn: (m: string) => void = (m) => console.warn(m)): Promise<UiImages> {
  const cache = new Map<string, UiImage>();
  const take = async (key: string, get: () => Promise<UiImage | null>): Promise<void> => {
    try { const img = await get(); if (img) cache.set(key, img); else warn(`[ui] image ${key} unavailable`); }
    catch { warn(`[ui] image ${key} failed to extract`); }
  };
  for (const n of names) await take(n, () => source.texture(n));
  for (const k of glyphKinds) await take(`glyph.${k}`, () => source.glyph(k));
  return cache;
}
