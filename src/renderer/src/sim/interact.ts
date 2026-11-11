import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState, Seated } from './components';
import { roomAt } from './grid';
import { extinguishRoom } from './hazards/fire';
import { repairBreach } from './hazards/breach';
import { reviveCrew } from './crew';
import { intentFor } from './step';
import { stationOnline, sitDown } from './stations';
import { repairStation } from './power';
import { Skill, skillLevelOf, repairMult, addXp } from './skills';
import { repairTraitMult } from './characters';
import { XP_RATE, DT, REACH, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, REVIVE_TIME } from './tuning';

export const TargetKind = { None: 0, Revive: 1, Fire: 2, Breach: 3, Power: 4 } as const;
export interface Target { kind: number; index: number }
export const ConfirmKind = { None: 0, Door: 1, Console: 2 } as const;
export interface ConfirmTarget { kind: number; index: number }

const NONE: Target = { kind: TargetKind.None, index: -1 };
const NONE_CONFIRM: ConfirmTarget = { kind: ConfirmKind.None, index: -1 };

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
  if (Life.state[eid] !== LifeState.Conscious || Seated.station[eid]! >= 0) return NONE;
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
  if (best.kind !== TargetKind.None) return best;
  // Power failure: nearest failed station tile in reach; equal distances go to the lower tile index.
  bestDist = Infinity; let bestTile = Infinity;
  for (let i = 0; i < d.stationTile.length; i++) {
    if (!state.stations.failed[i]) continue;
    const tile = d.stationTile[i]!, dist = distToTile(state, x, y, tile);
    if (dist <= REACH && (dist < bestDist || (dist === bestDist && tile < bestTile))) { best = { kind: TargetKind.Power, index: i }; bestDist = dist; bestTile = tile; }
  }
  return best;
}

/** Nearest door tile or same-room console tile within REACH; ties by lower tile index. None while seated or not Conscious. */
export function confirmTarget(state: SimState, pid: number): ConfirmTarget {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious || Seated.station[eid]! >= 0) return NONE_CONFIRM;
  const d = state.derived, x = Position.x[eid]!, y = Position.y[eid]!;
  let best = NONE_CONFIRM, bestDist = Infinity, bestTile = Infinity;
  const consider = (kind: number, index: number, tile: number): void => {
    const dist = distToTile(state, x, y, tile);
    if (dist > REACH) return;
    if (dist < bestDist || (dist === bestDist && tile < bestTile)) { best = { kind, index }; bestDist = dist; bestTile = tile; }
  };
  for (let e = 0; e < d.edgeIsDoor.length; e++) if (d.edgeIsDoor[e]) consider(ConfirmKind.Door, e, d.edgeTile[e]!);
  const own = roomAt(state, x, y);   // -1 on a door tile: a console is never reachable across a wall or from a doorway
  for (let i = 0; i < d.stationTile.length; i++) if (own >= 0 && d.stationRoom[i] === own) consider(ConfirmKind.Console, i, d.stationTile[i]!);
  return best;
}

/** Step 1 (before movement): Confirm actions, revive arbitration, repair and revive progress. */
export function interactSystem(state: SimState, intents: readonly Intent[]): void {
  const targets: Target[] = [];
  const sitRequests = new Map<number, number[]>();
  for (let pid = 0; pid < state.playerCount; pid++) {
    const it = intentFor(intents, pid);
    if (it.confirmPressed) {
      const c = confirmTarget(state, pid);
      if (c.kind === ConfirmKind.Door) state.scratch.doorToggles.add(c.index);       // applied once per door at the end of consoleSystem
      else if (c.kind === ConfirmKind.Console) sitRequests.set(c.index, [...(sitRequests.get(c.index) ?? []), pid]);
    }
    targets.push(it.interactHeld ? interactTarget(state, pid) : NONE);
  }
  // Seating: online and unoccupied; the lowest pid wins a tie; the seating Confirm is consumed (spec section 4).
  for (const i of [...sitRequests.keys()].sort((a, b) => a - b)) {
    if (!stationOnline(state, i) || state.stations.occupant[i]! >= 0) continue;
    const pid = Math.min(...sitRequests.get(i)!);
    sitDown(state, pid, i); state.scratch.satThisTick[pid] = 1;
    targets[pid] = NONE;                                                            // a player who sits this tick repairs or revives nothing this tick
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
    const t = targets[pid]!, level = skillLevelOf(state, pid, Skill.Repair), trait = repairTraitMult(state, pid);
    if (t.kind === TargetKind.Fire) {
      if (!(state.rooms.fire[t.index]! > 0)) continue;                             // an earlier holder this tick already put it out
      state.rooms.fireRepair[t.index]! += DT * repairMult(level) * trait / REPAIR_TIME_FIRE;
      addXp(state, pid, Skill.Repair, XP_RATE * DT);
      if (state.rooms.fireRepair[t.index]! >= 1) extinguishRoom(state, t.index);
    } else if (t.kind === TargetKind.Breach) {
      if (!state.breaches.active[t.index]) continue;                                // an earlier holder this tick already repaired it
      state.breaches.repair[t.index]! += DT * repairMult(level) * trait / REPAIR_TIME_BREACH;
      addXp(state, pid, Skill.Repair, XP_RATE * DT);
      if (state.breaches.repair[t.index]! >= 1) repairBreach(state, t.index);
    } else if (t.kind === TargetKind.Power) {
      if (!state.stations.failed[t.index]) continue;                                // an earlier holder this tick already completed it
      state.stations.repair[t.index]! += DT * repairMult(level) * trait / REPAIR_TIME_POWER;
      addXp(state, pid, Skill.Repair, XP_RATE * DT);
      if (state.stations.repair[t.index]! >= 1) repairStation(state, t.index);
    }
  }
}
