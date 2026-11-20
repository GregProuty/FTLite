// Spike ii §7 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): the rock feedback, view-owned and never hashed,
// driven by each tick's events: chips thrown back along a laser shot that met a rock, a burst sized by the rock and a
// ring of specks for a break, a puff for dust, a shockwave, core flash and heavy spray for a torpedo blast, a spark for a
// damaging rock-rock contact; asteroids-iii §5.6: shards, puffs, the touch spark, the hit-stop; the shakes for a blast and a break on screen; and their screen draws. On the CRT ramp only.
import type { Point } from './camera';
import { CRT } from './crtTheme';
import { BURST, BURST_S, FLARE_S, fxRandom, SPARK_S, startShake, type FxItem, type FxState, type ViewEvent } from './fxModel';
import type { EffectDraw } from './weaponsModel';

export const CHIP_S = 0.6, CHIP_TAIL_S = 0.04, SPECK_S = 0.6, PUFF_S = 0.5, SHOCK_S = 0.35, CORE_FLASH_S = 0.15, BLAST_SPECK_S = 0.7;
/** Feel fix: the rock fx's sizes in world units (they follow the zoom), and the screen-pixel floors that keep them
 *  readable at the map zoom 0.25: a chip's head radius and tail, a speck's radius, the core flash, the rock impact
 *  flare and the shockwave's stroke. */
/** The chip fan: the least and greatest angle off the reverse shot line, in radians. */
export const CHIP_FAN_MIN = 0.25, CHIP_FAN_MAX = 1.2;
export const CHIP_R_U = 2.5, SPECK_R_U = 2;
export const CHIP_MIN_PX = 2, CHIP_TAIL_MIN_PX = 6, SPECK_MIN_PX = 1.5, CORE_MIN_PX = 10, FLARE_MIN_PX = 8, SHOCK_WIDTH_MIN_PX = 2;
/** §7 item 6: a blast on screen shakes strongly, falling with distance from the crew ship (to 0 at `fade` u); a break lightly. */
export const BLAST_SHAKE = { px: 8, s: 0.35, fade: 1500 } as const, BREAK_SHAKE = { px: 2, s: 0.12 } as const;

/** Asteroids-iii §5.6: a burst split throws SHARD_COUNT shards at SHARD_SPEED u/s living SHARD_LIFE s, and holds the
 *  tactical drawing for HIT_STOP_S; a fan split or a dust puffs PUFF_COUNT; a touch sparks for TOUCH_SPARK_S. */
export const SHARD_COUNT = 16, SHARD_SPEED = [150, 250] as const, SHARD_LIFE = [1, 2] as const, PUFF_COUNT = 6, TOUCH_SPARK_S = 0.18, HIT_STOP_S = 0.08, HOLD_GAP_S = 0.25, FX_SOFT_CAP = 300;
/** §5.6: whether this frame holds the tactical drawing (hit-stop), spending `dt` of it. Effects and positions hold; after
 *  it the drawing snaps to the live state. The sim never pauses. */
export function holdFrame(fx: FxState, dt: number): boolean {
  if (fx.hold <= 0) { fx.holdGap = Math.max(0, fx.holdGap - dt); return false; }
  fx.hold = Math.max(0, fx.hold - dt);
  if (fx.hold === 0) fx.holdGap = HOLD_GAP_S;   // a chain of bursts gets at most one hold per HIT_STOP_S + HOLD_GAP_S
  return true;
}
/** Soft cap: above FX_SOFT_CAP items, the oldest specks (shards, puffs) go first. In place, no allocation. */
export function capFx(fx: FxState): void {
  const items = fx.items;
  let drop = items.length - FX_SOFT_CAP;
  if (drop <= 0) return;
  let w = 0;
  for (let i = 0; i < items.length; i++) { const it = items[i]!; if (drop > 0 && it.kind === 'speck') { drop--; continue; } items[w++] = it; }
  items.length = w;
}

/** An integer lo..hi from the view's random. */
const between = (fx: FxState, lo: number, hi: number): number => lo + Math.floor(fxRandom(fx) * (hi - lo + 1));
/** One flying particle from (x, y): its angle within ±spread of `angle`, its speed speed0..speed1, plus (bvx, bvy). */
function fling(fx: FxState, kind: 'chip' | 'speck', life: number, x: number, y: number, angle: number, spread: number, speed0: number, speed1: number, bvx: number, bvy: number, colour: number): void {
  const a = angle + (fxRandom(fx) * 2 - 1) * spread, sp = speed0 + fxRandom(fx) * (speed1 - speed0);
  fx.items.push({ kind, age: 0, life, x1: x, y1: y, x2: x, y2: y, vx: bvx + Math.cos(a) * sp, vy: bvy + Math.sin(a) * sp, colour });
}

