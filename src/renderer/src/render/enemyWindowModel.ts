import type { SimState } from '../sim/state';
import { EnemySystem, EnemyRoom, ENEMY_ROOM_NAMES, ENEMY_SYSTEM_COUNT, enemyShieldCap, isWarden, enemyWeaponCharge, fleeSecondsLeft, rotateSecondsLeft, ionSecondsLeft } from '../sim/enemy';
import { isEnemySlot, enemyRoomOfSlot } from '../sim/debrisTargets';
import { StationKind } from '../sim/stationKinds';
import { beaconKey } from '../sim/run';
import { TICK_HZ, ENEMY_SYS_HP, ENEMY_ROOMS, ENEMY_FIRE_SECONDS, ENEMY_BREACH_SECONDS } from '../sim/tuning';
import { ENEMY_LAYOUT, ENEMY_TILE, ENEMY_COLS, ENEMY_ROWS } from './enemyShipLayout';

/** The enemy ship window (spec Demo-viii section 2, amendments R1-R4): pure state -> picture data, no Pixi. Every position is in window pixels unless named otherwise. */
export const WINDOW = { x: 872, y: 114, w: 400, h: 340 } as const;   // the right column under the threats panel (spec Demo-x-c section 3)
export const SHIP_MARGIN = 8;
export const ARRIVE_SECONDS = 0.5, BREAK_SECONDS = 1.2, FLY_SECONDS = 0.8, BOLT_SECONDS = 0.4;
export const FLASH_TICKS = 30, CREW_WALK_SECONDS = 1.5;
/** The ship's frame inside the window: centred across, below the pip row, leaving room for the shield rings above the charge bar and the two status lines. */
export const SHIP = { x: (WINDOW.w - ENEMY_COLS * ENEMY_TILE) / 2, y: 44, w: ENEMY_COLS * ENEMY_TILE, h: ENEMY_ROWS * ENEMY_TILE } as const;

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export type RoomGlyph = 'weapons' | 'engines' | 'shields' | 'piloting';
export interface WindowRoom { rect: Rect; glyph: RoomGlyph | null; tint: 'normal' | 'damaged' | 'down' | 'ion'; hp: number | null; repairIn: number | null; ionIn: number | null; fire: boolean; breach: boolean }   // ion / ionIn: an ion-disabled system and its whole seconds left (spec Loop-iii section 4)
export interface EnemyWindowView {
  visible: boolean; phase: 'arriving' | 'present' | 'destroyed' | 'leaving'; t: number;
  slideX: number; shipDY: number; ship: Rect;
  rooms: WindowRoom[];
  shield: { layers: number; max: number; down: boolean; flash: boolean };
  hullPips: { lit: number; total: number };
  frequency: string | null; charge: number | null; status: string; problem: string | null;
  /** The ship's name over the window: THE WARDEN at the final beacon (spec Loop-iv section 2), else none. */
  title: string | null;
  reticle: { room: number } | null;   // the targeted room (spec Demo-x-c section 4: every target is a room)
  crew: { x: number; y: number; working: boolean }[];
  /** Our last shot: the target in window pixels (null for a debris slot, whose rock lives in the world band), progress 0..1. */
  bolt: { to: Pt | null; slot: number; t: number; result: number; kind: number } | null;
}
/** Render memory for the window's animations, advanced once per frame by stepWindowAnim. */
export interface WindowAnim { node: number; tick: number; present: boolean; destroyed: number; arriveTick: number; goneTick: number; gone: 'destroyed' | 'leaving' | null; last: EnemyWindowView | null }

const GLYPHS: readonly (RoomGlyph | null)[] = ['weapons', 'engines', 'shields', 'piloting', null];
const HIDDEN: EnemyWindowView = { visible: false, phase: 'present', t: 0, slideX: 0, shipDY: 0, ship: { ...SHIP }, rooms: [], shield: { layers: 0, max: 0, down: true, flash: false }, hullPips: { lit: 0, total: 10 }, frequency: null, charge: null, status: '', problem: null, title: null, reticle: null, crew: [], bolt: null };

export function freshWindowAnim(): WindowAnim { return { node: -1, tick: -1, present: false, destroyed: 0, arriveTick: -1, goneTick: -1, gone: null, last: null }; }

function roomRect(room: number): Rect { const r = ENEMY_LAYOUT.rooms[room]!; return { x: SHIP.x + r.x * ENEMY_TILE, y: SHIP.y + r.y * ENEMY_TILE, w: r.w * ENEMY_TILE, h: r.h * ENEMY_TILE }; }
const centreOf = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** A room's centre in internal (screen) pixels with the window at rest: the enemy-shot origin (amendment R3). */
export function windowRoomCentre(room: number): Pt { const c = centreOf(roomRect(room)); return { x: WINDOW.x + c.x, y: WINDOW.y + c.y }; }

