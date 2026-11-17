// The duel publication budget (H-2 spec §5): on seed 2026 (its next valid seed) mid-duel, the host's median cost per
// tick for the snapshot, two validations and two image encodes (one per streamed attachment), and the client's cost
// per received publication (decode, validate, restore). Budgets: host under 1.5 ms, client under 1.0 ms.
// Explicit diagnostic: npx tsx scripts/profile-duel-publication.ts [--json <path>]
// The restore uses restoreDuelSnapshot when the build has it (after the cache), else loadDuelSnapshot, so the same
// script measures the code before and after the cache.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import * as snapshots from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { validateMap } from '../src/renderer/src/sim/tactical/map';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { duelPublicationToImage, imageToDuelPublication, type DuelPublication } from '../src/network/modes/duelStream';
import { decodeState, encodeDelta, encodeFull, type StateImage } from '../src/network/state/imageCodec';
import { hashF64 } from '../src/shared/hash';

const contentDigest = computeContentDigest(process.cwd());
const layout = parseShip(cutter), resolveLayout = (id: string) => { if (id !== layout.id) throw Error('unknown layout'); return layout; };
const options = { resolveLayout, contentDigest };
let seed = 2026;
while (validateMap(createTacticalState(seed).map).length > 0) seed++;   // seed 2026's next valid seed, without the seed cache
const WARM = 3000, SAMPLES = 600;
const restore: (d: DuelState | null, snap: snapshots.DuelSnapshot) => DuelState = (snapshots as { restoreDuelSnapshot?: unknown }).restoreDuelSnapshot
  ? (d, snap) => { if (d) { snapshots.restoreDuelSnapshot(d, snap, contentDigest); return d; } return snapshots.loadDuelSnapshot(layout, snap, contentDigest); }
  : (d, snap) => { if (d) disposeDuel(d); return snapshots.loadDuelSnapshot(layout, snap, contentDigest); };

function publication(d: DuelState, sequence: number): DuelPublication {
  const snapshot = snapshots.saveDuelSnapshot(d, contentDigest);
  return { runId: 'profile', tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)), phase: 'running',
    pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 };
}
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

const d = createDuel(layout, seed), pair = createScriptedPair(seed);
let replica: DuelState | null = null;
try {
  for (let k = 0; k < WARM; k++) stepDuelTick(d, scriptedInput(pair, d));
  const host: number[] = [], client: number[] = [];
  let previous: StateImage | null = null;
  for (let k = 0; k < SAMPLES; k++) {
    stepDuelTick(d, scriptedInput(pair, d));
    let t = performance.now();
    const pub = publication(d, k + 1), images = [duelPublicationToImage(pub, options), duelPublicationToImage(pub, options)];
    const bytes = images.map((image) => (previous ? encodeDelta(previous, image) : encodeFull(image)));
    host.push(performance.now() - t);
    t = performance.now();
    const received = imageToDuelPublication(decodeState(bytes[0]!, previous ?? undefined), options);
    replica = restore(replica, received.snapshot);
    client.push(performance.now() - t);
    previous = images[0]!;
  }
  const result = { seed, tick: d.interior.tick, samples: SAMPLES, restore: 'restoreDuelSnapshot' in snapshots ? 'restoreDuelSnapshot' : 'loadDuelSnapshot',
    hostMedianMs: Number(median(host).toFixed(3)), clientMedianMs: Number(median(client).toFixed(3)), hostBudgetMs: 1.5, clientBudgetMs: 1.0 };
  console.log(`duel publication profile, seed ${seed} at tick ${result.tick} (${SAMPLES} samples, restore by ${result.restore}): host ${result.hostMedianMs} ms per tick (budget 1.5), client ${result.clientMedianMs} ms per publication (budget 1.0)`);
  const at = process.argv.indexOf('--json');
  if (at > 0 && process.argv[at + 1]) { mkdirSync(dirname(process.argv[at + 1]!), { recursive: true }); writeFileSync(process.argv[at + 1]!, JSON.stringify(result, null, 2) + '\n'); }
  if (result.hostMedianMs >= 1.5 || result.clientMedianMs >= 1.0) process.exitCode = 1;
} finally { disposeDuel(d); if (replica) disposeDuel(replica); }
