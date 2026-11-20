// Net-4a (spec 2026-11-19-net-4a-duel-prediction-design §2, gate G6): the measurement of §2 as a committed tool, and the
// cost gate. Part A, per run (quiet; busy, a burst every 10 s; busy, every 5 s): a scripted Cutter duel for 3600 ticks
// after a 600-tick opening. At every third tick a copy is restored and stepped 12 ticks ahead with only what one seat's
// client could know: its own held input and commands on every tick, its partner's held input as of the saved tick. It is
// compared value for value with the straight run: the share exactly right per seat, the own-ship error when wrong (p95,
// max), and the checks with any rock wrong. The state packet estimate: values changed in three ticks × 12 bytes + 734.
// Part B (G6): the busy-every-5-s run fed to the real predictor 12 ticks ahead of each publication: one local tick (a
// step plus its hash) p99 <= 0.8 ms; one publication (verify, or restore and 12 ticks) p99 <= 4 ms. --force-resim
// perturbs the partner's published held input so every publication re-simulates (the worst case). Exit 1 on a G6 miss.
//   npx tsx scripts/measure-prediction.ts [--force-resim] [--json <path>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelPredictor } from '../src/renderer/src/clientControl/duelPredictor';
import type { DuelPublication } from '../src/renderer/src/clientControl/duelClient';
import type { CommandEnvelope, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import { flattenDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, type DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelInput } from '../src/renderer/src/sim/duel/step';
import { rockAlive, rockAt, rockSlots } from '../src/renderer/src/sim/tactical/rocks';
import { burstStep } from './determinism/duelRestore';

(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());
const digest = computeContentDigest(process.cwd()), CUTTER = parseShip(cutter), OPENING = 600, TICKS = 3600, AHEAD = 12;
const pct = (xs: readonly number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]! : 0; };
const N = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
/** What part A compares besides the flat values: ship 0 and every rock slot (alive, x, y). */
interface Probe { x: number; y: number; rocks: number[] }
function probe(d: DuelState): Probe {
  const t = d.tactical, rocks: number[] = [];
  for (let r = 0; r < rockSlots(t); r++) { const a = rockAt(t, r); rocks.push(rockAlive(t, r) ? 1 : 0, a.x, a.y); }
  return { x: t.ships[0]!.x, y: t.ships[0]!.y, rocks };
}
const sameValues = (a: Float64Array, b: Float64Array): boolean => { if (a.length !== b.length) return false; for (let v = 0; v < a.length; v++) if (a[v] !== b[v]) return false; return true; };

/** One straight run: every tick's input, a snapshot every third tick after the opening, and each later tick's flat values and probe. */
function straight(seed: number, burstEvery: number) {
  const step = burstStep(burstEvery), d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  const inputs: DuelInput[] = [], snaps = new Map<number, DuelSnapshot>(), flats = new Map<number, Float64Array>(), probes = new Map<number, Probe>();
  const live: number[] = [], packet: number[] = [];
  let prev3: Float64Array | null = null;
  for (let k = 0; k < OPENING + TICKS + AHEAD; k++) {
    if (k >= OPENING && k % 3 === 0) snaps.set(k, saveDuelSnapshot(d, digest));
    const input = scriptedInput(pair, d); inputs.push(structuredClone(input)); step(d, input);
    const tick = k + 1;
    if (tick > OPENING) {
      const flat = flattenDuel(d); flats.set(tick, flat); probes.set(tick, probe(d));
      let n = 0; for (let r = 0; r < rockSlots(d.tactical); r++) if (rockAlive(d.tactical, r)) n++; live.push(n);
      if (tick % 3 === 0) {
        if (prev3) { let changed = 0; for (let v = 0; v < flat.length; v++) if (flat[v] !== prev3[v]) changed++; packet.push(changed * 12 + 734); }
        prev3 = flat;
      }
    }
  }
  return { d, inputs, snaps, flats, probes, live, packet, step };
}

