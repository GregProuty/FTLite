import type { SimState } from '../sim/state';
import { Life, LifeState, Position, Seated } from '../sim/components';
import { interactTarget, TargetKind } from '../sim/interact';
import { STATION_NAMES } from '../sim/stationKinds';
import { baseMax } from '../sim/power';
import { TICK_HZ } from '../sim/tuning';
import { TILE_PX } from '../../../shared/resolution';

/** Callouts (spec Coop-i section 3): presentation only. They live in the app and render layers and never enter Intent, replays or snapshots. */
export const CALLOUT_SECONDS = 3;

export interface CalloutText { text: string; icon: string | null; flash: number | null }
/** One press: who, the sim tick it was made on, and what it said then (the text is fixed at the press). */
export interface Callout extends CalloutText { pid: number; tick: number }
export interface Bubble { pid: number; text: string; icon: string | null }

const OVER_HERE: CalloutText = { text: 'Over here!', icon: null, flash: null };

/** What a press says for this player right now: downed, seated below full power, beside a fire, breach or failed station, else Over here!. */
export function calloutFor(state: SimState, pid: number): CalloutText {
  const eid = state.crew[pid]!;
  if (Life.state[eid] === LifeState.Downed) return { text: 'Help!', icon: 'icon.medical', flash: null };
  const seat = Seated.station[eid]!;
  if (seat >= 0) {
    const kind = state.derived.stationKind[seat]!;
    return state.stations.level[seat]! < baseMax(state, kind) ? { text: `Power to ${STATION_NAMES[kind]}!`, icon: 'icon.power', flash: kind } : OVER_HERE;
  }
  const t = interactTarget(state, pid);
  if (t.kind === TargetKind.Fire) return { text: 'Fire here!', icon: 'icon.fire', flash: null };
  if (t.kind === TargetKind.Breach) return { text: 'Breach here!', icon: 'icon.breach', flash: null };
  if (t.kind === TargetKind.Power) return { text: 'Repair here!', icon: 'icon.repair', flash: null };
  return OVER_HERE;
}

const live = (c: Callout, nowTick: number): boolean => nowTick >= c.tick && nowTick - c.tick < CALLOUT_SECONDS * TICK_HZ;

/** Record this frame's presses: each pressing player (present in the run) replaces its own entry; expired entries are dropped. */
export function pressCallouts(prev: readonly Callout[], state: SimState, pressed: readonly number[]): Callout[] {
  const fresh = pressed.filter((pid, k) => pid >= 0 && pid < state.playerCount && pressed.indexOf(pid) === k && Life.state[state.crew[pid]!] !== LifeState.Dead);
  const kept = prev.filter((c) => live(c, state.tick) && !fresh.includes(c.pid));
  return [...kept, ...fresh.map((pid) => ({ pid, tick: state.tick, ...calloutFor(state, pid) }))].sort((a, b) => a.pid - b.pid);
}

/** The bubbles to draw at nowTick, one per player by pid: a downed player always shows Help! (no press needed); the dead show nothing. */
export function bubbles(state: SimState, callouts: readonly Callout[], nowTick: number): Bubble[] {
  const out: Bubble[] = [];
  for (let pid = 0; pid < state.playerCount; pid++) {
    const life = Life.state[state.crew[pid]!]!;
    if (life === LifeState.Dead) continue;
    if (life === LifeState.Downed) { out.push({ pid, text: 'Help!', icon: 'icon.medical' }); continue; }
    const c = callouts.find((x) => x.pid === pid && live(x, nowTick));
    if (c) out.push({ pid, text: c.text, icon: c.icon });
  }
  return out;
}

/** Station kinds whose Engineering row flashes at nowTick (a live Power to ... callout), ascending, no repeats. */
export function flashingKinds(callouts: readonly Callout[], nowTick: number): number[] {
  const kinds = new Set<number>();
  for (const c of callouts) if (c.flash !== null && live(c, nowTick)) kinds.add(c.flash);
  return [...kinds].sort((a, b) => a - b);
}

/** Where a player's bubble sits in internal pixels: centred above the crew member's head, given the world fit. */
export function bubbleAnchor(state: SimState, pid: number, fit: { scale: number; x: number; y: number }): { x: number; y: number } {
  const eid = state.crew[pid]!;
  return { x: fit.x + Position.x[eid]! * TILE_PX * fit.scale, y: fit.y + (Position.y[eid]! - 0.6) * TILE_PX * fit.scale };
}
