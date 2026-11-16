// The duel's end summary (engine refactor spec §6): a plain, frozen value computed once when the duel ends, from the
// telemetry accumulator. Per-ship pairs are [crew ship, enemy ship]; repairsFinished is per player. `terminal` keeps the
// accumulator's per-ship cause arrays as they are (one tick can kill a ship several ways), each in TERMINAL_CAUSES
// order without duplicates, and empty for a ship that survived.
import type { DuelTelemetry, TerminalCause } from './telemetry';

/** The accumulator's order of terminal causes (telemetry.ts recordTick). */
export const TERMINAL_CAUSES = ['planet', 'asteroid', 'ship', 'laser', 'missile'] as const satisfies readonly TerminalCause[];
type Pair = readonly [number, number];
export interface DuelEndSummary {
  readonly outcome: number; readonly ticks: number;
  readonly terminal: readonly [readonly TerminalCause[], readonly TerminalCause[]];
  readonly laserReleases: Pair; readonly laserHits: Pair; readonly missilesLaunched: Pair; readonly missileHits: Pair;
  readonly repairsFinished: Pair;
}

const pair = (f: (i: 0 | 1) => number): readonly [number, number] => Object.freeze([f(0), f(1)] as [number, number]);
export function duelEndSummary(t: DuelTelemetry): DuelEndSummary {
  const ship = (i: 0 | 1) => t.ships[i];
  return Object.freeze({
    outcome: t.outcome, ticks: t.ticks,
    terminal: Object.freeze([Object.freeze([...t.terminal[0]]), Object.freeze([...t.terminal[1]])] as [TerminalCause[], TerminalCause[]]),
    laserReleases: pair((i) => ship(i).laserReleases), laserHits: pair((i) => ship(i).laserHits),
    missilesLaunched: pair((i) => ship(i).missilesLaunched),
    missileHits: pair((i) => ship(i).missileHitsByRoom[0] + ship(i).missileHitsByRoom[1] + ship(i).missileHitsByRoom[2]),
    repairsFinished: pair((i) => t.players[i].repairsFinished)
  });
}
