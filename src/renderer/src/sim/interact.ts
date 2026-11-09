import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState } from './components';
import { roomAt } from './grid';
import { toggleSeal } from './doors';
import { extinguishRoom } from './hazards/fire';
import { repairBreach } from './hazards/breach';
import { reviveCrew } from './crew';
import { intentFor } from './step';
import { DT, REACH, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REVIVE_TIME } from './tuning';

export const TargetKind = { None: 0, Revive: 1, Fire: 2, Breach: 3 } as const;
export interface Target { kind: number; index: number }
export const ConfirmKind = { None: 0, Door: 1 } as const;
export interface ConfirmTarget { kind: number; index: number }

const NONE: Target = { kind: TargetKind.None, index: -1 };

/** Distance from a point to the nearest point of a tile's unit square. */
function distToTile(state: SimState, x: number, y: number, tileIdx: number): number {
  const w = state.derived.width, tx = tileIdx % w, ty = (tileIdx - tx) / w;
  const dx = Math.max(tx - x, 0, x - (tx + 1)), dy = Math.max(ty - y, 0, y - (ty + 1));
  return Math.sqrt(dx * dx + dy * dy);
}

export function inReachOfTile(state: SimState, eid: number, tileIdx: number): boolean {
  return distToTile(state, Position.x[eid]!, Position.y[eid]!, tileIdx) <= REACH;
}

export function interactTarget(state: SimState, pid: number): Target {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return NONE;
  const x = Position.x[eid]!, y = Position.y[eid]!;
  // Revive: nearest Downed teammate within REACH (centre to centre), ties by lower pid.
  let best: Target = NONE, bestDist = Infinity;
  for (let other = 0; other < state.playerCount; other++) {
    if (other === pid) continue;
    const o = state.crew[other]!;
    if (Life.state[o] !== LifeState.Downed) continue;
    const dx = Position.x[o]! - x, dy = Position.y[o]! - y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= REACH && dist < bestDist) { best = { kind: TargetKind.Revive, index: other }; bestDist = dist; }
  }
  if (best.kind !== TargetKind.None) return best;
  // Fire: only the crew member's own room (a fire is repaired from inside it, never through a wall).
  const own = roomAt(state, x, y);
  if (own >= 0 && state.rooms.fire[own]! > 0) return { kind: TargetKind.Fire, index: own };
  // Breach: nearest active site tile in reach.
  bestDist = Infinity;
  const d = state.derived;
  for (let s = 0; s < d.siteTile.length; s++) {
    if (!state.breaches.active[s]) continue;
    const dist = distToTile(state, x, y, d.siteTile[s]!);
    if (dist <= REACH && dist < bestDist) { best = { kind: TargetKind.Breach, index: s }; bestDist = dist; }
  }
  return best;
}

export function confirmTarget(state: SimState, pid: number): ConfirmTarget {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return { kind: ConfirmKind.None, index: -1 };
  const d = state.derived;
  let best = -1, bestDist = Infinity;
  for (let e = 0; e < d.edgeIsDoor.length; e++) {
    if (!d.edgeIsDoor[e]) continue;
    const dist = distToTile(state, Position.x[eid]!, Position.y[eid]!, d.edgeTile[e]!);
    if (dist <= REACH && dist < bestDist) { best = e; bestDist = dist; }
  }
  return best < 0 ? { kind: ConfirmKind.None, index: -1 } : { kind: ConfirmKind.Door, index: best };
}

/** Step 1 (before movement): Confirm actions, revive arbitration, repair and revive progress. */
export function interactSystem(state: SimState, intents: readonly Intent[]): void {
  const targets: Target[] = [];
  for (let pid = 0; pid < state.playerCount; pid++) {
    const it = intentFor(intents, pid);
    if (it.confirmPressed) {
      const c = confirmTarget(state, pid);
      if (c.kind === ConfirmKind.Door) toggleSeal(state, c.index);
    }
    targets.push(it.interactHeld ? interactTarget(state, pid) : NONE);
  }
  // Revive arbitration: keep the current reviver if still trying, else the lowest pid trying.
  for (let other = 0; other < state.playerCount; other++) {
    const o = state.crew[other]!;
    if (Life.state[o] !== LifeState.Downed) continue;
    const trying: number[] = [];
    for (let pid = 0; pid < state.playerCount; pid++) if (targets[pid]!.kind === TargetKind.Revive && targets[pid]!.index === other) trying.push(pid);
    const current = Life.reviverPid[o]!;
    const reviver = trying.includes(current) ? current : (trying[0] ?? -1);
    Life.reviverPid[o] = reviver;
    if (reviver >= 0) {
      Life.reviveProgress[o] = Math.min(1, Life.reviveProgress[o]! + DT / REVIVE_TIME);
      if (Life.reviveProgress[o] >= 1) reviveCrew(state, o);
    } else {
      Life.reviveProgress[o] = Math.max(0, Life.reviveProgress[o]! - DT / REVIVE_TIME);
    }
  }
  // Repair: every holder adds progress.
  for (let pid = 0; pid < state.playerCount; pid++) {
    const t = targets[pid]!;
    if (t.kind === TargetKind.Fire) {
      state.rooms.fireRepair[t.index]! += DT / REPAIR_TIME_FIRE;
      if (state.rooms.fireRepair[t.index]! >= 1) extinguishRoom(state, t.index);
    } else if (t.kind === TargetKind.Breach) {
      state.breaches.repair[t.index]! += DT / REPAIR_TIME_BREACH;
      if (state.breaches.repair[t.index]! >= 1) repairBreach(state, t.index);
    }
  }
}
