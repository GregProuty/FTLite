import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OnlineSessionOwner } from '../src/main/network/onlineSession';
import { registerOnlineIpc } from '../src/main/network/onlineIpc';

const native = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { ipcMain: { handle: (name: string, cb: (...args: any[]) => any) => native.handlers.set(name, cb), removeHandler: (name: string) => native.handlers.delete(name) }, powerMonitor: new EventEmitter() };
});
import { powerMonitor } from 'electron';
const status = () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] } as const);
const cleanups: (() => void)[] = [];
afterEach(() => { for (const off of cleanups.splice(0)) off(); });
function harness(visible = true) {
  const webContents = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false, send: vi.fn() });
  const win = Object.assign(new EventEmitter(), { webContents, isDestroyed: (): boolean => false, isVisible: (): boolean => visible });
  const listeners = new Set<(value: any) => void>();
  const owner: OnlineSessionOwner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: vi.fn(status),
    subscribe: cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, suspend: vi.fn(async () => {}), dispose: vi.fn(async () => {}) };
  const off = registerOnlineIpc(win as any, owner); cleanups.push(off);
  const event = { sender: webContents, senderFrame: webContents.mainFrame, ports: [] };
  const invoke = (name: string, payload?: unknown, e = event) => native.handlers.get('online:' + name)!(e, ...(payload === undefined ? [] : [payload]));
  return { win, owner, webContents, listeners, off, event, invoke };
}
describe('registered visible online IPC', () => {
  it('registers its trusted application window before the OS shows it, but admits actions only once visible', async () => {
    const h = harness(false);
    expect(await h.invoke('host', { type: 'host', capacity: 2 })).toEqual({ ok: false, code: 'unauthorized' });
    h.win.isVisible = () => true;
    expect(await h.invoke('host', { type: 'host', capacity: 2 })).toEqual({ ok: true });
    expect(await h.invoke('host', { type: 'host', capacity: 2 }, { ...h.event, sender: {} } as any)).toEqual({ ok: false, code: 'unauthorized' });
  });
  const actions = [{ type: 'host', capacity: 2 }, { type: 'join', code: 'ABCD1234' }, { type: 'ready', ready: false }, { type: 'remove-seat', seatId: 1 }, { type: 'view-state', epoch: 1, phase: 'synced' }, ...['reconnect', 'start', 'retry', 'leave', 'forget-seat'].map(type => ({ type }))];
  it.each(actions)('denies unknown windows, hidden transports, subframes and port injection for $type', async action => {
    const h = harness();
    for (const e of [{ ...h.event, sender: {} }, { ...h.event, senderFrame: {} }]) expect(await h.invoke(action.type, action, e as any)).toEqual({ ok: false, code: 'unauthorized' });
    h.win.isVisible = () => false;
    expect(await h.invoke(action.type, action)).toEqual({ ok: false, code: 'unauthorized' });
    h.win.isVisible = () => true;
    const port = { close: vi.fn() };
    expect(await h.invoke(action.type, action, { ...h.event, ports: [port] } as any)).toEqual({ ok: false, code: 'unauthorized' });
    expect(port.close).toHaveBeenCalledOnce(); expect(h.owner.dispatch).not.toHaveBeenCalled();
    expect(await h.invoke(action.type, action)).toEqual({ ok: true });
  });
  it('validates channel action, output and status before copying any provider fields', async () => {
    const h = harness();
    expect(await h.invoke('host', { type: 'leave' })).toEqual({ ok: false, code: 'invalid-action' });
    expect(await h.invoke('join', { type: 'join', code: 'ABCD1234', seatToken: 'private' })).toEqual({ ok: false, code: 'invalid-action' });
    vi.mocked(h.owner.dispatch).mockResolvedValueOnce({ ok: true, seatToken: 'private' } as any).mockRejectedValueOnce(Error('private'));
    expect(await h.invoke('leave', { type: 'leave' })).toEqual({ ok: false, code: 'invalid-status' });
    expect(await h.invoke('leave', { type: 'leave' })).toEqual({ ok: false, code: 'unavailable' });
    const first = await h.invoke('status'); expect(first).toEqual({ version: 1, revision: 1, status: status() });
    for (const cb of h.listeners) cb({ ...status(), persistent: true });
    expect(h.webContents.send).toHaveBeenLastCalledWith('online:status', { version: 1, revision: 2, status: { ...status(), persistent: true } });
    for (const cb of h.listeners) cb({ ...status(), seatToken: 'private' });
    expect(JSON.stringify(h.webContents.send.mock.calls)).not.toContain('private');
    expect((await h.invoke('status')).status.error).toBe('invalid-status');
    expect(await h.invoke('status', undefined, { ...h.event, senderFrame: {} } as any)).toEqual({ ok: false, code: 'unauthorized' });
  });
  it('removes every handler and lifecycle listener and disposes once across repeated cleanup', () => {
    const before = { suspend: powerMonitor.listenerCount('suspend'), resume: powerMonitor.listenerCount('resume') };
    for (let i = 0; i < 3; i++) {
      const h = harness();
      powerMonitor.emit('suspend'); powerMonitor.emit('resume');
      expect(h.owner.suspend).toHaveBeenCalledOnce();
      expect(h.webContents.send.mock.calls.filter(([channel]) => channel === 'app:resume')).toHaveLength(1);
      h.win.emit('closed'); h.win.emit('closed'); h.off();
      expect(h.owner.dispose).toHaveBeenCalledOnce(); expect(h.listeners.size).toBe(0); expect(native.handlers.size).toBe(0);
      expect(h.win.listenerCount('closed')).toBe(0); expect(h.webContents.listenerCount('render-process-gone')).toBe(0);
      expect(powerMonitor.listenerCount('suspend')).toBe(before.suspend); expect(powerMonitor.listenerCount('resume')).toBe(before.resume);
    }
  });
  it('cleans IPC after native BrowserWindow getters are destroyed', () => {
    const h=harness(); Object.defineProperty(h.win,'webContents',{get(){throw Error('Object has been destroyed');}});
    expect(()=>h.win.emit('closed')).not.toThrow(); expect(h.owner.dispose).toHaveBeenCalledOnce();
    expect(native.handlers.size).toBe(0); expect(h.webContents.listenerCount('render-process-gone')).toBe(0);
  });
});
