// The enemy's shot telegraph and what the crew's hits did (duel polish i spec §A, §B). Pure, no Pixi: the charge ring's
// fill from the Hunter's held laser, the callouts from each frame's view events, their ageing and stacking (view-owned,
// in FxState beside the beams), and the contact window's struck-room flashes. Presentation only: nothing here is sent
// to the sim or hashed. The spec's warning red, shield blue and amber map onto the console's amber ramp (CRT map spec
// section 2: meaning by brightness, never by hue): the charge and OFFLINE hot, a hit main, SHIELD DOWN mid, a miss dim.
import { classOf, CREW_SLOT, Room, targetOf, type TacticalState } from '../../sim/tactical/state';
import { laserFull, laserOffline } from '../../sim/tactical/weapons';
import { ROOM_NAMES } from '../duel/interiorModel';
import { CRT } from './crtTheme';
import type { FxState, ViewEvent } from './fxModel';
import type { Point } from './camera';

/** The ship whose shot is telegraphed and whose hits are called out: the Hunter (§A). */
export const ENEMY_SLOT = 1;
/** §A: the ring's radius in ship radii, its screen-px floor, and the full charge's pulse (alpha 0.45 to 1 at 4 Hz). */
export const CHARGE_RING_RADII = 2.2, CHARGE_RING_MIN_PX = 18, CHARGE_PULSE_HZ = 4, CHARGE_PULSE_MIN = 0.45;
/** §B: a callout's life and rise, the same-frame stacking step, and the most shown at once. */
export const CALLOUT_S = 1.5, CALLOUT_RISE_PX = 24, CALLOUT_STACK_PX = 18, CALLOUT_MAX = 4;
/** §B: the contact window's struck-room flash, alpha FLASH_ALPHA to 0 over FLASH_S. */
export const FLASH_S = 0.6, FLASH_ALPHA = 0.6;
/** §B colours on the ramp (see the header). */
export const CALLOUT_COLOUR = { shield: CRT.mid, hit: CRT.main, offline: CRT.hot, miss: CRT.dim } as const;
export const CHARGE_COLOUR = CRT.hot;

/** §A: the Hunter's held charge, or null when it holds none, its laser is off (Weapons at 2) or it is gone. */
export function enemyCharge(state: TacticalState, ship = ENEMY_SLOT): { fill: number; full: boolean } | null {
  const s = state.systems[ship], body = state.ships[ship];
  if (!s || !body?.active || !s.fireHeld || laserOffline(state, ship)) return null;
  const units = classOf(state, ship).slots.laser.chargeUnits;
  return { fill: Math.max(0, Math.min(1, s.laserCharge / units)), full: laserFull(state, ship) };
}
/** §A: the full ring's pulse alpha at presentation time t, 0.45 to 1 at 4 Hz. */
export function chargePulse(t: number): number { return CHARGE_PULSE_MIN + (1 - CHARGE_PULSE_MIN) * (0.5 + 0.5 * Math.cos(t * 2 * Math.PI * CHARGE_PULSE_HZ)); }

export type CalloutKind = keyof typeof CALLOUT_COLOUR;
export interface Callout { text: string; colour: number; kind: CalloutKind }

/** A struck room's words: `<ROOM> HIT`, `<ROOM> OFFLINE` once it is at 2, Shields at 2 `SHIELDS DMG 2`. */
function roomCallout(state: TacticalState, room: number, prefix: string): Callout {
  const name = ROOM_NAMES[room] ?? 'HULL', down = (state.systems[ENEMY_SLOT]!.rooms[room] ?? 0) >= 2;
  if (!down) return { text: `${prefix}${name} HIT`, colour: CALLOUT_COLOUR.hit, kind: 'hit' };
  return { text: `${prefix}${room === Room.Shields ? 'SHIELDS DMG 2' : `${name} OFFLINE`}`, colour: CALLOUT_COLOUR.offline, kind: 'offline' };
}

/** §B: the callouts for one frame's events, in event order: every crew laser release (ship 0) and every crew missile
 *  that lands on the enemy on a room. The room's level is read from the state the events arrived with. */
