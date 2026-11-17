// Painted fire (art spike): soft layered flame tongues over a burning bed, with one thick ink outline round the whole
// blaze of a room, a scorch under it, and an additive glow. Drawn every frame from the presentation clock (it holds in a
// hitstop and a pause).
import { Container, Graphics, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../../shared/resolution';
import type { SimState } from '../../sim/state';
import { FIRE_CAP } from '../../sim/tuning';
import { fireTiles } from '../hazardTiles';
import { syncCache } from '../cache';
import { FLAME, INK } from './ink';
import { flameGlow, tileTongues, type Tongue } from './flameModel';
import { softTextures } from './softTextures';

export interface PaintedFire {
  /** Under the crew (into effects.below): the scorch and the flames. */
  below: Container;
  /** Into the (additive) lights: the glow. */
  glow: Container;
  draw(state: SimState | null, t: number): void;
  destroy(): void;
}

/** A teardrop tongue scaled by `s` about its base's bottom (inner layers sit low in the flame). */
function tongue(g: Graphics, q: Tongue, s: number): void {
  const r = q.r * s, h = q.h * s, cx = q.x + q.lean * (1 - s) * 0.3, cy = q.y + q.r * (1 - s) * 0.8, tipX = cx + q.lean * s, tipY = cy - h;
  g.moveTo(tipX, tipY)
    .bezierCurveTo(cx + r * 0.35 + q.lean * 0.3 * s, cy - h * 0.5, cx + r * 1.3, cy - r * 0.35, cx, cy + r)
    .bezierCurveTo(cx - r * 1.3, cy - r * 0.35, cx - r * 0.35 + q.lean * 0.3 * s, cy - h * 0.5, tipX, tipY)
    .closePath();
}

const LAYERS: readonly { s: number; color: number }[] = [{ s: 1, color: FLAME[3] }, { s: 0.74, color: FLAME[2] }, { s: 0.5, color: FLAME[1] }, { s: 0.26, color: FLAME[0] }];
const GLOW_SIZE = TILE_PX * 2.6;

export function createPaintedFire(): PaintedFire {
  const below = new Container(), scorch = new Graphics(), flames = new Graphics(), glow = new Container();
  below.addChild(scorch, flames);
  const glows = new Map<number, Sprite>();
  return {
    below, glow,
    draw(state, t) {
      scorch.clear(); flames.clear();
      const burning: number[] = [];
      if (state) for (let room = 0; room < state.derived.volume.length; room++) if (state.rooms.fire[room]! > 0) burning.push(...fireTiles(state.derived.roomTiles[room]!, state.rooms.fire[room]!, FIRE_CAP));
      syncCache(glows, burning, () => { const s = new Sprite(softTextures().glow); s.anchor.set(0.5); s.setSize(GLOW_SIZE, GLOW_SIZE); s.tint = FLAME[2]; glow.addChild(s); return s; }, (s) => s.destroy());
      if (!state) return;
      const d = state.derived, T = TILE_PX;
      for (let room = 0; room < d.volume.length; room++) {
        const fire = state.rooms.fire[room]!;
        if (fire <= 0) continue;
        const tiles = fireTiles(d.roomTiles[room]!, fire, FIRE_CAP), all: Tongue[] = [];
        for (const tile of tiles) {
          const tx = tile % d.width, ty = (tile - tx) / d.width, cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
          scorch.ellipse(cx, cy + T * 0.12, T * 0.62, T * 0.48).fill({ color: INK, alpha: 0.28 });
          glows.get(tile)!.position.set(cx, cy - T * 0.1); glows.get(tile)!.alpha = 0.55 * flameGlow(tile, t);
          all.push(...tileTongues(tile, tx, ty, t));
        }
        all.sort((u, v) => u.y - v.y);
        // The ink: every tongue's outer silhouette stroked thick, then filled over, so only the blaze's outside edge stays inked.
        for (const q of all) tongue(flames, q, 1);
        flames.stroke({ width: 5, color: INK, join: 'round' });
        for (const { s, color } of LAYERS) { for (const q of all) tongue(flames, q, s); flames.fill(color); }
      }
    },
    destroy() { scorch.destroy(); flames.destroy(); for (const s of glows.values()) s.destroy(); glows.clear(); glow.destroy(); }
  };
}
