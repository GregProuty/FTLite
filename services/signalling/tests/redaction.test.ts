import { runInDurableObject } from 'cloudflare:test';
import { http, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { connect, create, stub } from './socket-helpers';
import { directory, endpoint, error, network, synthetic, turn } from './turn-helpers';

it.each(['provider-error', 'redirect', 'oversize', 'malformed-json', 'duplicate-keys', 'network-error'] as const)('redacts %s without storing or logging provider data', async kind => {
  const host = await create(); await connect(host);
  const secret = 'PROVIDER_PRIVATE_BODY_ICE_SDP_TOKEN_ADDRESS';
  const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
  network.use(http.post(endpoint, () => {
    if (kind === 'provider-error') return new HttpResponse(secret, { status: 403 });
    if (kind === 'redirect') return new HttpResponse(secret, { status: 302, headers: { Location: 'https://127.0.0.1/private' } });
    if (kind === 'oversize') return new HttpResponse(secret.repeat(500), { status: 201 });
    if (kind === 'malformed-json') return new HttpResponse(secret, { status: 201 });
    if (kind === 'duplicate-keys') return new HttpResponse('{"iceServers":[],"iceServers":' + JSON.stringify(synthetic.iceServers) + '}', { status: 201 });
    return HttpResponse.error();
  }));
  try {
    const response = await turn(host); expect(response.status).toBe(503); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: { code: 'turn-unavailable', retryable: true } });
    expect(logs.flatMap(spy => spy.mock.calls)).toEqual([]);
    for (const target of [stub(host), directory()]) {
      const saved = await runInDurableObject(target, (_, state) => {
        const names = state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'room_%' OR name LIKE 'directory_%' OR name = 'service_schema')").toArray();
        return names.map(({ name }) => state.storage.sql.exec(`SELECT * FROM "${name}"`).toArray());
      });
      expect(JSON.stringify(saved)).not.toContain(secret);
      expect(JSON.stringify(saved)).not.toContain('synthetic-server-turn-secret');
      expect(JSON.stringify(saved)).not.toContain('synthetic-ephemeral');
    }
    await error(await turn(host), 'rate-limited', 429);
  } finally { for (const spy of logs) spy.mockRestore(); }
});
