import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import worker from '../src/index';
import { compatibility, create, request } from './helpers';

const bindings = { IP_HASH_SALT: 'synthetic-runtime-test-salt', ALLOWED_ORIGINS: 'https://allowed.example' };
function call(path: string, headers: Record<string, string>) {
  return worker.fetch(new Request('https://service' + path, { headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers } }), { ...env, ...bindings });
}
it('exposes X-FTL-Checkpoint to a listed https origin and to Origin: null, and to no request without an Origin (web build spec §6)', async () => {
  const session = await create(2);
  for (const origin of ['https://allowed.example', 'null']) {
    const response = await call(`/v2/rooms/${session.snapshot.roomId}/checkpoint`, { Authorization: `Bearer ${session.seatToken}`, Origin: origin });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-FTL-Checkpoint');
    await response.body?.cancel();
  }
  const bare = await request('/v2/rooms', { compatibility, capacity: 1 });
  expect(bare.status).toBe(200); expect(bare.headers.get('Access-Control-Expose-Headers')).toBeNull();
});
it('refuses a socket upgrade from a disallowed origin and accepts a listed origin, null and file://', async () => {
  const session = await create(2), path = `/v2/rooms/${session.snapshot.roomId}/socket`;
  expect((await call(path, { Upgrade: 'websocket', Origin: 'https://evil.example' })).status).toBe(403);
  for (const origin of ['https://allowed.example', 'null', 'file://']) {
    const response = await call(path, { Upgrade: 'websocket', Origin: origin });
    expect(response.status).toBe(101);
    response.webSocket!.accept(); response.webSocket!.close(1000);
  }
});
