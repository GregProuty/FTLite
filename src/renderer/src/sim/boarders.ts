import type { SimState } from './state';
import { nextFloat, nextInt } from '../../../shared/rng';
import { Position, Health, Life, LifeState } from './components';
import { roomAt, DoorState } from './grid';
import { stationOnline } from './stations';
import { failStation } from './power';
import { downCrew } from './crew';
import { addScrap } from './scrap';
import { depthOf, peaceful } from './depth';
import { Skill, skillLevelOf, addXp } from './skills';
import { TICK_HZ, DT, BOARDING_PARTY, BOARDING_COOLDOWN, BOARDING_JITTER, BOARDER_HEALTH, BOARDER_DPS, CREW_MELEE_DPS, COMBAT_GAIN, COMBAT_DEFENCE, BOARDER_MOVE, BOARDER_SABOTAGE, XP_PER_KILL, HEALTH_EPS, scrapBoarder, BOARDER_O2_DPS, BOARDER_FIRE_DPS, SUFFOCATE_FRAC } from './tuning';

/** aloneSince sentinels (spec Boarders-i section 4). */
export const ALONE_IDLE = -1, ALONE_SABOTAGED = -2;

export function combatDps(level: number): number { return CREW_MELEE_DPS * (1 + COMBAT_GAIN * level); }
export function combatDefence(level: number): number { return COMBAT_DEFENCE * level; }

export function activeBoarderCount(state: SimState): number { let n = 0; for (const a of state.boarders.active) if (a) n++; return n; }
/** Active boarder slots in a room, ascending slot. */
export function boardersInRoom(state: SimState, room: number): number[] {
  const b = state.boarders, out: number[] = [];
  for (let k = 0; k < b.active.length; k++) if (b.active[k] && b.room[k] === room) out.push(k);
  return out;
}
/** Conscious crew pids in a room, ascending. */
function consciousInRoom(state: SimState, room: number): number[] {
  const out: number[] = [];
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Conscious && roomAt(state, Position.x[eid]!, Position.y[eid]!) === room) out.push(pid);
  }
  return out;
}
/** The lowest online station index in a room, or -1. */
function onlineConsoleIn(state: SimState, room: number): number {
  const d = state.derived;
  for (let i = 0; i < d.stationRoom.length; i++) if (d.stationRoom[i] === room && stationOnline(state, i)) return i;
  return -1;
}
/** The boarder a Conscious, unseated crew member fights: the one in their room with the lowest StableId, or -1 (spec section 5). */
export function boarderTarget(state: SimState, pid: number): number {
  const eid = state.crew[pid]!, room = roomAt(state, Position.x[eid]!, Position.y[eid]!);
  if (room < 0) return -1;
  let best = -1;
  for (const k of boardersInRoom(state, room)) if (best < 0 || state.boarders.stableId[k]! < state.boarders.stableId[best]!) best = k;
  return best;
}
/** Mean of the room's tile centres. */
export function roomCentre(state: SimState, room: number): [number, number] {
  const d = state.derived, tiles = d.roomTiles[room]!;
  let sx = 0, sy = 0;
  for (const t of tiles) { const tx = t % d.width; sx += tx + 0.5; sy += (t - tx) / d.width + 0.5; }
  return [sx / tiles.length, sy / tiles.length];
}
/** Pure projection for the HUD and the world layer (spec section 7). */
export function boarderMarkers(state: SimState): { stableId: number; x: number; y: number; health: number }[] {
  const b = state.boarders, out: { stableId: number; x: number; y: number; health: number }[] = [];
  for (let k = 0; k < b.active.length; k++) {
    if (!b.active[k]) continue;
    const [cx, cy] = roomCentre(state, b.room[k]!);
    out.push({ stableId: b.stableId[k]!, x: cx + (k - 1.5) * 0.4, y: cy, health: b.health[k]! / BOARDER_HEALTH });
  }
  return out;
}

function snap(h: number): number { return h < HEALTH_EPS ? 0 : h; }

function arriveParty(state: SimState): void {
  const b = state.boarders, room = nextInt(state.rng.hazards, state.derived.volume.length);
  let placed = 0;
  for (let k = 0; k < b.active.length && placed < BOARDING_PARTY; k++) {
    if (b.active[k]) continue;
    b.active[k] = 1; b.stableId[k] = state.nextStableId++; b.room[k] = room; b.health[k] = BOARDER_HEALTH;
    b.nextMoveTick[k] = state.tick + BOARDER_MOVE * TICK_HZ; b.aloneSince[k] = ALONE_IDLE; placed++;
  }
  state.telemetry.boardings++;
}

