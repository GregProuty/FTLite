import { Container, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import { featureReady } from './fallback';
import { consolePlacement } from './consoleModel';
import { propKey, propSlots } from './propModel';

/** The set dressing (Art-iii spec section 4): one sprite per prop slot, flush to its wall and turned by quarter turns, in
 *  its own container directly over the tiles, so the grade, effects, icons, consoles, magazine, fixtures and crew draw over
 *  it. Rebuilt only when propKey changes. No tint, no state; empty without the propArt feature (today's look). */
export function createPropLayer(assets: GameAssets): { container: Container; draw(state: SimState): void } {
  const container = new Container();
  const ready = featureReady(new Set(assets.missing), 'propArt');
  let drawnFor = '', drawnLayout: unknown = null;
  return {
    container,
    draw(state) {
      if (!ready || state.layout === drawnLayout) return;   // same layout object: nothing to rebuild (avoids building propKey every frame)
      drawnLayout = state.layout;
      const key = propKey(state);
      if (key === drawnFor) return;
      drawnFor = key;
      for (const s of container.removeChildren()) s.destroy();
      const W = state.derived.width;
      for (const slot of propSlots(state)) {
        const tex = assets.texture(slot.name), p = consolePlacement(slot.side, true, tex.width, tex.height);
        const tx = slot.tile % W, ty = (slot.tile - tx) / W;
        const s = new Sprite(tex); s.anchor.set(0.5); s.scale.set(2); s.rotation = p.rotation;
        s.position.set(tx * TILE_PX + p.cx, ty * TILE_PX + p.cy); container.addChild(s);
      }
    }
  };
}
