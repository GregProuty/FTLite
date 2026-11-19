// Spike ii (billiard asteroids) measurements (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md §9.1, §9.4, §9.5):
//   npx tsx scripts/spike-asteroids-ii-measure.ts [--json <path>] [--only stress|feel|sizes]
// 1. Stress (§9.1, §9.5): seeds 1..20, 4,000 tactical ticks each with the Hunter switched off, a torpedo into the belt
//    every 10 s and the laser at the nearest rock whenever charged; twin runs hashed every 500 ticks; a save (flatten)
//    and restore (validate, unflatten into a fresh state) at tick 4,000, then 1,000 more ticks on both; stepDuel's cost
//    per tick (the gate: p99 under 0.5 ms) and the moving-rock count every 10 s. The driver parks the crew 300 u outward
//    of the biggest live belt rock when nothing is in torpedo range, keeps its hull full, tops the magazine up before each
//    torpedo and turns the nose onto the laser's rock (script-side writes, identical in both twins).
// 2. Feel proxies (§9.4): seed 2026, the 10 largest belt rocks, one rock-targeted torpedo each from 300 u outward, at
//    rest, facing the rock; pieces made and damaging collisions among the blast's family within 5 s; breaks, the farthest
//    piece travel and the moving count 30 s after the blast.
// 3. Sizes (§9.5): the duel snapshot, its full image and its 20 Hz delta images with 0 and with 60 moving rocks.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { flattenTactical, hashTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { validateMap } from '../src/renderer/src/sim/tactical/map';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { beginRockTick, rockAlive, rockAt, RockKind, rockSlots, ROCK_STRIDE, type RockView } from '../src/renderer/src/sim/tactical/rocks';
import { classOf, createTacticalState, missileOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT, laserFull, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { duelPublicationToImage, type DuelPublication } from '../src/network/modes/duelStream';
import { encodeDelta, encodeFull, type StateImage } from '../src/network/state/imageCodec';
import { hashF64 } from '../src/shared/hash';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const argAt = (name: string): string | null => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] ?? null : null; };
const only = argAt('--only'), want = (part: string): boolean => only === null || only === part;
const median = (xs: readonly number[]): number => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const quantile = (xs: readonly number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
const round = (v: number, d = 4): number => Number(v.toFixed(d));
function movingCount(st: TacticalState): number { let n = 0; for (let k = 0; k < rockSlots(st); k++) if (st.rocks[k * ROCK_STRIDE] === RockKind.Moving) n++; return n; }

/** Switch slot i off as an inactive slot holds it (zeros): the Hunter neither thinks nor collides, and validation accepts it. */
function switchOff(st: TacticalState, i: number): void {
  const ship = st.ships[i]!, sys = st.systems[i]! as unknown as Record<string, unknown>;
  Object.assign(ship, { active: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 });
  ship.graceUntil.fill(0);
  for (const key of Object.keys(sys)) sys[key] = key === 'rooms' ? [0, 0, 0] : typeof sys[key] === 'boolean' ? false : 0;
}
/** The heading index (0 north, 64 east) nearest the bearing from (x, y) to (tx, ty). Script-side trigonometry. */
const headingTo = (x: number, y: number, tx: number, ty: number): number => ((Math.round((Math.atan2(tx - x, -(ty - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
/** Park ship 0 at rest `gap` u outward of rock k (away from the planet), facing it. */
function parkOutward(st: TacticalState, k: number, gap = 300): void {
  const a = rockAt(st, k), d = Math.hypot(a.x, a.y), x = a.x + (a.x / d) * gap, y = a.y + (a.y / d) * gap;
  Object.assign(st.ships[0], { x, y, vx: 0, vy: 0, heading: headingTo(x, y, a.x, a.y), headingAcc: 0 });
}
function nearest(st: TacticalState, dist: (a: RockView) => number, within: number): number {
  let best = -1, bd = Infinity;
  for (let k = 0; k < rockSlots(st); k++) { if (!rockAlive(st, k)) continue; const d = dist(rockAt(st, k)); if (d <= within && d < bd) { best = k; bd = d; } }
  return best;
}
function biggestBelt(st: TacticalState): number {
  let best = -1;
  for (let k = 0; k < st.map.beltCount; k++) if (rockAlive(st, k) && (best < 0 || rockAt(st, k).r > rockAt(st, best).r)) best = k;
  return best;
}
/** The stress driver's input for this tick (see the header). */
function drive(st: TacticalState): ShipInput {
  const sys = st.systems[0]!, me = st.ships[0]!, input: ShipInput = { ...IDLE_INPUT, rockLock: { laser: null, torpedo: null } };
  sys.hull = classOf(st, 0).hull;
  if (st.tick % 600 === 0 && !missileOf(st, 0)) {
    sys.magazine = classOf(st, 0).slots.missile.magazine;
    let k = nearest(st, (a) => Math.hypot(a.x - me.x, a.y - me.y), classOf(st, 0).slots.missile.range);
    if (k < 0) { k = biggestBelt(st); if (k >= 0) parkOutward(st, k); }
    if (k >= 0) input.rockLock.torpedo = k;
  }
  if (sys.laserBurst === 0 && laserFull(st, 0) && sys.laserRock < 0) {
    const k = nearest(st, (a) => Math.hypot(a.x - me.x, a.y - me.y) - a.r, classOf(st, 0).slots.laser!.range);
    if (k >= 0) { const a = rockAt(st, k); me.heading = headingTo(me.x, me.y, a.x, a.y); me.headingAcc = 0; input.rockLock.laser = k; }
  }
  return input;
}

const stress = want('stress') ? (() => {
  const times: number[] = [], failures: string[] = [], moving: number[][] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const a = createTacticalState(seed), b = createTacticalState(seed), marks: number[] = [];
    switchOff(a, 1); switchOff(b, 1);
    for (let k = 0; k < 4000; k++) {
      const ia = drive(a), ib = drive(b), t0 = performance.now();
      stepDuel(a, ia); times.push(performance.now() - t0);
      stepDuel(b, ib);
      if (a.tick % 600 === 0) marks.push(movingCount(a));
      if ((k + 1) % 500 === 0 && hashTactical(a) !== hashTactical(b)) { failures.push(`seed ${seed} tick ${k + 1}: twin runs differ`); break; }
    }
    moving.push(marks);
    const values = flattenTactical(a), c = createTacticalState(seed);
    validateTacticalValues(c, values); unflattenTactical(c, values);
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: the restored state's hash differs`);
    for (let k = 0; k < 1000; k++) { stepDuel(a, drive(a)); stepDuel(c, drive(c)); }
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: save and restore diverged`);
  }
  const p99 = quantile(times, 0.99), marks = moving[0]?.length ?? 0;
  return {
    seeds: 20, ticks: 4000, restoreTicks: 1000, failures,
    stepDuelMs: { median: round(median(times)), p99: round(p99), max: round(Math.max(...times)) }, p99GateMs: 0.5, p99Pass: p99 < 0.5,
    movingEvery10s: { max: Array.from({ length: marks }, (_, j) => Math.max(...moving.map((m) => m[j] ?? 0))), median: Array.from({ length: marks }, (_, j) => median(moving.map((m) => m[j] ?? 0))) }
  };
})() : null;

function feelShot(rock: number) {
  const st = createTacticalState(2026), family = new Set<number>();
  switchOff(st, 1); parkOutward(st, rock);
  let blastAt = -1, bx = 0, by = 0, blastRock = -1, pieces = 0, breaks = 0, collisions = 0, far = 0, movingAt30s = -1;
  for (let k = 0; k < 3000 && (blastAt < 0 || st.tick - 1 < blastAt + 1800); k++) {
    stepDuel(st, { ...IDLE_INPUT, rockLock: { laser: null, torpedo: k === 0 ? rock : null } });
    const now = st.tick - 1;
    for (const e of st.events) {
      if (e.kind !== 'rock') continue;
      if (e.what === 'blast' && blastAt < 0) { blastAt = now; bx = e.x; by = e.y; blastRock = e.rock; family.add(e.rock); }
      if (blastAt < 0 || now > blastAt + 300) continue;
      if (e.what === 'hit' && e.by === 'torpedo' && now === blastAt) family.add(e.rock);
      else if (e.what === 'split') {
        const fam = family.has(e.rock);
        for (const p of e.pieces ?? []) { if (fam) family.add(p); else family.delete(p); }
        if (fam) { pieces += (e.pieces ?? []).length; breaks++; }
      } else if (e.what === 'dust' && e.rock >= 0 && family.has(e.rock)) { family.delete(e.rock); if (!e.evicted && e.by !== 'planet' && e.by !== 'edge') breaks++; }
      else if (e.what === 'bump' && e.by === 'collision' && (family.has(e.rock) || family.has(e.other ?? -1))) collisions++;
    }
    if (blastAt >= 0 && now <= blastAt + 300) for (const s of family) if (rockAlive(st, s)) { const a = rockAt(st, s); far = Math.max(far, Math.hypot(a.x - bx, a.y - by)); }
    if (blastAt >= 0 && now === blastAt + 1800) movingAt30s = movingCount(st);
  }
  return { rock, r: round(st.map.asteroids[rock]!.r, 1), blasted: blastAt >= 0, blastRock, pieces, breaks, collisions, farthestTravel: Math.round(far), movingAt30s };
}
const feel = want('feel') ? (() => {
  const shape = createTacticalState(2026), big = Array.from({ length: shape.map.beltCount }, (_, k) => k).sort((x, y) => shape.map.asteroids[y]!.r - shape.map.asteroids[x]!.r || x - y).slice(0, 10);
  const rows = big.map(feelShot), passing = rows.filter((r) => r.pieces >= 8 && r.collisions >= 2).length;
  return { seed: 2026, rows, passing, floor: '>= 8 pieces and >= 2 damaging collisions in >= 7 of 10', floorPass: passing >= 7 };
})() : null;

const sizes = want('sizes') ? (() => {
  const contentDigest = computeContentDigest(process.cwd()), layout = DUEL_LAYOUT;
  const options = { resolveLayout: (id: string) => { if (id !== layout.id) throw Error('unknown layout'); return layout; }, contentDigest };
  let seed = 2026;
  while (validateMap(createTacticalState(seed).map).length > 0) seed++;
  const publication = (d: DuelState, sequence: number): DuelPublication => {
    const snapshot = saveDuelSnapshot(d, contentDigest);
    return { runId: 'profile', tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)), phase: 'running',
      pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 };
  };
  const deltas = (d: DuelState, pair: ReturnType<typeof createScriptedPair>, ticks: number, first: number): number[] => {
    let previous: StateImage = duelPublicationToImage(publication(d, first), options);
    const out: number[] = [];
    for (let k = 0; k < ticks; k++) {
      stepDuelTick(d, scriptedInput(pair, d));
      if (k % 3 !== 2) continue;   // a 20 Hz publication every third tick
      const image = duelPublicationToImage(publication(d, first + k + 1), options);
      out.push(encodeDelta(previous, image).byteLength); previous = image;
    }
    return out;
  };
  const d = createDuel(layout, seed), pair = createScriptedPair(seed);
  try {
    for (let k = 0; k < 3000; k++) stepDuelTick(d, scriptedInput(pair, d));
    const snap = saveDuelSnapshot(d, contentDigest), full = encodeFull(duelPublicationToImage(publication(d, 1), options)).byteLength;
    const still = deltas(d, pair, 600, 2), t = d.tactical;
    beginRockTick(t);
    for (let k = 0; k < t.map.asteroids.length && movingCount(t) < 60; k++) if (t.rocks[k * ROCK_STRIDE] === RockKind.Static && rockAt(t, k).r >= 25) breakRock(t, k, 1, 0, 'collision', -1, 'fan');
    const moversAtStart = movingCount(t), flying = deltas(d, pair, 300, 1000), moversAtEnd = movingCount(t);
    return { seed, tick: 3000, values: snap.values.length, jsonBytes: JSON.stringify(snap).length, fullImageBytes: full,
      delta0: { median: median(still), max: Math.max(...still) }, delta60: { moversAtStart, moversAtEnd, median: median(flying), max: Math.max(...flying) } };
  } finally { disposeDuel(d); }
})() : null;

const result = { simVersion: SIM_VERSION, stress, feel, sizes };
console.log(JSON.stringify(result, null, 2));
const out = argAt('--json');
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
if ((stress && (!stress.p99Pass || stress.failures.length > 0)) || (feel && !feel.floorPass)) process.exitCode = 1;
