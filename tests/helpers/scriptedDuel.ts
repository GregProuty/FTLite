// Headless duels for the H-0c-ii-a gates (spec §5) and the duel golden (§6): the scripted pair, or a passive crew with
// nobody at either console, against the hunter, with telemetry, up to a tick cap. Shared by tests/duelGates.test.ts,
// tests/duelGolden.test.ts, scripts/duel-telemetry.ts and scripts/bless-golden.ts. runRematch is the rematch golden's run
// (H-2 spec §7): two rounds in one duel, the second started by a rematch on the first's end card.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { LOCAL_DUEL_RUN } from '../../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../../src/renderer/src/sim/duel/step';
import { createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../../src/renderer/src/sim/duel/telemetry';
import { Outcome } from '../../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../../src/renderer/src/sim/tuning';

export const CUTTER = parseShip(cutter);
/** The gate's seeds and cap (parent §16, spec §5): 1 to 10, 15 minutes of ticks. */
export const GATE_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const CAP_TICKS = 15 * 60 * TICK_HZ;
/** No duel may end from a planet contact in under 30 s (parent §16). */
export const PLANET_END_MIN_TICKS = 30 * TICK_HZ;
/** The duel golden (spec §6): the scripted pair at seed 1, a hash every 600 ticks. */
export const DUEL_GOLDEN = 'tests/golden/duel-1.json';
export const DUEL_GOLDEN_SEED = 1;
export const DUEL_GOLDEN_EVERY = 600;

/** The rematch golden (H-2 spec §7): seed 1, the scripted pair, one rematch, round 2 to its outcome, a hash every 600 ticks. */
export const DUEL_REMATCH_GOLDEN = 'tests/golden/duel-rematch.json';

/** W-4 spec §2.1: the crew's pew and gun rounds (the gates read them; laserReleases is 0 on the Hound), and when and why the
 *  hold ended (the final hostileAt and the `hostile` event's cause; −1 and 'none' if never). */
export interface DuelRun { seed: number; telemetry: DuelTelemetry; finalHash: string; hashes: string[]; pewShots: number; gunShots: number; holdEndTick: number; holdCause: string }

/** Both players go away on tick 0, so neither console is attended for the whole duel. */
export function passiveInput(d: DuelState): DuelInput {
  if (d.interior.tick !== 0) return { held: [], commands: [] };
  return { held: [], commands: [0, 1].map((player) => ({ runId: 'duel', id: { player, sequence: 0 }, requestedTick: 0, command: { kind: 'presence' as const, present: false } })) };
}

/** Throws unless every scripted command of the tick was applied, so no golden pins a run whose script is rejected. */
export function requireApplied(seed: number, d: DuelState, input: DuelInput, results: ReturnType<typeof stepDuelTick>): void {
  for (const r of results) {
    if (r.status !== 'applied') {
      const env = input.commands.find((e) => e.id.player === r.id.player && e.id.sequence === r.id.sequence);
      throw Error(`seed ${seed} tick ${d.interior.tick}: scripted command ${JSON.stringify(env?.command)} (player ${r.id.player} #${r.id.sequence}) was ${r.status}${r.reason ? `: ${r.reason}` : ''}`);
    }
  }
}

/** Run one duel to its end or the cap. `hashEvery` > 0 records hashDuel after every that many ticks. */
export function runDuel(seed: number, crew: 'scripted' | 'passive', cap = CAP_TICKS, hashEvery = 0): DuelRun {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed), t = createTelemetry(d), hashes: string[] = [];
  try {
    let holdCause = 'none';
    while (d.tactical.outcome === Outcome.Running && d.interior.tick < cap) {
      const input = crew === 'scripted' ? scriptedInput(pair, d) : passiveInput(d);
      const results = stepDuelTick(d, input);
      if (crew === 'scripted') requireApplied(seed, d, input, results);
      recordTick(t, d, input);
      for (const e of d.tactical.events) if (e.kind === 'hostile') holdCause = e.cause;
      if (hashEvery > 0 && d.interior.tick % hashEvery === 0) hashes.push(hashDuel(d));
    }
    const crewSys = d.tactical.systems[0]!;   // not `crew`: that is the parameter, and a block const would shadow it in the loop above (TDZ)
    return { seed, telemetry: t, finalHash: hashDuel(d), hashes, pewShots: crewSys.pewShots, gunShots: crewSys.gunShots, holdEndTick: d.tactical.hostileAt, holdCause };
  } finally { disposeDuel(d); }
}

