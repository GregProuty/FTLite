import type { SimState } from '../sim/state';
import { EndReason } from '../sim/crew';

/** Spec Demo-ii section 5: the eight cues, in the order `audioCues` emits them; plus the callout, played by the session on a press (spec Coop-i section 3), never by the detector. */
export type Cue = 'alarm' | 'impact' | 'shot' | 'hit' | 'ready' | 'jump' | 'upgrade' | 'victory' | 'defeat' | 'callout';   // upgrade: a level or reactor bar bought (spec Loop-ii section 2)

/** The run counters the detector compares across a frame (all read from the state, no sim change). */
export interface CueCounters { spawns: number; boardings: number; encounters: number; impacts: number; shots: number; hits: number; shieldHits: number; jumps: number; ended: number; endReason: number; jumpReady: number; upgrades: number }   // upgrades: levels plus reactor bars bought

export function cueCounters(state: SimState): CueCounters {
  const t = state.telemetry;
  let spawns = 0; for (let i = 0; i < t.spawns.length; i++) spawns += t.spawns[i]!;
  let upgrades = state.run.reactorBonus; for (const v of state.run.upgrades) upgrades += v;
  return { spawns, boardings: t.boardings, encounters: t.encounters, impacts: t.impacts, shots: t.shots, hits: t.hits, shieldHits: t.shieldHits, jumps: t.jumps, ended: state.ended ? 1 : 0, endReason: state.endReason, jumpReady: state.run.jumpCharge >= 1 ? 1 : 0, upgrades };
}

/** Pure edge detector: at most one of each cue per call, in the fixed order. */
export function audioCues(prev: CueCounters, next: CueCounters): Cue[] {
  const out: Cue[] = [];
  if (next.spawns > prev.spawns || next.boardings > prev.boardings || next.encounters > prev.encounters) out.push('alarm');
  if (next.impacts > prev.impacts) out.push('impact');
  if (next.shots > prev.shots) out.push('shot');
  if (next.hits > prev.hits || next.shieldHits > prev.shieldHits) out.push('hit');
  if (prev.jumpReady === 0 && next.jumpReady === 1) out.push('ready');
  if (next.jumps > prev.jumps) out.push('jump');
  if (next.upgrades > prev.upgrades) out.push('upgrade');
  if (prev.ended === 0 && next.ended === 1) out.push(next.endReason === EndReason.Victory ? 'victory' : 'defeat');
  return out;
}
