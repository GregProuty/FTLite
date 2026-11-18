// Destructible-asteroids spike measurements (docs/superpowers/specs/2026-11-17-destructible-asteroids-spike.md).
// Runs on master and on spike/asteroids alike, so the before/after numbers come from one script:
//   npx tsx scripts/spike-asteroids-measure.ts [--json <path>]
// 1. Snapshot size: a typical duel state (the scripted pair, seed 2026's next valid seed, at tick 3000), as the JSON
//    snapshot, the full state image and the median 20 Hz delta image.
// 2. Per-tick cost: stepDuelTick with the scripted pair over 6000 ticks (median and mean), and the tactical stepDuel alone.
// 3. Determinism: per seed 1..20, two independent runs agree hash for hash, and a mid-run save/restore continues to the same hash.
// 4. Feel evidence: the gate seeds 1..10, scripted, round length and (on the spike) rock hits, splits and shatters.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { validateMap } from '../src/renderer/src/sim/tactical/map';
import { createTacticalState, Outcome, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { duelPublicationToImage, type DuelPublication } from '../src/network/modes/duelStream';
import { encodeDelta, encodeFull, type StateImage } from '../src/network/state/imageCodec';
import { hashF64 } from '../src/shared/hash';
import { SIM_VERSION, TICK_HZ } from '../src/renderer/src/sim/tuning';

const contentDigest = computeContentDigest(process.cwd());
const layout = DUEL_LAYOUT, resolveLayout = (id: string) => { if (id !== layout.id) throw Error('unknown layout'); return layout; };
const options = { resolveLayout, contentDigest };
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
let seed = 2026;
while (validateMap(createTacticalState(seed).map).length > 0) seed++;

function publication(d: ReturnType<typeof createDuel>, sequence: number): DuelPublication {
  const snapshot = saveDuelSnapshot(d, contentDigest);
  return { runId: 'profile', tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)), phase: 'running',
    pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 };
}

/** Rock tallies from the tactical events, when the build has them (the spike's `rock` event). */
interface RockTally { laserRock: number; torpRock: number; hits: number; splits: number; shatters: number; fragmentContacts: number }
function tally(t: TacticalState, r: RockTally): void {
  for (const e of t.events as { kind: string; what?: string; by?: string }[]) {
    if (e.kind !== 'rock') continue;
    if (e.what === 'hit') { r.hits++; if (e.by === 'laser') r.laserRock++; else if (e.by === 'torpedo') r.torpRock++; else if (e.by === 'fragment') r.fragmentContacts++; }
    else if (e.what === 'split') r.splits++;
    else if (e.what === 'shatter') r.shatters++;
  }
}

// 1. Snapshot size
const sizes = (() => {
  const d = createDuel(layout, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < 3000; k++) stepDuelTick(d, scriptedInput(pair, d));
  const snap = saveDuelSnapshot(d, contentDigest), json = JSON.stringify(snap).length;
  const full = encodeFull(duelPublicationToImage(publication(d, 1), options)).byteLength;
  let previous: StateImage = duelPublicationToImage(publication(d, 1), options);
  const deltas: number[] = [];
  for (let k = 0; k < 600; k++) {
    stepDuelTick(d, scriptedInput(pair, d));
    if (k % 3 !== 2) continue;   // a 20 Hz publication every third tick
    const image = duelPublicationToImage(publication(d, k + 2), options);
    deltas.push(encodeDelta(previous, image).byteLength); previous = image;
  }
  // With fragments in flight (the spike only): break five big rocks, then the same 20 Hz delta measure.
  let deltaFragmentsMedianBytes: number | null = null;
  const rk = (d.tactical as unknown as { rocks?: Float64Array }).rocks;
  if (rk) {
    const mod = require('../src/renderer/src/sim/tactical/rocks') as typeof import('../src/renderer/src/sim/tactical/rocks');
    let broken = 0;
    for (let k = 0; k < d.tactical.map.asteroids.length && broken < 5; k++) if (rk[k * 7] === 1 && rk[k * 7 + 5]! >= 30) { mod.damageRock(d.tactical, k, 99, 1, 0, 'laser'); broken++; }
    let prev = duelPublicationToImage(publication(d, 1000), options);
    const fd: number[] = [];
    for (let k = 0; k < 300; k++) { stepDuelTick(d, scriptedInput(pair, d)); if (k % 3 !== 2) continue; const image = duelPublicationToImage(publication(d, 1001 + k), options); fd.push(encodeDelta(prev, image).byteLength); prev = image; }
    deltaFragmentsMedianBytes = median(fd);
  }
  const out = { seed, tick: 3000, deltaFragmentsMedianBytes, values: snap.values.length, jsonBytes: json, fullImageBytes: full, deltaMedianBytes: median(deltas), deltaMaxBytes: Math.max(...deltas) };
  disposeDuel(d);
  return out;
})();

