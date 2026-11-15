import { describe, expect, it, vi } from 'vitest';
import { BrowserWindow, ipcMain, utilityProcess } from 'electron';
import { createHostPlatform } from '../src/main/network/transportWindow';
import { startHostProcess } from '../src/main/network/hostProcess';
import { TRANSPORT_READY_CHANNEL } from '../src/shared/hostProcessProtocol';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    static latest: Window;
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), { mainFrame: {}, setWindowOpenHandler() {}, postMessage() {} });
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
