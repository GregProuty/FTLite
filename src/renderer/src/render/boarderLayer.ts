import { Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { boarderMarkers } from '../sim/boarders';
import { syncCache } from './cache';

const SIZE = 10, COLOR = 0xe53935;

/** One red diamond per boarder at its room centre (spec Boarders-i section 7). Graphics only: no asset, no animation. */
export function createBoarderLayer(): { container: Container; draw(state: SimState): void } {
  const container = new Container();
  const marks = new Map<number, Graphics>();
  return {
    container,
    draw(state) {
      const markers = boarderMarkers(state);
      syncCache(marks, markers.map((m) => m.stableId), () => { const g = new Graphics(); g.poly([0, -SIZE / 2, SIZE / 2, 0, 0, SIZE / 2, -SIZE / 2, 0]).fill(COLOR); container.addChild(g); return g; }, (g) => { g.destroy(); });
      for (const m of markers) { const g = marks.get(m.stableId)!; g.position.set(m.x * TILE_PX, m.y * TILE_PX); g.alpha = 0.5 + 0.5 * m.health; }
    }
  };
}
