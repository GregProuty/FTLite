import { describe, expect, it, vi } from 'vitest';
import { harness } from './helpers/onlineHarness';

describe('the lease relay is event-driven (web build spec §3.5, fail path)', () => {
  it('relays each renewal request to the service and the grant back to the host with no session timer callback', async () => {
    const scheduled: number[] = [];
    const frozen = { setTimeout: (_cb: () => void, ms: number) => { scheduled.push(ms); return scheduled.length; }, clearTimeout: () => {} };
    const h = harness(1, 0, 0, 'http://127.0.0.1:8787', frozen);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true });
    expect(await h.owner.dispatch({ type: 'start' })).toEqual({ ok: true });
    for (const nonce of ['1', '2', '3'].map(digit => digit.repeat(32))) {
      h.renewal(nonce);
      await vi.waitFor(() => expect(h.host.applyLease).toHaveBeenCalledWith(expect.objectContaining({ nonce }), expect.objectContaining({ nonce })));
    }
    expect(h.service.request.mock.calls.filter((call: any) => call[0].type === 'lease-renew').length).toBeGreaterThanOrEqual(4);   // the start's grant plus three
    await h.owner.dispose();
  });
});
