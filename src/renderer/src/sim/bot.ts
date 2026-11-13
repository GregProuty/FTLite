import type { Intent } from '../../../shared/intent';
import { NEUTRAL_INTENT } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState, Seated, Health } from './components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from './interact';
import { navRows } from './run';
import { EVENTS } from './events';
import { StationKind } from './stationKinds';
import { DoorState, roomAt, conditionRoomAt } from './grid';
import { stationOnline } from './stations';

/** Bot self-preservation (spec Demo-ii section 10): below this health a bot keeps out of burning rooms; below BOT_RECOVER_HEALTH it stays in an online Medbay. Bot policy, not sim tuning. */
export const BOT_RETREAT_HEALTH = 30;
export const BOT_RECOVER_HEALTH = 60;

/** Passable for pathing: not a wall, and not a sealed door (closed doors open on approach). */
function passable(state: SimState, tx: number, ty: number): boolean {
  const d = state.derived;
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return false;
  const i = ty * d.width + tx;
  if (d.wallTile[i]) return false;
  const e = d.doorTileToEdge[i]!;
  return e < 0 || state.doors.state[e] !== DoorState.Sealed;   // only Sealed blocks a path: Closed, Open and HeldOpen all pass (spec Demo-vii section 1)
}

/** BFS from the crew tile to the nearest goal tile; returns the first step's tile index, or -1. */
function firstStep(state: SimState, fromIdx: number, goals: Set<number>, blocked?: Set<number>): number {
  if (goals.has(fromIdx)) return fromIdx;
  const w = state.derived.width;
  const parent = new Map<number, number>([[fromIdx, -1]]);
  const queue = [fromIdx];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, tx = i % w, ty = (i - tx) / w;
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]] as const) {
      if (!passable(state, nx, ny)) continue;
      const n = ny * w + nx;
      if (blocked && blocked.has(n)) continue;
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

/** Run behaviour for pid 0 (spec Demo-i section 6): walk to Navigation when the drive is ready, sit, take the event's safe choice or the first jump row, stand after the jump. Null when the run behaviour is not active (pid > 0, no Navigation, or its console failed or offline: the hazard goals repair it). */
function runIntent(state: SimState, pid: number, eid: number, here: number, blocked?: Set<number>): Intent | null {
  const nav = state.derived.stationOfKind[StationKind.Navigation]!;
  if (pid !== 0 || nav < 0 || !stationOnline(state, nav)) return null;
  const r = state.run, pending = r.event >= 0 && r.eventChoice < 0, seated = Seated.station[eid] === nav;
  if (seated) {
    if (r.jumpCharge < 1 && !pending) return { ...NEUTRAL_INTENT, cancelPressed: true };
    const rows = navRows(state), c = state.stations.cursor[nav]!;
    const t = pending ? rows.findIndex((row) => row.select === 'choice' && row.index === EVENTS[r.event]!.safeChoice) : rows.findIndex((row) => row.select === 'jump');
    if (t < 0) return NEUTRAL_INTENT;
    if (c !== t) return state.tick % 2 === 0 ? { ...NEUTRAL_INTENT, moveY: t > c ? 1 : -1 } : NEUTRAL_INTENT;   // one stick edge per two ticks
    return rows[t]!.select === 'choice' || r.jumpCharge >= 1 ? { ...NEUTRAL_INTENT, confirmPressed: true } : NEUTRAL_INTENT;
  }
  if (r.jumpCharge < 1 || pending || state.stations.occupant[nav]! >= 0) return null;
  const c = confirmTarget(state, 0);
  if (c.kind === ConfirmKind.Console && c.index === nav) return { ...NEUTRAL_INTENT, confirmPressed: true };
  const next = firstStep(state, here, new Set([state.derived.stationTile[nav]!]), blocked);
  if (next < 0) return blocked ? null : NEUTRAL_INTENT;   // a hurt bot with no fire-free way yields to self-preservation
  return walkTo(state, eid, next);
}

function walkTo(state: SimState, eid: number, next: number): Intent {
  const w = state.derived.width, x = Position.x[eid]!, y = Position.y[eid]!;
  const nx = next % w + 0.5, ny = (next - next % w) / w + 0.5;
  const dx = nx - x, dy = ny - y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { ...NEUTRAL_INTENT, moveX: dx / len, moveY: dy / len };
}

/** The room of an online, non-burning Medbay while `hp` is below BOT_RECOVER_HEALTH, else -1. */
function recoveryRoom(state: SimState, hp: number): number {
  const mb = state.derived.stationOfKind[StationKind.Medbay]!;
  if (mb < 0 || hp >= BOT_RECOVER_HEALTH || !stationOnline(state, mb)) return -1;
  const mr = state.derived.stationRoom[mb]!;
  return state.rooms.fire[mr]! > 0 ? -1 : mr;
}

/** Whether the crew member stands where fire hurts (conditionRoomAt: a doorway counts as the burning room beside it). */
function inFire(state: SimState, eid: number): boolean {
  const r = conditionRoomAt(state, Position.x[eid]!, Position.y[eid]!);
  return r >= 0 && state.rooms.fire[r]! > 0;
}

/**
 * Whether another Conscious crew member covers the fires for hurt bot `pid` (spec Demo-v): one at or above BOT_RETREAT_HEALTH (its ordinary
 * duty fights them) and not healing in the Medbay, or a hurt or healing one that outranks it by (already in fire, then health, then lower pid). Position is the memory: a hurt bot that
 * has reached a fire keeps the fire fighter's role, so the role does not swap back and forth as its health falls.
 */
function covered(state: SimState, pid: number): boolean {
  const eid = state.crew[pid]!, mine = [inFire(state, eid) ? 1 : 0, Health.cur[eid]!] as const;
  for (let other = 0; other < state.playerCount; other++) {
    const o = state.crew[other]!;
    if (other === pid || Life.state[o] !== LifeState.Conscious) continue;
    const hp = Health.cur[o]!;
    const mr = recoveryRoom(state, hp);
    if (hp >= BOT_RETREAT_HEALTH && !(mr >= 0 && roomAt(state, Position.x[o]!, Position.y[o]!) === mr)) return true;   // one healing in the Medbay is not fighting: it is ranked like a hurt one
    const f = inFire(state, o) ? 1 : 0;
    if (f !== mine[0] ? f > mine[0] : hp !== mine[1] ? hp > mine[1] : other < pid) return true;
  }
  return false;
}

/**
 * Self-preservation for a hurt bot (spec Demo-ii section 10, Demo-v). Returns the intent to act on, or null to carry on with ordinary duty;
 * `blocked` (the burning-room tiles) is cleared when the bot is to fight the fires itself. "In fire" is judged by conditionRoomAt (a doorway
 * counts as the burning room beside it); the Medbay stay by roomAt (healing applies only inside the room).
 */
function retreatIntent(state: SimState, pid: number, eid: number, here: number, blocked: Set<number>, target: { kind: number }): Intent | null {
  const d = state.derived, hp = Health.cur[eid]!, x = Position.x[eid]!, y = Position.y[eid]!;
  const burning = (r: number): boolean => r >= 0 && state.rooms.fire[r]! > 0;
  const mr = recoveryRoom(state, hp);
  if (mr >= 0 && roomAt(state, x, y) === mr) return NEUTRAL_INTENT;   // in the online, unburning Medbay: stay
  const toMedbay = mr >= 0 ? firstStep(state, here, new Set(d.roomTiles[mr]!), blocked) : -1;   // a fire-free route (every burning room avoided)
  if (toMedbay >= 0) return walkTo(state, eid, toMedbay);
  if (!covered(state, pid)) { blocked.clear(); return null; }   // nobody else to fight the fires: hazard duty, fires included
  const fireRoom = conditionRoomAt(state, x, y);
  if (burning(fireRoom)) {   // a teammate covers the fires: get out of the fire and wait
    const goals = new Set<number>();
    for (let r = 0; r < state.rooms.fire.length; r++) if (!burning(r)) for (const t of d.roomTiles[r]!) goals.add(t);
    const free = new Set(blocked);
    for (const t of d.roomTiles[fireRoom]!) free.delete(t);   // the way out starts inside (or beside) this room
    const next = firstStep(state, here, goals, free);
    if (next >= 0) return walkTo(state, eid, next);
    if (target.kind === TargetKind.Fire) return { ...NEUTRAL_INTENT, interactHeld: true };   // trapped: fight the fire it stands in
    const out = firstStep(state, here, goals);   // else the shortest way out through the fire
    return out < 0 ? NEUTRAL_INTENT : walkTo(state, eid, out);
  }
  return null;   // ordinary duty that avoids every burning room
}

export function botIntent(state: SimState, pid: number): Intent {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return NEUTRAL_INTENT;
  const it = dutyIntent(state, pid, eid), r = state.run;
  if (Seated.station[eid] !== -1) return it;
  // Crew decisions (spec Coop-ii amendments D6 and D7): standing, a bot presses Confirm until its vote is the safe choice, and confirms a pending jump.
  if (r.event >= 0 && r.eventChoice < 0 && r.vote[pid] !== EVENTS[r.event]!.safeChoice) return { ...it, confirmPressed: true };
  if (r.jumpPending >= 0) return { ...it, confirmPressed: true };
  return it;
}

function dutyIntent(state: SimState, pid: number, eid: number): Intent {
  const here = Math.floor(Position.y[eid]!) * state.derived.width + Math.floor(Position.x[eid]!);
  const raw = interactTarget(state, pid), target = raw.kind === TargetKind.Pickup || raw.kind === TargetKind.Deliver ? { kind: TargetKind.None, index: -1 } : raw;   // bots never run torpedoes (spec Coop-ii section 2)
  if (target.kind === TargetKind.Fight || target.kind === TargetKind.Revive) return { ...NEUTRAL_INTENT, interactHeld: true };   // urgent: outranks every run behaviour
  let blocked: Set<number> | undefined;
  const hp = Health.cur[eid]!;
  const rr = recoveryRoom(state, hp), recovering = rr >= 0 && rr === roomAt(state, Position.x[eid]!, Position.y[eid]!);   // position is the memory: a bot already in the online Medbay stays until BOT_RECOVER_HEALTH
  if ((hp < BOT_RETREAT_HEALTH || recovering) && Seated.station[eid] === -1) {   // self-preservation: after the urgent interactions, before the run behaviour and hazard goals
    blocked = new Set<number>();
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) for (const t of state.derived.roomTiles[r]!) blocked.add(t);
    const retreat = retreatIntent(state, pid, eid, here, blocked, target); if (retreat) return retreat;
    if (!blocked.size) blocked = undefined;
  }
  const run = runIntent(state, pid, eid, here, blocked); if (run) return run;
  const goals = goalTiles(state, pid, here);
  if (target.kind !== TargetKind.None) return { ...NEUTRAL_INTENT, interactHeld: true };
  if (!goals.size) return NEUTRAL_INTENT;
  const next = firstStep(state, here, goals, blocked);
  if (next < 0) return NEUTRAL_INTENT;
  return walkTo(state, eid, next);
}
