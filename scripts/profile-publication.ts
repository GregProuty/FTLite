// Explicit diagnostic only: npx tsx scripts/profile-publication.ts
import { performance } from 'node:perf_hooks';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { RECRUIT } from '../src/renderer/src/sim/characters';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { encodeMessage, decodeMessage, latestMessageMetadata } from '../src/renderer/src/net/codec';
import type { AuthorityMessage } from '../src/renderer/src/net/contracts';

// Match the original four-Recruit, seed-1 profiling fixture without test helpers.
const state = createSimState(parseShip(starter), 4, 1, [RECRUIT, RECRUIT, RECRUIT, RECRUIT]);
const message: AuthorityMessage = {
  kind: 'state',
  state: {
    runId: 'profile', tick: 0, publicationSequence: 1,
    snapshot: saveSnapshot(state), hash: hashState(state), phase: 'running',
    pauseOwner: null, controlRevision: 0, commandHighWater: [0, 0, 0, 0], eventSequence: 0
  }
};
const bytes = encodeMessage(message);
const times: Record<string, number> = {};
const operations = {
  snapshot: () => saveSnapshot(state),
  hash: () => hashState(state),
  encode: () => encodeMessage(message),
  metadata: () => latestMessageMetadata(bytes),
  decode: () => decodeMessage(bytes)
};
for (const [name, operation] of Object.entries(operations)) {
  const start = performance.now();
  for (let i = 0; i < 500; i++) operation();
  times[name] = performance.now() - start;
}
console.log('publication profile / 500 (milliseconds):', times);