/** Queue one tick's rock effects. */
export function pushRockFx(fx: FxState, events: readonly ViewEvent[]): void {
  for (const e of events) {
    if (e.kind === 'laser' && (e.rock ?? -1) >= 0) {   // §7 item 1: the flare and the chips, back along the shot
      fx.items.push({ kind: 'flare', age: 0, life: FLARE_S, x1: e.x2, y1: e.y2, x2: e.x2, y2: e.y2, colour: CRT.hot, size: 0 });   // sized: a rock's flare (rockEffectDraw floors it)
      const back = Math.atan2(e.y1 - e.y2, e.x1 - e.x2);
      // Feel fix: a wide fan, 0.25 to 1.2 rad off the reverse shot line on either side (none on the beam), fast enough to clear the rock
      for (let n = between(fx, 5, 8); n > 0; n--) fling(fx, 'chip', CHIP_S, e.x2, e.y2, back + (fxRandom(fx) < 0.5 ? -1 : 1) * (CHIP_FAN_MIN + fxRandom(fx) * (CHIP_FAN_MAX - CHIP_FAN_MIN)), 0, 160, 260, 0, 0, CRT.hot);
      continue;
    }
    if (e.kind !== 'rock') continue;
    if (e.what === 'split' || e.what === 'dust') {   // §7 item 4 and §3.5
      fx.items.push({ kind: 'burst', age: 0, life: BURST_S * 2, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: BURST, size: e.r });
      if (e.what === 'split' && e.burst) {
        for (let j = 0; j < SHARD_COUNT; j++) fling(fx, 'speck', SHARD_LIFE[0] + fxRandom(fx) * (SHARD_LIFE[1] - SHARD_LIFE[0]), e.x, e.y, (2 * Math.PI * j) / SHARD_COUNT, 0.2, SHARD_SPEED[0], SHARD_SPEED[1], e.vx, e.vy, CRT.main);
        if (fx.hold === 0 && fx.holdGap === 0) fx.hold = HIT_STOP_S;
      } else {
        const moving = Math.hypot(e.vx, e.vy) > 1, along = moving ? Math.atan2(e.vy, e.vx) : 0;
        for (let n = 0; n < PUFF_COUNT; n++) fling(fx, 'speck', PUFF_S, e.x, e.y, along, moving ? 0.8 : Math.PI, 20, 90, e.vx, e.vy, CRT.mid);
      }
    } else if (e.what === 'blast') {   // §7 item 5
      fx.items.push({ kind: 'shock', age: 0, life: SHOCK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot, size: e.r },
        { kind: 'core', age: 0, life: CORE_FLASH_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot, size: e.r * 0.3 });
      for (let n = between(fx, 18, 24), j = 0; j < n; j++) fling(fx, 'speck', BLAST_SPECK_S, e.x, e.y, (2 * Math.PI * j) / n, 0.3, 150, 320, 0, 0, CRT.hot);
    } else if ((e.what === 'bump' && e.by === 'collision') || (e.what === 'hit' && e.by === 'gun')) fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });   // §7 item 7; W-4 spec §5.1: an autocannon round's hit
    else if (e.what === 'touch') fx.items.push({ kind: 'spark', age: 0, life: TOUCH_SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.mid });   // §5.6: a slow billiard's cue
  }
  capFx(fx);
}

/** §7 item 6: the shakes for this tick's rock events on screen; startShake keeps the strongest running one. */
export function pushRockShakes(fx: FxState, events: readonly ViewEvent[], crew: Point, onScreen: (x: number, y: number) => boolean): void {
  for (const e of events) {
    if (e.kind !== 'rock' || !onScreen(e.x, e.y)) continue;
    if (e.what === 'blast') {
      const px = BLAST_SHAKE.px * Math.max(0, 1 - Math.hypot(e.x - crew.x, e.y - crew.y) / BLAST_SHAKE.fade);
      if (px >= 0.5) startShake(fx, px, BLAST_SHAKE.s);
    } else if (e.what === 'split' || (e.what === 'dust' && e.rock >= 0 && !e.evicted && e.by !== 'planet' && e.by !== 'edge')) startShake(fx, BREAK_SHAKE.px, BREAK_SHAKE.s);
  }
}

/** The screen draw of a rock effect at its age, or null for the other kinds: chips and specks at their world velocity,
 *  fading; the shockwave grows to its size with an ease-out, thinning; the core flash shrinks; a sized burst grows with its
 *  rock; a sized flare is a rock's impact flare. Feel fix: each keeps its screen-pixel floor (above) at the map zoom and
 *  follows its world size once zoomed in past it. */
export function rockEffectDraw(it: FxItem, toS: (x: number, y: number) => Point, z: number): EffectDraw | null {
  const k = Math.min(1, it.age / it.life), vx = it.vx ?? 0, vy = it.vy ?? 0, x = it.x1 + vx * it.age, y = it.y1 + vy * it.age, a = toS(x, y);
  const at = { x1: a.x, y1: a.y, x2: a.x, y2: a.y, colour: it.colour, alpha: 1 - k };
  if (it.kind === 'chip') {   // the head at the chip, the tail back along its flight, at least CHIP_TAIL_MIN_PX long
    const b = toS(x - vx * CHIP_TAIL_S, y - vy * CHIP_TAIL_S), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const s = len > 0 ? Math.max(len, CHIP_TAIL_MIN_PX) / len : 0;
    return { kind: 'chip', ...at, x2: a.x + dx * s, y2: a.y + dy * s, r: Math.max(CHIP_MIN_PX, CHIP_R_U * z) };
  }
  if (it.kind === 'speck') return { kind: 'speck', ...at, r: Math.max(SPECK_MIN_PX, SPECK_R_U * z) };
  if (it.kind === 'shock') return { kind: 'shock', ...at, r: (it.size ?? 0) * z * (1 - (1 - k) * (1 - k)), width: Math.max(SHOCK_WIDTH_MIN_PX, 1 + 3 * (1 - k)) };
  if (it.kind === 'core') return { kind: 'core', ...at, r: Math.max(CORE_MIN_PX, (it.size ?? 0) * z * (1 - 0.6 * k)) };
  if (it.kind === 'burst' && it.size !== undefined) return { kind: 'burst', ...at, r: Math.max(6, it.size * z * (0.6 + 1.2 * k)) };
  if (it.kind === 'flare' && it.size !== undefined) return { kind: 'flare', ...at, r: Math.max(FLARE_MIN_PX, 5 + 22 * k) };
  return null;
}
