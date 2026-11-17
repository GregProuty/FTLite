// The Pixi side of the UI image cache (React UI spec §4): textures and the white station glyphs to data URLs, once.
import { Graphics, Rectangle, Sprite } from 'pixi.js';
import type { GameAssets } from '../render/assets';
import type { Renderer } from '../render/renderer';
import { drawIcon } from '../render/roomIcons';
import type { IconKind } from '../render/roomIconModel';
import type { ImageSource, UiImage } from '../ui/images';

export function createPixiImageSource(renderer: Renderer, assets: GameAssets): ImageSource {
  const extract = renderer.app.renderer.extract;
  return {
    async texture(name): Promise<UiImage | null> {
      if (!assets.has(name)) return null;
      const t = assets.texture(name), sprite = new Sprite(t);
      try { return { url: await extract.base64(sprite), w: t.width, h: t.height }; } finally { sprite.destroy(); }
    },
    async glyph(kind): Promise<UiImage | null> {
      const g = new Graphics(); drawIcon(g, kind as IconKind, 10, 10, 16, 0xffffff);
      try { return { url: await extract.base64({ target: g, frame: new Rectangle(0, 0, 20, 20) }), w: 20, h: 20 }; } finally { g.destroy(); }
    }
  };
}
