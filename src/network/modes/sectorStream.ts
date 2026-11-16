import { createClientRun } from '../../renderer/src/clientControl/clientRun';
import type { AuthorityMessage, ChannelKind, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { decodeMessage, validatePublication, MAX_MESSAGE_BYTES, createMessageCodec } from '../../renderer/src/net/codec';
import { validateSnapshot } from '../../renderer/src/sim/snapshot';
import type { ShipLayout } from '../../renderer/src/sim/ship/schema';
import { Life, Position, Seated, Stable } from '../../renderer/src/sim/components';
import { CREW_SPEED, TICK_HZ } from '../../renderer/src/sim/tuning';
import { speedMult } from '../../renderer/src/sim/characters';
import { hashF64 } from '../../shared/hash';
import { classifyStreamPacket, createTransportSequence, decodeOpaquePacket, decodeStatePacket, inspectState, encodeOpaquePacket, imageBytes, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, type StateImage } from '../state/imageCodec';
import { createStateReceiver } from '../state/receiver';
import { createModeStreamBinding, encodeModeNotification, modeInputIdentity } from './streamBinding';
import { createPresentationTimeline, type PresentationPoint, type PresentationTimelineOptions } from '../state/timeline';

export interface SectorValidationOptions { resolveLayout(id: string): ShipLayout; contentDigest?: string }
type Notification = Extract<AuthorityMessage, { kind: 'result' | 'event' }>;
const NOTIFICATION_STREAM = 'sector-notification';
const codec = createMessageCodec();
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
  return encodeModeNotification(codec, NOTIFICATION_STREAM, 'sector', message, requiredPublicationSequence, transportSequence);
}
function decodeNotification(packet: Uint8Array): { message: Notification; floor: number } {
  const { bytes, class: payloadClass, stream } = decodeOpaquePacket(packet);
  if (payloadClass !== 'state' || stream !== NOTIFICATION_STREAM || bytes.length <= 9 || bytes.length > 9 + MAX_MESSAGE_BYTES || bytes[0] !== 1) throw Error('sector-notification');
  const floor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(1, true), message = decodeMessage(bytes.subarray(9));
  if (!Number.isSafeInteger(floor) || floor < 0 || message.kind !== 'result' && message.kind !== 'event') throw Error('sector-notification');
  return { message, floor };
}
function inputIdentity(bytes: Uint8Array, channel: ChannelKind): { stream: string; channel: ChannelKind } {
  return modeInputIdentity(codec, 'sector', bytes, channel);
}

/** Trusted authority attachment. It owns stream controls, while the authority owns gameplay ingress. */
export function createSectorStreamBinding(link: Link, options: SectorValidationOptions & { clock: MonotonicClock; latestPayloadLimit: number }) {
  return createModeStreamBinding(link, { clock: options.clock, latestPayloadLimit: options.latestPayloadLimit,
    toImage: publication => publicationToImage(publication, options), codec, notificationStream: NOTIFICATION_STREAM, label: 'sector' });
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
      try { const expected = inputIdentity(bytes, kind); if (kind !== expected.channel) throw Error('sector-input-channel');
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
