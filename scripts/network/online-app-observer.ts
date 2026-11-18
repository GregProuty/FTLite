// TEST ONLY: injected by the isolated application gate, never imported by product.
// Passive port copies: no alternate client, ACK, command, coordinator or producer.
import { classifyStreamPacket, decodeControl, decodeOpaquePacket, decodeState, decodeStatePacket, ImageStore, inspectState } from '../../src/network/state/imageCodec';
import { imageToPublication } from '../../src/network/modes/sectorStream';
import { decodeMessage } from '../../src/renderer/src/net/codec';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import hound from '../../src/renderer/src/sim/ship/hound.json';
const layouts = [parseShip(skiff), parseShip(cutter), parseShip(hound)];
const sessions: any[] = [];
const target = window as any;
target.onlineAppKeys = [];
for (const type of ['keydown','keyup','focus','blur']) window.addEventListener(type, (event: any) => {
  target.onlineAppKeys.push({type,code:event.code,key:event.key,target:event.target?.tagName,hidden:document.hidden,focused:document.hasFocus()});
  if(target.onlineAppKeys.length>32) target.onlineAppKeys.shift();
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
        const publication = imageToPublication(image, { resolveLayout: id => { const layout = layouts.find(l => l.id === id); if (!layout) throw Error('layout'); return layout; } });
        record.publications.push({ runId: publication.runId, tick: publication.tick, sequence: publication.publicationSequence, hash: publication.hash,
          phase: publication.phase, layout: publication.snapshot.header.layoutId, playerCount: publication.snapshot.header.playerCount,
          commandHighWater: publication.commandHighWater, heldHighWater: publication.heldHighWater });
        if (record.publications.length > 256) record.publications.shift();
      } else if (!incoming && metadata.class === 'input') {
        const message: any = decodeMessage(decodeOpaquePacket(bytes).bytes);
        record.firstInputOrder ||= record.order;
        record.inputs.push({ kind: message.kind, player: message.frame?.player ?? message.envelope?.id.player ?? message.player,
          sequence: message.frame?.sequence ?? message.envelope?.id.sequence ?? message.sequence,
          held: message.frame?.held, command: message.envelope?.command.kind, reliable: data.kind === 'reliable-ordered', order: record.order });
        if (record.inputs.length > 512) record.inputs.shift();
      } else if (incoming && metadata.stream === 'sector-notification') {
        const message: any = decodeMessage(decodeOpaquePacket(bytes).bytes.subarray(9));
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
