// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §8.3): the quiet scene for the idle-belt and
// after-burst gates. No player acts: the crew Hound flies a circular orbit at IDLE_ORBIT_R (2780: belt and cluster rocks
// stay inside 2700 where the map placed them, and a tumbling cluster rock's sweep reaches at most about 2755, so the ship
// (radius 20) never touches one), and the Hunter is pinned antipodal to it after
// every tick with its weapons emptied (the duel snapshot needs both slots active and locked on each other). `bursts`
// (seconds) break the largest live kind-1 belt rock with a torpedo-style burst at those times (script-side, between
// ticks). Reported per run: the 20 Hz delta image sizes in each window, how many slots ever left kind 1, and the kind-2
// count each second. Only APIs that exist on master (SIM 60) and on spike/asteroids-iii are used and kinds are compared
// as numbers (1 Static/Rail, 2 Moving/Free), so this one file measured master's baseline (Task 1) and measures the branch.
//   npx tsx scripts/spike-asteroids-iii-idle.ts [--json <path>]
// The duel helpers read the bundler-defined __GAMEPLAY_CONTENT_DIGEST__; tsx defines nothing, so it is supplied here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../src/renderer/src/sim/duel/step';
import { circularSpeed } from '../src/renderer/src/sim/tactical/map';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { beginRockTick, rockAt, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { SIM_VERSION, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { duelPublicationToImage, type DuelPublication } from '../src/network/modes/duelStream';
import { encodeDelta, type StateImage } from '../src/network/state/imageCodec';
import { hashF64 } from '../src/shared/hash';

export const IDLE_ORBIT_R = 2780;
export const IDLE_SEEDS = [1, 2, 3] as const;
export const IDLE_WINDOWS: readonly (readonly [number, number])[] = [[60, 61], [300, 301], [600, 601]];
export const BURST_TIMES = [10, 20, 30] as const;
export const BURST_WINDOW = [10, 270] as const;
export interface QuietRun { seed: number; seconds: number; bursts: number[]; outcome: number; ticks: number; leftKind1: number; freeEachSecond: number[]; deltas: number[][] }

(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());
const contentDigest = computeContentDigest(process.cwd()), layout = DUEL_LAYOUT;
const options = { resolveLayout: (id: string) => { if (id !== layout.id) throw Error('unknown layout'); return layout; }, contentDigest };
const IDLE: DuelInput = { held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }], commands: [] };

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function publication(d: DuelState, sequence: number): DuelPublication {
  const snapshot = saveDuelSnapshot(d, contentDigest);
  return { runId: 'quiet', tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)), phase: 'running',
    pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 };
}
/** The Hunter antipodal to the crew with its weapons empty: it neither fires nor meets a rock. */
function pinHunter(d: DuelState): void {
  const c = d.tactical.ships[0]!, h = d.tactical.ships[1]!, hs = d.tactical.systems[1]!;
  Object.assign(h, { x: -c.x, y: -c.y, vx: -c.vx, vy: -c.vy, heading: (c.heading + 128) % 256, headingAcc: 0 });
  hs.laserCharge = 0; hs.magazine = 0; hs.pewCharge = 0; hs.gunHeat = 0;
}
/** The largest live kind-1 rock among the belt's slots (−1 when none). */
function biggestBeltRail(d: DuelState): number {
  const t = d.tactical; let best = -1;
  for (let k = 0; k < t.map.beltCount; k++) {
    const b = k * ROCK_STRIDE;
    if (t.rocks[b] === 1 && (best < 0 || t.rocks[b + 5]! > t.rocks[best * ROCK_STRIDE + 5]!)) best = k;
  }
  return best;
}

/** One quiet run of `seconds`: deltas (bytes) per window [from, to) seconds at 20 Hz, kind-1 departures, kind-2 counts. */
export function quietRun(seed: number, seconds: number, windows: readonly (readonly [number, number])[], bursts: readonly number[] = []): QuietRun {
  const d = createDuel(layout, seed), t = d.tactical, v = circularSpeed(IDLE_ORBIT_R), ticks = Math.round(seconds * TICK_HZ);
  try {
    Object.assign(t.ships[0], { x: 0, y: -IDLE_ORBIT_R, vx: v, vy: 0, heading: 64, headingAcc: 0 });   // clockwise (y down), as spawnAt
    pinHunter(d);
    const deltas = windows.map(() => [] as number[]), freeEachSecond: number[] = [];
    let previous: StateImage | null = null, sequence = 1, leftKind1 = 0;
    const kinds = Array.from({ length: t.rocks.length / ROCK_STRIDE }, (_, k) => t.rocks[k * ROCK_STRIDE]!);
    for (let k = 1; k <= ticks; k++) {
      stepDuelTick(d, IDLE); pinHunter(d);
      if (bursts.some((s) => Math.round(s * TICK_HZ) === k)) {
        const rock = biggestBeltRail(d);
        if (rock >= 0) { const a = rockAt(t, rock); breakRock(t, rock, a.x, a.y, -a.x, -a.y, 'torpedo', 0, 'shatter'); beginRockTick(t); }   // toward the planet from where it is now
      }
      for (let j = 0; j < kinds.length; j++) { const now = t.rocks[j * ROCK_STRIDE]!; if (kinds[j] === 1 && now !== 1) leftKind1++; kinds[j] = now; }
      if (k % TICK_HZ === 0) { let free = 0; for (let j = 0; j < kinds.length; j++) if (kinds[j] === 2) free++; freeEachSecond.push(free); }
      if (k % 3 !== 0) continue;   // a 20 Hz publication every third tick
      const w = windows.findIndex(([from, to]) => k >= Math.round(from * TICK_HZ) - 3 && k < Math.round(to * TICK_HZ));
      if (w < 0) { previous = null; continue; }
      const image = duelPublicationToImage(publication(d, sequence++), options);
      if (previous && k >= Math.round(windows[w]![0] * TICK_HZ)) deltas[w]!.push(encodeDelta(previous, image).byteLength);
      previous = image;
    }
    return { seed, seconds, bursts: [...bursts], outcome: t.outcome, ticks: t.tick, leftKind1, freeEachSecond, deltas };
  } finally { disposeDuel(d); }
}

const main = (process.argv[1] ?? '').replaceAll('\\', '/').endsWith('scripts/spike-asteroids-iii-idle.ts');
if (main) {
  const at = process.argv.indexOf('--json'), out = at > 0 ? process.argv[at + 1] ?? null : null;
  const idle = IDLE_SEEDS.map((seed) => quietRun(seed, 601, IDLE_WINDOWS));
  const burst = IDLE_SEEDS.map((seed) => quietRun(seed, BURST_WINDOW[1], [BURST_WINDOW], BURST_TIMES));
  const summary = {
    idle: idle.map((r) => ({ seed: r.seed, outcome: r.outcome, leftKind1: r.leftKind1, medians: r.deltas.map(median), max: r.deltas.map((x) => Math.max(...x)) })),
    burst: burst.map((r) => ({ seed: r.seed, outcome: r.outcome, leftKind1: r.leftKind1, deltaMedian: median(r.deltas[0]!), freeAt30: r.freeEachSecond[29], freeAt90: r.freeEachSecond[89], freeAt270: r.freeEachSecond[269] }))
  };
  const result = { simVersion: SIM_VERSION, windows: IDLE_WINDOWS, burstTimes: BURST_TIMES, burstWindow: BURST_WINDOW, summary, idle, burst };
  console.log(JSON.stringify(summary, null, 2));
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result) + '\n'); }
}
