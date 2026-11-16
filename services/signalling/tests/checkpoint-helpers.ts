import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import worker from '../src/index';
import { stub } from './socket-helpers';
import type { SeatSession, SessionCheckpointMetadata } from '../../../src/shared/roomSession';
export async function hashBytes(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''); }
export const header = (metadata: SessionCheckpointMetadata) => btoa(JSON.stringify(metadata)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export async function checkpointRequest(host: SeatSession, bytes = new Uint8Array([1, 2, 3]), overrides: Partial<SessionCheckpointMetadata> = {}) {
  const connection = await runInDurableObject(stub(host), room => room.store.seat(host.seatId)!.connection_id!);
  const metadata: SessionCheckpointMetadata = { version: 1, protocolVersion: 2, roomId: host.snapshot.roomId, compatibility: host.snapshot.compatibility,
    runId: host.snapshot.runId, hostGeneration: 1, checkpointSequence: 1, capturedTick: 100, payloadSha256: await hashBytes(bytes), ...overrides };
  const headers = { Authorization: `Bearer ${host.seatToken}`, 'X-FTL-Connection': connection, 'X-FTL-Seat-Generation': String(host.seatGeneration),
    'X-FTL-Checkpoint': header(metadata), 'Content-Type': 'application/octet-stream', 'CF-Connecting-IP': '192.0.2.1' };
  return { metadata, headers, request: () => new Request(`https://service/v2/rooms/${host.snapshot.roomId}/checkpoint`, { method: 'PUT', headers, body: bytes }) };
}
export function dispatch(request: Request) { return worker.fetch(request, { ...env, IP_HASH_SALT: 'synthetic-runtime-test-salt' }); }
export function getCheckpoint(host: SeatSession, token = host.seatToken) { return dispatch(new Request(`https://service/v2/rooms/${host.snapshot.roomId}/checkpoint`, { headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '192.0.2.1' } })); }
