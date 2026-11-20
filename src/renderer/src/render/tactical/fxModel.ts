// The duel's view effects (H-1 spec §7 item 8, §8 shake): laser beams, missile bursts and contact sparks from each tick's
// events, the shake when the crew ship is hit, and the missile trails. Pure and view-owned: never sent to the sim, never
// hashed; a restart resets it. Times are render seconds.
import { CREW_SLOT, missileOf, type DuelEvent, type TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT, LASER_HULL, MISSILE_HULL } from '../../sim/tactical/tuning';
import type { Point } from './camera';
import type { PrevBody } from './tacticalModel';
import { CRT } from './crtTheme';
import { stepHits, type CalloutItem, type StruckItem } from './hitModel';

/** A contact the runtime detects from a ship's hit counters (the sim emits no contact events). */
export interface ContactEvent { kind: 'contact'; ship: number; body: 'planet' | 'asteroid' | 'ship'; x: number; y: number }
/** What the runtime queues for the views each tick: the sim's events plus the detected contacts. */
export type ViewEvent = DuelEvent | ContactEvent;

export const BEAM_S = 0.15, BURST_S = 0.3, SPARK_S = 0.3, SHAKE_S = 0.2, SHAKE_PX = 6;
/** Feel-i (console feel spec §3, hits are loud): the crew's beam lives a little longer, with a white-hot (CRT.hot) core for
 *  its first CORE_S; an impact flare where it lands; the enemy's shield bubble pops when a layer goes; a floating `-2`
 *  over a room hit; the shakes on the seats that see it (a laser room hit 2 px 120 ms, a torpedo hit 4 px 200 ms); a kill
 *  is a big explosion, the hull breaking apart and KILL_SLOWMO_S of render-only slow motion at KILL_SLOWMO_RATE. */
export const CREW_BEAM_S = 0.22, CORE_S = 0.06, FLARE_S = 0.35, POP_S = 0.45, FLOAT_S = 1.1, FLOAT_RISE_PX = 30, FLOATS_MAX = 4, FLOAT_STEP_PX = 44;
export const ROOM_SHAKE = { px: 2, s: 0.12 }, TORPEDO_SHAKE = { px: 4, s: 0.2 }, KILL_SHAKE = { px: 6, s: 0.4 };
export const KILL_S = 1.8, KILL_SLOWMO_S = 0.4, KILL_SLOWMO_RATE = 0.3, BOOM_S = 0.9;
/** Trail length in drawn positions (spec §7 item 6). */
export const TRAIL_POINTS = 30;
/** CRT map spec section 2: a beam hit hot, a miss dim; bursts and sparks hot (the layer fades them to mid). */
export const BEAM_HIT = CRT.hot, BEAM_MISS = CRT.dim, BURST = CRT.hot;
export const SPARK: Readonly<Record<ContactEvent['body'], number>> = { planet: CRT.hot, asteroid: CRT.hot, ship: CRT.hot };

/** `crew` (Feel-i): a crew beam, drawn thicker with its core; `side` its burst offset (-1 or 1). A `flare` is a crew hit's
 *  impact; a `pop` the enemy shield bubble flashing out (x1, y1 its centre); a `boom` the kill's explosion. Spike ii §7: a
 *  `chip` or `speck` flies from (x1, y1) at (vx, vy) world u/s; a `shock` ring grows to `size` world units; a `core` flash
 *  of `size`; a `burst` with a `size` is sized by its rock. */
export interface FxItem { kind: 'beam' | 'burst' | 'spark' | 'flare' | 'pop' | 'boom' | 'chip' | 'speck' | 'shock' | 'core'; age: number; life: number; x1: number; y1: number; x2: number; y2: number; colour: number; crew?: boolean; side?: number; vx?: number; vy?: number; size?: number }
/** A floating damage number over the enemy, at the world point it rose from. */
/** `slot` (Feel-i review): the lowest column free when it appeared, so successive floats stand side by side, not stacked. */
export interface FloatItem { text: string; x: number; y: number; age: number; slot: number }
/** The kill (Feel-i): the enemy's last drawn place and heading, and the seconds since. */
export interface KillFx { x: number; y: number; h: number; age: number }
export interface FxState {
  items: FxItem[];
  /** Seconds of shake left, and the seconds since it started (drives the wobble). */
  shake: number; shakeT: number;
  /** Per ship's missile: its last TRAIL_POINTS drawn world positions, oldest first; empty while none flies. */
  trails: [Point[], Point[]];
  /** Duel polish i spec §B: the hit callouts over the enemy on the maps, and the struck rooms flashing in the contact
   *  window (hitModel.ts pushes them; stepFx ages them). */
  callouts: CalloutItem[]; struck: StruckItem[];
  /** Feel-i: the shake's strength in px (SHAKE_PX for a hit on the crew), its life, the floating numbers, the seconds
   *  since the crew laser last fired (Infinity: never), the seconds the shot has been lined up (-1: not), the kill and
   *  the slow motion left (render seconds), and the crew burst's last beam offset. */
  shakePx: number; shakeLife: number; floats: FloatItem[]; sinceShot: number; solutionAge: number; kill: KillFx | null; slowmo: number; beamSide: number;
  /** Spike ii: the view's own seeded random (fxRandom), for the rock sprays. */
  seed: number;
}

