import { describe, expect, it, vi } from 'vitest';
import { createPagePlatform } from '../src/network/online/pagePlatform';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
const descriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, compatibility: { protocolVersion: 2 as const, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
const port = () => ({ close: vi.fn() }) as never as MessagePort & { close: ReturnType<typeof vi.fn> };
const unused = () => { throw Error('unused'); };
describe('the page online platform (web build spec §3.1)', () => {
  it('delivers only validated increasing descriptors and closes every refused port', () => {
    const deliver = vi.fn(), platform = createPagePlatform({ hostPlatform: unused, deliver });
    const first = port(); platform.publishPort(descriptor, first);
    expect(deliver).toHaveBeenCalledWith(descriptor, first); expect(deliver.mock.calls[0]![0]).not.toBe(descriptor);
    for (const bad of [descriptor, { ...descriptor, epoch: 2, token: 'private' }]) {
      const refused = port(); expect(() => platform.publishPort(bad as never, refused)).toThrow('invalid-port'); expect(refused.close).toHaveBeenCalledOnce();
    }
    const noListener = createPagePlatform({ hostPlatform: unused, deliver: () => { throw Error('no listener'); } }), lost = port();
    expect(() => noListener.publishPort(descriptor, lost)).toThrow('invalid-port'); expect(lost.close).toHaveBeenCalledOnce();
  });
  it('rejects a missing or foreign lease identity before starting a Worker', async () => {
    const hostPlatform = vi.fn(), platform = createPagePlatform({ hostPlatform, deliver: vi.fn() }), signal = new AbortController().signal;
    await expect(platform.startLeasedHost(identity, signal, { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 8, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) })).rejects.toThrow('invalid-lease');
    await expect(platform.startLeasedHost(identity, signal, {} as never)).rejects.toThrow('invalid-lease');
    expect(hostPlatform).not.toHaveBeenCalled();
  });
  it('owns a page transport whose public disposal is one loss and whose owner disposal is none', async () => {
    const platform = createPagePlatform({ hostPlatform: unused, deliver: vi.fn() });
    const a = await platform.createTransport(identity), lost = vi.fn(); a.onExit(lost); await a.controller.dispose(); expect(lost).toHaveBeenCalledOnce();
    const late = vi.fn(); a.onExit(late); expect(late).toHaveBeenCalledOnce();
    const b = await platform.createTransport(identity), quiet = vi.fn(); b.onExit(quiet); await b.dispose(); expect(quiet).not.toHaveBeenCalled();
    const after = vi.fn(); b.onExit(after); expect(after).not.toHaveBeenCalled();
  });
  it('makes real MessageChannels for peers and never reports the page as gone', () => {
    const platform = createPagePlatform({ hostPlatform: unused, deliver: vi.fn() }), { port1, port2 } = platform.channel();
    expect(typeof port1.postMessage).toBe('function'); port1.close(); port2.close();
    const gone = vi.fn(); platform.onVisibleGone(gone)(); expect(gone).not.toHaveBeenCalled();
  });
});
