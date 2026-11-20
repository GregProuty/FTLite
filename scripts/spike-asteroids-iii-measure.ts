// Asteroids-iii measurements (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §8.2, §8.3, §13.7):
//   npx tsx scripts/spike-asteroids-iii-measure.ts [--json <path>] [--only feel|stress|cost|idle|burst]
// feel   §8.2: seed 2026, the Hunter off, the crew on a circular orbit 300 u outward of each of the 10 largest main-lane
//        rocks, one rock-targeted torpedo each. A shot passes with (a) ≥ 6 real pieces, (b) ≥ 3 touch events within 20 s,
//        (c) ≥ 50% of the burst's born piece mass (by the active mass law, rockMassOf) alive at 30 s (plan deviation 23), (d) ≥ 4 burst pieces whose velocity relative to V_c turned ≥ 25°
//        by 20 s. Gate: ≥ 7 of 10. §13.7: run with all four switches on (the gate) and all four off (reported).
// stress §8.3: seeds 1-20 × 4,000 ticks, the Hunter off, the stress driver; twins hashed every 500 ticks; a save and
//        restore at 4,000 then 1,000 more ticks; the safety counters (edge dust, rockSlotDust, rockCapHits: gates 0), tidal
//        breaks and their pieces, rejoins by how, refused rejoins by reason every 60 ticks (plan deviation 3), the grid
//        against a brute-force scan every 60 ticks (plan deviation 18), the free count every 10 s, stepDuel's p99.
// cost   §8.3: seeds 1-3, every empty slot filled with a free rock (about 240 live), 2,000 ticks of the stress driver:
//        stepDuel's p99 under 0.5 ms; once with the fill flying; once settled and over 60 s old (every rock a rejoin
//        candidate, so the refused-rejoin loops run, on the §14 staggered path: each re-checked every 30th tick); and
//        (reported, not gated) settled with every fill rock kept 120-149 ticks old, so each is re-checked every tick.
// idle   §8.3: seeds 1-20, 600 s with no player action (the quiet scene, crew at IDLE_ORBIT_R, Hunter off): 0 rocks ever
//        freed; and seeds 1-3's 20 Hz deltas at 60, 300 and 600 s, each window's median at most master's (Task 1's JSON)
//        plus 64 bytes.
// burst  §8.3: seeds 1-3, the quiet scene with bursts at 10, 20 and 30 s: the free count back to ≤ 10 by 270 s, and the
//        delta median from 10 to 270 s ≤ 5,500 bytes.
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BURST_TIMES, BURST_WINDOW, IDLE_ORBIT_R, IDLE_SEEDS, IDLE_WINDOWS, median, quietRun } from './spike-asteroids-iii-idle';
import { parkCoOrbit, stressInput, switchOff } from '../tests/helpers/rockStress';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { flattenTactical, hashTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { circularVelocity } from '../src/renderer/src/sim/tactical/rails';
import { beginRockTick, rockAlive, rockAt, rockHp, RockKind, rockMassOf, rocksNearGrid, rockSlots, ROCK_STRIDE, rockX, rockY, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { rejoinChoice, type RejoinRefusal } from '../src/renderer/src/sim/tactical/rockSettle';
import { ROCK_SWITCHES } from '../src/renderer/src/sim/tactical/rockTuning';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const argAt = (name: string): string | null => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] ?? null : null; };
const only = argAt('--only'), want = (part: string): boolean => only === null || only === part;
const quantile = (xs: readonly number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
const round = (v: number, d = 4): number => Number(v.toFixed(d));
const count = (st: TacticalState, kind: number): number => { let n = 0; for (let k = 0; k < rockSlots(st); k++) if (st.rocks[k * ROCK_STRIDE] === kind) n++; return n; };
const isRailKind = (kind: number): boolean => kind === RockKind.Rail || kind === RockKind.Tumble;
const COS25 = Math.cos((25 * Math.PI) / 180);
/** Plan deviation 17: the idle delta gate allows this many bytes over master's per window median (constant fields such as
 *  the larger reserve and the new counters may cost a few bytes in the delta encoding). */
const IDLE_DELTA_TOLERANCE = 64;
/** The grid check's own scratch (rocksNearGrid writes slots into a caller-owned array and returns the count). */
const GRID_SCRATCH: number[] = [];

function feelShot(rock: number) {
  const st = createTacticalState(2026);
  switchOff(st, 1); parkCoOrbit(st, rock, 300);
  const parent = rockAt(st, rock), family = new Set<number>(), u0 = new Map<number, [number, number]>();
  let bornMass = 0;
  let blastAt = -1, pieces = 0, touches = 0, massShare = -1, turned = -1;
  for (let k = 0; k < 4000 && (blastAt < 0 || st.tick - 1 < blastAt + 1800); k++) {
    stepDuel(st, { ...IDLE_INPUT, rockLock: { laser: null, torpedo: k === 0 ? rock : null } });
    const now = st.tick - 1;
    for (const e of st.events) {
      if (e.kind !== 'rock') continue;
      if (e.what === 'split' && e.burst && blastAt < 0) { blastAt = now; pieces = e.pieces!.length; for (const p of e.pieces!) { family.add(p); bornMass += rockMassOf(st, p); } continue; }
      if (blastAt < 0) continue;
      if (e.what === 'touch' && now <= blastAt + 1200) touches++;
      if (e.what === 'split' && family.has(e.rock)) { u0.delete(e.rock); for (const p of e.pieces ?? []) family.add(p); }
      if (e.what === 'dust' && e.rock >= 0 && family.has(e.rock)) { family.delete(e.rock); u0.delete(e.rock); }
    }
    if (blastAt === now) for (const p of family) { const a = rockAt(st, p), [cx, cy] = circularVelocity(a.x, a.y); u0.set(p, [a.vx - cx, a.vy - cy]); }
    if (blastAt >= 0 && now === blastAt + 1200) {
      turned = 0;
      for (const [p, [ux, uy]] of u0) {
        if (!rockAlive(st, p)) continue;
        const a = rockAt(st, p), [cx, cy] = circularVelocity(a.x, a.y), wx = a.vx - cx, wy = a.vy - cy, n = Math.hypot(ux, uy) * Math.hypot(wx, wy);
        if (n > 0 && (ux * wx + uy * wy) / n <= COS25) turned++;
      }
    }
    if (blastAt >= 0 && now === blastAt + 1800) {
      let m = 0;
      for (const p of family) if (rockAlive(st, p)) m += rockMassOf(st, p);
      massShare = bornMass > 0 ? m / bornMass : 0;   // plan deviation 23: of the born pieces' mass, by the active mass law
    }
  }
  const crit = { a: pieces >= 6, b: touches >= 3, c: massShare >= 0.5, d: turned >= 4 }, pass = crit.a && crit.b && crit.c && crit.d;
  return { rock, r: round(parent.r, 1), blasted: blastAt >= 0, pieces, touches, massShare: round(massShare, 3), turned, crit, pass };
}
function feelRun() {
  const shape = createTacticalState(2026), main0 = shape.map.laneSizes[0]!, main1 = main0 + shape.map.laneSizes[1]!;
  const big = Array.from({ length: main1 - main0 }, (_, j) => main0 + j).sort((x, y) => shape.map.asteroids[y]!.r - shape.map.asteroids[x]!.r || x - y).slice(0, 10);
  const rows = big.map(feelShot), passing = rows.filter((r) => r.pass).length;
  const perCriterion = { a: rows.filter((r) => r.crit.a).length, b: rows.filter((r) => r.crit.b).length, c: rows.filter((r) => r.crit.c).length, d: rows.filter((r) => r.crit.d).length };
  return { rows, passing, perCriterion, gatePass: passing >= 7 };
}
/** Run `run` with every switch set to `on`, always restoring them. */
function switches<T>(on: boolean, run: () => T): T {
  const saved = { ...ROCK_SWITCHES };
  Object.assign(ROCK_SWITCHES, { massCube: on, softEdge: on, clusterTumble: on, rocheBreak: on });
  try { return run(); } finally { Object.assign(ROCK_SWITCHES, saved); }
}
const feel = want('feel') ? { seed: 2026, allOn: switches(true, feelRun), allOff: switches(false, feelRun) } : null;

const stress = want('stress') ? (() => {
  const times: number[] = [], failures: string[] = [], freeEvery10s: number[][] = [];
  let edgeDust = 0, tidalBreaks = 0, tidalPieces = 0, slotDust = 0, capHits = 0, gridChecks = 0;
  const rejoins = { lane: 0, group: 0, own: 0, cluster: 0 }, clusterJoins = { tumble: 0, ring: 0 }, refused: Record<string, number> = {}, gridWrong: string[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const a = createTacticalState(seed), b = createTacticalState(seed), marks: number[] = [];
    switchOff(a, 1); switchOff(b, 1);
    for (let k = 0; k < 4000; k++) {
      const ia = stressInput(a), ib = stressInput(b), t0 = performance.now();
      stepDuel(a, ia); times.push(performance.now() - t0);
      stepDuel(b, ib);
      for (const e of a.events) {
        if (e.kind !== 'rock') continue;
        if (e.what === 'dust' && e.by === 'edge') edgeDust++;
        if (e.what === 'split' && e.by === 'tidal') { tidalBreaks++; tidalPieces += e.pieces?.length ?? 0; }
        if (e.what === 'rejoin' && e.how) { rejoins[e.how]++; if (e.join) clusterJoins[e.join]++; }
      }
      if (a.tick % 600 === 0) marks.push(count(a, RockKind.Free));
      if (a.tick % 60 === 0) { tallyRefusals(a, refused); gridChecks++; const w = gridAgainstBrute(a); if (w) gridWrong.push(`seed ${seed} tick ${a.tick}: ${w}`); }   // plan deviations 3, 18
      if ((k + 1) % 500 === 0 && hashTactical(a) !== hashTactical(b)) { failures.push(`seed ${seed} tick ${k + 1}: twin runs differ`); break; }
    }
    slotDust += a.rockSlotDust; capHits += a.rockCapHits;
    freeEvery10s.push(marks);
    const values = flattenTactical(a), c = createTacticalState(seed);
    validateTacticalValues(c, values); unflattenTactical(c, values);
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: the restored state's hash differs`);
    for (let k = 0; k < 1000; k++) { stepDuel(a, stressInput(a)); stepDuel(c, stressInput(c)); }
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: save and restore diverged`);
  }
  const safety = { edgeDust, slotDust, capHits };
  if (gridWrong.length > 0) failures.push(...gridWrong.slice(0, 5).map((w) => `grid: ${w}`));
  return { seeds: 20, ticks: 4000, restoreTicks: 1000, failures, safety, refused, gridChecks, safetyPass: edgeDust === 0 && slotDust === 0 && capHits === 0, tidalBreaks, tidalPieces, rejoins, clusterJoins,
    stepDuelMs: { median: round(median(times)), p99: round(quantile(times, 0.99)) }, freeEvery10sMax: Array.from({ length: freeEvery10s[0]?.length ?? 0 }, (_, j) => Math.max(...freeEvery10s.map((m) => m[j] ?? 0))) };
})() : null;

/** Plan deviation 3: tally the free rocks that pass the clock and speed tests but are refused a rail, by reason. */
function tallyRefusals(st: TacticalState, into: Record<string, number>): void {
  for (let k = 0; k < rockSlots(st); k++) {
    if (st.rocks[k * ROCK_STRIDE] !== RockKind.Free) continue;
    const why: { reason: RejoinRefusal | null } = { reason: null };
    if (rejoinChoice(st, k, why) === null && why.reason && why.reason !== 'state' && why.reason !== 'clock' && why.reason !== 'speed') into[why.reason] = (into[why.reason] ?? 0) + 1;
  }
}
/** Plan deviation 18: the grid against a brute-force bounding-box scan for every live rock (between ticks, on the last
 *  step's grid); the first mismatch, or null. */
function gridAgainstBrute(st: TacticalState): string | null {
  const n = rockSlots(st), live: number[] = [], xs = new Float64Array(n), ys = new Float64Array(n), rs = new Float64Array(n);
  for (let k = 0; k < n; k++) if (rockAlive(st, k)) { live.push(k); xs[k] = rockX(st, k); ys[k] = rockY(st, k); rs[k] = st.rocks[k * ROCK_STRIDE + 5]!; }
  for (const k of live) {
    const brute = live.filter((j) => Math.abs(xs[j]! - xs[k]!) <= rs[k]! + rs[j]! && Math.abs(ys[j]! - ys[k]!) <= rs[k]! + rs[j]!).join(','), grid = GRID_SCRATCH.slice(0, rocksNearGrid(st, xs[k]!, ys[k]!, rs[k]!, GRID_SCRATCH)).join(',');
    if (grid !== brute) return `rock ${k}: grid ${grid} brute ${brute}`;
  }
  return null;
}
/** Fill every empty slot with a free rock (r 9 to 12) on a spread of orbits from ρ 1350 to 2650, a little off circular, or
 *  (settled) exactly circular and older than 60 s, so every one is a rejoin candidate each tick (plan deviation 12, cost). */
function fillFree(st: TacticalState, settled = false): void {
  let j = 0;
  for (let k = 0; k < rockSlots(st); k++) {
    if (st.rocks[k * ROCK_STRIDE] !== RockKind.Gone) continue;
    const rho = 1350 + ((j * 37) % 1300), ang = j * 2.399963229728653, x = Math.cos(ang) * rho, y = Math.sin(ang) * rho, [vx, vy] = circularVelocity(x, y), r = 9 + (j % 4);
    writeRock(st, k, RockKind.Free, x, y, settled ? vx : vx + ((j * 13) % 7) - 3, settled ? vy : vy + ((j * 7) % 5) - 2, r, rockHp(r), 0);
    j++;
  }
}
/** The cost run: 'flying'; 'settled' (over 60 s old, so §14's staggered re-check: every 30th tick per rock); 'young'
 *  (settled, every Free rock's clock set back before each step to 120-149 ticks old by slot, so it is checked every tick). */
function costRun(variant: 'flying' | 'settled' | 'young') {
  const times: number[] = [], live: number[] = [], settled = variant !== 'flying';
  for (const seed of [1, 2, 3]) {
    const st = createTacticalState(seed);
    switchOff(st, 1);
    if (settled) st.tick = 3700;   // the fill's clocks (t = 0) are then over 60 s old: full drag, rejoin candidates (staggered)
    fillFree(st, settled);
    for (let k = 0; k < 2000; k++) {
      if (variant === 'young') for (let j = 0; j < rockSlots(st); j++) if (st.rocks[j * ROCK_STRIDE] === RockKind.Free) st.rocks[j * ROCK_STRIDE + 7] = st.tick + 1 - 120 - (j % 30);
      const input = stressInput(st), t0 = performance.now();
      stepDuel(st, input); times.push(performance.now() - t0);
      if (k % 100 === 0) live.push(rockSlots(st) - count(st, RockKind.Gone));
    }
  }
  const p99 = quantile(times, 0.99);
  return { seeds: [1, 2, 3], ticks: 2000, liveMedian: median(live), liveMin: Math.min(...live), stepDuelMs: { median: round(median(times)), p99: round(p99) }, p99GateMs: 0.5, p99Pass: p99 < 0.5 };
}
const cost = want('cost') ? (() => { const flying = costRun('flying'), settled = costRun('settled'), young = costRun('young'); return { flying, settled, young, p99Pass: flying.p99Pass && settled.p99Pass }; })() : null;

const idle = want('idle') ? (() => {
  let freed = 0;
  const perSeed: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const st = createTacticalState(seed), [vx, vy] = circularVelocity(0, -IDLE_ORBIT_R);
    switchOff(st, 1);
    Object.assign(st.ships[0], { x: 0, y: -IDLE_ORBIT_R, vx, vy, heading: 64, headingAcc: 0 });
    let kinds = Array.from({ length: rockSlots(st) }, (_, k) => st.rocks[k * ROCK_STRIDE]!), seedFreed = 0;
    for (let k = 0; k < 600 * 60; k++) {
      stepDuel(st, IDLE_INPUT);
      for (let j = 0; j < kinds.length; j++) { const now = st.rocks[j * ROCK_STRIDE]!; if (isRailKind(kinds[j]!) && !isRailKind(now)) seedFreed++; kinds[j] = now; }
    }
    perSeed.push(seedFreed); freed += seedFreed;
  }
  const master = JSON.parse(readFileSync('docs/superpowers/research/2026-11-19-asteroids-iii-master-idle.json', 'utf8')) as { idle: { seed: number; deltas: number[][] }[] };
  const deltas = IDLE_SEEDS.map((seed) => {
    const run = quietRun(seed, 601, IDLE_WINDOWS), base = master.idle.find((m) => m.seed === seed)!;
    const mine = run.deltas.map(median), theirs = base.deltas.map(median);
    return { seed, mine, master: theirs, pass: mine.every((m, w) => m <= theirs[w]! + IDLE_DELTA_TOLERANCE) };   // plan deviation 17
  });
  return { seeds: 20, seconds: 600, freed, perSeed, freedPass: freed === 0, deltas, deltaPass: deltas.every((d) => d.pass) };
})() : null;

const burst = want('burst') ? (() => {
  const rows = IDLE_SEEDS.map((seed) => {
    const run = quietRun(seed, BURST_WINDOW[1], [BURST_WINDOW], BURST_TIMES), last = BURST_TIMES[BURST_TIMES.length - 1]!;
    const back = run.freeEachSecond.findIndex((n, s) => s + 1 >= last && n <= 10), deltaMedian = median(run.deltas[0]!);
    return { seed, peakFree: Math.max(...run.freeEachSecond), backToTenAtS: back < 0 ? -1 : back + 1, freeAt270: run.freeEachSecond[run.freeEachSecond.length - 1], deltaMedian, pass: back >= 0 && deltaMedian <= 5500 };
  });
  return { rows, gatePass: rows.every((r) => r.pass) };
})() : null;

/** Plan deviation 3: the after-burst scene on the tactical state alone (crew at IDLE_ORBIT_R, Hunter off, the same three
 *  bursts), with the free count and the refused rejoins by reason every 60 ticks from 30 s on. */
const burstWhy = want('burst') ? IDLE_SEEDS.map((seed) => {
  const st = createTacticalState(seed), [vx, vy] = circularVelocity(0, -IDLE_ORBIT_R), refusedBy: Record<string, number> = {};
  switchOff(st, 1);
  Object.assign(st.ships[0], { x: 0, y: -IDLE_ORBIT_R, vx, vy, heading: 64, headingAcc: 0 });
  for (let k = 1; k <= BURST_WINDOW[1] * 60; k++) {
    stepDuel(st, IDLE_INPUT);
    if (BURST_TIMES.some((t) => t * 60 === k)) {
      let big = -1;
      for (let j = 0; j < st.map.beltCount; j++) if (st.rocks[j * ROCK_STRIDE] === RockKind.Rail && (big < 0 || st.rocks[j * ROCK_STRIDE + 5]! > st.rocks[big * ROCK_STRIDE + 5]!)) big = j;
      if (big >= 0) { const a = rockAt(st, big); breakRock(st, big, a.x, a.y, -a.x, -a.y, 'torpedo', 0, 'shatter'); beginRockTick(st); }
    }
    if (k >= 30 * 60 && k % 60 === 0) tallyRefusals(st, refusedBy);
  }
  return { seed, freeAtEnd: count(st, RockKind.Free), refusedBy };
}) : null;

const result = { simVersion: SIM_VERSION, switches: { ...ROCK_SWITCHES }, feel, stress, cost, idle, burst, burstWhy };
console.log(JSON.stringify(result, null, 2));
const out = argAt('--json');
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
const failed = (feel && !feel.allOn.gatePass) || (stress && (stress.failures.length > 0 || !stress.safetyPass)) || (cost && !cost.p99Pass)
  || (idle && (!idle.freedPass || !idle.deltaPass)) || (burst && !burst.gatePass);
if (failed) process.exitCode = 1;
