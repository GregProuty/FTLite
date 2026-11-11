import type { Intent } from '../../../shared/intent';
import { NEUTRAL_INTENT } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState } from './components';
import { interactTarget, TargetKind } from './interact';
import { DoorState } from './grid';

/** Passable for pathing: not a wall, and not a sealed door (closed doors open on approach). */
function passable(state: SimState, tx: number, ty: number): boolean {
  const d = state.derived;
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return false;
  const i = ty * d.width + tx;
  if (d.wallTile[i]) return false;
  const e = d.doorTileToEdge[i]!;
  return e < 0 || state.doors.state[e] !== DoorState.Sealed;
}

/** BFS from the crew tile to the nearest goal tile; returns the first step's tile index, or -1. */
function firstStep(state: SimState, fromIdx: number, goals: Set<number>): number {
  if (goals.has(fromIdx)) return fromIdx;
  const w = state.derived.width;
  const parent = new Map<number, number>([[fromIdx, -1]]);
  const queue = [fromIdx];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, tx = i % w, ty = (i - tx) / w;
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]] as const) {
      if (!passable(state, nx, ny)) continue;
      const n = ny * w + nx;
      if (parent.has(n)) continue;
      parent.set(n, i);
      if (goals.has(n)) {
        let cur = n;
        while (parent.get(cur) !== fromIdx) cur = parent.get(cur)!;
        return cur;
      }
      queue.push(n);
    }
  }
  return -1;
}

function goalTiles(state: SimState, pid: number, here: number): Set<number> {
  const d = state.derived, goals = new Set<number>();
  for (let other = 0; other < state.playerCount; other++) {
    if (other === pid || Life.state[state.crew[other]!] !== LifeState.Downed) continue;
    goals.add(Math.floor(Position.y[state.crew[other]!]!) * d.width + Math.floor(Position.x[state.crew[other]!]!));
  }
  if (goals.size) return goals;
  for (let k = 0; k < state.boarders.active.length; k++) if (state.boarders.active[k]) for (const t of d.roomTiles[state.boarders.room[k]!]!) goals.add(t);
  if (goals.size && firstStep(state, here, goals) >= 0) return goals;                 // boarders outrank hazards (spec Boarders-i section 6), unless every boarder room is sealed off
  goals.clear();
  for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) for (const t of d.roomTiles[r]!) goals.add(t);
  for (let s = 0; s < d.siteTile.length; s++) {
    if (!state.breaches.active[s]) continue;
    const t = d.siteTile[s]!, tx = t % d.width, ty = (t - tx) / d.width;
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]] as const) if (passable(state, nx, ny)) goals.add(ny * d.width + nx);
  }
  for (let i = 0; i < d.stationTile.length; i++) if (state.stations.failed[i]) goals.add(d.stationTile[i]!);   // stand on the console tile: in reach
  return goals;
}

export function botIntent(state: SimState, pid: number): Intent {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return NEUTRAL_INTENT;
  const x = Position.x[eid]!, y = Position.y[eid]!, w = state.derived.width;
  const here = Math.floor(y) * w + Math.floor(x);
  const target = interactTarget(state, pid);
  const goals = goalTiles(state, pid, here);
  if (target.kind !== TargetKind.None) return { ...NEUTRAL_INTENT, interactHeld: true };
  if (!goals.size) return NEUTRAL_INTENT;
  const next = firstStep(state, here, goals);
  if (next < 0) return NEUTRAL_INTENT;
  const nx = next % w + 0.5, ny = (next - next % w) / w + 0.5;
  const dx = nx - x, dy = ny - y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { ...NEUTRAL_INTENT, moveX: dx / len, moveY: dy / len };
}
