import { describe, expect, it, vi } from 'vitest';
import { BrowserWindow, ipcMain, utilityProcess } from 'electron';
import { createHostPlatform } from '../src/main/network/transportWindow';
import { startHostProcess } from '../src/main/network/hostProcess';
import { TRANSPORT_READY_CHANNEL } from '../src/shared/hostProcessProtocol';
import { startGuestTransport } from '../src/main/network/rtcTransport';
import { RTC_RESPONSE_CHANNEL, type RtcAttemptOptions } from '../src/shared/rtcSession';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    static latest: Window;
    destroyed = false;
    sent: { channel: string; message: any; ports?: unknown[] }[] = [];
    webContents = Object.assign(new EventEmitter(), { mainFrame: {}, setWindowOpenHandler() {},
      postMessage: (channel: string, message: unknown, ports?: unknown[]) => { this.sent.push({ channel, message, ports }); } });
    constructor(readonly options: unknown) { super(); Window.latest = this; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    loadedURL?: string;
    async loadFile() {}
    async loadURL(url: string) { this.loadedURL = url; }
  }
  class Utility extends EventEmitter {
    pid?: number;
    killAttempts = 0;
    exited = false;
    postMessage() {}
    spawn() { this.pid = 41; this.emit('spawn'); }
    kill() { this.killAttempts++; if (!this.pid) return false; this.exited = true; this.emit('exit', 0); return true; }
  }
  return { BrowserWindow: Window, ipcMain: new EventEmitter(), powerMonitor: new EventEmitter(), MessageChannelMain: class {}, utilityProcess: { fork: vi.fn(() => new Utility()) } };
});
const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
const lastUtility = () => vi.mocked(utilityProcess.fork).mock.results.at(-1)!.value as any;
describe('native utility termination ownership', () => {
  it('retains pre-spawn cancellation after the owner unsubscribes and cleans lifecycle listeners on exit', async () => {
    const platform = createHostPlatform(), abort = new AbortController();
    const starting = startHostProcess({ ...identity, signal: abort.signal }, platform), rejected = expect(starting).rejects.toThrow('cancelled');
    const child = lastUtility(); abort.abort(); await rejected;
    expect(child.pid).toBeUndefined(); expect(child.killAttempts).toBe(1);
    child.spawn(); expect(child.exited).toBe(true); expect(child.killAttempts).toBe(2);
    expect(child.listenerCount('spawn')).toBe(0); expect(child.listenerCount('exit')).toBe(0); expect(child.listenerCount('message')).toBe(0);
  });
  it('retains termination when transport construction throws before utility spawn', async () => {
    const platform = createHostPlatform(); platform.createTransport = () => { throw Error('transport-construction'); };
    await expect(startHostProcess(identity, platform)).rejects.toThrow('transport-construction');
    const child = lastUtility(); expect(child.pid).toBeUndefined();
    child.spawn(); expect(child.exited).toBe(true); expect(child.listenerCount('spawn')).toBe(0); expect(child.listenerCount('exit')).toBe(0);
  });
  it('does not send repeated termination after a successful kill or observed exit', () => {
    const utility = createHostPlatform().spawn(), child = lastUtility();
    child.spawn(); utility.kill(); utility.kill();
    expect(child.exited).toBe(true); expect(child.killAttempts).toBe(1);
    expect(child.listenerCount('spawn')).toBe(0); expect(child.listenerCount('exit')).toBe(0);
  });
});
describe('hidden transport sender ownership', () => {
  const attempt = (id: string): RtcAttemptOptions => ({ attemptId: id, role: 'offerer', identity: { ...identity, protocolVersion: 2,
    runId: 'run', roomId: 'room', layoutHash: '1234abcd', localConnectionId: 'host', remoteConnectionId: id, seatGeneration: 1 },
    localTicket: 'local', expectedRemoteTicket: 'remote', ticketExpiresAtEpochMs: Date.now() + 10000, iceServers: [] });
  it('guest creates no utility, rejects unexpected sender/frame/ports, and window death closes every attempt', async () => {
    const forks = vi.mocked(utilityProcess.fork).mock.calls.length, starting = startGuestTransport(identity);
    await vi.waitFor(() => {
      expect((BrowserWindow as any).latest.destroyed).toBe(false);
    });
    const window = (BrowserWindow as any).latest;
    const source = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    ipcMain.emit(TRANSPORT_READY_CHANNEL, source, { protocolVersion: 2, ...identity });
    const owner = await starting; expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(forks);
    const ports = [{ close: vi.fn() }, { close: vi.fn() }], starts = ports.map((port, n) => owner.startAttempt(attempt(`guest-${n}`), port as any));
    const settled = Promise.allSettled(starts), request = window.sent[0].message;
    const response = { version: 1, hostGeneration: 7, requestId: request.requestId, attemptId: 'guest-0', kind: 'port-ready' };
    ipcMain.emit(RTC_RESPONSE_CHANNEL, { ...source, sender: {} }, response);
    ipcMain.emit(RTC_RESPONSE_CHANNEL, { ...source, senderFrame: {} }, response);
    const unexpected = { close: vi.fn() }; ipcMain.emit(RTC_RESPONSE_CHANNEL, { ...source, ports: [unexpected] }, response);
    expect(unexpected.close).toHaveBeenCalledOnce();
    ipcMain.emit(RTC_RESPONSE_CHANNEL, source, response);
    ipcMain.emit(RTC_RESPONSE_CHANNEL, source, { ...response, kind: 'ready', latestPayloadLimit: 4096 });
    await expect(starts[0]).resolves.toEqual({ latestPayloadLimit: 4096 });
    window.webContents.emit('render-process-gone');
    expect((await settled)[1]!.status).toBe('rejected'); expect(ports.every(p => p.close.mock.calls.length === 1)).toBe(true);
    expect(window.destroyed).toBe(true); expect(ipcMain.listenerCount(RTC_RESPONSE_CHANNEL)).toBe(0); await owner.dispose();
  });
  it('disposing the exposed host transport triggers paired owner exit notification', async () => {
    const transport = createHostPlatform().createTransport(identity), onExit = vi.fn(); transport.onExit(onExit);
    await transport.controller.dispose(); expect(onExit).toHaveBeenCalledOnce();
    expect((BrowserWindow as any).latest.destroyed).toBe(true);
  });
  it('cleans guest startup failure without spawning any authority utility', async () => {
    const forks = vi.mocked(utilityProcess.fork).mock.calls.length;
    const loading = vi.spyOn((BrowserWindow as any).prototype, 'loadFile').mockRejectedValueOnce(Error('load'));
    try {
      await expect(startGuestTransport(identity)).rejects.toThrow('transport-load-failed');
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(forks);
      expect((BrowserWindow as any).latest.destroyed).toBe(true);
      expect(ipcMain.listenerCount(TRANSPORT_READY_CHANNEL)).toBe(0); expect(ipcMain.listenerCount(RTC_RESPONSE_CHANNEL)).toBe(0);
    } finally { loading.mockRestore(); }
  });
  it('loads the fixed transport page from the development server', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/');
    const transport = createHostPlatform().createTransport(identity), window = (BrowserWindow as any).latest;
    try {
      await transport.load();
      const url = new URL(window.loadedURL); expect(url.pathname).toBe('/networkTransport.html');
      expect(JSON.parse(url.searchParams.get('identity')!)).toEqual({ protocolVersion: 2, ...identity });
    } finally { transport.dispose(); vi.unstubAllEnvs(); }
  });
  it('accepts only its own main-frame IPC with the active identity', () => {
    const transport = createHostPlatform().createTransport(identity), window = (BrowserWindow as any).latest;
    let ready = 0; transport.onReady(() => ready++);
    const valid = { protocolVersion: 2, ...identity }, source = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    ipcMain.emit(TRANSPORT_READY_CHANNEL, { ...source, sender: {} }, valid);
    ipcMain.emit(TRANSPORT_READY_CHANNEL, { ...source, senderFrame: {} }, valid);
    ipcMain.emit(TRANSPORT_READY_CHANNEL, source, { ...valid, hostGeneration: 6 });
    expect(ready).toBe(0);
    ipcMain.emit(TRANSPORT_READY_CHANNEL, source, valid); ipcMain.emit(TRANSPORT_READY_CHANNEL, source, valid);
    expect(ready).toBe(1); transport.dispose(); transport.dispose();
    expect(window.destroyed).toBe(true); expect(ipcMain.listenerCount(TRANSPORT_READY_CHANNEL)).toBe(0);
  });
});