function partA(name: string, seed: number, burstEvery: number) {
  const run = straight(seed, burstEvery);
  const row: Record<string, unknown> = { run: name, freeRocks: Math.round(run.live.reduce((a, b) => a + b, 0) / run.live.length),
    packetMedianKB: (pct(run.packet, 0.5) / 1024).toFixed(1), packetMaxKB: (Math.max(...run.packet) / 1024).toFixed(1) };
  for (const seat of [0, 1]) {
    let right = 0, total = 0, rocksWrong = 0, copy: DuelState | null = null;
    const err: number[] = [];
    for (const [k, snap] of run.snaps) {
      if (k + AHEAD > OPENING + TICKS) continue;
      if (!copy) copy = loadDuelSnapshot(CUTTER, snap, digest); else restoreDuelSnapshot(copy, snap, digest);
      const partner = run.inputs[k - 1]!.held[1 - seat] ?? N();   // the partner's held input as of the saved tick
      for (let j = 0; j < AHEAD; j++) {
        const t = run.inputs[k + j]!;
        run.step(copy, { held: [0, 1].map((p) => (p === seat ? t.held[p] ?? N() : partner)), commands: t.commands.filter((c) => c.id.player === seat) });
      }
      total++;
      if (sameValues(flattenDuel(copy), run.flats.get(k + AHEAD)!)) { right++; continue; }
      const got = probe(copy), want = run.probes.get(k + AHEAD)!;
      err.push(Math.hypot(got.x - want.x, got.y - want.y));
      if (got.rocks.length !== want.rocks.length || got.rocks.some((v, i) => v !== want.rocks[i])) rocksWrong++;
    }
    if (copy) disposeDuel(copy);
    row[seat === 0 ? 'helmRight' : 'weaponsRight'] = `${((right / total) * 100).toFixed(1)}%`;
    row[seat === 0 ? 'helmErrP95' : 'weaponsErrP95'] = pct(err, 0.95).toFixed(2);
    row[seat === 0 ? 'helmErrMax' : 'weaponsErrMax'] = Math.max(0, ...err).toFixed(2);
    row[seat === 0 ? 'helmRocksWrong' : 'weaponsRocksWrong'] = rocksWrong;
  }
  disposeDuel(run.d);
  return row;
}

function partB(forceResim: boolean) {
  const run = straight(9, 300), tickMs: number[] = [], pubMs: number[] = [];
  const predictor = createDuelPredictor({ seat: 0, contentDigest: digest, resolveLayout: () => CUTTER, step: run.step });
  // Seat 0's commands get positive sequences in the order the predictor sees them; the watermark of publication k is the
  // largest sequence among seat 0's commands the straight run had stepped before tick k.
  const sequenceAt: number[] = []; let nextId = 0;
  for (let j = 0; j < run.inputs.length; j++) { for (const c of run.inputs[j]!.commands) if (c.id.player === 0) nextId++; sequenceAt[j + 1] = nextId; }
  const publication = (k: number): DuelPublication => {
    const snapshot = run.snaps.get(k)!, held = run.inputs[k - 1]!.held.map((h) => ({ ...(h ?? N()) }));
    if (forceResim) held[1] = { ...held[1]!, moveX: (k / 3) % 2 === 0 ? 1 : -1 };
    return { runId: 'm', tick: k, publicationSequence: k, snapshot, hash: snapshot.header.hash, phase: 'running', pauseOwner: null, controlRevision: 0, pauseReason: null,
      lagTicks: 0, tickTimeMs: null, commandHighWater: [sequenceAt[k] ?? 0, 0], heldHighWater: [k, 0], auxiliaryHighWater: [0, 0], eventSequence: 0, held };
  };
  const confirmed = loadDuelSnapshot(CUTTER, run.snaps.get(OPENING)!, digest);
  predictor.confirm(publication(OPENING), confirmed);
  let id = sequenceAt[OPENING] ?? 0;
  // Local tick L sends the input that produced tick L (inputs[L − 1]) with held sequence L: the authority used it on tick L.
  for (let L = OPENING + 1; L <= OPENING + TICKS; L++) {
    const t = run.inputs[L - 1]!, commands: CommandEnvelope<DuelCommand>[] = t.commands.filter((c) => c.id.player === 0).map((c) => ({ ...c, id: { player: 0, sequence: ++id } }));
    const t0 = performance.now(); predictor.tick({ heldSequence: L, held: t.held[0] ?? N(), commands }); tickMs.push(performance.now() - t0);
    const k = L - AHEAD;
    if (k > OPENING && run.snaps.has(k)) {
      restoreDuelSnapshot(confirmed, run.snaps.get(k)!, digest);
      const t1 = performance.now(); predictor.confirm(publication(k), confirmed); pubMs.push(performance.now() - t1);
    }
  }
  const s = predictor.stats(); predictor.dispose(); disposeDuel(confirmed); disposeDuel(run.d);
  return { tickP99: pct(tickMs, 0.99), pubP99: pct(pubMs, 0.99), verified: s.verified, resimulated: s.resimulated, liveRocksMax: Math.max(...run.live) };
}

const force = process.argv.includes('--force-resim'), at = process.argv.indexOf('--json'), json = at >= 0 ? process.argv[at + 1] : undefined;
const a = [partA('quiet', 4, 0), partA('busy, a burst every 10 s', 4, 600), partA('busy, a burst every 5 s', 4, 300)];
console.table(a);
const b = partB(force);
console.log(`G6 (${force ? 'every publication re-simulated' : 'natural'}): one local tick p99 ${b.tickP99.toFixed(3)} ms (<= 0.8), one publication p99 ${b.pubP99.toFixed(3)} ms (<= 4), verified ${b.verified}, re-simulated ${b.resimulated}, live rocks max ${b.liveRocksMax}`);
if (json) { mkdirSync(dirname(json), { recursive: true }); writeFileSync(json, JSON.stringify({ a, b }, null, 2)); }
if (b.tickP99 > 0.8 || b.pubP99 > 4) process.exitCode = 1;
