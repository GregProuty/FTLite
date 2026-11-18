// Duel polish i spec §D: healing and revive feedback in the ship view. While a character heals in the Medbay, green `+`
// motes rise from it; on a pick-up, `REVIVED` floats up over the character with an expanding green ring. A pure model of
// what to spawn and how each piece looks this frame (the interior view draws it); the motes' x jitter comes from the
// caller's view-side Random, never the sim's generator. `crewLife` reads the characters for this model and the duel audio.
import { TILE_PX } from '../../../../shared/resolution';
import { Health, Life, LifeState } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import { healing } from '../../sim/duel/health';
import { HIT_FRESH_TICKS } from '../impactModel';
import type { Random } from '../particles/random';

/** Each character's health, downed state and whether it heals this tick, in player order. */
export interface CrewLifeState { health: number[]; downed: boolean[]; healing: boolean[] }
export function crewLife(d: DuelState): CrewLifeState {
  const crew = d.interior.crew;
  return {
    health: crew.map((eid) => Health.cur[eid]!),
    downed: crew.map((eid) => Life.state[eid] === LifeState.Downed),
    healing: crew.map((_, pid) => healing(d, pid))
  };
}

/** Motes: MOTE_RATE a second per healing character, each rising MOTE_RISE px and fading over MOTE_S seconds, from an x
 *  within MOTE_SPREAD of the character's tile centre. */
export const MOTE_RATE = 3, MOTE_RISE = 16, MOTE_S = 0.8, MOTE_SPREAD = TILE_PX * 0.4;
/** The revive: the label floats up REVIVED_RISE px over REVIVED_S; the ring grows from RING_FROM to RING_TO tiles (radius)
 *  and fades over RING_S. */
export const REVIVED_S = 1.5, REVIVED_RISE = 24, RING_S = 0.5, RING_FROM = 0.4, RING_TO = 1.2;
/** A long frame spawns at most this many motes per character (no burst after a stall). */
const MAX_SPAWN = 3;

export interface HealFxView { tick: number; round: number; downed: readonly boolean[]; healing: readonly boolean[]; pos: readonly { x: number; y: number }[] }
interface Piece { pid: number; x: number; y: number; age: number }
export interface HealFx { watch: { tick: number; round: number; downed: boolean[] } | null; timers: number[]; motes: Piece[]; revives: Piece[] }
export function createHealFx(): HealFx { return { watch: null, timers: [], motes: [], revives: [] }; }

/**
 * One frame: age every piece by `dt` (0 while paused: everything holds and nothing spawns) and drop the finished ones; each
 * healing character's mote timer runs down and spawns a mote at 0 (at once when the healing starts); a character going
 * from downed to up spawns its revive (replacing any of its own still showing). The revive diff re-baselines silently on
 * no baseline, a new round, a tick backwards or a stale jump, as the audio diffs do.
 */
export function stepHealFx(fx: HealFx, v: HealFxView, dt: number, random: Random): void {
  const step = Math.max(0, dt);
  for (const m of fx.motes) m.age += step;
  for (const r of fx.revives) r.age += step;
  fx.motes = fx.motes.filter((m) => m.age < MOTE_S);
  fx.revives = fx.revives.filter((r) => r.age < REVIVED_S);
  v.healing.forEach((on, pid) => {
    const p = v.pos[pid];
    if (!on || !p) { fx.timers[pid] = 0; return; }
    if (step <= 0) return;
    let t = (fx.timers[pid] ?? 0) - step, n = 0;
    while (t <= 0 && n < MAX_SPAWN) { fx.motes.push({ pid, x: p.x + (random.next() * 2 - 1) * MOTE_SPREAD, y: p.y, age: 0 }); t += 1 / MOTE_RATE; n++; }
    fx.timers[pid] = Math.max(t, 0);
  });
  const w = fx.watch;
  if (w && w.round === v.round && v.tick >= w.tick && v.tick - w.tick <= HIT_FRESH_TICKS && w.downed.length === v.downed.length) {
    v.downed.forEach((down, pid) => {
      const p = v.pos[pid];
      if (down || !w.downed[pid] || !p) return;
      fx.revives = fx.revives.filter((r) => r.pid !== pid);
      fx.revives.push({ pid, x: p.x, y: p.y, age: 0 });
    });
  }
  fx.watch = { tick: v.tick, round: v.round, downed: [...v.downed] };
}

export interface HealFxDraw {
  motes: { x: number; y: number; alpha: number }[];
  rings: { x: number; y: number; r: number; alpha: number }[];
  labels: { pid: number; x: number; y: number; alpha: number }[];
}
/** How each piece looks now: a mote rises and fades linearly; a ring grows and fades over RING_S; a label rises over
 *  REVIVED_S, fading out over its last third. Positions in world px (the label's y is its anchor, above the character). */
export function healFxDraw(fx: HealFx): HealFxDraw {
  const out: HealFxDraw = { motes: [], rings: [], labels: [] };
  for (const m of fx.motes) { const p = m.age / MOTE_S; out.motes.push({ x: m.x, y: m.y - TILE_PX * 0.2 - MOTE_RISE * p, alpha: 1 - p }); }
  for (const r of fx.revives) {
    if (r.age < RING_S) { const p = r.age / RING_S; out.rings.push({ x: r.x, y: r.y, r: (RING_FROM + (RING_TO - RING_FROM) * p) * TILE_PX, alpha: 1 - p }); }
    const p = r.age / REVIVED_S;
    out.labels.push({ pid: r.pid, x: r.x, y: r.y - TILE_PX - REVIVED_RISE * p, alpha: Math.min(1, (1 - p) * 3) });
  }
  return out;
}
