import { createAuthority, type Checkpoint } from '../../src/renderer/src/authority/authority';
import { LAYOUT } from './sim';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { createLoopbackHarness } from '../../src/renderer/src/net/loopback';
import { encodeMessage, decodeMessage } from '../../src/renderer/src/net/codec';
import type { AuthorityMessage, ClientMessage } from '../../src/renderer/src/net/contracts';
import { ownTestCleanup } from './simLifetime';
export function checkpointRig(playerCount = 1) {
  let now = 0;
  const init = { runId: 'durable', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 7, playerCount, characters: [0], unlocked: [], quirk: 0 };
  const authority = createAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, onCrash: r => { throw Error(r.error); } });
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: init.contentDigest });
  let pair = transport.connectLocal(); const output: AuthorityMessage[] = [];
  const observe = () => pair.clientLink.onMessage((_, bytes) => output.push(decodeMessage(bytes) as AuthorityMessage));
  observe();
  let detach = authority.attach(pair.authorityLink, [0]); authority.start(init); transport.drain();
  ownTestCleanup(() => { authority.dispose(); pair.host.close('done'); pair.client.close('done'); });
  return { authority, init, output, get pair() { return pair; }, transport, detach() { detach(); },
    restore(checkpoint: Checkpoint) {
      detach(); pair.host.close('restore'); pair.client.close('restore');
      authority.restore(checkpoint);
      pair = transport.connectLocal(); observe(); detach = authority.attach(pair.authorityLink, [0]); transport.drain();
    },
    send(message: ClientMessage) { pair.clientLink.send('reliable-ordered', encodeMessage(message)); transport.drain(); }, pump(time = now) { now = time; authority.pump(); transport.drain(); }, drain() { transport.drain(); } };
}