/** Advance the animation memory: an arrival, a departure (destroyed when the kill counter rose), a jump or a new run (closed at once). */
export function stepWindowAnim(prev: WindowAnim, state: SimState): WindowAnim {
  const node = beaconKey(state), present = state.enemy.present === 1, destroyed = state.telemetry.enemiesDestroyed;
  if (node !== prev.node || state.tick < prev.tick) return { ...freshWindowAnim(), node, tick: state.tick, present, destroyed, arriveTick: present ? state.tick : -1, last: null };
  const a: WindowAnim = { ...prev, tick: state.tick };
  if (present && !prev.present) { a.arriveTick = state.tick; a.gone = null; a.goneTick = -1; }
  if (!present && prev.present) { a.goneTick = state.tick; a.gone = destroyed > prev.destroyed ? 'destroyed' : 'leaving'; }
  a.present = present; a.destroyed = destroyed;
  if (present) a.last = presentView(state, state.tick, a);
  return a;
}

/** Problems (fire or breach) per room, with their age in seconds; most recent first. */
function problems(state: SimState): { room: number; kind: 'FIRE' | 'BREACH'; age: number }[] {
  const e = state.enemy, out: { room: number; kind: 'FIRE' | 'BREACH'; age: number }[] = [];
  for (let r = 0; r < ENEMY_ROOMS; r++) {
    if (e.roomFire[r]! > 0) out.push({ room: r, kind: 'FIRE', age: ENEMY_FIRE_SECONDS - e.roomFire[r]! });
    if (e.roomBreach[r]! > 0) out.push({ room: r, kind: 'BREACH', age: ENEMY_BREACH_SECONDS - e.roomBreach[r]! });
  }
  return out.sort((a, b) => a.age - b.age);
}

/** Three crew, one per system console; for each troubled room (in room order) the nearest free crew member walks there and works (spec section 2b, render only). */
function crewOf(state: SimState): EnemyWindowView['crew'] {
  const home = ENEMY_LAYOUT.consoles.map((c) => ({ x: SHIP.x + (c.x + 0.5) * ENEMY_TILE, y: SHIP.y + (c.y + 0.5) * ENEMY_TILE }));
  const out = home.map((p) => ({ x: p.x, y: p.y, working: true })), taken = new Set<number>(), e = state.enemy;
  for (let r = 0; r < ENEMY_ROOMS; r++) {
    const fire = e.roomFire[r]!, breach = e.roomBreach[r]!;
    if (fire <= 0 && breach <= 0) continue;
    if (r < home.length && !taken.has(r)) { taken.add(r); continue; }   // the room's own crew member is already there
    const spot = centreOf(roomRect(r));
    let best = -1, bestD = Infinity;
    home.forEach((p, k) => { if (taken.has(k)) return; const d = Math.hypot(p.x - spot.x, p.y - spot.y); if (d < bestD) { bestD = d; best = k; } });
    if (best < 0) continue;
    taken.add(best);
    const age = Math.max(fire > 0 ? ENEMY_FIRE_SECONDS - fire : 0, breach > 0 ? ENEMY_BREACH_SECONDS - breach : 0);
    const f = Math.min(1, age / CREW_WALK_SECONDS), p = home[best]!;
    out[best] = { x: p.x + (spot.x - p.x) * f, y: p.y + (spot.y - p.y) * f, working: f >= 1 };
  }
  return out;
}

/** Our last shot while it flies (BOLT_SECONDS): the target room centre (the ship centre for the hull row), null for a debris slot. */
function boltOf(state: SimState, nowTick: number): EnemyWindowView['bolt'] {
  const w = state.weapons, age = nowTick - w.lastShotTick;
  if (w.lastShotTick < 0 || age < 0 || age >= BOLT_SECONDS * TICK_HZ) return null;
  const slot = w.lastShotTarget, to = !isEnemySlot(slot) ? null : centreOf(roomRect(enemyRoomOfSlot(slot)));
  return { to, slot, t: age / (BOLT_SECONDS * TICK_HZ), result: w.lastShotResult, kind: w.lastShotKind };
}

