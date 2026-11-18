// Spike ii §7 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): the rock feedback, view-owned and never hashed,
// driven by each tick's events: chips thrown back along a laser shot that met a rock, a burst sized by the rock and a
// ring of specks for a break, a puff for dust, a shockwave, core flash and heavy spray for a torpedo blast, a spark for a
// damaging rock-rock contact; the shakes for a blast and a break on screen; and their screen draws. On the CRT ramp only.
import type { Point } from './camera';
import { CRT } from './crtTheme';
import { BURST, BURST_S, FLARE_S, fxRandom, SPARK_S, startShake, type FxItem, type FxState, type ViewEvent } from './fxModel';
import type { EffectDraw } from './weaponsModel';

export const CHIP_S = 0.4, CHIP_TAIL_S = 0.04, SPECK_S = 0.6, PUFF_S = 0.5, SHOCK_S = 0.35, CORE_FLASH_S = 0.15, BLAST_SPECK_S = 0.7;
/** §7 item 6: a blast on screen shakes strongly, falling with distance from the crew ship (to 0 at `fade` u); a break lightly. */
export const BLAST_SHAKE = { px: 8, s: 0.35, fade: 1500 } as const, BREAK_SHAKE = { px: 2, s: 0.12 } as const;

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
      fx.items.push({ kind: 'flare', age: 0, life: FLARE_S, x1: e.x2, y1: e.y2, x2: e.x2, y2: e.y2, colour: CRT.hot });
      const back = Math.atan2(e.y1 - e.y2, e.x1 - e.x2);
      for (let n = between(fx, 5, 8); n > 0; n--) fling(fx, 'chip', CHIP_S, e.x2, e.y2, back, 0.6, 60, 160, 0, 0, CRT.hot);
      continue;
    }
    if (e.kind !== 'rock') continue;
    if (e.what === 'split' || e.what === 'dust') {   // §7 item 4 and §3.5
      fx.items.push({ kind: 'burst', age: 0, life: BURST_S * 2, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: BURST, size: e.r });
      if (e.what === 'split') for (let n = between(fx, 10, 16), j = 0; j < n; j++) fling(fx, 'speck', SPECK_S, e.x, e.y, (2 * Math.PI * j) / n, 0.25, 80, 200, e.vx, e.vy, CRT.main);
      else {
        const moving = Math.hypot(e.vx, e.vy) > 1, along = moving ? Math.atan2(e.vy, e.vx) : 0;
        for (let n = between(fx, 6, 9); n > 0; n--) fling(fx, 'speck', PUFF_S, e.x, e.y, along, moving ? 0.8 : Math.PI, 20, 90, e.vx, e.vy, CRT.mid);
      }
    } else if (e.what === 'blast') {   // §7 item 5
      fx.items.push({ kind: 'shock', age: 0, life: SHOCK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot, size: e.r },
        { kind: 'core', age: 0, life: CORE_FLASH_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot, size: e.r * 0.3 });
      for (let n = between(fx, 18, 24), j = 0; j < n; j++) fling(fx, 'speck', BLAST_SPECK_S, e.x, e.y, (2 * Math.PI * j) / n, 0.3, 150, 320, 0, 0, CRT.hot);
    } else if (e.what === 'bump' && e.by === 'collision') fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });   // §7 item 7
  }
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
 *  fading; the shockwave grows to its size with an ease-out, thinning; the core flash shrinks; a sized burst grows with its rock. */
export function rockEffectDraw(it: FxItem, toS: (x: number, y: number) => Point, z: number): EffectDraw | null {
  const k = Math.min(1, it.age / it.life), vx = it.vx ?? 0, vy = it.vy ?? 0, x = it.x1 + vx * it.age, y = it.y1 + vy * it.age, a = toS(x, y);
  const at = { x1: a.x, y1: a.y, x2: a.x, y2: a.y, colour: it.colour, alpha: 1 - k };
  if (it.kind === 'chip') { const b = toS(x - vx * CHIP_TAIL_S, y - vy * CHIP_TAIL_S); return { kind: 'chip', ...at, x2: b.x, y2: b.y, r: 0 }; }
  if (it.kind === 'speck') return { kind: 'speck', ...at, r: 1.5 };
  if (it.kind === 'shock') return { kind: 'shock', ...at, r: (it.size ?? 0) * z * (1 - (1 - k) * (1 - k)), width: 1 + 3 * (1 - k) };
  if (it.kind === 'core') return { kind: 'core', ...at, r: Math.max(4, (it.size ?? 0) * z) * (1 - 0.6 * k) };
  if (it.kind === 'burst' && it.size !== undefined) return { kind: 'burst', ...at, r: Math.max(6, it.size * z * (0.6 + 1.2 * k)) };
  return null;
}
