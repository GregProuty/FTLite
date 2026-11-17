import { Container, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import { battlemapFor } from './battlemapModel';

/** The painted battlemap under the interior (Art-iv spec section 4): one sprite, smoothly filtered (painted art is exempt
 *  from the whole-pixel rule), placed so the painted walls line up with the layout's wall tiles. Hidden for other layouts.
 *  Mipmaps (it is shown at about a third of source size): verified against pixi.js 8.19, GlTextureSystem allocates the mip
 *  chain (mipLevelCount) and generates it at first upload when source.autoGenerateMipmaps is true, so setting the flag before
 *  the first render is enough; scaleMode 'linear' also sets mipmapFilter. updateMipmaps() is a no-op until uploaded
 *  (it needs mipLevelCount > 1), so it is not called. No new TextureSource is needed. */
export function createBattlemapLayer(assets: GameAssets): { container: Container; draw(state: SimState): void } {
  const container = new Container(), missing = new Set(assets.missing);
  let drawnFor: string | null = null;
  return {
    container,
    draw(state) {
      if (drawnFor === state.layout.id) return;
      drawnFor = state.layout.id;
      for (const c of container.removeChildren()) c.destroy();
      const def = battlemapFor(state.layout.id, missing);
      if (!def) return;
      const tex = assets.texture(def.name), src = tex.source;
      src.scaleMode = 'linear';
      src.autoGenerateMipmaps = true;
      const s = new Sprite(tex);
      s.scale.set(TILE_PX / def.pxPerTile);
      s.position.set(def.origin.x * TILE_PX, def.origin.y * TILE_PX);
      container.addChild(s);
    }
  };
}
