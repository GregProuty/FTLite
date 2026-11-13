import { Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';

const BODY = 0x8f9aab, NOSE = 0xd9483b, EDGE = 0x1c2029, RACK = 0x5f6575, FAINT = 0xb4b9c3;

/** A small torpedo centred at (cx, cy): a dark-edged grey body with a red nose and fins, `len` px long, readable on the light floors (spec Coop-ii section 2). */
export function drawTorpedo(g: Graphics, cx: number, cy: number, len: number): void {
  const h = Math.max(4, Math.round(len / 3)), x0 = cx - len / 2, nose = x0 + len - h / 2;
  g.poly([x0, cy - 0.75 * h, x0 + h, cy - h / 2, x0 + h, cy + h / 2, x0, cy + 0.75 * h]).fill(EDGE);   // fins
  g.roundRect(x0 + 1, cy - h / 2, len - h / 2, h, h / 2).fill(BODY).stroke({ width: 1, color: EDGE });
  g.circle(nose, cy, h / 2).fill(NOSE).stroke({ width: 1, color: EDGE });
}

/** The magazine mark (spec Coop-ii section 2): a rack outline on the magazine tile holding up to three torpedoes, one per stock unit shown; faint when empty. Nothing on a ship without one. */
export function createMagazineLayer(): { container: Container; draw(state: SimState): void } {
  const container = new Container();
  const g = new Graphics();
  container.addChild(g);
  let drawnFor = '';
  return {
    container,
    draw(state) {
      const d = state.derived, shown = Math.min(3, state.weapons.torpedoStock), key = `${d.layoutHash}:${shown}`;
      if (key === drawnFor) return;
      drawnFor = key; g.clear();
      if (d.magazineTile < 0) return;
      const x = (d.magazineTile % d.width) * TILE_PX, y = Math.floor(d.magazineTile / d.width) * TILE_PX;
      g.rect(x + 3, y + 3, TILE_PX - 6, TILE_PX - 6).stroke({ width: 2, color: shown > 0 ? RACK : FAINT });
      for (let k = 0; k < shown; k++) drawTorpedo(g, x + TILE_PX / 2, y + 9 + k * 7, TILE_PX - 14);
    }
  };
}
