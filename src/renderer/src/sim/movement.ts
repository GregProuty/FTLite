import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState, Seated } from './components';
import { solidAt } from './grid';
import { intentFor } from './step';
import { speedMult } from './characters';
import { CREW_SPEED, CREW_HALF, DT, MOVE_EPS } from './tuning';

type Solid = (tx: number, ty: number) => boolean;

function overlaps(solid: Solid, x: number, y: number, half: number): boolean {
  const x0 = Math.floor(x - half), x1 = Math.floor(x + half - MOVE_EPS);
  const y0 = Math.floor(y - half), y1 = Math.floor(y + half - MOVE_EPS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
  return false;
}

/** Per-axis AABB move against solid tiles: X first, then Y, snapping flush to the blocking tile. */
export function moveAABB(solid: Solid, x: number, y: number, dx: number, dy: number, half: number): { x: number; y: number } {
  if (dx !== 0) {
    const nx = x + dx;
    if (!overlaps(solid, nx, y, half)) x = nx;
    else x = dx > 0 ? Math.floor(nx + half) - half - MOVE_EPS : Math.floor(nx - half) + 1 + half + MOVE_EPS;
  }
  if (dy !== 0) {
    const ny = y + dy;
    if (!overlaps(solid, x, ny, half)) y = ny;
    else y = dy > 0 ? Math.floor(ny + half) - half - MOVE_EPS : Math.floor(ny - half) + 1 + half + MOVE_EPS;
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
    const p = moveAABB(solid, Position.x[eid]!, Position.y[eid]!, it.moveX * CREW_SPEED * speedMult(state, pid) * DT, it.moveY * CREW_SPEED * speedMult(state, pid) * DT, CREW_HALF);
    Position.x[eid] = p.x; Position.y[eid] = p.y;
  }
}
