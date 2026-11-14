import type { CardUiState } from './cardController';
import type { Intent } from '../../../shared/intent';
import { NEUTRAL_INTENT } from '../../../shared/intent';
import type { SimState } from '../sim/state';
import { Position, Life, LifeState, Seated, Health } from '../sim/components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../sim/interact';
import { navRows, beaconAt, overrun, type NavRow } from '../sim/run';
import { EVENTS } from '../sim/events';
import { StationKind } from '../sim/stationKinds';
import { DoorState, roomAt, conditionRoomAt } from '../sim/grid';
import { stationOnline } from '../sim/stations';
import { quirkChargeMult } from '../sim/quirks';
import { JUMP_CHARGE_TIME, TICK_HZ, WEAPON_SLOTS } from '../sim/tuning';
import { Weapon, selectorList } from '../sim/weapons';
import { weaponDef } from '../sim/weaponDefs';
import { EnemySystem, enemySysUp } from '../sim/enemy';
import { warnedTargets, ENEMY_SLOT, ENEMY_SHIELDS_SLOT, ENEMY_WEAPONS_SLOT } from '../sim/debrisTargets';

/** Bot self-preservation (spec Demo-ii section 10): below this health a bot keeps out of burning rooms; below BOT_RECOVER_HEALTH it stays in an online Medbay. Bot policy, not sim tuning. */
export const BOT_RETREAT_HEALTH = 30;
export const BOT_RECOVER_HEALTH = 60;
/** The bot gunner (spec Demo-xiii amendment 2): below this health a standing gunner heals in an online Medbay (to BOT_RECOVER_HEALTH) before it takes the guns. Bot policy, not sim tuning. */
export const BOT_GUN_HEAL_HEALTH = 50;

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

/** The captain's drive is ready: charged, and at a calm beacon (full on arrival, spec Demo-xi section 4) only after the old charge wait from the arrival, JUMP_CHARGE_TIME seconds times the ship's charge quirk, so the bot gates keep their scenario (spec Demo-xi amendment 10). */
function driveReady(state: SimState): boolean {
  const r = state.run;
  return r.jumpCharge >= 1 && !(r.calm && state.tick < r.arrivalTick + Math.round(JUMP_CHARGE_TIME * quirkChargeMult(state) * TICK_HZ));
}

/** Run behaviour for pid 0 (spec Demo-i section 6): walk to Navigation when the drive is ready, sit, take the event's safe choice or the first jump row, stand after the jump. Null when the run behaviour is not active (pid > 0, no Navigation, or its console failed or offline: the hazard goals repair it). */
function runIntent(state: SimState, ui: CardUiState, pid: number, eid: number, here: number, blocked?: Set<number>): Intent | null {
  const nav = state.derived.stationOfKind[StationKind.Navigation]!;
  if (pid !== 0 || nav < 0 || !stationOnline(state, nav)) return null;
  const r = state.run, pending = r.event >= 0 && r.eventChoice < 0, seated = Seated.station[eid]! >= 0 && state.stations.occupant[nav] === pid, ready = driveReady(state);   // at Navigation, or on another tab of its console group (spec Demo-xiii amendment 3)
  if (seated) {
    if (!ready && !pending) return { ...NEUTRAL_INTENT, cancelPressed: true };
    const tab = tabTo(state, ui, eid, nav); if (tab) return tab;   // back to the Helm tab first
    const rows = navRows(state), c = state.stations.cursor[nav]!;
    const t = pending ? rows.findIndex((row) => row.select === 'choice' && row.index === EVENTS[r.event]!.safeChoice) : wayOnRow(state, rows);
    if (t < 0) return NEUTRAL_INTENT;
    if (c !== t) return state.tick % 2 === 0 ? { ...NEUTRAL_INTENT, moveY: t > c ? 1 : -1 } : NEUTRAL_INTENT;   // one stick edge per two ticks
    if (rows[t]!.select === 'wait') return rows[t]!.enabled ? { ...NEUTRAL_INTENT, confirmPressed: true } : NEUTRAL_INTENT;   // a wait under way: stay seated
    return rows[t]!.select === 'choice' || ready ? { ...NEUTRAL_INTENT, confirmPressed: true } : NEUTRAL_INTENT;
  }
  if (!ready || pending || state.stations.occupant[nav]! >= 0) return null;
  const c = confirmTarget(state, 0);
  if (c.kind === ConfirmKind.Console && c.index === nav) return { ...NEUTRAL_INTENT, confirmPressed: true };
  const next = firstStep(state, here, new Set([state.derived.stationTile[nav]!]), blocked);
  if (next < 0) return blocked ? null : NEUTRAL_INTENT;   // a hurt bot with no fire-free way yields to self-preservation
  return walkTo(state, eid, next);
}

