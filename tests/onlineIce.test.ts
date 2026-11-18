import { expect, it, vi } from 'vitest';
import { createOnlineIce } from '../src/network/online/onlineIce';
const owner = { roomId: 'a'.repeat(32), hostGeneration: 1, seatId: 0, seatGeneration: 1, connectionId: 'b'.repeat(32) };
const credentials = (expiresAtEpochMs = 1000000) => ({ iceServers: [{ urls: ['turn:example.test:3478'], username: 'ephemeral', credential: 'test' }], expiresAtEpochMs });
function rig(mode: 'loopback' | 'turn' = 'turn') {
  let now = 0; const getTurn = vi.fn(async () => credentials(now + 1000000));
  const ice = createOnlineIce({ service: { getTurn }, clock: { nowMs: () => now, epochMs: () => now }, mode });
  return { ice, getTurn, advance: (ms: number) => { now += ms; }, signal: new AbortController().signal };
}
it('uses a finite empty loopback batch without a provider', async () => {
  const r = rig('loopback'), value = await r.ice.get(owner, r.signal);
  expect(value.iceServers).toEqual([]); expect(Number.isFinite(value.expiresAtEpochMs)).toBe(true); expect(r.getTurn).not.toHaveBeenCalled(); r.ice.dispose();
});
it('coalesces three routes and copies owner-bound cached credentials', async () => {
  const r = rig(); const batches = await Promise.all([0, 1, 2].map(() => r.ice.get({ ...owner }, r.signal)));
  expect(r.getTurn).toHaveBeenCalledTimes(1); batches[0]!.iceServers[0]!.credential = 'mutated';
  expect((await r.ice.get(owner, r.signal)).iceServers[0]!.credential).toBe('test'); r.ice.dispose();
});
it('refreshes at the five-minute boundary', async () => {
  const r = rig(); await r.ice.get(owner, r.signal); r.advance(699999); await r.ice.get(owner, r.signal); expect(r.getTurn).toHaveBeenCalledTimes(1);
  r.advance(1); await r.ice.get(owner, r.signal); expect(r.getTurn).toHaveBeenCalledTimes(2); r.ice.dispose();
});
it('rejects stale completion after owner change and never caches it', async () => {
  const r = rig(); let finish!: (value: ReturnType<typeof credentials>) => void;
  r.getTurn.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const old = r.ice.get(owner, r.signal), rejected = expect(old).rejects.toMatchObject({ code: 'stale-connection' });
  const changed = r.ice.get({ ...owner, connectionId: 'c'.repeat(32) }, r.signal);
  await expect(changed).rejects.toMatchObject({ code: 'rate-limited' }); finish(credentials()); await rejected;
  r.advance(60000); await r.ice.get({ ...owner, connectionId: 'c'.repeat(32) }, r.signal); expect(r.getTurn).toHaveBeenCalledTimes(2); r.ice.dispose();
});
it('preserves provider retryAfter and charges failures against the minute quota', async () => {
  const r = rig(); r.getTurn.mockRejectedValueOnce({ code: 'turn-unavailable', retryable: true, retryAfterMs: 90000 });
  await expect(r.ice.get(owner, r.signal)).rejects.toMatchObject({ code: 'turn-unavailable', retryAfterMs: 90000 });
  r.ice.invalidate(); r.advance(60000); await expect(r.ice.get(owner, r.signal)).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 30000 });
  expect(r.getTurn).toHaveBeenCalledTimes(1); r.advance(30000); await r.ice.get(owner, r.signal); r.ice.dispose();
});
it('rejects expired and near-expiry provider results and refuses a hot retry', async () => {
  const r = rig(); r.getTurn.mockResolvedValueOnce(credentials(300000));
  await expect(r.ice.get(owner, r.signal)).rejects.toMatchObject({ code: 'turn-unavailable', retryAfterMs: 60000 });
  await expect(r.ice.get(owner, r.signal)).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 60000 }); expect(r.getTurn).toHaveBeenCalledOnce();
  r.advance(60000); r.getTurn.mockResolvedValueOnce(credentials(59999));
  await expect(r.ice.get(owner, r.signal)).rejects.toMatchObject({ code: 'turn-unavailable' }); r.ice.dispose();
});
it('retains a late provider cooldown even when its credentials owner was invalidated', async () => {
  const r = rig(); let fail!: (e: unknown) => void; r.getTurn.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  const old = r.ice.get(owner, r.signal), rejected = expect(old).rejects.toMatchObject({ code: 'stale-connection' }); r.ice.invalidate(); await rejected;
  fail({ code: 'rate-limited', retryable: true, retryAfterMs: 90000 });
  for (let i = 0; i < 8; i++) await Promise.resolve(); r.advance(60000);
  await expect(r.ice.get(owner, r.signal)).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 30000 }); expect(r.getTurn).toHaveBeenCalledOnce(); r.ice.dispose();
});
it('cancels individual waiters without cancelling another route and invalidates on dispose', async () => {
  const r = rig(); let finish!: (value: ReturnType<typeof credentials>) => void;
  r.getTurn.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const abort = new AbortController(), a = r.ice.get(owner, abort.signal), b = r.ice.get(owner, r.signal);
  const rejected = expect(a).rejects.toMatchObject({ code: 'cancelled' }); abort.abort(); await rejected; finish(credentials()); await expect(b).resolves.toEqual(credentials());
  r.ice.dispose(); await expect(r.ice.get(owner, r.signal)).rejects.toMatchObject({ code: 'cancelled' });
});
