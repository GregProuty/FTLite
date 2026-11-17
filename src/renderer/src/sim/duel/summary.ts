// The duel's end summary (engine refactor spec §6, widened by H-2 spec §8 to the Helm §13 list): a plain, frozen value
// computed once when a round is decided, from the telemetry accumulator. Per-ship pairs are [crew ship, enemy ship];
// per-player pairs are [player 0, player 1]. `terminal` keeps the accumulator's per-ship cause arrays as they are (one
// tick can kill a ship several ways), each in TERMINAL_CAUSES order without duplicates, and empty for a ship that
// survived. The round record (H-2 spec §7) is the summary plus the round, its seed and its first tick.
import type { DuelTelemetry, MissileLoss, TerminalCause } from './telemetry';

/** The accumulator's order of terminal causes (telemetry.ts recordTick). */
export const TERMINAL_CAUSES = ['planet', 'asteroid', 'ship', 'laser', 'missile'] as const satisfies readonly TerminalCause[];
/** The accumulator's missile loss causes, in its order. */
export const MISSILE_LOSSES = ['planet', 'asteroid', 'edge', 'expired', 'own', 'missile'] as const satisfies readonly MissileLoss[];
type Pair = readonly [number, number];
export interface DuelEndSummary {
  readonly outcome: number; readonly ticks: number;
  readonly terminal: readonly [readonly TerminalCause[], readonly TerminalCause[]];
  readonly laserReleases: Pair; readonly laserHits: Pair; readonly missilesLaunched: Pair; readonly missileHits: Pair;
  readonly repairsFinished: Pair;
  readonly laserMisses: Pair; readonly layersStripped: Pair;
  readonly missileLosses: readonly [Readonly<Record<MissileLoss, number>>, Readonly<Record<MissileLoss, number>>];
  readonly planetContacts: Pair; readonly asteroidContacts: Pair;
  readonly baits: number; readonly consoleSwaps: number;
  readonly helmEmptyTicks: number; readonly weaponsEmptyTicks: number; readonly enemyInArcTicks: number; readonly weaponsIdleTicks: number;
  readonly repairsStarted: Pair; readonly walkingTicks: Pair; readonly repairingTicks: Pair;
}
/** One decided round (H-2 spec §7): its summary, its index from 0, its seed and the encounter tick it began on. */
export type DuelRoundRecord = DuelEndSummary & { readonly round: number; readonly seed: number; readonly baseTick: number };

const pair = (f: (i: 0 | 1) => number): readonly [number, number] => Object.freeze([f(0), f(1)] as [number, number]);
const losses = (l: Record<MissileLoss, number>): Readonly<Record<MissileLoss, number>> =>
  Object.freeze(Object.fromEntries(MISSILE_LOSSES.map((k) => [k, l[k]])) as Record<MissileLoss, number>);
export function duelEndSummary(t: DuelTelemetry): DuelEndSummary {
  const ship = (i: 0 | 1) => t.ships[i], player = (i: 0 | 1) => t.players[i];
  return Object.freeze({
    outcome: t.outcome, ticks: t.ticks,
    terminal: Object.freeze([Object.freeze([...t.terminal[0]]), Object.freeze([...t.terminal[1]])] as [TerminalCause[], TerminalCause[]]),
    laserReleases: pair((i) => ship(i).laserReleases), laserHits: pair((i) => ship(i).laserHits),
    missilesLaunched: pair((i) => ship(i).missilesLaunched),
    missileHits: pair((i) => ship(i).missileHitsByRoom[0] + ship(i).missileHitsByRoom[1] + ship(i).missileHitsByRoom[2]),
    repairsFinished: pair((i) => player(i).repairsFinished),
    laserMisses: pair((i) => ship(i).laserMisses), layersStripped: pair((i) => ship(i).layersStripped),
    missileLosses: Object.freeze([losses(ship(0).missileLosses), losses(ship(1).missileLosses)] as const),
    planetContacts: pair((i) => ship(i).planetContacts), asteroidContacts: pair((i) => ship(i).asteroidContacts),
    baits: t.baits, consoleSwaps: t.consoleSwaps,
    helmEmptyTicks: t.helmEmptyTicks, weaponsEmptyTicks: t.weaponsEmptyTicks, enemyInArcTicks: t.enemyInArcTicks, weaponsIdleTicks: t.weaponsIdleTicks,
    repairsStarted: pair((i) => player(i).repairsStarted), walkingTicks: pair((i) => player(i).walkingTicks), repairingTicks: pair((i) => player(i).repairingTicks)
  });
}
/** The round record: the summary, then the round, its seed and its base tick, frozen. */
export function duelRoundRecord(summary: DuelEndSummary, round: number, seed: number, baseTick: number): DuelRoundRecord {
  return Object.freeze({ ...summary, round, seed, baseTick });
}