/** The captain's way on (spec Loop-i section 5): the exit's sector jump; else the lowest forward destination, an overrun one only as a last resort, never sideways; else Wait for help (the only row with no fuel). -1 when none. */
function wayOnRow(state: SimState, rows: NavRow[]): number {
  const sector = rows.findIndex((row) => row.select === 'sector');
  if (sector >= 0) return sector;
  const forward = rows.map((row, k) => ({ row, k })).filter(({ row }) => row.select === 'jump' && beaconAt(row.index).column === state.run.column + 1);
  const free = forward.find(({ row }) => !overrun(state, beaconAt(row.index).column)) ?? forward[0];
  if (free) return free.k;
  return rows.findIndex((row) => row.select === 'wait');
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

const CANCEL: Intent = { ...NEUTRAL_INTENT, cancelPressed: true };
/** One stick edge per two ticks (a release between presses), as the captain's row moves. */
const press = (state: SimState, moveX: number, moveY: number): Intent => (state.tick % 2 === 0 ? { ...NEUTRAL_INTENT, moveX, moveY } : NEUTRAL_INTENT);

/** The tab-bar presses that bring a seated bot to `station`'s tab of its console group (spec Demo-x-a section 1): Up to the bar, Left/Right to the tab, Down back to the rows. Null when already there, or not at a group. */
function tabTo(state: SimState, ui: CardUiState, eid: number, station: number): Intent | null {
  const d = state.derived, g = d.stationGroup[station]!;
  if (g < 0) return null;
  const members = d.groupStations[g]!, k = members.indexOf(station), n = members.length, gr = state.groups;
  if (Seated.station[eid] === station && !ui.groupBar[g]) return null;
  if (!ui.groupBar[g]) return press(state, 0, -1);
  if (gr.tab[g] !== k) { const right = (k - gr.tab[g]! + n) % n; return press(state, right <= n - right ? 1 : -1, 0); }
  return press(state, 0, 1);
}

/** One Up/Down edge toward `want` in a cyclic list, the shorter way; at a console group Up never wraps past the first entry (Up there enters the tab bar), so that way round is Down. */
function cycleToward(list: readonly number[], at: number, want: number, grouped: boolean): number {
  const k = list.indexOf(at), j = list.indexOf(want), n = list.length;
  if (k < 0) return 1;
  const down = (j - k + n) % n;
  if (grouped && j > k) return 1;
  return down <= n - down ? 1 : -1;
}

/**
 * The bot gunner (spec Demo-xiii section 3, amendment 1): the captain at a Helm group (Weapons and Navigation on one console), else pid 1 with
 * two or more crew, else pid 0. -1 on a ship with no Weapons.
 */
export function gunnerPid(state: SimState): number {
  const d = state.derived, wpn = d.stationOfKind[StationKind.Weapons]!, nav = d.stationOfKind[StationKind.Navigation]!;
  if (wpn < 0) return -1;
  const g = d.stationGroup[wpn]!;
  if (g >= 0 && nav >= 0 && d.stationGroup[nav] === g) return 0;
  return state.playerCount >= 2 ? 1 : 0;
}

/** The gunner leaves the guns (spec Demo-xiii amendment 2): a fire burns anywhere aboard, or there is other work (a downed crew member, boarders, a fire, a breach, a failed console) and nobody else can take it (another Conscious, standing crew member at or above BOT_RETREAT_HEALTH, not healing in the Medbay). */
function gunnerCalled(state: SimState, pid: number, eid: number, here: number): boolean {
  if (inFire(state, eid)) return true;
  for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) return true;   // every fire: two hands put it out sooner, and one bot alone in a fire is how the gates lose health (amendment 2)
  for (let other = 0; other < state.playerCount; other++) {
    const o = state.crew[other]!;
    if (other === pid || Life.state[o] !== LifeState.Conscious || Seated.station[o]! >= 0) continue;
    const hp = Health.cur[o]!, mr = recoveryRoom(state, hp);
    if (hp >= BOT_RETREAT_HEALTH && !(mr >= 0 && roomAt(state, Position.x[o]!, Position.y[o]!) === mr)) return false;
  }
  return goalTiles(state, pid, here).size > 0;
}

