import { createClientRun } from '../../renderer/src/clientControl/clientRun';
import type { AuthorityMessage, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { validatePublication, createMessageCodec } from '../../renderer/src/net/codec';
import { validateSnapshot } from '../../renderer/src/sim/snapshot';
import type { ShipLayout } from '../../renderer/src/sim/ship/schema';
import { Life, Position, Seated, Stable } from '../../renderer/src/sim/components';
import { CREW_SPEED, TICK_HZ } from '../../renderer/src/sim/tuning';
import { speedMult } from '../../renderer/src/sim/characters';
import { hashF64 } from '../../shared/hash';
import { imageBytes, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, type StateImage } from '../state/imageCodec';
import { createModeStreamBinding, encodeModeNotification } from './streamBinding';
import { createModeRemoteClient } from './remoteClient';
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

/** Trusted authority attachment. It owns stream controls, while the authority owns gameplay ingress. */
export function createSectorStreamBinding(link: Link, options: SectorValidationOptions & { clock: MonotonicClock; latestPayloadLimit: number }) {
  return createModeStreamBinding(link, { clock: options.clock, latestPayloadLimit: options.latestPayloadLimit,
    toImage: publication => publicationToImage(publication, options), codec, notificationStream: NOTIFICATION_STREAM, label: 'sector' });
}

export interface SectorRemoteClientOptions extends SectorValidationOptions {
  runId: string; clock: MonotonicClock; presentation?: PresentationTimelineOptions;
}
/** The sector's remote client (H-2 spec §4): the mode remote client with the sector codec, its notification stream, the
 *  sector client run and its presentation points on the 100 ms timeline. Unchanged in behaviour, bytes and timing. */
export function createSectorRemoteClient(link: Link, owned: readonly number[], options: SectorRemoteClientOptions) {
  const presentation = createPresentationTimeline(options.presentation);
  let disposed = false, connected = true;
  let previous: { tick: number; points: PresentationPoint[] } | undefined;
  const generations = new Map<string, number>();
  let client!: ReturnType<typeof createClientRun>;
  function present(publication: PublishedState): void {
    const state = client.state(); if (!state || !connected) return;
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
  const remote = createModeRemoteClient<import('../../renderer/src/sim/snapshot').Snapshot, ReturnType<typeof createClientRun>>(link, {
    clock: options.clock, codec, notificationStream: NOTIFICATION_STREAM, label: 'sector',
    imageToPublication: image => imageToPublication(image, options),
    createClient: clientLink => (client = createClientRun(clientLink, owned, { ...options, admissionPolicy: 'receive-time', remoteStreaming: true })),
    onAccepted: present,
    onDisconnect() { connected = false; presentation.disconnect(); previous = undefined; generations.clear(); }
  });
  return { ...remote.client, presentation, streamStats: remote.streamStats,
    dispose() { if (disposed) return; disposed = true; remote.disconnect(); presentation.dispose(); }
  };
}
