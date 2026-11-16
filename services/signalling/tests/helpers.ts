import { env } from 'cloudflare:workers';
import { beforeEach, expect } from 'vitest';
import { runInDurableObject } from 'cloudflare:test';
import worker from '../src/index';
import type { SeatSession } from '../../../src/shared/roomSession';
beforeEach(async () => {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
  await runInDurableObject(directory, (_, { storage }) => {
    storage.sql.exec('DELETE FROM directory_rooms');
    storage.sql.exec('DELETE FROM directory_activations');
    storage.sql.exec('DELETE FROM directory_ip');
  });
});
export const compatibility = { protocolVersion: 2, modeId: 'opaque-test', schemaVersion: 2, simVersion: 35,
  contentDigest: 'a'.repeat(64), layoutHash: 'b87a0284' } as const;
export function request(path: string, body: unknown = {}, headers: Record<string, string> = {}, overrides = {}) {
  return worker.fetch(new Request('https://service' + path, { method: 'POST',
    headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers }, body: JSON.stringify(body) }),
  { ...env, IP_HASH_SALT: 'synthetic-runtime-test-salt', ...overrides });
}
export async function create(capacity = 4): Promise<SeatSession> {
  const response = await request('/v2/rooms', { compatibility, capacity });
  expect(response.status).toBe(200);
  return response.json();
}
