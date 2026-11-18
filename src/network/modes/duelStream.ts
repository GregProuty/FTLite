// The duel's stream publication adapter (engine refactor spec §6), the equivalent of sectorStream: a duel publication
// becomes a Net-3 StateImage (its canonical values, with the rest of the publication as metadata) and back. H-2 adds the
// remote duel client: the mode remote client with the duel codec, 'duel-notification' and the duel stream client, no
// presentation timeline, and one validation per received publication (the stream client's).
import type { Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { createDuelStreamClient, type DuelStreamClient } from '../../renderer/src/clientControl/duelClient';
import { duelCodec, duelPublicationSchema } from '../../renderer/src/net/codec';
import type { ResolveLayout } from '../../renderer/src/authority/rules';
import { validateDuelSnapshot, type DuelSnapshot } from '../../renderer/src/sim/duel/snapshot';
import { DUEL_CREW_MAX } from '../../renderer/src/sim/duel/state';
import { hashF64 } from '../../shared/hash';
import { imageBytes, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, type StateImage } from '../state/imageCodec';
import { createModeStreamBinding } from './streamBinding';
import { createModeRemoteClient } from './remoteClient';

export interface DuelValidationOptions { resolveLayout: ResolveLayout; contentDigest: string }
export type DuelPublication = PublishedState<DuelSnapshot>;
const NOTIFICATION_STREAM = 'duel-notification';

function identity(value: unknown): string {
  const text = JSON.stringify(value);
  return hashF64(Float64Array.from(text, c => c.charCodeAt(0)));
}
function epoch(publication: DuelPublication): string {
  return identity([publication.runId, publication.snapshot.header.layoutId, publication.snapshot.header.layoutHash, publication.controlRevision, publication.phase]);
}
function checkedPublication(value: unknown, options: DuelValidationOptions): DuelPublication {
  const publication = duelPublicationSchema.parse(value) as DuelPublication;
  if (publication.tick !== publication.snapshot.header.tick || publication.hash !== hashF64(Float64Array.from(publication.snapshot.values))) throw Error('duel-state-identity');
  publication.snapshot = validateDuelSnapshot(options.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, options.contentDigest);
  return publication;
}
export function duelPublicationToImage(value: DuelPublication, options: DuelValidationOptions): StateImage {
  const publication = checkedPublication(value, options);
  const image: StateImage = { sequence: publication.publicationSequence, tick: publication.tick, epoch: epoch(publication),
    metadata: new TextEncoder().encode(JSON.stringify({ ...publication, snapshot: { header: publication.snapshot.header } })),
    values: Float64Array.from(publication.snapshot.values) };
  if (image.metadata.length > MAX_METADATA_BYTES || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('duel-image-capacity');
  return image;
}
/** `validate` false only rebuilds the publication and checks the image's identity: the caller validates it once
 *  (the remote client hands it to the stream client, whose validatePublication is the full check). */
export function imageToDuelPublication(image: StateImage, options: DuelValidationOptions, validate = true): DuelPublication {
  if (!(image.metadata instanceof Uint8Array) || image.metadata.length > MAX_METADATA_BYTES || !(image.values instanceof Float64Array)
    || typeof image.epoch !== 'string' || image.epoch.length > 128 || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('duel-image-capacity');
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(image.metadata));
  if (!metadata?.snapshot || Object.keys(metadata.snapshot).length !== 1 || !Object.hasOwn(metadata.snapshot, 'header')) throw Error('duel-image-metadata');
  const value = { ...metadata, snapshot: { header: metadata.snapshot.header, values: Array.from(image.values) } };
  const publication = validate ? checkedPublication(value, options) : value as DuelPublication;
  if (image.sequence !== publication.publicationSequence || image.tick !== publication.tick || image.epoch !== epoch(publication)) throw Error('duel-image-identity');
  return publication;
}

/** The host side of a streamed duel attachment. */
export function createDuelStreamBinding(link: Link, options: DuelValidationOptions & { clock: MonotonicClock; latestPayloadLimit: number }) {
  return createModeStreamBinding<DuelSnapshot>(link, { clock: options.clock, latestPayloadLimit: options.latestPayloadLimit,
    toImage: publication => duelPublicationToImage(publication, options), codec: duelCodec(DUEL_CREW_MAX), notificationStream: NOTIFICATION_STREAM, label: 'duel' });
}

export interface DuelRemoteClientOptions extends DuelValidationOptions { runId: string; clock: MonotonicClock }
/** The client side of a streamed duel attachment (H-2 spec §4): receive-time, remote streaming, no presentation delay. */
export function createDuelRemoteClient(link: Link, owned: readonly number[], options: DuelRemoteClientOptions) {
  let disposed = false;
  const remote = createModeRemoteClient<DuelSnapshot, DuelStreamClient>(link, { clock: options.clock, codec: duelCodec(DUEL_CREW_MAX), notificationStream: NOTIFICATION_STREAM, label: 'duel',
    imageToPublication: image => imageToDuelPublication(image, options, false),
    createClient: clientLink => createDuelStreamClient(clientLink, owned, { runId: options.runId, contentDigest: options.contentDigest, resolveLayout: options.resolveLayout,
      admissionPolicy: 'receive-time', remoteStreaming: true }) });
  return { ...remote.client, streamStats: remote.streamStats, connected: () => !remote.closed(),
    dispose() { if (disposed) return; disposed = true; remote.disconnect(); } };
}