export function createFx(): FxState {
  return { items: [], shake: 0, shakeT: 0, trails: [[], []], callouts: [], struck: [], shakePx: SHAKE_PX, shakeLife: SHAKE_S, floats: [], sinceShot: Infinity, solutionAge: -1, kill: null, slowmo: 0, beamSide: 1, seed: 1 };
}
export function resetFx(fx: FxState): void {
  fx.items.length = 0; fx.shake = 0; fx.shakeT = 0; fx.trails[0].length = 0; fx.trails[1].length = 0; fx.callouts.length = 0; fx.struck.length = 0;
  fx.shakePx = SHAKE_PX; fx.shakeLife = SHAKE_S; fx.floats.length = 0; fx.sinceShot = Infinity; fx.solutionAge = -1; fx.kill = null; fx.slowmo = 0; fx.beamSide = 1; fx.seed = 1;
}

/** Start a shake of `px` for `s` seconds unless a stronger one is still running. */
export function startShake(fx: FxState, px: number, s: number): void {
  const now = fx.shake > 0 ? fx.shakePx * (fx.shake / fx.shakeLife) : 0;
  if (px < now) return;
  fx.shakePx = px; fx.shakeLife = s; fx.shake = s; fx.shakeT = 0;
}
/** Spike ii: the view's seeded random in [0, 1) (an xorshift on fx.seed): render-only, never the sim's. */
export function fxRandom(fx: FxState): number {
  let r = fx.seed >>> 0 || 1;
  r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0;
  fx.seed = r;
  return r / 4294967296;
}
function float(fx: FxState, text: string, x: number, y: number): void {
  if (fx.floats.length >= FLOATS_MAX) fx.floats.splice(0, fx.floats.length - FLOATS_MAX + 1);   // the oldest goes first
  let slot = 0;
  while (fx.floats.some((f) => f.slot === slot)) slot++;
  fx.floats.push({ text, x, y, age: 0, slot });
}

/** Whether an event is a hit on the crew ship (CREW_SLOT): a laser hit from another ship, or any missile landing on it.
 *  Laser events carry no target until R-3/R-5 (adding one changes the duel oracle's event digest), so a laser hit from
 *  any non-crew ship counts as a hit on the crew; with two ships that is exactly the enemy's. */
export function hitsCrew(e: ViewEvent): boolean {
  return (e.kind === 'laser' && e.ship !== CREW_SLOT && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === CREW_SLOT);
}

/** Queue one tick's events as effects; a hit on the crew ship (re)starts the shake. Feel-i: the crew's beams are louder
 *  (a thicker beam, a burst's two beams side by side, an impact flare on a hit), a stripped layer pops the enemy's shield
 *  bubble, a room hit floats `-2` over the enemy and shakes 2 px, and a crew torpedo on the enemy floats its damage and
 *  shakes 4 px. The events are the same online (onlineSource's gapEvents), so the guest's screen gets the same juice. */
export function pushEvents(fx: FxState, events: readonly ViewEvent[]): void {
  for (const e of events) {
    if (e.kind === 'laser') {
      const crew = e.ship === CREW_SLOT, rock = (e.rock ?? -1) >= 0;
      if (crew) { fx.sinceShot = 0; fx.beamSide = -fx.beamSide; }
      fx.items.push({ kind: 'beam', age: 0, life: crew ? CREW_BEAM_S : BEAM_S, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, colour: e.hit || rock ? BEAM_HIT : BEAM_MISS, ...(crew ? { crew: true, side: fx.beamSide } : {}) });
      if (crew && e.hit) fx.items.push({ kind: 'flare', age: 0, life: FLARE_S, x1: e.x2, y1: e.y2, x2: e.x2, y2: e.y2, colour: CRT.hot });
      if (crew && e.stripped) fx.items.push({ kind: 'pop', age: 0, life: POP_S, x1: e.x2, y1: e.y2, x2: e.x2, y2: e.y2, colour: CRT.hot });
      if (crew && e.hit && !e.stripped && e.room >= 0) { float(fx, `-${LASER_HULL}`, e.x2, e.y2); startShake(fx, ROOM_SHAKE.px, ROOM_SHAKE.s); }
    } else if (e.kind === 'missileEnd') {
      fx.items.push({ kind: 'burst', age: 0, life: BURST_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: BURST });
      if (e.ship === CREW_SLOT && e.cause === 'ship' && e.target >= 0 && e.target !== CREW_SLOT) { float(fx, `-${MISSILE_HULL}`, e.x, e.y); startShake(fx, TORPEDO_SHAKE.px, TORPEDO_SHAKE.s); }
    } else if (e.kind === 'contact') fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: SPARK[e.body] });
    if (hitsCrew(e)) startShake(fx, SHAKE_PX, SHAKE_S);
  }
}