export const OUTCOME_NAMES = ['running', 'crew win', 'crew loss', 'draw'] as const;

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** One line per duel: the gate's columns first, then the rest of the telemetry. */
export function telemetryLine(r: DuelRun): string {
  const t = r.telemetry, [c, e] = t.ships, f = (n: number): string => (n / TICK_HZ).toFixed(1);
  const losses = (s: typeof c): string => Object.entries(s.missileLosses).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  return [
    `seed ${r.seed}: ${f(t.ticks)} s, ${OUTCOME_NAMES[t.outcome]}, terminal crew [${t.terminal[0].join(' ')}] enemy [${t.terminal[1].join(' ')}]${endedFromPlanet(t) ? ', PLANET END' : ''}`,
    `  crew  laser ${c.laserReleases} released, ${c.laserHits} hit (${c.layersStripped} stripped), ${c.laserMisses} missed; missiles ${c.missilesLaunched} launched, hits W/S/E ${c.missileHitsByRoom.join('/')}, lost ${losses(c)}; contacts planet ${c.planetContacts}, asteroid ${c.asteroidContacts}`,
    `  crew  pew ${r.pewShots} rounds, gun ${r.gunShots} rounds; hold ended at rt ${r.holdEndTick} (${r.holdCause})`,
    `  enemy laser ${e.laserReleases} released, ${e.laserHits} hit (${e.layersStripped} stripped), ${e.laserMisses} missed; missiles ${e.missilesLaunched} launched, hits W/S/E ${e.missileHitsByRoom.join('/')}, lost ${losses(e)}; contacts planet ${e.planetContacts}, asteroid ${e.asteroidContacts}; baits ${t.baits}`,
    `  repairs started/finished P0 ${t.players[0]!.repairsStarted}/${t.players[0]!.repairsFinished}, P1 ${t.players[1]!.repairsStarted}/${t.players[1]!.repairsFinished}; away walking/repairing P0 ${f(t.players[0]!.walkingTicks)}/${f(t.players[0]!.repairingTicks)} s, P1 ${f(t.players[1]!.walkingTicks)}/${f(t.players[1]!.repairingTicks)} s`,
    `  helm empty ${f(t.helmEmptyTicks)} s, weapons empty ${f(t.weaponsEmptyTicks)} s, enemy in arc ${f(t.enemyInArcTicks)} s, weapons idle ${f(t.weaponsIdleTicks)} s, console swaps ${t.consoleSwaps}`
  ].join('\n');
}

/** The gate summary over a set of scripted duels (spec §5). */
export function gateSummary(runs: readonly DuelRun[]): string {
  const ts = runs.map((r) => r.telemetry), wins = ts.filter((t) => t.outcome === Outcome.CrewWins).length, losses = ts.filter((t) => t.outcome === Outcome.EnemyWins).length;
  return [
    `median length ${(median(ts.map((t) => t.ticks)) / TICK_HZ).toFixed(1)} s (gate 180 to 300)`,
    `crew wins ${wins}, crew losses ${losses}, draws ${ts.filter((t) => t.outcome === Outcome.Draw).length}, at the cap ${ts.filter((t) => t.outcome === Outcome.Running).length} (gate: a win and a loss, none at the cap)`,
    `every duel with a crew pew or gun round and a missile launch: ${runs.every((r) => r.pewShots + r.gunShots > 0 && r.telemetry.ships[0].missilesLaunched > 0)}`,   // W-4 spec §14
    `planet-contact ends under 30 s: ${ts.filter((t) => endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS).length} (gate 0)`
  ].join('\n');
}

export interface RematchRun { seed: number; rematchTick: number; rounds: { seed: number; baseTick: number; outcome: number; ticks: number }[]; finalHash: string; hashes: string[] }
/** Round 1 with the scripted pair to its outcome, then on the first end-card tick player 0 sends `rematch`, then round 2
 *  with a fresh scripted pair for its seed to its outcome (each round capped at `cap` ticks). `hashEvery` > 0 records
 *  hashDuel whenever the encounter tick is a multiple of it. */
export function runRematch(seed: number, hashEvery: number, cap = CAP_TICKS): RematchRun {
  const d = createDuel(CUTTER, seed), hashes: string[] = [], rounds: RematchRun['rounds'] = [];
  const sample = (): void => { if (hashEvery > 0 && d.interior.tick % hashEvery === 0) hashes.push(hashDuel(d)); };
  const play = (): void => {
    const pair = createScriptedPair(d.tactical.seed), t = createTelemetry(d);
    while (d.tactical.outcome === Outcome.Running && d.interior.tick - d.baseTick < cap) {
      const input = scriptedInput(pair, d);
      requireApplied(seed, d, input, stepDuelTick(d, input));
      recordTick(t, d, input); sample();
    }
    rounds.push({ seed: d.tactical.seed, baseTick: d.baseTick, outcome: t.outcome, ticks: t.ticks });
  };
  try {
    play();
    const rematchTick = d.interior.tick;
    const [result] = stepDuelTick(d, { held: [], commands: [{ runId: LOCAL_DUEL_RUN, id: { player: 0, sequence: 1 }, requestedTick: rematchTick, command: { kind: 'rematch' } }] });
    if (result?.status !== 'applied' || d.round !== 1) throw Error(`seed ${seed}: the rematch on tick ${rematchTick} was ${result?.status}`);
    sample();
    play();
    return { seed, rematchTick, rounds, finalHash: hashDuel(d), hashes };
  } finally { disposeDuel(d); }
}
