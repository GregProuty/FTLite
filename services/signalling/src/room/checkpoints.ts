import { isRoomId, parseBoundedJson, validateCheckpointMetadata, type LeaseGrant, type SessionCheckpointMetadata } from '../../../../src/shared/roomSession';
import { tokenHash } from '../crypto';
import { failure } from '../errors';
import { bearerToken, readBoundedBody } from '../http';
import { RoomStore, compatibilityKey } from './store';
import { RoomAuth } from './auth';
import { RoomLifecycle, bytesHash } from './lifecycle';
import type { ConnectionRow } from './sockets';

export function checkpointHeader(metadata: SessionCheckpointMetadata): string {
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function parseMetadata(header: string | null): SessionCheckpointMetadata {
  if (!header) failure('invalid-request');
  if (new TextEncoder().encode(header).byteLength > 4096) failure('too-large');
  if (!/^[A-Za-z0-9_-]+$/.test(header)) failure('invalid-request');
  let value: unknown;
  try { value = parseBoundedJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(header.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))), 4096); }
  catch { return failure('invalid-request'); }
  if (!validateCheckpointMetadata(value)) failure('invalid-request');
  return value;
}
type StoredCheckpoint = { metadata: string; payload: ArrayBuffer };
/** In-flight requests pin the DO instance. Only two bounded readers can exist; there is no body queue. */
export class RoomCheckpoints {
  private inflight = 0;
  constructor(readonly store: RoomStore, readonly auth: RoomAuth, readonly lifecycle: RoomLifecycle) {}
  private authorize(connection: ConnectionRow, metadata: SessionCheckpointMetadata, observed?: LeaseGrant): LeaseGrant {
    const lease = this.lifecycle.leased(connection), m = this.store.requireConfirmed();
    if (metadata.hostGeneration !== m.host_generation) failure('stale-generation');
    if (metadata.roomId !== m.room_id || metadata.runId !== m.run_id || compatibilityKey(metadata.compatibility) !== compatibilityKey(JSON.parse(m.compatibility))) failure('incompatible');
    if (observed && (observed.nonce !== lease.nonce || observed.hostGeneration !== lease.hostGeneration || observed.expiresAtEpochMs <= Date.now())) failure('lease-expired');
    return lease;
  }
  async fetch(request: Request): Promise<Response> {
    const token = bearerToken(request)!;
    const metadata = request.method === 'PUT' ? parseMetadata(request.headers.get('X-FTL-Checkpoint')) : undefined;
    const hash = await tokenHash(token);
    this.store.expire();
    const seat = this.auth.authenticateHash(hash);
    if (request.method === 'GET') {
      const saved = this.store.sql.exec<StoredCheckpoint>('SELECT metadata, payload FROM room_checkpoint').toArray()[0] ?? failure('no-checkpoint');
      return new Response(saved.payload, { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/octet-stream', 'X-FTL-Checkpoint': checkpointHeader(JSON.parse(saved.metadata)) } });
    }
    if (request.headers.get('Content-Type') !== 'application/octet-stream') failure('invalid-request');
    const id = request.headers.get('X-FTL-Connection'), generation = request.headers.get('X-FTL-Seat-Generation');
    if (!isRoomId(id) || !generation || !/^[1-9][0-9]*$/.test(generation) || !Number.isSafeInteger(Number(generation))) failure('invalid-request');
    if (seat.generation !== Number(generation)) failure('stale-generation');
    if (seat.connection_id !== id) failure('stale-connection');
    const connection = this.lifecycle.sockets.byConnection(id) ?? failure('stale-connection');
    const lease = this.authorize(connection, metadata!);
    if (this.inflight >= 2) failure('capacity');
    this.inflight++;
    try {
      const bytes = await readBoundedBody(request, 262144);
      this.authorize(connection, metadata!, lease);
      const digest = await bytesHash(bytes);
      this.store.transaction(() => {
        this.authorize(connection, metadata!, lease);
        if (digest !== metadata!.payloadSha256) failure('hash-mismatch');
        const old = this.store.sql.exec<StoredCheckpoint>('SELECT metadata, payload FROM room_checkpoint').toArray()[0];
        if (old) {
          const previous = JSON.parse(old.metadata) as SessionCheckpointMetadata;
          if (previous.hostGeneration > metadata!.hostGeneration || (previous.hostGeneration === metadata!.hostGeneration && previous.checkpointSequence > metadata!.checkpointSequence)) failure('conflict');
          if (previous.hostGeneration === metadata!.hostGeneration && previous.checkpointSequence === metadata!.checkpointSequence) {
            const oldBytes = new Uint8Array(old.payload);
            if (previous.capturedTick !== metadata!.capturedTick || previous.payloadSha256 !== digest || oldBytes.byteLength !== bytes.byteLength || oldBytes.some((b, i) => b !== bytes[i])) failure('conflict');
            return;
          }
        }
        this.store.sql.exec('INSERT OR REPLACE INTO room_checkpoint VALUES (1, ?, ?)', JSON.stringify(metadata), bytes);
      });
      this.lifecycle.sockets.broadcast({ type: 'checkpoint-status', metadata: metadata! });
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    } finally { this.inflight--; }
  }
}