// 2. Per-tick cost
const cost = (() => {
  const d = createDuel(layout, seed), pair = createScriptedPair(seed), times: number[] = [];
  for (let k = 0; k < 500; k++) stepDuelTick(d, scriptedInput(pair, d));   // warm
  for (let k = 0; k < 6000 && d.tactical.outcome === Outcome.Running; k++) { const input = scriptedInput(pair, d), t = performance.now(); stepDuelTick(d, input); times.push(performance.now() - t); }
  disposeDuel(d);
  const t = createTacticalState(seed), tac: number[] = [];
  for (let k = 0; k < 6000 && t.outcome === Outcome.Running; k++) { const s = performance.now(); stepDuel(t, IDLE_INPUT); tac.push(performance.now() - s); }
  return { duelTicks: times.length, duelMedianMs: +median(times).toFixed(4), duelMeanMs: +mean(times).toFixed(4), tacticalTicks: tac.length, tacticalMedianMs: +median(tac).toFixed(4), tacticalMeanMs: +mean(tac).toFixed(4) };
})();

// 3. Determinism
const determinism = (() => {
  const bad: string[] = [];
  for (let s = 1; s <= 20; s++) {
    const a = createDuel(layout, s), b = createDuel(layout, s), pa = createScriptedPair(s), pb = createScriptedPair(s);
    for (let k = 0; k < 4000; k++) {
      stepDuelTick(a, scriptedInput(pa, a)); stepDuelTick(b, scriptedInput(pb, b));
      if (k % 500 === 0 && hashDuel(a) !== hashDuel(b)) { bad.push(`seed ${s} tick ${k}: twin runs differ`); break; }
    }
    // Save/restore: the restored copy and the original step on together with no new input (the scripted pair's private
    // rng is not part of the duel), and must agree.
    const c = loadDuelSnapshot(layout, saveDuelSnapshot(a, contentDigest), contentDigest);
    if (hashDuel(a) !== hashDuel(c)) bad.push(`seed ${s}: restore hash differs`);
    for (let k = 0; k < 1000; k++) { stepDuelTick(a, { held: [], commands: [] }); stepDuelTick(c, { held: [], commands: [] }); }
    if (hashDuel(a) !== hashDuel(c)) bad.push(`seed ${s}: save/restore diverged`);
    disposeDuel(c);
    disposeDuel(a); disposeDuel(b);
  }
  return { seeds: 20, twinTicks: 4000, restoreTicks: 1000, failures: bad };
})();

// 4. Feel evidence over the gate seeds, on the gates' own ship (tests/helpers/scriptedDuel.ts: the Cutter layout)
const CUTTER = parseShip(cutter);
const feel = (() => {
  const rows: { seed: number; crewAsteroidContacts: number; hunterAsteroidContacts: number; seconds: number; outcome: number; rocks: RockTally; rocksLeft: number | null }[] = [];
  for (let s = 1; s <= 10; s++) {
    const d = createDuel(CUTTER, s), pair = createScriptedPair(s), r: RockTally = { laserRock: 0, torpRock: 0, hits: 0, splits: 0, shatters: 0, fragmentContacts: 0 };
    let k = 0;
    let fragTouch = 0;   // ticks on which a ship touches a moving fragment (the spike's fragment hazard)
    for (; k < 15 * 60 * TICK_HZ && d.tactical.outcome === Outcome.Running; k++) {
      stepDuelTick(d, scriptedInput(pair, d)); tally(d.tactical, r);
      const rk = (d.tactical as unknown as { rocks?: Float64Array }).rocks;
      if (rk) for (let j = 0; j < rk.length; j += 7) if (rk[j] === 2) for (const sh of d.tactical.ships) if (Math.hypot(sh.x - rk[j + 1]!, sh.y - rk[j + 2]!) <= rk[j + 5]! + 20 + 0.5) fragTouch++;
    }
    (r as RockTally & { shipFragmentTouchTicks?: number }).shipFragmentTouchTicks = fragTouch;
    const rocks = (d.tactical as unknown as { rocks?: Float64Array }).rocks;
    rows.push({ seed: s, crewAsteroidContacts: d.tactical.ships[0].asteroidHits, hunterAsteroidContacts: d.tactical.ships[1].asteroidHits, seconds: +(k / TICK_HZ).toFixed(1), outcome: d.tactical.outcome, rocks: r, rocksLeft: rocks ? countAlive(rocks) : null });
    disposeDuel(d);
  }
  return { rows, medianSeconds: median(rows.map((x) => x.seconds)) };
})();
function countAlive(rocks: Float64Array): number { let n = 0; for (let k = 0; k < rocks.length; k += 7) if (rocks[k]! > 0) n++; return n; }

const result = { simVersion: SIM_VERSION, sizes, cost, determinism, feel };
console.log(JSON.stringify(result, null, 2));
const at = process.argv.indexOf('--json');
if (at > 0) { const p = process.argv[at + 1]!; mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(result, null, 2)); }
