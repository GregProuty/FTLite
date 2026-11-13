import { Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';

const BODY = 0xb8c0cc, NOSE = 0xd9483b, RACK = 0x5f6575, FAINT = 0xb4b9c3;

/** A small torpedo centred at (cx, cy): a grey body with a red nose, `len` px long (spec Coop-ii section 2). */
export function drawTorpedo(g: Graphics, cx: number, cy: number, len: number): void {
  const h = Math.max(4, Math.round(len / 3)), x0 = cx - len / 2;
  g.roundRect(x0, cy - h / 2, len - h / 2, h, h / 2).fill(BODY);
  g.circle(x0 + len - h / 2, cy, h / 2).fill(NOSE);
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
      for (let k = 0; k < shown; k++) drawTorpedo(g, x + TILE_PX / 2, y + 9 + k * 7, TILE_PX - 12);
    }
  };
}
