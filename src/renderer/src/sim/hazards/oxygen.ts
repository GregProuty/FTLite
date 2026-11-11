import type { SimState } from '../state';
import { Life, LifeState, Position } from '../components';
import { DoorState, conditionRoomAt } from '../grid';
import { StationKind } from '../stationKinds';
import { Skill, addXp, skillLevelOf } from '../skills';
import { stationOnline } from '../stations';
import { XP_RATE, HAZARD_DT, PASSAGE_OPEN, PASSAGE_CLOSED, PASSAGE_SEALED, PASSAGE_BREACH, SEAL_SKILL, BREATH_RATE, FIRE_O2_RATE, O2_SNAP_EPS } from '../tuning';

export function passageFor(state: SimState, edge: number): number {
  if (!state.derived.edgeIsDoor[edge]) return PASSAGE_OPEN;
  const st = state.doors.state[edge];
  if (st === DoorState.Open) return PASSAGE_OPEN;
  if (st !== DoorState.Sealed) return PASSAGE_CLOSED;
  const doors = state.derived.stationOfKind[StationKind.Doors]!;
  const occ = doors >= 0 && stationOnline(state, doors) ? state.stations.occupant[doors]! : -1;
  const level = occ >= 0 ? skillLevelOf(state, occ, Skill.Engineering) : 0;
  return PASSAGE_SEALED * (1 - SEAL_SKILL * level);                   // a sealed door leaks less under a skilled Doors operator
}

export function roomBreached(state: SimState, room: number): boolean {
  const d = state.derived;
  for (let s = 0; s < d.siteRoom.length; s++) if (state.breaches.active[s] && d.siteRoom[s] === room) return true;
  return false;
}

export function totalO2(state: SimState): number {
  let t = 0; for (const v of state.rooms.o2) t += v; return t;
}

/**
 * One hazard step. Flows are computed from a start-of-step snapshot and applied symmetrically.
 * A room whose total demand (outflows + venting + breathing + fire) exceeds its mass has all of them
 * scaled down proportionally, which keeps conservation and non-negativity on branching graphs (spec §5).
 */
export function oxygenStep(state: SimState, injection: Float64Array): void {
  const d = state.derived, o2 = state.rooms.o2, V = d.volume, k = d.kEff, dt = HAZARD_DT;
  const R = o2.length, E = d.edgeA.length, S = d.siteRoom.length;
  const frac = new Float64Array(R);
  for (let r = 0; r < R; r++) frac[r] = o2[r]! / V[r]!;
  const demand = new Float64Array(R);
  // Edge flows (positive = a -> b).
  const flow = new Float64Array(E);
  for (let e = 0; e < E; e++) {
    const a = d.edgeA[e]!, b = d.edgeB[e]!;
    const f = k * d.edgeWidth[e]! * passageFor(state, e) * (frac[a]! - frac[b]!) * dt;
    flow[e] = f;
    if (f > 0) demand[a]! += f; else demand[b]! -= f;
  }
  // Venting through active breaches (space is a fixed-zero node).
  const vent = new Float64Array(S);
  for (let s = 0; s < S; s++) {
    if (!state.breaches.active[s]) continue;
    const r = d.siteRoom[s]!;
    vent[s] = k * d.siteWidth[s]! * PASSAGE_BREACH * frac[r]! * dt;
    demand[r]! += vent[s]!;
  }
  // Sinks.
  const breath = new Float64Array(R), burn = new Float64Array(R);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Dead) continue;
    const r = conditionRoomAt(state, Position.x[eid]!, Position.y[eid]!);
    if (r >= 0) breath[r]! += BREATH_RATE * dt;
  }
  for (let r = 0; r < R; r++) { burn[r] = FIRE_O2_RATE * state.rooms.fire[r]! * dt; demand[r]! += breath[r]! + burn[r]!; }
  // Proportional scaling per source room.
  const scale = new Float64Array(R);
  for (let r = 0; r < R; r++) scale[r] = demand[r]! > o2[r]! && demand[r]! > 0 ? o2[r]! / demand[r]! : 1;
  // Apply.
  for (let e = 0; e < E; e++) {
    const f = flow[e]!;
    if (f === 0) continue;
    const src = f > 0 ? d.edgeA[e]! : d.edgeB[e]!, dst = f > 0 ? d.edgeB[e]! : d.edgeA[e]!;
    const amt = Math.abs(f) * scale[src]!;
    o2[src]! -= amt; o2[dst]! += amt;
  }
  const c = state.o2Counters;
  for (let s = 0; s < S; s++) {
    if (vent[s] === 0) continue;
    const r = d.siteRoom[s]!, amt = vent[s]! * scale[r]!;
    o2[r]! -= amt; c.vented += amt;
  }
  for (let r = 0; r < R; r++) {
    const b = breath[r]! * scale[r]!, f = burn[r]! * scale[r]!;
    o2[r]! -= b + f; c.breathed += b; c.burned += f;
  }
  // Injection, clamped to the free volume, none into breached rooms.
  let delivered = 0;
  for (let r = 0; r < R; r++) {
    const want = injection[r] ?? 0;
    if (want <= 0 || roomBreached(state, r)) continue;
    const inj = Math.min(want, Math.max(0, V[r]! - o2[r]!));
    if (inj > 0) { o2[r]! += inj; c.injected += inj; delivered += inj; }
  }
  if (delivered > 0) {
    state.skills.lsDeliveredTick = state.tick;
    const ls = d.stationOfKind[StationKind.LifeSupport]!, occ = ls >= 0 ? state.stations.occupant[ls]! : -1;
    if (occ >= 0 && Life.state[state.crew[occ]!] === LifeState.Conscious) addXp(state, occ, Skill.Engineering, XP_RATE * HAZARD_DT);   // spec 3-i section 5: XP at the delivery event
  }
  // Snap tiny values; the discarded mass is tracked so the balance test can account for it.
  for (let r = 0; r < R; r++) {
    if (o2[r]! < O2_SNAP_EPS) { c.residual += o2[r]!; o2[r] = 0; }
  }
}
