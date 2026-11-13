import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState, Seated } from './components';
import { roomAt } from './grid';
import { extinguishRoom } from './hazards/fire';
import { repairBreach } from './hazards/breach';
import { reviveCrew } from './crew';
import { boarderTarget, damageBoarder, combatDps } from './boarders';
import { intentFor } from './step';
import { stationOnline, sitDown } from './stations';
import { repairStation } from './power';
import { StationKind } from './stationKinds';
import { canDeliver, pickUpTorpedo, deliverTorpedo } from './torpedoes';
import { REPAIR_FIRE, REPAIR_BREACH, REPAIR_POWER } from './tuning';
import { Skill, skillLevelOf, repairMult, addXp } from './skills';
import { repairTraitMult } from './characters';
import { XP_RATE, DT, REACH, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, REVIVE_TIME, TEAM_MULT } from './tuning';

export const TargetKind = { None: 0, Revive: 1, Fire: 2, Breach: 3, Power: 4, Fight: 5, Pickup: 6, Deliver: 7 } as const;   // Pickup / Deliver: a torpedo at the magazine / the Weapons console (spec Coop-ii section 2)
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
  const fight = boarderTarget(state, pid); if (fight >= 0) return { kind: TargetKind.Fight, index: fight };   // a boarder in the room outranks everything (spec Boarders-i section 5)
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
  const own = roomAt(state, x, y), d = state.derived;
  // Torpedoes (spec Coop-ii amendment D5): a carrier fights no fires and repairs nothing; it delivers at the Weapons console, from inside Weapons.
  if (state.carrying[pid]) {
    const wpn = d.stationOfKind[StationKind.Weapons]!;
    return wpn >= 0 && own >= 0 && own === d.stationRoom[wpn] && canDeliver(state) && inReachOfTile(state, eid, d.stationTile[wpn]!) ? { kind: TargetKind.Deliver, index: wpn } : NONE;
  }
  // Fire: only the crew member's own room (a fire is repaired from inside it, never through a wall).
  if (own >= 0 && state.rooms.fire[own]! > 0) return { kind: TargetKind.Fire, index: own };
  // Breach: nearest active site tile in reach.
  bestDist = Infinity;
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
  if (best.kind !== TargetKind.None) return best;
  // Pickup: the magazine tile in reach, from inside its room, with stock (spec Coop-ii amendment D5).
  if (d.magazineTile >= 0 && own === d.magazineRoom && state.weapons.torpedoStock > 0 && inReachOfTile(state, eid, d.magazineTile)) return { kind: TargetKind.Pickup, index: d.magazineTile };
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
  const nav = state.derived.stationOfKind[StationKind.Navigation]!, navOfficer = nav >= 0 ? state.stations.occupant[nav]! : -1;   // the occupant, on every tab of a group (spec Demo-xi amendment 1)
  for (let pid = 0; pid < state.playerCount; pid++) {
    const it = intentFor(intents, pid);
    const eid = state.crew[pid]!, conscious = Life.state[eid] === LifeState.Conscious, standing = conscious && Seated.station[eid]! < 0;
    const otherSeat = conscious && Seated.station[eid]! >= 0 && pid !== navOfficer;   // seated, and not the Navigation occupant
    if (it.confirmPressed && (standing || otherSeat) && state.run.event >= 0 && state.run.eventChoice < 0) { state.scratch.votePress[pid] = 1; if (otherSeat) state.scratch.confirmUsed[pid] = 1; }   // an open event: a standing or other seated Confirm is a vote, never a door, a seat or the card; before a pending jump (spec Coop-ii amendment D7, Demo-xi section 2 and amendment 2)
    else if (it.confirmPressed && (standing || otherSeat) && state.run.jumpPending >= 0) { state.scratch.jumpConfirm[pid] = 1; if (otherSeat) state.scratch.confirmUsed[pid] = 1; }   // a pending jump: any other conscious player's Confirm agrees, seated or standing; a seated press is consumed (spec Demo-xi section 1)
    else if (it.confirmPressed && standing) {
      const c = confirmTarget(state, pid);
      if (c.kind === ConfirmKind.Door) state.scratch.doorToggles.add(c.index);       // applied once per door at the end of consoleSystem
      else if (c.kind === ConfirmKind.Console) { const g = state.derived.stationGroup[c.index]!, i = g >= 0 ? state.derived.groupStations[g]![0]! : c.index; sitRequests.set(i, [...(sitRequests.get(i) ?? []), pid]); }   // a console group seats at its first tab (spec Demo-x-a section 1)
    }
    targets.push(it.interactHeld ? interactTarget(state, pid) : NONE);
  }
  // Seating: online and unoccupied; the lowest pid wins a tie; the seating Confirm is consumed (spec section 4). A console group needs one member online (spec Demo-x-a section 1).
  for (const i of [...sitRequests.keys()].sort((a, b) => a - b)) {
    const g = state.derived.stationGroup[i]!, members = g >= 0 ? state.derived.groupStations[g]! : [i];
    if (!members.some((j) => stationOnline(state, j)) || state.stations.occupant[i]! >= 0) continue;
    const pid = Math.min(...sitRequests.get(i)!);
    sitDown(state, pid, i); state.scratch.satThisTick[pid] = 1;
    targets[pid] = NONE;                                                            // a player who sits this tick repairs or revives nothing this tick
  }
  // Hands together (spec Coop-i section 2, amendments C3 and C5): holders per exact (kind, index); two or more each work at TEAM_MULT, and teamSeconds counts once per such target per tick.
  const holders = new Map<number, number>();
  const key = (t: Target): number => t.kind * 4096 + t.index;
  for (const t of targets) if (t.kind !== TargetKind.None && t.kind !== TargetKind.Fight && t.kind !== TargetKind.Pickup && t.kind !== TargetKind.Deliver) holders.set(key(t), (holders.get(key(t)) ?? 0) + 1);
  const teamed = new Set<number>();
  const mult = (t: Target): number => {
    if ((holders.get(key(t)) ?? 0) < 2) return 1;
    if (!teamed.has(key(t))) { teamed.add(key(t)); state.telemetry.teamSeconds += DT; }
    return TEAM_MULT;
  };
  // Revive, shared (amendment C3): every Conscious holder on the downed pid adds progress; reviverPid keeps the current reviver if still trying, else the lowest pid trying (for display).
  for (let other = 0; other < state.playerCount; other++) {
    const o = state.crew[other]!;
    if (Life.state[o] !== LifeState.Downed) continue;
    const trying: number[] = [];
    for (let pid = 0; pid < state.playerCount; pid++) if (targets[pid]!.kind === TargetKind.Revive && targets[pid]!.index === other) trying.push(pid);
    const current = Life.reviverPid[o]!;
    Life.reviverPid[o] = trying.includes(current) ? current : (trying[0] ?? -1);
    if (trying.length) {
      const m = mult({ kind: TargetKind.Revive, index: other });
      for (const pid of trying) state.scratch.activeThisTick[pid] = 1;
      Life.reviveProgress[o] = Math.min(1, Life.reviveProgress[o]! + trying.length * m * DT / REVIVE_TIME);
      if (Life.reviveProgress[o] >= 1) reviveCrew(state, o);
    } else {
      Life.reviveProgress[o] = Math.max(0, Life.reviveProgress[o]! - DT / REVIVE_TIME);
    }
  }
  // Repair: every holder adds progress, at TEAM_MULT with company.
  for (let pid = 0; pid < state.playerCount; pid++) {
    const t = targets[pid]!, level = skillLevelOf(state, pid, Skill.Repair), trait = repairTraitMult(state, pid) * (t.kind === TargetKind.Fire || t.kind === TargetKind.Breach || t.kind === TargetKind.Power ? mult(t) : 1);
    if (t.kind === TargetKind.Pickup) { if (pickUpTorpedo(state, pid)) state.scratch.activeThisTick[pid] = 1; continue; }     // instant; ascending pid wins the last torpedo
    if (t.kind === TargetKind.Deliver) { if (deliverTorpedo(state, pid)) state.scratch.activeThisTick[pid] = 1; continue; }
    if (t.kind === TargetKind.Fight) {
      if (!state.boarders.active[t.index]) continue;                                 // an earlier holder this tick already killed it
      damageBoarder(state, t.index, combatDps(skillLevelOf(state, pid, Skill.Combat)) * DT, pid);
      addXp(state, pid, Skill.Combat, XP_RATE * DT); state.scratch.activeThisTick[pid] = 1;
      continue;
    }
    if (t.kind === TargetKind.Fire) {
      if (!(state.rooms.fire[t.index]! > 0)) continue;                             // an earlier holder this tick already put it out
      state.rooms.fireRepair[t.index]! += DT * repairMult(level) * trait / REPAIR_TIME_FIRE;
      state.scratch.activeThisTick[pid] = 1; addXp(state, pid, Skill.Repair, XP_RATE * DT);
      if (state.rooms.fireRepair[t.index]! >= 1) { extinguishRoom(state, t.index); state.telemetry.repairs[REPAIR_FIRE]!++; }
    } else if (t.kind === TargetKind.Breach) {
      if (!state.breaches.active[t.index]) continue;                                // an earlier holder this tick already repaired it
      state.breaches.repair[t.index]! += DT * repairMult(level) * trait / REPAIR_TIME_BREACH;
      state.scratch.activeThisTick[pid] = 1; addXp(state, pid, Skill.Repair, XP_RATE * DT);
      if (state.breaches.repair[t.index]! >= 1) { repairBreach(state, t.index); state.telemetry.repairs[REPAIR_BREACH]!++; }
    } else if (t.kind === TargetKind.Power) {
      if (!state.stations.failed[t.index]) continue;                                // an earlier holder this tick already completed it
      state.stations.repair[t.index]! += DT * repairMult(level) * trait / REPAIR_TIME_POWER;
      state.scratch.activeThisTick[pid] = 1; addXp(state, pid, Skill.Repair, XP_RATE * DT);
      if (state.stations.repair[t.index]! >= 1) { repairStation(state, t.index); state.telemetry.repairs[REPAIR_POWER]!++; }
    }
  }
}