function presentView(state: SimState, nowTick: number, anim: WindowAnim): EnemyWindowView {
  const e = state.enemy, tick = state.tick;
  const rooms: WindowRoom[] = Array.from({ length: ENEMY_ROOMS }, (_, r) => {
    const sys = r < ENEMY_SYSTEM_COUNT ? r : -1, hp = sys >= 0 ? e.sysHp[sys]! : null;
    const ion = sys >= 0 && hp! > 0 ? ionSecondsLeft(state, sys) : 0;
    const tint = hp === null ? 'normal' : hp <= 0 ? 'down' : ion > 0 ? 'ion' : hp < ENEMY_SYS_HP ? 'damaged' : 'normal';
    return { rect: roomRect(r), glyph: GLYPHS[r]!, tint, hp: hp === null ? null : hp / ENEMY_SYS_HP, repairIn: hp !== null && hp <= 0 && e.sysRepairTick[sys]! >= 0 ? Math.ceil((e.sysRepairTick[sys]! - tick) / TICK_HZ) : null, ionIn: ion > 0 ? ion : null, fire: e.roomFire[r]! > 0, breach: e.roomBreach[r]! > 0 };
  });
  const w = state.weapons, shotAge = nowTick - w.lastShotTick;
  const flee = fleeSecondsLeft(state);
  const status = e.fleeing && e.surrenderIntact ? `SURRENDERING ${flee}s  hold fire` : e.fleeing ? `FLEEING ${flee}s` : e.sysHp[EnemySystem.Engines] === 0 ? 'ENGINES DOWN' : 'ENEMY';
  const first = problems(state)[0];
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, cursor = wpn >= 0 && state.stations.occupant[wpn]! >= 0 ? state.stations.cursor[wpn]! : -1;
  const reticle = cursor >= 0 && isEnemySlot(cursor) ? { room: enemyRoomOfSlot(cursor) } : null;
  const bolt = boltOf(state, nowTick);
  const age = nowTick - anim.arriveTick, arriving = anim.arriveTick >= 0 && age < ARRIVE_SECONDS * TICK_HZ;
  const t = arriving ? Math.max(0, age) / (ARRIVE_SECONDS * TICK_HZ) : 1;
  const ease = 1 - (1 - t) * (1 - t);
  return {
    visible: true, phase: arriving ? 'arriving' : 'present', t, slideX: arriving ? Math.round((1 - ease) * (WINDOW.w + 16)) : 0, shipDY: 0, ship: { ...SHIP },
    rooms,
    shield: { layers: e.shieldLayers, max: enemyShieldCap(state), down: e.sysHp[EnemySystem.Shields] === 0, flash: w.lastShotResult === 1 && w.lastShotTick >= 0 && shotAge >= 0 && shotAge < FLASH_TICKS },
    hullPips: { lit: e.maxHull > 0 ? Math.max(0, Math.ceil(e.hull / e.maxHull * 10 - 1e-9)) : 0, total: 10 },
    frequency: e.scanned ? (() => { const r = rotateSecondsLeft(state); return r === null ? `F${e.shieldFreq}` : `F${e.shieldFreq} ${r}s`; })() : null,   // spec Coop-i section 1: only while current (a re-tune clears the scan), with the re-tune countdown
    charge: e.sysHp[EnemySystem.Weapons] === 0 ? null : enemyWeaponCharge(state),
    status, title: isWarden(state) ? 'THE WARDEN' : null, problem: first ? `${first.kind}: ${ENEMY_ROOM_NAMES[first.room]}` : null,
    reticle, crew: crewOf(state), bolt,
  };
}

/** The window for this frame: the live ship while present; the last picture breaking up or flying out after it left; hidden otherwise. nowTick may be fractional. */
export function enemyWindowModel(state: SimState, nowTick: number, anim: WindowAnim): EnemyWindowView {
  if (state.enemy.present) return presentView(state, nowTick, anim);
  if (!anim.gone || !anim.last || anim.goneTick < 0) return HIDDEN;
  const secs = anim.gone === 'destroyed' ? BREAK_SECONDS : FLY_SECONDS, age = nowTick - anim.goneTick;
  if (age >= secs * TICK_HZ || age < 0) return HIDDEN;
  const t = age / (secs * TICK_HZ);
  return { ...anim.last, phase: anim.gone, t, slideX: 0, shipDY: anim.gone === 'leaving' ? -Math.round(t * t * (SHIP.y + SHIP.h + 40)) : 0, reticle: null, bolt: boltOf(state, nowTick), status: anim.gone === 'destroyed' ? 'DESTROYED' : anim.last.status, problem: anim.gone === 'destroyed' ? null : anim.last.problem };
}
export { EnemyRoom };

/** Someone sits at Navigation with its card showing: a lone console, or a console group on its Helm tab (spec Demo-x-c: on the Skiff the Helm and Weapons share a seat, and the gunner needs the window). */
export function navigatorAtHelm(state: SimState): boolean {
  const d = state.derived, nav = d.stationOfKind[StationKind.Navigation]!;
  if (nav < 0 || state.stations.occupant[nav]! < 0) return false;
  const g = d.stationGroup[nav]!;
  return g < 0 || d.groupStations[g]![state.groups.tab[g]!] === nav;
}
/** Amendment R1: the window shows while it has something to show and no one sits at Navigation (the map shows then instead). */
export function windowShown(state: SimState, view: EnemyWindowView): boolean {
  return view.visible && !navigatorAtHelm(state);
}
/** The right column (amendment R1): the map with a navigator seated, else the enemy window when it has something to show, else nothing. Never both. */
export function rightColumn(state: SimState, phase: string, view: EnemyWindowView): 'map' | 'window' | 'none' {
  if (phase === 'running' && navigatorAtHelm(state)) return 'map';
  return windowShown(state, view) ? 'window' : 'none';
}
/** The red flash on the room our hit landed in, as the bolt arrives: 0.3 s fading (render only). */
export function hitFlashOf(state: SimState, view: EnemyWindowView): { room: number | 'hull'; alpha: number } | null {
  const w = state.weapons, age = state.tick - w.lastShotTick - BOLT_SECONDS * TICK_HZ;
  if (!view.visible || w.lastShotTick < 0 || w.lastShotResult !== 2 || !isEnemySlot(w.lastShotTarget) || age < 0 || age >= 18) return null;
  return { room: enemyRoomOfSlot(w.lastShotTarget), alpha: 1 - age / 18 };
}
