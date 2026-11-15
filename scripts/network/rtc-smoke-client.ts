// Harness composition only. Both bundles use production sector adapters/codecs.
import { createPortLink } from '../../src/network/portLink';
import { browserPortEndpoint } from '../../src/network/transport/bridge';
import { classifyStreamPacket, decodeControl, decodeState, decodeStatePacket, encodeOpaquePacket, ImageStore, inspectState } from '../../src/network/state/imageCodec';
import type { MessagePortMain } from 'electron';
import { createSectorRemoteClient, imageToPublication } from '../../src/network/modes/sectorStream';
import { translateTick, pauseActions } from '../../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../../src/renderer/src/clientControl/inputFrame';
import { Position } from '../../src/renderer/src/sim/components';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import type { PublishedState } from '../../src/renderer/src/net/contracts';
import starter from '../../src/renderer/src/sim/ship/starter.json';

const layout = parseShip(starter);
export const init = { runId: 'rtc-runtime', layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash,
  simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 7, playerCount: 2, characters: [0, 1], unlocked: [] };

/** Sacrificial fragmentation probe over the real generic PortLink/RTC bridge. */
export function createProbe(port: MessagePortMain) {
  const link = createPortLink({ postMessage: data => port.postMessage(data), start: () => port.start(), close: () => port.close(),
    onMessage(cb) { const receive = (event: { data: unknown }) => cb(event.data); port.on('message', receive); return () => { port.off('message', receive); }; },
    onClose(cb) { port.on('close', cb); return () => { port.off('close', cb); }; }
  }, 'probe', { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
  return { send: () => link.send('reliable-ordered', encodeOpaquePacket('checkpoint', 'probe', 1, new Uint8Array(40000))), close: link.close };
}

/** Passive authority->hidden MessagePort observation; never sends state/ACK. */
export function createObserver() {
  const images = new ImageStore(), publications = new Map<number, PublishedState>();
  const packets: { kind: string; tick: number; sequence: number; bytes: number; fullBytes: number; at: number }[] = [];
  let maxImageBytes = 0, maxInputBytes = 0, fullReceipts = 0, validatedAcks = 0, refreshes = 0;
  return {
    observe(bytes: Uint8Array, incoming: boolean) {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'input') maxInputBytes = Math.max(maxInputBytes, bytes.length + 40 + metadata.stream.length * 2);
      if (metadata.stream === 'state-control') {
        const control = decodeControl(bytes);
        if (control.kind === 'ack') validatedAcks++;
        else if (control.kind === 'full-received') fullReceipts++;
        else refreshes++;
      }
      if (!incoming || metadata.stream !== 'state' || metadata.class !== 'state') return;
      const payload = decodeStatePacket(bytes), header = inspectState(payload);
      const image = decodeState(payload, images.get(header.baseSequence));
      images.put(image, header.baseSequence ? [header.baseSequence] : []);
      const publication = imageToPublication(image, { resolveLayout: () => layout, contentDigest: init.contentDigest });
      publications.set(image.sequence, publication);
      while (publications.size > 128) publications.delete(publications.keys().next().value!);
      maxImageBytes = Math.max(maxImageBytes, bytes.length + 40 + metadata.stream.length * 2);
      packets.push({ kind: header.kind, tick: image.tick, sequence: image.sequence, bytes: bytes.length,
        fullBytes: header.valueOffset + header.valueCount * 8 + 30, at: performance.now() });
      if (packets.length > 512) packets.shift();
    },
    publication: (sequence: number) => publications.get(sequence),
    stats: () => ({ packets: [...packets], maxImageBytes, maxInputBytes, fullReceipts, validatedAcks, refreshes }),
    dispose() { images.clear(); publications.clear(); packets.length = 0; }
  };
}

function installPage() {
  const target = window as unknown as Window & { rtcSmokeReport(value: unknown): void; rtcSmoke: typeof api };
  const report = (value: unknown) => target.rtcSmokeReport(value);
  window.addEventListener('error', () => report({ kind: 'page-error' }));
  window.addEventListener('unhandledrejection', () => report({ kind: 'page-error' }));
  let client: ReturnType<typeof createSectorRemoteClient> | undefined, link: ReturnType<typeof createPortLink> | undefined;
  let player = 0, producer: ReturnType<typeof setInterval> | undefined, suppressAcks = false, suppressedAcks = 0;
  let controls = { ack: 0, 'full-received': 0, refresh: 0 }, lastSequence = 0, accepted = 0, sawInterpolation = false;
  let closed = false, maxInputBytes = 0;
  const results: unknown[] = [], events: unknown[] = [];
  function state() { const value = client?.state(); if (!value) throw Error('no confirmed state'); return value; }
  function stop() { clearInterval(producer); producer = undefined; }
  function send(moveX = 0, confirmPresses = 0) {
    const value = state(), frames = Array.from({ length: init.playerCount }, () => ({ ...NEUTRAL_FRAME }));
    frames[player] = { ...NEUTRAL_FRAME, moveX, confirmPresses };
    const actions = translateTick(value, client!.ui, frames, value.tick, [player], client!.commandBudget);
    client!.send(actions); return actions;
  }
  const api = {
    status() {
      results.push(...(client?.takeResults() ?? [])); events.push(...(client?.takeEvents() ?? []));
      if (results.length > 128 || events.length > 128) throw Error('harness notification budget');
      const value = client?.state(), publication = client?.publication(), presentation = client?.presentation.sample(performance.now()) ?? [];
      if (publication && publication.publicationSequence !== lastSequence) { accepted++; lastSequence = publication.publicationSequence; }
      if (value && presentation.some(point => point.id === `crew:${player}` && Math.abs(point.x - Position.x[value.crew[player]!]!) > 1e-5)) sawInterpolation = true;
      return { publication, canAllocate: client?.commandStatus(player).canAllocate ?? false, controls, suppressedAcks,
        stream: client?.streamStats(), accepted, sawInterpolation, maxInputBytes, closed, producer: producer !== undefined,
        x: value ? Position.x[value.crew[player]!] : null, presentation, results: [...results], events: [...events] };
    },
    produce(moveX = 0) { stop(); send(moveX); producer = setInterval(() => send(moveX), 1000 / 60); },
    stop,
    primeHeld() { stop(); return send(1).held.find(frame => frame.player === player); },
    pause(paused: boolean) { stop(); const actions = pauseActions(client!.ui, player, state().tick, paused, client!.commandBudget); client!.send(actions); return actions.commands[0]; },
    suppressAcks(value: boolean) { suppressAcks = value; },
    stall() {
      stop(); const value = state(), frames = Array.from({ length: init.playerCount }, () => ({ ...NEUTRAL_FRAME }));
      frames[player] = { ...NEUTRAL_FRAME, moveX: -1, confirmPresses: 1 };
      const actions = translateTick(value, client!.ui, frames, value.tick, [player], client!.commandBudget);
      if (actions.commands.length !== 1 || actions.commands[0]!.command.kind !== 'vote') throw Error('fixture did not translate vote');
      const start = performance.now(); report({ kind: 'stall-start', tick: state().tick, command: actions.commands[0] });
      while (performance.now() - start < 500) { /* actual visible-renderer stall */ }
      client!.send(actions); report({ kind: 'stall-end', milliseconds: performance.now() - start, observedTick: state().tick });
      return actions.commands[0];
    },
    disconnect() { stop(); link?.close('harness-disconnect'); },
    dispose() { stop(); client?.dispose(); link?.close('disposed'); client = undefined; link = undefined; },
    injectPageFailure() { setTimeout(() => { throw Error('injected RTC page failure'); }); }
  };
  target.rtcSmoke = api;
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.kind !== 'rtc-smoke-port' || event.ports.length !== 1) return;
    api.dispose(); player = event.data.player; closed = false;
    const raw = createPortLink(browserPortEndpoint(event.ports[0]!), 'host', { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
    link = raw;
    // Labelled client Link boundary: suppress ONLY validated ACKs, leaving
    // full receipts and refresh requests real and unchanged for eviction proof.
    const observed = { ...raw, send(kind: Parameters<typeof raw.send>[0], bytes: Uint8Array) {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'input') maxInputBytes = Math.max(maxInputBytes, bytes.length + 40 + metadata.stream.length * 2);
      if (metadata.stream === 'state-control') {
        const control = decodeControl(bytes); controls[control.kind]++;
        if (suppressAcks && control.kind === 'ack') { suppressedAcks++; return; }
      }
      raw.send(kind, bytes);
    } };
    controls = { ack: 0, 'full-received': 0, refresh: 0 };
    client = createSectorRemoteClient(observed, [player], { runId: init.runId, resolveLayout: () => layout,
      contentDigest: init.contentDigest, clock: { nowMs: () => performance.now() } });
    raw.onClose(() => { closed = true; stop(); });
    report({ kind: 'subscribed', player, canAllocate: client.commandStatus(player).canAllocate });
  });
}
if (typeof window !== 'undefined') installPage();
