import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState, Seated } from './components';
import { solidAt } from './grid';
import { intentFor } from './step';
import { speedMult } from './characters';
import { CREW_SPEED, CREW_HALF, DT, MOVE_EPS, CARRY_SPEED_MULT } from './tuning';

type Solid = (tx: number, ty: number) => boolean;

function overlaps(solid: Solid, x: number, y: number, half: number): boolean {
  const x0 = Math.floor(x - half), x1 = Math.floor(x + half - MOVE_EPS);
  const y0 = Math.floor(y - half), y1 = Math.floor(y + half - MOVE_EPS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
  return false;
}

/**
 * Corner sliding (doorways): a blocked move whose hitbox spans two lanes at the blocking face, exactly one of them open,
 * slides the crew toward that open lane's centre by at most the move's own length (never into a wall). `lane` is the
 * crew's position across the move, `face` the tile index of the blocking face along the move.
 */
function slideToward(open: (laneTile: number) => boolean, lane: number, half: number, speed: number): number {
  const a = Math.floor(lane - half), b = Math.floor(lane + half - MOVE_EPS);
  if (a === b) return lane;                                                   // the hitbox sits in one lane: a plain wall, no slide
  const openA = open(a), openB = open(b);
  if (openA === openB) return lane;                                           // both open (not blocked by this face) or both solid
  const target = (openA ? a : b) + 0.5;
  return lane + Math.max(-speed, Math.min(speed, target - lane));
}

/** Per-axis AABB move against solid tiles: X first, then Y, snapping flush to the blocking tile; a blocked move slides into a one-tile doorway the hitbox partly covers. */
export function moveAABB(solid: Solid, x: number, y: number, dx: number, dy: number, half: number): { x: number; y: number } {
  if (dx !== 0) {
    const nx = x + dx;
    if (!overlaps(solid, nx, y, half)) x = nx;
    else {
      const fx = dx > 0 ? Math.floor(nx + half - MOVE_EPS) : Math.floor(nx - half);
      const sy = slideToward((ty) => !solid(fx, ty), y, half, Math.abs(dx));
      if (sy !== y && !overlaps(solid, x, sy, half)) y = sy;
      x = dx > 0 ? Math.floor(nx + half) - half - MOVE_EPS : Math.floor(nx - half) + 1 + half + MOVE_EPS;
    }
  }
  if (dy !== 0) {
    const ny = y + dy;
    if (!overlaps(solid, x, ny, half)) y = ny;
    else {
      const fy = dy > 0 ? Math.floor(ny + half - MOVE_EPS) : Math.floor(ny - half);
      const sx = slideToward((tx) => !solid(tx, fy), x, half, Math.abs(dy));
      if (sx !== x && !overlaps(solid, sx, y, half)) x = sx;
      y = dy > 0 ? Math.floor(ny + half) - half - MOVE_EPS : Math.floor(ny - half) + 1 + half + MOVE_EPS;
    }
  }
  return { x, y };
}

export function movementSystem(state: SimState, intents: readonly Intent[]): void {
  const solid: Solid = (tx, ty) => solidAt(state, tx, ty);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    if (Seated.station[eid]! >= 0 || state.scratch.stoodThisTick[pid]) continue;
    const it = intentFor(intents, pid);
    if (it.moveX === 0 && it.moveY === 0) continue;
    const v = CREW_SPEED * speedMult(state, pid) * (state.carrying[pid] ? CARRY_SPEED_MULT : 1) * DT;   // a carrier is slower (spec Coop-ii section 2)
    const p = moveAABB(solid, Position.x[eid]!, Position.y[eid]!, it.moveX * v, it.moveY * v, CREW_HALF);
    Position.x[eid] = p.x; Position.y[eid] = p.y;
  }
}