export function hitCallouts(events: readonly ViewEvent[], state: TacticalState): Callout[] {
  const out: Callout[] = [];
  for (const e of events) {
    if (e.kind === 'laser' && e.ship === CREW_SLOT) {
      if (e.stripped) out.push({ text: 'SHIELD DOWN', colour: CALLOUT_COLOUR.shield, kind: 'shield' });
      else if (!e.hit) out.push({ text: 'MISS', colour: CALLOUT_COLOUR.miss, kind: 'miss' });
      else if (e.room >= 0) out.push(roomCallout(state, e.room, ''));
    } else if (e.kind === 'missileEnd' && e.ship === CREW_SLOT && e.target === ENEMY_SLOT && e.room >= 0) out.push(roomCallout(state, e.room, 'TORPEDO: '));
  }
  return out;
}

/** A shown callout: its age in seconds and its place in its frame's stack (0 the lowest). */
export interface CalloutItem extends Callout { age: number; stack: number }
/** A struck room on a ship, flashing in the contact window. */
export interface StruckItem { ship: number; room: number; age: number }

/** §B: queue one frame's hits: the callouts (stacked in event order, the oldest dropped past CALLOUT_MAX) and each
 *  struck room (a crew laser hit on its target, a crew missile on any ship, room ≥ 0) restarting its flash. */
export function pushHits(fx: FxState, events: readonly ViewEvent[], state: TacticalState): void {
  hitCallouts(events, state).forEach((c, stack) => fx.callouts.push({ ...c, age: 0, stack }));
  if (fx.callouts.length > CALLOUT_MAX) fx.callouts.splice(0, fx.callouts.length - CALLOUT_MAX);
  for (const e of events) {
    let ship = -1, room = -1;
    if (e.kind === 'laser' && e.ship === CREW_SLOT && e.hit && !e.stripped) { ship = targetOf(state, CREW_SLOT); room = e.room; }
    else if (e.kind === 'missileEnd' && e.ship === CREW_SLOT && e.target >= 0 && e.target !== CREW_SLOT) { ship = e.target; room = e.room; }
    if (ship < 0 || room < 0) continue;
    const at = fx.struck.findIndex((s) => s.ship === ship && s.room === room);
    if (at >= 0) fx.struck[at]!.age = 0;
    else fx.struck.push({ ship, room, age: 0 });
  }
}
/** Age the callouts and flashes by dt, dropping the finished ones (stepFx calls it). */
export function stepHits(fx: FxState, dt: number): void {
  for (const c of fx.callouts) c.age += dt;
  for (let k = fx.callouts.length - 1; k >= 0; k--) if (fx.callouts[k]!.age >= CALLOUT_S) fx.callouts.splice(k, 1);
  for (const s of fx.struck) s.age += dt;
  for (let k = fx.struck.length - 1; k >= 0; k--) if (fx.struck[k]!.age >= FLASH_S) fx.struck.splice(k, 1);
}

export interface CalloutDraw { text: string; x: number; y: number; colour: number; alpha: number }
/** §B: the callouts over an anchor (the screen point above the enemy marker): each rises CALLOUT_RISE_PX over its life
 *  and fades. Feel-i review: never on top of one another; the newest is lowest (a frame's own in event order) and each
 *  older one sits at least CALLOUT_STACK_PX above the one below it. */
export function calloutDraws(items: readonly CalloutItem[], anchor: Point): CalloutDraw[] {
  const ys: number[] = new Array(items.length);
  const order = items.map((_, k) => k).sort((a, b) => items[a]!.age - items[b]!.age || items[a]!.stack - items[b]!.stack || a - b);
  let above = Infinity;
  for (const k of order) {
    const y = Math.min(anchor.y - CALLOUT_RISE_PX * Math.min(1, items[k]!.age / CALLOUT_S), above - CALLOUT_STACK_PX);
    ys[k] = y; above = y;
  }
  return items.map((c, k) => ({ text: c.text, x: anchor.x, y: ys[k]!, colour: c.colour, alpha: 1 - Math.min(1, c.age / CALLOUT_S) }));
}
/** §B: the flashes for one ship: each struck room and its alpha now. */
export function flashesFor(struck: readonly StruckItem[], ship: number): { room: number; alpha: number }[] {
  return struck.filter((s) => s.ship === ship).map((s) => ({ room: s.room, alpha: FLASH_ALPHA * Math.max(0, 1 - s.age / FLASH_S) }));
}
