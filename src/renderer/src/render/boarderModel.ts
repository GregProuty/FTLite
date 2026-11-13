import type { SimState } from '../sim/state';

/** Boarders as walking figures (the user, 2026-11-13: "boarders need to be actual npc guys not just dots"). The sim moves a boarder room to room in one step; the render walks the figure there through the door between the rooms. Pure: no Pixi. */
export const BOARDER_WALK_TILES_PER_S = 2.5;
export const BOARDER_TINT = 0xc62828;

export interface Walker { x: number; y: number; room: number; path: { x: number; y: number }[] }

/** The door tile's centre between two rooms, or null when they share no door. */
export function doorBetween(state: SimState, a: number, b: number): { x: number; y: number } | null {
  const d = state.derived;
  for (let e = 0; e < d.edgeA.length; e++) {
    if (!d.edgeIsDoor[e]) continue;
    if ((d.edgeA[e] === a && d.edgeB[e] === b) || (d.edgeA[e] === b && d.edgeB[e] === a)) {
      const t = d.edgeTile[e]!, tx = t % d.width;
      return { x: tx + 0.5, y: (t - tx) / d.width + 0.5 };
    }
  }
  return null;
}

/** A new figure stands at its marker. */
export function freshWalker(m: { x: number; y: number; room: number }): Walker { return { x: m.x, y: m.y, room: m.room, path: [] }; }

/** One frame: retarget when the sim moved the boarder (via the door between the rooms), then walk along the path. Returns the movement this frame. */
export function stepWalker(state: SimState, w: Walker, m: { x: number; y: number; room: number }, dt: number): { dx: number; dy: number } {
  if (m.room !== w.room) {
    const door = doorBetween(state, w.room, m.room);
    w.path = door ? [door, { x: m.x, y: m.y }] : [{ x: m.x, y: m.y }];
    w.room = m.room;
  } else if (w.path.length === 0 && (w.x !== m.x || w.y !== m.y)) w.path = [{ x: m.x, y: m.y }];
  else if (w.path.length > 0) w.path[w.path.length - 1] = { x: m.x, y: m.y };
  const x0 = w.x, y0 = w.y;
  let budget = BOARDER_WALK_TILES_PER_S * dt;
  while (budget > 0 && w.path.length > 0) {
    const p = w.path[0]!, dx = p.x - w.x, dy = p.y - w.y, dist = Math.hypot(dx, dy);
    if (dist <= budget) { w.x = p.x; w.y = p.y; budget -= dist; w.path.shift(); }
    else { w.x += (dx / dist) * budget; w.y += (dy / dist) * budget; budget = 0; }
  }
  return { dx: w.x - x0, dy: w.y - y0 };
}