/** Valkyrn spec §7.4: the gun's hits: a tick flash at the hit point; the shield pop when the hit stripped a layer (the
 *  event's `stripped`); `-1` when the hit took a hull point (the event's `hull`, Part ii review fix to Part i: exact, so two
 *  room hits in one frame float exactly their hull steps). The online view's gap events carry neither, so online only sparks. */
export function pushGunHits(fx: FxState, events: readonly ViewEvent[]): void {
  for (const e of events) {
    if (e.kind !== 'gunHit') continue;
    fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });
    if (e.room < 0 && e.stripped) fx.items.push({ kind: 'pop', age: 0, life: POP_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });
    if (e.hull) float(fx, '-1', e.x, e.y);
  }
}

/** W-1 (pew pew spec §1): the pew's hits: a hot spark at the hit point; the shield pop when it stripped a layer; `-1` when
 *  a crew round cost the enemy hull; a 1 px shake when a round hits the crew ship (the console maps; the interior shows
 *  only the hit's effect). The online view's gap events carry neither strip nor hull, so online only sparks. */
export function pushPewHits(fx: FxState, events: readonly ViewEvent[]): void {
  for (const e of events) {
    if (e.kind !== 'pewHit') continue;
    fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });
    if (e.stripped) fx.items.push({ kind: 'pop', age: 0, life: POP_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });
    if (e.hull && e.owner === CREW_SLOT) float(fx, '-1', e.x, e.y);
    if (e.ship === CREW_SLOT) startShake(fx, 1, 0.12);
  }
}

/** Feel-i: the enemy destroyed at (x, y) heading h (its drawn place): the explosion, the break-apart, the slow motion, a
 *  big shake and TARGET DESTROYED over it. Once per kill: a second call while one runs does nothing. */
export function pushKill(fx: FxState, x: number, y: number, h: number): void {
  if (fx.kill) return;
  fx.kill = { x, y, h, age: 0 }; fx.slowmo = KILL_SLOWMO_S;
  fx.items.push({ kind: 'boom', age: 0, life: BOOM_S, x1: x, y1: y, x2: x, y2: y, colour: CRT.hot });
  fx.callouts.push({ text: 'TARGET DESTROYED', colour: CRT.hot, kind: 'offline', age: 0, stack: 0 });
  startShake(fx, KILL_SHAKE.px, KILL_SHAKE.s);
}

/** Feel-i: whether the shot is lined up this frame; the bracket closes from the first frame it is. */
export function trackSolution(fx: FxState, lined: boolean, dt: number): void { fx.solutionAge = !lined ? -1 : fx.solutionAge < 0 ? 0 : fx.solutionAge + dt; }

/** The render dt the effects age by: slowed while the kill's slow motion runs (the sim never is). Counts the slow motion
 *  down by the real dt. */
export function fxDt(fx: FxState, dt: number): number {
  if (fx.slowmo <= 0) return dt;
  fx.slowmo = Math.max(0, fx.slowmo - dt);
  return dt * KILL_SLOWMO_RATE;
}

/** Age every effect (the callouts and flashes too) by dt and drop the finished ones; run the shake down. */
export function stepFx(fx: FxState, dt: number): void {
  stepHits(fx, dt);
  for (const it of fx.items) it.age += dt;
  for (let k = fx.items.length - 1; k >= 0; k--) if (fx.items[k]!.age >= fx.items[k]!.life) fx.items.splice(k, 1);
  if (fx.shake > 0) { fx.shake = Math.max(0, fx.shake - dt); fx.shakeT += dt; }
  for (const f of fx.floats) f.age += dt;
  for (let k = fx.floats.length - 1; k >= 0; k--) if (fx.floats[k]!.age >= FLOAT_S) fx.floats.splice(k, 1);
  fx.sinceShot += dt;
  if (fx.kill) fx.kill.age += dt;
}

/** The screen offset of the shake now: a decaying wobble, zero when none runs. `scale` is the Settings shake (Feel-i:
 *  off 0, low 0.5, full 1). */
export function shakeOffset(fx: FxState, scale = 1): Point {
  if (fx.shake <= 0 || scale <= 0) return { x: 0, y: 0 };
  const k = scale * fx.shakePx * (fx.shake / fx.shakeLife);
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
  return { x: p.x + (m.x - p.x) * a + (p.ox ?? 0), y: p.y + (m.y - p.y) * a + (p.oy ?? 0), h: p.h + dh * a + (p.oh ?? 0) };   // Net-4a §3.8: the offset after the blend
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
