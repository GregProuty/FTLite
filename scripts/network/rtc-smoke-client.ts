import type { MessagePortMain } from 'electron';
import { createPortLink } from '../../src/network/portLink';
import { classifyStreamPacket } from '../../src/network/state/imageCodec';
import { createSectorRemoteClient } from '../../src/network/modes/sectorStream';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import starter from '../../src/renderer/src/sim/ship/starter.json';

const layout = parseShip(starter);
export const init = { runId: 'rtc-owner-smoke', layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash,
  simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 7, playerCount: 1, characters: [0], unlocked: [] };
export function createClient(port: MessagePortMain) {
  const link = createPortLink({ postMessage: value => port.postMessage(value), start: () => port.start(), close: () => port.close(),
    onMessage(callback) { const receive = (event: { data: unknown }) => callback(event.data); port.on('message', receive); return () => { port.off('message', receive); }; },
    onClose(callback) { port.on('close', callback); return () => { port.off('close', callback); }; }
  }, 'host', { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
  const client = createSectorRemoteClient(link, [0], { runId: init.runId, resolveLayout: () => layout, contentDigest: init.contentDigest, clock: { nowMs: () => performance.now() } });
  return { client, link };
}
