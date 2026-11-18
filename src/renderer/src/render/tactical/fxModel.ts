// The duel's view effects (H-1 spec §7 item 8, §8 shake): laser beams, missile bursts and contact sparks from each tick's
// events, the shake when the crew ship is hit, and the missile trails. Pure and view-owned: never sent to the sim, never
// hashed; a restart resets it. Times are render seconds.
import { CREW_SLOT, missileOf, type DuelEvent, type TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import type { Point } from './camera';
import type { PrevBody } from './tacticalModel';
import { CRT } from './crtTheme';
import { stepHits, type CalloutItem, type StruckItem } from './hitModel';

/** A contact the runtime detects from a ship's hit counters (the sim emits no contact events). */
export interface ContactEvent { kind: 'contact'; ship: number; body: 'planet' | 'asteroid' | 'ship'; x: number; y: number }
/** What the runtime queues for the views each tick: the sim's events plus the detected contacts. */
export type ViewEvent = DuelEvent | ContactEvent;

export const BEAM_S = 0.15, BURST_S = 0.3, SPARK_S = 0.3, SHAKE_S = 0.2, SHAKE_PX = 6;
/** Trail length in drawn positions (spec §7 item 6). */
export const TRAIL_POINTS = 30;
/** CRT map spec section 2: a beam hit hot, a miss dim; bursts and sparks hot (the layer fades them to mid). */
export const BEAM_HIT = CRT.hot, BEAM_MISS = CRT.dim, BURST = CRT.hot;
export const SPARK: Readonly<Record<ContactEvent['body'], number>> = { planet: CRT.hot, asteroid: CRT.hot, ship: CRT.hot };

export interface FxItem { kind: 'beam' | 'burst' | 'spark'; age: number; life: number; x1: number; y1: number; x2: number; y2: number; colour: number }
export interface FxState {
  items: FxItem[];
  /** Seconds of shake left, and the seconds since it started (drives the wobble). */
  shake: number; shakeT: number;
  /** Per ship's missile: its last TRAIL_POINTS drawn world positions, oldest first; empty while none flies. */
  trails: [Point[], Point[]];
  /** Duel polish i spec §B: the hit callouts over the enemy on the maps, and the struck rooms flashing in the contact
   *  window (hitModel.ts pushes them; stepFx ages them). */
  callouts: CalloutItem[]; struck: StruckItem[];
}

export function createFx(): FxState { return { items: [], shake: 0, shakeT: 0, trails: [[], []], callouts: [], struck: [] }; }
export function resetFx(fx: FxState): void { fx.items.length = 0; fx.shake = 0; fx.shakeT = 0; fx.trails[0].length = 0; fx.trails[1].length = 0; fx.callouts.length = 0; fx.struck.length = 0; }

/** Whether an event is a hit on the crew ship (CREW_SLOT): a laser hit from another ship, or any missile landing on it.
 *  Laser events carry no target until R-3/R-5 (adding one changes the duel oracle's event digest), so a laser hit from
 *  any non-crew ship counts as a hit on the crew; with two ships that is exactly the enemy's. */
export function hitsCrew(e: ViewEvent): boolean {
  return (e.kind === 'laser' && e.ship !== CREW_SLOT && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === CREW_SLOT);
}

/** Queue one tick's events as effects; a hit on the crew ship (re)starts the shake. */
export function pushEvents(fx: FxState, events: readonly ViewEvent[]): void {
  for (const e of events) {
    if (e.kind === 'laser') fx.items.push({ kind: 'beam', age: 0, life: BEAM_S, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, colour: e.hit ? BEAM_HIT : BEAM_MISS });
    else if (e.kind === 'missileEnd') fx.items.push({ kind: 'burst', age: 0, life: BURST_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: BURST });
    else if (e.kind === 'contact') fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: SPARK[e.body] });
    if (hitsCrew(e)) { fx.shake = SHAKE_S; fx.shakeT = 0; }
  }
}

/** Age every effect (the callouts and flashes too) by dt and drop the finished ones; run the shake down. */
export function stepFx(fx: FxState, dt: number): void {
  stepHits(fx, dt);
  for (const it of fx.items) it.age += dt;
  for (let k = fx.items.length - 1; k >= 0; k--) if (fx.items[k]!.age >= fx.items[k]!.life) fx.items.splice(k, 1);
  if (fx.shake > 0) { fx.shake = Math.max(0, fx.shake - dt); fx.shakeT += dt; }
}

/** The screen offset of the shake now: a decaying wobble, zero when none runs. */
export function shakeOffset(fx: FxState): Point {
  if (fx.shake <= 0) return { x: 0, y: 0 };
  const k = SHAKE_PX * (fx.shake / SHAKE_S);
  return { x: Math.round(Math.sin(fx.shakeT * 95) * k), y: Math.round(Math.cos(fx.shakeT * 71) * k) };
}

/** Ship i's missile's interpolated position, or null when none flies. `missilePrev` is by owner (ship slot). */
export function interpolatedMissile(state: TacticalState, missilePrev: readonly (PrevBody | null)[], alpha: number, i: number): PrevBody | null {
  const m = missileOf(state, i);
  if (!m) return null;
  const p = missilePrev[i], h1 = m.heading + m.headingAcc, a = Math.min(1, Math.max(0, alpha));
  if (!p) return { x: m.x, y: m.y, h: h1 };
  let dh = h1 - p.h;
  dh -= Math.round(dh / HEADING_COUNT) * HEADING_COUNT;
  return { x: p.x + (m.x - p.x) * a, y: p.y + (m.y - p.y) * a, h: p.h + dh * a };
}

/** Once per frame: append each flying missile's drawn position to its trail (when it moved), and clear ended ones. */
export function recordTrails(fx: FxState, state: TacticalState, missilePrev: readonly (PrevBody | null)[], alpha: number): void {
  for (let i = 0; i < 2; i++) {
    const trail = fx.trails[i as 0 | 1], m = interpolatedMissile(state, missilePrev, alpha, i);
    if (!m) { trail.length = 0; continue; }
    const last = trail[trail.length - 1];
    if (last && last.x === m.x && last.y === m.y) continue;
    trail.push({ x: m.x, y: m.y });
    if (trail.length > TRAIL_POINTS) trail.shift();
  }
}