/** The weapon the gunner fires next and the room it aims at (spec Demo-xiii section 3): a loaded torpedo, then a charged extra slot, then the Pulse; with nothing ready, the Pulse's aim so the shot is lined up when it charges. */
function gunnerPlan(state: SimState): { selector: number; slot: number; ready: boolean } {
  const w = state.weapons, e = state.enemy;
  const room = e.shieldLayers > 0 || enemySysUp(state, EnemySystem.Shields) ? ENEMY_SHIELDS_SLOT : ENEMY_WEAPONS_SLOT;
  if (w.torpedoLoaded) return { selector: Weapon.Torpedo, slot: ENEMY_SHIELDS_SLOT, ready: true };
  for (let k = 0; k < WEAPON_SLOTS; k++) {
    if (!w.slot[k] || w.charge2[k]! < 1) continue;
    const kind = weaponDef(w.slot[k]!).kind;
    if (kind === 'missile' && w.torpedoStock <= 0) continue;
    return { selector: Weapon.Slot1 + k, slot: kind === 'laser' ? room : ENEMY_SHIELDS_SLOT, ready: true };   // the Missile Pod and the Ion Cannon at the Shields room, a loot beam as the Pulse
  }
  const beam = e.scanned ? e.shieldFreq - 1 : w.selector <= Weapon.BeamF3 ? w.selector : Weapon.BeamF1;   // the frequency the Science card shows once scanned, else the selector's own
  return { selector: beam, slot: room, ready: w.charge >= 1 };
}

/** Seated at the guns: the Weapons tab, the cursor on the room, the selector on the weapon, then Confirm; nothing while a surrender is offered. */
function gunnerInput(state: SimState, ui: CardUiState, eid: number, wpn: number): Intent {
  const tab = tabTo(state, ui, eid, wpn); if (tab) return tab;
  const e = state.enemy, w = state.weapons;
  if (e.fleeing && e.surrenderIntact) return NEUTRAL_INTENT;   // take the scrap: any damage voids the surrender
  const plan = gunnerPlan(state), c = state.stations.cursor[wpn]!, grouped = state.derived.stationGroup[wpn]! >= 0;
  if (c !== plan.slot) return press(state, 0, cycleToward(warnedTargets(state), c, plan.slot, grouped));
  if (w.selector !== plan.selector) { const list = selectorList(state), k = list.indexOf(w.selector), j = list.indexOf(plan.selector), n = list.length, right = (j - k + n) % n; return press(state, right <= n - right ? 1 : -1, 0); }
  return plan.ready ? { ...NEUTRAL_INTENT, confirmPressed: true } : NEUTRAL_INTENT;
}

