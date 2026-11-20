// TEST ONLY: injected by the duel application gate (H-2 spec §10), never imported by product. Passive copies of the
// renderer's port traffic: every received duel state image is decoded to the values the gate reads (the round, its
// outcome, the crew ship's speed, the laser shots, presence, the phase and the hash), every sent input is listed, and
// results are kept. No client, ACK, command or producer of its own.
import { classifyStreamPacket, decodeControl, decodeOpaquePacket, decodeState, decodeStatePacket, ImageStore, inspectState } from '../../src/network/state/imageCodec';
import { imageToDuelPublication } from '../../src/network/modes/duelStream';
import { duelCodec } from '../../src/renderer/src/net/codec';
import { duelRoundOf } from '../../src/renderer/src/sim/duel/snapshot';
import { TACTICAL_MODULES, tacticalLength } from '../../src/renderer/src/sim/tactical/hash';
import { createTacticalState } from '../../src/renderer/src/sim/tactical/state';

import { DUEL_LAYOUT } from '../../src/renderer/src/sim/duel/layout';
import { DUEL_CREW_MAX } from '../../src/renderer/src/sim/duel/state';
const layout = DUEL_LAYOUT, codec = duelCodec(DUEL_CREW_MAX);   // the wire's player limit (Sci-2 spec §4.3)
const offsets = new Map<number, { at: Map<string, number>; presence: number }>();
function named(seed: number) {
  let o = offsets.get(seed);
  if (!o) {
    const shape = createTacticalState(seed), at = new Map<string, number>(); let k = 1;
    for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) { at.set(f.name, k); k += f.count; }
    o = { at, presence: 1 + tacticalLength(shape) }; offsets.set(seed, o);
  }
  return o;
}
const sessions: any[] = [];
const target = window as any;
target.onlineAppKeys = [];
for (const type of ['keydown', 'keyup', 'focus', 'blur']) window.addEventListener(type, (event: any) => {
  target.onlineAppKeys.push({ type, code: event.code, key: event.key, target: event.target?.tagName, hidden: document.hidden, focused: document.hasFocus() });
  if (target.onlineAppKeys.length > 32) target.onlineAppKeys.shift();
});
// Web-i (deviation D-1): the page dispatches each game port to this test event before the game's own listener receives it.
window.addEventListener('ftlite:online:test-port', (event: Event) => {
  const { descriptor, port } = (event as CustomEvent<{ descriptor: unknown; port: MessagePort }>).detail;
  const images = new ImageStore();
  const record: any = { descriptor, publications: [], inputs: [], results: [], acks: 0, fullReceipts: 0,
    firstAckOrder: 0, firstInputOrder: 0, closed: false, errors: 0, order: 0 };
  sessions.push(record);
  function observe(data: any, incoming: boolean) {
    try {
      if (data?.type === 'close') { record.closed = true; return; }
      if (data?.type !== 'data') return;
      const bytes = new Uint8Array(data.bytes), metadata = classifyStreamPacket(bytes); record.order++;
      if (metadata.stream === 'state-control') {
        const control = decodeControl(bytes);
        if (control.kind === 'ack') { record.acks++; record.firstAckOrder ||= record.order; }
        if (control.kind === 'full-received') record.fullReceipts++;
      } else if (incoming && metadata.stream === 'state') {
        const payload = decodeStatePacket(bytes), header = inspectState(payload), image = decodeState(payload, images.get(header.baseSequence));
        images.put(image, header.baseSequence ? [header.baseSequence] : []);
        const p = imageToDuelPublication(image, { resolveLayout: () => layout, contentDigest: '' }, false), v = p.snapshot.values, n = named(p.snapshot.header.seed);
        const round = duelRoundOf(p.snapshot), vx = v[n.at.get('ships.0.vx')!]!, vy = v[n.at.get('ships.0.vy')!]!;
        const wp = n.at.get('systems.0.weaponPower')!;
        record.publications.push({ runId: p.runId, tick: p.tick, sequence: p.publicationSequence, hash: p.hash, phase: p.phase, pauseReason: p.pauseReason,
          round: round.round, outcome: round.outcome, helmPlayer: round.helmPlayer, seed: p.snapshot.header.seed, speed: Math.sqrt(vx * vx + vy * vy),
          shots: v[n.at.get('systems.0.shots')!]!, pewShots: v[n.at.get('systems.0.pewShots')!]!, gunShots: v[n.at.get('systems.0.gunShots')!]!, launches: v[n.at.get('systems.0.missilesLaunched')!]!, weaponPower: [0, 1, 2].map((k) => v[wp + k]!), present: [v[n.presence]!, v[n.presence + 1]!], heldHighWater: p.heldHighWater, commandHighWater: p.commandHighWater });
        if (record.publications.length > 256) record.publications.shift();
      } else if (!incoming && metadata.class === 'input') {
        const message: any = codec.decodeMessage(decodeOpaquePacket(bytes).bytes);
        record.firstInputOrder ||= record.order;
        record.inputs.push({ kind: message.kind, player: message.frame?.player ?? message.envelope?.id.player ?? message.player,
          sequence: message.frame?.sequence ?? message.envelope?.id.sequence ?? message.sequence,
          held: message.frame?.held, command: message.envelope?.command.kind, present: message.envelope?.command.present, reliable: data.kind === 'reliable-ordered', order: record.order });
        if (record.inputs.length > 512) record.inputs.shift();
      } else if (incoming && metadata.stream === 'duel-notification') {
        const message: any = codec.decodeMessage(decodeOpaquePacket(bytes).bytes.subarray(9));
        if (message.kind === 'result') { record.results.push(message.result); if (record.results.length > 128) record.results.shift(); }
      }
    } catch { record.errors++; }
  }
  const post = port.postMessage.bind(port), close = port.close.bind(port);
  port.postMessage = ((data: unknown, ...args: any[]) => { observe(data, false); return (post as any)(data, ...args); }) as any;
  port.close = () => { record.closed = true; port.removeEventListener('message', receive); images.clear(); close(); };
  const receive = (message: MessageEvent) => observe(message.data, true);
  port.addEventListener('message', receive);
});
target.onlineAppObservation = () => structuredClone(sessions);
