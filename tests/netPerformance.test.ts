import { it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { makeState } from './helpers/sim';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { encodeMessage, decodeMessage, latestMessageMetadata } from '../src/renderer/src/net/codec';
import type { AuthorityMessage } from '../src/renderer/src/net/contracts';
it('profiles the complete copied publication path without bypassing bytes', () => {
  const state = makeState(4), message: AuthorityMessage = { kind: 'state', state: { runId: 'profile', tick: 0, publicationSequence: 1, snapshot: saveSnapshot(state), hash: hashState(state), phase: 'running', pauseOwner: null, controlRevision: 0, commandHighWater: [0, 0, 0, 0], eventSequence: 0 } };
  const bytes = encodeMessage(message), times: Record<string, number> = {};
  for (const [name, operation] of Object.entries({ snapshot: () => saveSnapshot(state), hash: () => hashState(state), encode: () => encodeMessage(message), metadata: () => latestMessageMetadata(bytes), decode: () => decodeMessage(bytes) })) {
    const start = performance.now(); for (let i = 0; i < 500; i++) operation(); times[name] = performance.now() - start;
  }
  console.log('publication profile / 500:', times);
});