/** The gunner's duty (spec Demo-xiii section 3): to the guns while an enemy is present, unless called away (amendment 2) or, as the captain, the jump comes first; at them, fire. Null when this bot has no gunner duty this tick. */
function gunnerIntent(state: SimState, ui: CardUiState, pid: number, eid: number, here: number, blocked?: Set<number>): Intent | null {
  const d = state.derived, wpn = d.stationOfKind[StationKind.Weapons]!;
  if (pid !== gunnerPid(state)) return null;
  const g = d.stationGroup[wpn]!, members = g >= 0 ? d.groupStations[g]! : [wpn], seat = Seated.station[eid]!, atGuns = seat >= 0 && members.includes(seat);
  const nav = d.stationOfKind[StationKind.Navigation]!, helm = members.includes(nav), r = state.run;
  if (pid === 0 && nav >= 0 && stationOnline(state, nav) && (driveReady(state) || (r.event >= 0 && r.eventChoice < 0))) return atGuns && !helm ? CANCEL : null;   // the captain's jump and vote come first (runIntent)
  if (!state.enemy.present || !stationOnline(state, wpn) || gunnerCalled(state, pid, eid, here)) return atGuns ? CANCEL : null;
  if (seat < 0 && Health.cur[eid]! < BOT_GUN_HEAL_HEALTH) { const mr = recoveryRoom(state, Health.cur[eid]!); if (mr >= 0) { if (roomAt(state, Position.x[eid]!, Position.y[eid]!) === mr) return NEUTRAL_INTENT; const step = firstStep(state, here, new Set(d.roomTiles[mr]!), blocked); if (step >= 0) return walkTo(state, eid, step); } }   // a gunner below BOT_GUN_HEAL_HEALTH heals first, to BOT_RECOVER_HEALTH in an online Medbay, before it takes the guns (amendment 2)
  if (atGuns) return gunnerInput(state, ui, eid, wpn);
  if (seat >= 0 || state.stations.occupant[wpn]! >= 0) return null;
  const c = confirmTarget(state, pid);
  if (c.kind === ConfirmKind.Console && members.includes(c.index)) return { ...NEUTRAL_INTENT, confirmPressed: true };
  const next = firstStep(state, here, new Set([d.stationTile[wpn]!]), blocked);
  return next < 0 ? null : walkTo(state, eid, next);
}

/** A seated Science bot with nothing running scans the enemy ship (spec Demo-xiii section 3): the cursor to the ship row, then Confirm. Null otherwise. */
function scienceIntent(state: SimState, ui: CardUiState, eid: number): Intent | null {
  const sci = state.derived.stationOfKind[StationKind.Science]!, e = state.enemy;
  if (sci < 0 || Seated.station[eid] !== sci || !e.present || e.scanned || state.science.scanning || !stationOnline(state, sci)) return null;
  const g = state.derived.stationGroup[sci]!;
  if (g >= 0 && ui.groupBar[g]) return press(state, 0, 1);   // off the tab bar
  const c = state.stations.cursor[sci]!, list = [...warnedTargets(state, false), -1];
  if (c !== ENEMY_SLOT) return press(state, 0, cycleToward(list, c < 0 ? -1 : c, ENEMY_SLOT, g >= 0));
  return { ...NEUTRAL_INTENT, confirmPressed: true };
}

export function botIntent(state: SimState, ui: CardUiState, pid: number): Intent {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return NEUTRAL_INTENT;
  const it = dutyIntent(state, ui, pid, eid), r = state.run;
  if (Seated.station[eid] !== -1) {   // seated (spec Demo-xi amendment 4): a crew member who is not the Navigation occupant votes the safe choice and agrees to a pending jump from the seat, like a standing bot
    const nav = state.derived.stationOfKind[StationKind.Navigation]!;
    if (nav >= 0 && state.stations.occupant[nav] === pid) return it;
    if (r.event >= 0 && r.eventChoice < 0) return { ...it, confirmPressed: r.vote[pid] !== EVENTS[r.event]!.safeChoice };   // every seated Confirm is a vote press while the event is open
    if (r.jumpPending >= 0) return { ...it, confirmPressed: true };
    return it;
  }
  // Crew decisions (spec Coop-ii amendments D6 and D7): standing, a bot presses Confirm until its vote is the safe choice, and confirms a pending jump.
  if (r.event >= 0 && r.eventChoice < 0 && r.vote[pid] !== EVENTS[r.event]!.safeChoice) return { ...it, confirmPressed: true };
  if (r.jumpPending >= 0) return { ...it, confirmPressed: true };
  return it;
}

function dutyIntent(state: SimState, ui: CardUiState, pid: number, eid: number): Intent {
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
  const gun = gunnerIntent(state, ui, pid, eid, here, blocked); if (gun) return gun;
  const sci = scienceIntent(state, ui, eid); if (sci) return sci;
  const run = runIntent(state, ui, pid, eid, here, blocked); if (run) return run;
  const goals = goalTiles(state, pid, here);
  if (target.kind !== TargetKind.None) return { ...NEUTRAL_INTENT, interactHeld: true };
  if (!goals.size) return NEUTRAL_INTENT;
  const next = firstStep(state, here, goals, blocked);
  if (next < 0) return NEUTRAL_INTENT;
  return walkTo(state, eid, next);
}
