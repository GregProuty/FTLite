import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({}));
vi.mock('../src/main/network/transportWindow', () => ({ createHostPlatform: vi.fn() }));
vi.mock('../src/main/network/hostProcess', () => ({ startHostProcess: vi.fn() }));
import { createHostPlatform } from '../src/main/network/transportWindow';
import { createOnlinePlatform } from '../src/main/network/onlinePlatform';
import type { OnlinePortDescriptor } from '../src/shared/onlineSession';
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'a'.repeat(64), hostGeneration: 1 };
const descriptor: OnlinePortDescriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 0, compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
afterEach(() => vi.useRealTimers());
function harness() {
  const transportEvents = new EventEmitter(), wc = Object.assign(new EventEmitter(), { postMessage: vi.fn(), isDestroyed: () => false, mainFrame: { postMessage: vi.fn() } });
  const win = Object.assign(new EventEmitter(), { webContents: wc, isDestroyed: (): boolean => false, isVisible: (): boolean => true });
  const raw = { controller: { dispose: vi.fn(async () => {}) }, load: vi.fn(async () => {}),
    onReady(cb: () => void) { transportEvents.on('ready', cb); return () => { transportEvents.off('ready', cb); }; },
    onExit(cb: () => void) { transportEvents.on('exit', cb); return () => { transportEvents.off('exit', cb); }; }, dispose: vi.fn() };
  vi.mocked(createHostPlatform).mockReturnValue({ createTransport: () => raw } as any);
  return { win, wc, raw, events: transportEvents, platform: createOnlinePlatform(win as any) };
}
describe('native online platform ownership', () => {
  it('rejects missing or foreign lease identity at the leased-only entry', async () => {
    const h = harness(), signal = new AbortController().signal;
    await expect(h.platform.startLeasedHost(identity, signal, undefined as any)).rejects.toThrow('invalid-lease');
    await expect(h.platform.startLeasedHost(identity, signal, { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), utilityEpoch: 'c'.repeat(32), hostGeneration: 2, hostSeatId: 0 })).rejects.toThrow('invalid-lease');
  });
  it('retains native window exit observation after readiness and disposes exactly once', async () => {
    const h = harness(), pending = h.platform.createTransport(identity);
    h.events.emit('ready'); const owned = await pending, lost = vi.fn(); owned.onExit(lost);
    expect(h.events.listenerCount('ready')).toBe(0); expect(h.events.listenerCount('exit')).toBe(1);
    h.events.emit('exit'); h.events.emit('exit'); expect(lost).toHaveBeenCalledOnce();
    await owned.dispose(); await owned.dispose(); expect(h.raw.dispose).toHaveBeenCalledOnce(); expect(h.events.listenerCount('exit')).toBe(0);
  });
  it('cleans failed/timed-out startup and never reports intentional disposal as a loss', async () => {
    vi.useFakeTimers(); const h = harness(), pending = h.platform.createTransport(identity), rejected = expect(pending).rejects.toThrow('transport-lost');
    await vi.advanceTimersByTimeAsync(5000); await rejected; expect(h.raw.dispose).toHaveBeenCalledOnce();
    expect(h.events.eventNames()).toEqual([]);
    const h2 = harness(), p2 = h2.platform.createTransport(identity); h2.events.emit('ready'); const owned = await p2, lost = vi.fn(); owned.onExit(lost); await owned.dispose(); owned.onExit(lost); expect(lost).not.toHaveBeenCalled();
  });
  it('rejects a failed load and removes both startup observers', async () => {
    const h = harness(); h.raw.load.mockRejectedValueOnce(Error('private native error'));
    await expect(h.platform.createTransport(identity)).rejects.toThrow('transport-lost');
    expect(h.raw.dispose).toHaveBeenCalledOnce(); expect(h.events.eventNames()).toEqual([]);
  });
  it('transfers only validated increasing descriptors and closes all rejected endpoints', () => {
    const h = harness(), port = () => ({ close: vi.fn() }), first = port();
    h.platform.publishPort(descriptor, first as any);
    expect(h.wc.mainFrame.postMessage).toHaveBeenCalledWith('online:port', { version: 1, descriptor }, [first]);
    for (const d of [descriptor, { ...descriptor, epoch: 0 }, { ...descriptor, epoch: 2, seatToken: 'private' }]) {
      const p = port(); expect(() => h.platform.publishPort(d as any, p as any)).toThrow('invalid-port'); expect(p.close).toHaveBeenCalledOnce();
    }
    h.wc.mainFrame.postMessage.mockImplementationOnce(() => { throw Error('private'); });
    const failed = port(); expect(() => h.platform.publishPort({ ...descriptor, epoch: 2 }, failed as any)).toThrow('invalid-port'); expect(failed.close).toHaveBeenCalledOnce();
    h.win.isDestroyed = () => true;
    const stale = port(); expect(() => h.platform.publishPort({ ...descriptor, epoch: 3 }, stale as any)).toThrow('invalid-port'); expect(stale.close).toHaveBeenCalledOnce();
  });
  it('removes both visible exit listeners on unsubscribe', () => {
    const h = harness(), lost = vi.fn(), off = h.platform.onVisibleGone(lost);
    h.wc.emit('render-process-gone'); h.win.emit('closed'); expect(lost).toHaveBeenCalledOnce(); off();
    expect(h.win.listenerCount('closed')).toBe(0); expect(h.wc.listenerCount('render-process-gone')).toBe(0);
  });
  it('handles native closed after BrowserWindow webContents getter is destroyed', () => {
    const h=harness(), lost=vi.fn(), off=h.platform.onVisibleGone(lost);
    Object.defineProperty(h.win,'webContents',{get(){throw Error('Object has been destroyed');}});
    expect(()=>h.win.emit('closed')).not.toThrow(); expect(lost).toHaveBeenCalledOnce();
    off(); expect(h.wc.listenerCount('render-process-gone')).toBe(0);
  });
});
