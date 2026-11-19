// Headless Valkyrn duels for the Valkyrn gate (Valkyrn spec §10, tests/duelGates.test.ts) and its tuning tool
// (scripts/valkyrn-telemetry.ts): the scripted pilot (crew of one) against the hunter, with telemetry, up to the cap.
import valkyrn from '../../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { createScriptedPilot, scriptedPilotInput } from '../../src/renderer/src/sim/duel/scriptedPilot';
import { createDuel, disposeDuel } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../../src/renderer/src/sim/duel/step';
import { createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../../src/renderer/src/sim/duel/telemetry';
import { classOf, Outcome } from '../../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../../src/renderer/src/sim/tuning';
import { CAP_TICKS, median, OUTCOME_NAMES, PLANET_END_MIN_TICKS, requireApplied } from './scriptedDuel';

export const VALKYRN = parseShip(valkyrn);
/** The gate (spec §10): the median round in seconds, and the Hunter's minimum wins over the ten seeds. */
export const VALKYRN_MEDIAN_MIN_S = 180;
export const VALKYRN_MEDIAN_MAX_S = 300;
export const VALKYRN_HUNTER_WINS_MIN = 1;

export interface ValkyrnRun {
  seed: number; telemetry: DuelTelemetry; finalHash: string;
  /** The crew ship's gun counters (ShipSystems, spec §7.3) at the end. */
  gunShots: number; gunHits: number;
  /** Hull left and the class's hull: crew, enemy. */
  hull: [number, number]; hullMax: [number, number];
}

/** One crew-of-one duel to its end or the cap; every pilot command must be applied. */
export function runValkyrnDuel(seed: number, cap = CAP_TICKS): ValkyrnRun {
  const d = createDuel(VALKYRN, seed, 0, 1), pilot = createScriptedPilot(), t = createTelemetry(d);
  try {
    while (d.tactical.outcome === Outcome.Running && d.interior.tick < cap) {
      const input = scriptedPilotInput(pilot, d);
      requireApplied(seed, d, input, stepDuelTick(d, input));
      recordTick(t, d, input);
    }
    const sys = d.tactical.systems;
    return {
      seed, telemetry: t, finalHash: hashDuel(d), gunShots: sys[0]!.gunShots, gunHits: sys[0]!.gunHits,
      hull: [sys[0]!.hull, sys[1]!.hull], hullMax: [classOf(d.tactical, 0).hull, classOf(d.tactical, 1).hull]
    };
  } finally { disposeDuel(d); }
}

/** One line per Valkyrn duel (two lines of text). */
export function valkyrnLine(r: ValkyrnRun): string {
  const t = r.telemetry, [c, e] = t.ships, p = t.players[0]!, f = (n: number): string => (n / TICK_HZ).toFixed(1);
  const rate = r.gunShots > 0 ? ((100 * r.gunHits) / r.gunShots).toFixed(1) : '0.0';
  return [
    `seed ${r.seed}: ${f(t.ticks)} s, ${OUTCOME_NAMES[t.outcome]}, hull crew ${r.hull[0]}/${r.hullMax[0]} enemy ${r.hull[1]}/${r.hullMax[1]}, terminal crew [${t.terminal[0].join(' ')}] enemy [${t.terminal[1].join(' ')}]${endedFromPlanet(t) ? ', PLANET END' : ''}`,
    `  gun ${r.gunShots} shots, ${r.gunHits} hits (${rate}%); missiles ${c.missilesLaunched} launched, hits W/S/E ${c.missileHitsByRoom.join('/')}; enemy laser ${e.laserReleases} released, ${e.laserHits} hit, missiles ${e.missilesLaunched}; repairs ${p.repairsStarted}/${p.repairsFinished}, away walking/repairing ${f(p.walkingTicks)}/${f(p.repairingTicks)} s; contacts planet ${c.planetContacts}, asteroid ${c.asteroidContacts}`
  ].join('\n');
}

/** The Valkyrn gate over a set of runs (spec §10), with the reasons it fails, if any. */
export function valkyrnGate(runs: readonly ValkyrnRun[]): { pass: boolean; reasons: string[]; summary: string; medianS: number; crewWins: number; hunterWins: number } {
  const ts = runs.map((r) => r.telemetry), medianS = median(ts.map((t) => t.ticks)) / TICK_HZ;
  const crewWins = ts.filter((t) => t.outcome === Outcome.CrewWins).length, hunterWins = ts.filter((t) => t.outcome === Outcome.EnemyWins).length;
  const draws = ts.filter((t) => t.outcome === Outcome.Draw).length, atCap = ts.filter((t) => t.outcome === Outcome.Running).length;
  const shots = runs.reduce((n, r) => n + r.gunShots, 0), hits = runs.reduce((n, r) => n + r.gunHits, 0);
  const reasons: string[] = [];
  if (medianS < VALKYRN_MEDIAN_MIN_S) reasons.push(`median ${medianS.toFixed(1)} s < ${VALKYRN_MEDIAN_MIN_S}`);
  if (medianS > VALKYRN_MEDIAN_MAX_S) reasons.push(`median ${medianS.toFixed(1)} s > ${VALKYRN_MEDIAN_MAX_S}`);
  if (hunterWins < VALKYRN_HUNTER_WINS_MIN) reasons.push(`hunter wins ${hunterWins} < ${VALKYRN_HUNTER_WINS_MIN}`);
  if (atCap > 0) reasons.push(`${atCap} at the cap`);
  for (const r of runs) {
    if (r.gunShots < 1) reasons.push(`seed ${r.seed} no gun`);
    if (r.telemetry.ships[0].missilesLaunched < 1) reasons.push(`seed ${r.seed} no torpedo`);
    if (endedFromPlanet(r.telemetry) && r.telemetry.ticks < PLANET_END_MIN_TICKS) reasons.push(`seed ${r.seed} planet end < 30 s`);
  }
  const summary = [
    `valkyrn median length ${medianS.toFixed(1)} s (gate ${VALKYRN_MEDIAN_MIN_S} to ${VALKYRN_MEDIAN_MAX_S})`,
    `crew wins ${crewWins}, hunter wins ${hunterWins} (gate ≥ ${VALKYRN_HUNTER_WINS_MIN}), draws ${draws}, at the cap ${atCap} (gate 0)`,
    `gun ${shots} shots, ${hits} hits (${shots > 0 ? ((100 * hits) / shots).toFixed(1) : '0.0'}%) over ${runs.length} duels; cap ${(CAP_TICKS / TICK_HZ).toFixed(0)} s`
  ].join('\n');
  return { pass: reasons.length === 0, reasons, summary, medianS, crewWins, hunterWins };
}
