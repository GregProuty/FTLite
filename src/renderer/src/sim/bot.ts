import type { Intent } from '../../../shared/intent';
import { NEUTRAL_INTENT } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState, Seated, Health } from './components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from './interact';
import { navRows } from './run';
import { EVENTS } from './events';
import { StationKind } from './stationKinds';
import { DoorState } from './grid';

/** Bot self-preservation (spec Demo-ii section 10): below this health a bot keeps out of burning rooms; below BOT_RECOVER_HEALTH it stays in an online Medbay. Bot policy, not sim tuning. */
export const BOT_RETREAT_HEALTH = 30;
export const BOT_RECOVER_HEALTH = 60;
import { stationOnline } from './stations';
import { roomAt } from './grid';

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
function runIntent(state: SimState, pid: number, eid: number, here: number): Intent | null {
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
  const next = firstStep(state, here, new Set([state.derived.stationTile[nav]!]));
  return next < 0 ? NEUTRAL_INTENT : walkTo(state, eid, next);
}

function walkTo(state: SimState, eid: number, next: number): Intent {
  const w = state.derived.width, x = Position.x[eid]!, y = Position.y[eid]!;
  const nx = next % w + 0.5, ny = (next - next % w) / w + 0.5;
  const dx = nx - x, dy = ny - y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { ...NEUTRAL_INTENT, moveX: dx / len, moveY: dy / len };
}

/** Self-preservation for a hurt bot. Returns the intent to act on, or null to carry on with ordinary duty (using `blocked` as the burning-room tiles to avoid). */
function retreatIntent(state: SimState, eid: number, here: number, blocked: Set<number>): Intent | null {
  const d = state.derived, hp = Health.cur[eid]!, myRoom = roomAt(state, Position.x[eid]!, Position.y[eid]!);
  const burning = (r: number): boolean => r >= 0 && state.rooms.fire[r]! > 0;
  if (burning(myRoom)) {
    const goals = new Set<number>();
    for (let r = 0; r < state.rooms.fire.length; r++) if (!burning(r)) for (const t of d.roomTiles[r]!) goals.add(t);
    for (const t of d.roomTiles[myRoom]!) blocked.delete(t);   // the way out starts inside this room
    const next = firstStep(state, here, goals, blocked);
    return next < 0 ? NEUTRAL_INTENT : walkTo(state, eid, next);
  }
  const mb = d.stationOfKind[StationKind.Medbay]!;
  if (mb >= 0 && stationOnline(state, mb) && !burning(d.stationRoom[mb]!) && hp < BOT_RECOVER_HEALTH) {
    const mr = d.stationRoom[mb]!;
    if (myRoom === mr) return NEUTRAL_INTENT;
    const next = firstStep(state, here, new Set(d.roomTiles[mr]!), blocked);
    if (next >= 0) return walkTo(state, eid, next);
  }
  return null;
}

export function botIntent(state: SimState, pid: number): Intent {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return NEUTRAL_INTENT;
  const here = Math.floor(Position.y[eid]!) * state.derived.width + Math.floor(Position.x[eid]!);
  const target = interactTarget(state, pid);
  if (target.kind === TargetKind.Fight || target.kind === TargetKind.Revive) return { ...NEUTRAL_INTENT, interactHeld: true };   // urgent: outranks every run behaviour
  let blocked: Set<number> | undefined;
  if (Health.cur[eid]! < BOT_RETREAT_HEALTH && Seated.station[eid] === -1) {   // self-preservation: after the urgent interactions, before the run behaviour and hazard goals
    blocked = new Set<number>();
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) for (const t of state.derived.roomTiles[r]!) blocked.add(t);
    const retreat = retreatIntent(state, eid, here, blocked); if (retreat) return retreat;
  }
  const run = runIntent(state, pid, eid, here); if (run) return run;
  const goals = goalTiles(state, pid, here);
  if (target.kind !== TargetKind.None) return { ...NEUTRAL_INTENT, interactHeld: true };
  if (!goals.size) return NEUTRAL_INTENT;
  const next = firstStep(state, here, goals, blocked);
  if (next < 0) return NEUTRAL_INTENT;
  return walkTo(state, eid, next);
}