/** Through an unsealed door to the adjacent room with Conscious crew (lowest index), else a uniform hazards draw among the candidates, else stay (spec section 5). */
function moveBoarder(state: SimState, slot: number): void {
  const b = state.boarders, d = state.derived, cur = b.room[slot]!, cands: number[] = [];
  for (let e = 0; e < d.edgeA.length; e++) {
    if (!d.edgeIsDoor[e] || state.doors.state[e] === DoorState.Sealed) continue;   // HeldOpen counts as unsealed (spec Demo-vii section 1)
    const other = d.edgeA[e] === cur ? d.edgeB[e]! : d.edgeB[e] === cur ? d.edgeA[e]! : -1;
    if (other >= 0 && !cands.includes(other)) cands.push(other);
  }
  if (!cands.length) return;
  const withCrew = cands.filter((r) => consciousInRoom(state, r).length > 0);
  const dest = withCrew.length ? Math.min(...withCrew) : cands[nextInt(state.rng.hazards, cands.length)]!;
  if (dest !== cur) { b.room[slot] = dest; b.aloneSince[slot] = ALONE_IDLE; }
}

/** Shared death bookkeeping: deactivate, scrap, the kill count; the last death arms the next boarding with one director draw. */
function killBoarder(state: SimState, slot: number): void {
  const b = state.boarders;
  b.active[slot] = 0; b.stableId[slot] = 0; state.telemetry.boardersKilled++; addScrap(state, scrapBoarder(depthOf(state)));
  if (activeBoarderCount(state) === 0) {
    const u = nextFloat(state.rng.director);
    b.nextArrivalTick = state.tick + Math.round(BOARDING_COOLDOWN * TICK_HZ * (1 + BOARDING_JITTER * (2 * u - 1)));
  }
}

/** A crew blow. At 0 the boarder dies: kill XP to the striker. */
export function damageBoarder(state: SimState, slot: number, amount: number, pid: number): void {
  const b = state.boarders;
  b.health[slot] = snap(Math.max(0, b.health[slot]! - amount));
  if (b.health[slot]! > 0) return;
  addXp(state, pid, Skill.Combat, XP_PER_KILL);
  killBoarder(state, slot);
}

/** A death by vacuum or fire: the usual scrap and kill count, plus boardersVented; no XP (spec Demo-ix amendment B6). */
export function killBoarderByHazard(state: SimState, slot: number): void {
  if (!state.boarders.active[slot]) return;
  state.telemetry.boardersVented++;
  killBoarder(state, slot);
}

/** Vacuum and fire at the start of boarderSystem, ascending slot, from each boarder's room (amendment B7). No draws. */
function boarderHazards(state: SimState): void {
  const b = state.boarders;
  for (let k = 0; k < b.active.length; k++) {
    if (!b.active[k]) continue;
    const r = b.room[k]!;
    const dps = (state.rooms.fire[r]! > 0 ? BOARDER_FIRE_DPS : 0) + (state.rooms.o2[r]! / state.derived.volume[r]! < SUFFOCATE_FRAC ? BOARDER_O2_DPS : 0);
    if (dps === 0) continue;
    b.health[k] = snap(Math.max(0, b.health[k]! - dps * DT));
    if (b.health[k] === 0) killBoarderByHazard(state, k);
  }
}

/** After the debris step, before the Medbay: vacuum and fire, arrival, then per boarder fight / sabotage clock / due move (spec section 5). */
export function boarderSystem(state: SimState): void {
  const b = state.boarders;
  boarderHazards(state);   // a slot killed here is inactive, so the loop below skips it (amendment B6)
  if (activeBoarderCount(state) === 0 && state.tick >= b.nextArrivalTick && !peaceful(state)) arriveParty(state);   // no party at a peaceful beacon (spec Loop-i section 4b)
  for (let k = 0; k < b.active.length; k++) {
    if (!b.active[k]) continue;
    const room = b.room[k]!, targets = consciousInRoom(state, room);
    if (targets.length) {
      const pid = targets[0]!, eid = state.crew[pid]!;
      Health.cur[eid] = snap(Math.max(0, Health.cur[eid]! - BOARDER_DPS * DT * (1 - combatDefence(skillLevelOf(state, pid, Skill.Combat)))));
      if (Health.cur[eid] === 0) downCrew(state, pid);
      b.nextMoveTick[k] = state.tick + BOARDER_MOVE * TICK_HZ;
      if (b.aloneSince[k]! >= 0) b.aloneSince[k] = ALONE_IDLE;
      continue;
    }
    const console = onlineConsoleIn(state, room);
    if (console < 0) { if (b.aloneSince[k] !== ALONE_SABOTAGED) b.aloneSince[k] = ALONE_IDLE; }
    else if (b.aloneSince[k] === ALONE_IDLE) b.aloneSince[k] = state.tick;
    else if (b.aloneSince[k]! >= 0 && state.tick - b.aloneSince[k]! >= BOARDER_SABOTAGE * TICK_HZ) { failStation(state, console); b.aloneSince[k] = ALONE_SABOTAGED; }
    if (state.tick >= b.nextMoveTick[k]!) { moveBoarder(state, k); b.nextMoveTick[k] = state.tick + BOARDER_MOVE * TICK_HZ; }
  }
}
