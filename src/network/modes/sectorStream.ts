import type { AttachOptions } from '../../renderer/src/authority/authority';
import { createClientRun } from '../../renderer/src/clientControl/clientRun';
import type { AuthorityMessage, ChannelKind, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { decodeMessage, encodeMessage, validatePublication, MAX_MESSAGE_BYTES } from '../../renderer/src/net/codec';
import { validateSnapshot } from '../../renderer/src/sim/snapshot';
import type { ShipLayout } from '../../renderer/src/sim/ship/schema';
import { Life, Position, Seated, Stable } from '../../renderer/src/sim/components';
import { CREW_SPEED, TICK_HZ } from '../../renderer/src/sim/tuning';
import { speedMult } from '../../renderer/src/sim/characters';
import { hashF64 } from '../../shared/hash';
import { classifyStreamPacket, createTransportSequence, decodeOpaquePacket, decodeStatePacket, inspectState, encodeOpaquePacket, imageBytes, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, type StateImage } from '../state/imageCodec';
import { createStateSender } from '../state/sender';
import { createStateReceiver } from '../state/receiver';
import { createPresentationTimeline, type PresentationPoint, type PresentationTimelineOptions } from '../state/timeline';

export interface SectorValidationOptions { resolveLayout(id: string): ShipLayout; contentDigest?: string }
type Notification = Extract<AuthorityMessage, { kind: 'result' | 'event' }>;
const NOTIFICATION_STREAM = 'sector-notification';
function identity(value: unknown): string {
  const text = JSON.stringify(value);
  return hashF64(Float64Array.from(text, c => c.charCodeAt(0)));
}
function epoch(publication: PublishedState): string {
  return identity([publication.runId, publication.snapshot.header.layoutId, publication.snapshot.header.layoutHash, publication.controlRevision, publication.phase]);
}
function checkedPublication(value: unknown, options: SectorValidationOptions): PublishedState {
  const publication: PublishedState = validatePublication(value);
  if (publication.tick !== publication.snapshot.header.tick || publication.hash !== hashF64(Float64Array.from(publication.snapshot.values))) throw Error('sector-state-identity');
  publication.snapshot = validateSnapshot(options.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, options.contentDigest);
  return publication;
}
/** No local byte-codec roundtrip: numeric canonical values go directly into the image. */
export function publicationToImage(value: PublishedState, options: SectorValidationOptions): StateImage {
  const publication = checkedPublication(value, options);
  const image: StateImage = { sequence: publication.publicationSequence, tick: publication.tick, epoch: epoch(publication),
    metadata: new TextEncoder().encode(JSON.stringify({ ...publication, snapshot: { header: publication.snapshot.header } })),
    values: Float64Array.from(publication.snapshot.values) };
  if (image.metadata.length > MAX_METADATA_BYTES || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('sector-image-capacity');
  return image;
}
export function imageToPublication(image: StateImage, options: SectorValidationOptions): PublishedState {
  if (!(image.metadata instanceof Uint8Array) || image.metadata.length > MAX_METADATA_BYTES || !(image.values instanceof Float64Array)
    || typeof image.epoch !== 'string' || image.epoch.length > 128 || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('sector-image-capacity');
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(image.metadata));
  if (!metadata?.snapshot || Object.keys(metadata.snapshot).length !== 1 || !Object.hasOwn(metadata.snapshot, 'header')) throw Error('sector-image-metadata');
  const publication = checkedPublication({ ...metadata, snapshot: { header: metadata.snapshot.header, values: Array.from(image.values) } }, options);
  if (image.sequence !== publication.publicationSequence || image.tick !== publication.tick || image.epoch !== epoch(publication)) throw Error('sector-image-identity');
  return publication;
}

/** Mode-owned envelope preserves the original reliable codec bytes verbatim. */
export function encodeSectorNotification(message: Notification, requiredPublicationSequence: number, transportSequence: number): Uint8Array {
  if (!Number.isSafeInteger(requiredPublicationSequence) || requiredPublicationSequence < 0) throw Error('sector-notification-floor');
  const payload = encodeMessage(message), body = new Uint8Array(9 + payload.length);
  body[0] = 1; new DataView(body.buffer).setFloat64(1, requiredPublicationSequence, true); body.set(payload, 9);
  return encodeOpaquePacket('state', NOTIFICATION_STREAM, transportSequence, body);
}
function decodeNotification(packet: Uint8Array): { message: Notification; floor: number } {
  const { bytes, class: payloadClass, stream } = decodeOpaquePacket(packet);
  if (payloadClass !== 'state' || stream !== NOTIFICATION_STREAM || bytes.length <= 9 || bytes.length > 9 + MAX_MESSAGE_BYTES || bytes[0] !== 1) throw Error('sector-notification');
  const floor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(1, true), message = decodeMessage(bytes.subarray(9));
  if (!Number.isSafeInteger(floor) || floor < 0 || message.kind !== 'result' && message.kind !== 'event') throw Error('sector-notification');
  return { message, floor };
}
function inputIdentity(bytes: Uint8Array): { stream: string; channel: ChannelKind } {
  const message = decodeMessage(bytes);
  if (message.kind === 'held') return { stream: `held:${message.frame.player}`, channel: 'unreliable-latest' };
  if (message.kind === 'command' || message.kind === 'callout') return { stream: message.kind, channel: 'reliable-ordered' };
  throw Error('sector-input-direction');
}

/** Trusted authority attachment. It owns stream controls, while the authority owns gameplay ingress. */
export function createSectorStreamBinding(link: Link, options: SectorValidationOptions & { clock: MonotonicClock; latestPayloadLimit: number }) {
  const nextTransportSequence = createTransportSequence(), messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>();
  let closed = false;
  const removers: (() => void)[] = [];
  const sender = createStateSender({ clock: options.clock, latestPayloadLimit: options.latestPayloadLimit, nextTransportSequence,
    send: (kind, bytes) => { if (!closed) link.send(kind, bytes); }, close: reason => link.close(reason) });
  function dispose(): void { if (closed) return; closed = true; sender.dispose(); messages.clear(); for (const off of removers.splice(0)) { try { off(); } catch { /* release all subscriptions */ } } }
  const offClose = link.onClose(dispose);
  if (closed) offClose(); else removers.push(offClose);
  if (!closed) removers.push(link.onMessage((kind, bytes) => {
    if (closed) return;
    try {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'control' && metadata.stream === 'state-control') {
        if (kind !== 'reliable-ordered') throw Error('sector-control-channel');
        sender.receiveControl(bytes); return;
      }
      if (metadata.class !== 'input') throw Error('sector-input-direction');
      const payload = decodeOpaquePacket(bytes), expected = inputIdentity(payload.bytes);
      if (payload.stream !== expected.stream || kind !== expected.channel) throw Error('sector-input-channel');
      for (const receive of [...messages]) { if (closed) break; receive(kind, payload.bytes); }
    } catch { link.close('sector-stream-invalid'); }
  }));
  const authorityLink: Link = { peer: link.peer, caps: link.caps, stats: () => link.stats(), close: reason => link.close(reason),
    onClose: cb => link.onClose(cb), onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    send() { throw Error('sector-stream-missing-sink'); } };
  const attachOptions: AttachOptions = {
    publicationSink(publication, reliable) {
      if (closed) return;
      try { sender.publish(publicationToImage(publication, options), reliable); } catch { link.close('sector-stream-invalid'); }
    },
    notificationSink(message, floor) {
      if (closed) return;
      try { link.send('reliable-ordered', encodeSectorNotification(message, floor, nextTransportSequence())); } catch { link.close('sector-stream-invalid'); }
    }
  };
  return { link: authorityLink, attachOptions, dispose, stats: sender.stats };
}

export interface SectorRemoteClientOptions extends SectorValidationOptions {
  runId: string; clock: MonotonicClock; presentation?: PresentationTimelineOptions;
}
export function createSectorRemoteClient(link: Link, owned: readonly number[], options: SectorRemoteClientOptions) {
  const nextTransportSequence = createTransportSequence(), presentation = createPresentationTimeline(options.presentation);
  let closed = false, disposed = false;
  const removers: (() => void)[] = [];
  const clientLink: Link = { peer: link.peer, caps: link.caps, stats: () => link.stats(), close: reason => link.close(reason),
    onClose: cb => link.onClose(cb), onMessage: () => () => {},
    send(kind, bytes) {
      if (closed) return;
      try { const expected = inputIdentity(bytes); if (kind !== expected.channel) throw Error('sector-input-channel');
        link.send(kind, encodeOpaquePacket('input', expected.stream, nextTransportSequence(), bytes));
      } catch { link.close('sector-stream-invalid'); }
    }
  };
  const client = createClientRun(clientLink, owned, { ...options, admissionPolicy: 'receive-time', remoteStreaming: true });
  let previous: { tick: number; points: PresentationPoint[] } | undefined;
  const generations = new Map<string, number>();
  function present(publication: PublishedState): void {
    const state = client.state(); if (!state || closed) return;
    const targets = identity([state.weapons.target, state.science.target]);
    const points = state.crew.map((eid, player): PresentationPoint => {
      const id = `crew:${player}`, x = Position.x[eid]!, y = Position.y[eid]!, prior = previous?.points.find(point => point.id === id);
      const maxDistance = previous ? CREW_SPEED * speedMult(state, player) * Math.max(0, state.tick - previous.tick) / TICK_HZ + 1e-6 : Infinity;
      if (prior && Math.hypot(x - prior.x, y - prior.y) > maxDistance) generations.set(id, (generations.get(id) ?? 0) + 1);
      return { id, x, y, generation: `${Stable.id[eid]}:${Seated.station[eid]}:${Life.state[eid]}:${targets}:${generations.get(id) ?? 0}` };
    });
    presentation.push({ tick: state.tick, epoch: identity([epoch(publication), state.run.sector, state.run.node, state.run.arrivalTick]), paused: publication.phase !== 'running', points }, options.clock.nowMs());
    previous = { tick: state.tick, points };
  }
  const receiver = createStateReceiver({ clock: options.clock, nextTransportSequence,
    accept(image) {
      if (closed) return 'ignored';
      let publication: PublishedState;
      try { publication = imageToPublication(image, options); } catch { return 'rejected'; }
      const result = client.acceptPublication(publication);
      if (result === 'accepted' && !closed) present(publication);
      return result;
    },
    sendControl(bytes) {
      if (closed) return false;
      try { link.send('reliable-ordered', bytes); return !closed; } catch { link.close('sector-stream-invalid'); return false; }
    },
    onAcknowledged(image) { if (!closed) client.acknowledgePublication(image.sequence); },
    close: reason => link.close(reason)
  });
  function disconnect(): void {
    if (closed) return; closed = true; receiver.dispose(); client.dispose(); presentation.disconnect(); previous = undefined; generations.clear();
    for (const off of removers.splice(0)) { try { off(); } catch { /* release all subscriptions */ } }
  }
  const offClose = link.onClose(disconnect);
  if (closed) offClose(); else removers.push(offClose);
  if (!closed) removers.push(link.onMessage((kind, bytes) => {
    if (closed) return;
    try {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'state' && metadata.stream === 'state') {
        const header = inspectState(decodeStatePacket(bytes));
        if (kind !== (header.kind === 'full' ? 'reliable-ordered' : 'unreliable-latest')) throw Error('sector-state-channel');
        receiver.receive(bytes); return;
      }
      if (kind !== 'reliable-ordered') throw Error('sector-notification-channel');
      const { message, floor } = decodeNotification(bytes); client.acceptNotification(message, floor);
    } catch { link.close('sector-stream-invalid'); }
  }));
  return { ...client, presentation, streamStats: receiver.stats,
    dispose() { if (disposed) return; disposed = true; disconnect(); presentation.dispose(); }
  };
}
