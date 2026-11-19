import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlineAppFailureCode, onlineAppStderrDiagnostic, onlineAppWaitDiagnostic } from '../scripts/network/online-app-diagnostics';

const secret = 'seatToken=private-seat localTicket=private-ticket SDP=private-sdp candidate=192.0.2.9';
// Web-i: a fake of the page-topology wrapper's Electron surface. The fake production main registers app:prepare-exit;
// a window close answers it after `closeAfter` ms, then the window is gone (the production close handshake, appExit.ts).
// The page answers only the probe's own drain/count calls; every other page call rejects with secret text.
function driver(closeAfter=0) {
  let liveWindows=1, destroyed=false;
  const app = Object.assign(new EventEmitter(), { isPackaged: false, setPath: vi.fn(), disableHardwareAcceleration: vi.fn(), exit: vi.fn(),
    whenReady: () => Promise.resolve(),
    commandLine: { appendSwitch: vi.fn(), hasSwitch: () => false, getSwitchValue: (key: string) => ({ 'online-app-dir': resolve('test-profile'),
      'online-app-role': 'guest', 'user-data-dir': resolve('test-profile/guest') })[key] } });
  const proc = Object.assign(new EventEmitter(), { versions: { electron: '37.10.3' }, env: {}, send: vi.fn() });
  const handlers = new Map<string, (...args: any[]) => any>();
  const ipcMain = Object.assign(new EventEmitter(), { handle: (channel: string, fn: (...args: any[]) => any) => { handlers.set(channel, fn); } });
  const session = { defaultSession: { registerPreloadScript: vi.fn(), webRequest: { onSendHeaders: vi.fn(), onCompleted: vi.fn() } } };
  const error = vi.fn();
  runInNewContext(readFileSync('scripts/network/online-app-smoke.cjs', 'utf8'), {
    require(name: string) {
      if(name === 'electron') return {app, BrowserWindow: {getAllWindows:()=>liveWindows?[{}]:[]}, ipcMain, powerMonitor:new EventEmitter(), session};
      if(name === 'node:path') return {resolve,join,sep:process.platform === 'win32' ? '\\' : '/'};
      // The built observers are not needed: an empty probe and observer stand in.
      if(name === 'node:fs') return {readFileSync:(path: string, ...rest: any[]) => /[\\/]observer[\\/]/.test(path) ? '' : (readFileSync as any)(path, ...rest),writeFileSync:vi.fn()};
      if(name === 'node:crypto') return {createHash};
      if(name === './rtc-smoke-native.cjs') return ()=>{};
      if(name === './online-app-click.cjs') return ()=>{};
      if(name === '../../out/main/index.js') { ipcMain.handle('app:prepare-exit', () => true); return {}; }
      throw Error('unexpected test import');
    }, process:proc, console:{error}, setTimeout, performance, Buffer, __dirname: resolve('scripts/network'),
  });
  const page = (source: string) => source === 'window.onlineProbe.take()' ? Promise.resolve({ bodies: [], workers: [], phases: [], mirrorReceipts: [], heldUploads: 0, mainBlockedMs: 0, exitCommitDelayMs: 0 })
    : source === 'window.onlineProbe.counts()' ? Promise.resolve({ workers: 0, workerExits: 0, workerErrors: 0, ports: 0, observedPagePorts: 0 })
    : source === 'window.rtcNative?.status()' ? Promise.resolve({ connections: [] })
    : source.startsWith('window.onlineProbe.set(') ? Promise.resolve(true) : Promise.reject(Error(secret));
  const contents = Object.assign(new EventEmitter(), { executeJavaScript:vi.fn(page) });
  const gone = () => { if (destroyed) return; destroyed=true; liveWindows=0; window.emit('closed'); };
  const close = () => { const finish = () => { void Promise.resolve(handlers.get('app:prepare-exit')?.({}, 1)).then(gone); }; if(closeAfter) setTimeout(finish, closeAfter); else finish(); };
  const window = Object.assign(new EventEmitter(), { webContents:contents, close, destroy:close, isDestroyed:()=>destroyed });
  app.emit('browser-window-created',{},window);
  return {app,proc,error,contents};
}
afterEach(() => vi.useRealTimers());
describe('application driver diagnostics',()=>{
  it('allows the full save window plus native retirement before successful shutdown',async()=>{
    vi.useFakeTimers();const h=driver(3400);h.proc.emit('message',{command:'shutdown',requestId:9,shutdownBudgetMs:4500});
    await vi.advanceTimersByTimeAsync(3000);expect(h.proc.send).not.toHaveBeenCalled();expect(h.app.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);expect(h.proc.send.mock.calls[0]![0].result.windows).toBe(0);
    h.proc.send.mock.calls[0]![1]();expect(h.app.exit).toHaveBeenCalledWith(0);
  });
  it('reports remaining resources and fails within the supplied launcher budget',async()=>{
    vi.useFakeTimers();const h=driver(99999);h.proc.emit('message',{command:'shutdown',requestId:9,shutdownBudgetMs:700});
    await vi.advanceTimersByTimeAsync(720);expect(h.proc.send).toHaveBeenCalledOnce();
    expect(h.proc.send.mock.calls[0]![0].result).toMatchObject({windows:1,shutdownComplete:false});
    h.proc.send.mock.calls[0]![1]();expect(h.app.exit).toHaveBeenCalledWith(1);
  });
  it('observes delayed window retirement before reporting cleanup even with no Worker',async()=>{
    const h=driver(30);h.proc.emit('message',{command:'shutdown',requestId:9});
    await vi.waitFor(()=>expect(h.proc.send).toHaveBeenCalled());
    expect(h.proc.send.mock.calls[0]![0].result.windows).toBe(0);
  });
  it('reports only enumerated wait role/phase context, including hostile last status values', () => {
    expect(onlineAppWaitDiagnostic('guest idle', 'joining')).toEqual({ code: 'APP_WAIT_TIMEOUT', role: 'guest', expected: 'idle', actual: 'joining' });
    expect(onlineAppWaitDiagnostic(secret, secret)).toEqual({ code: 'APP_WAIT_TIMEOUT', role: 'unknown', expected: 'unknown', actual: 'unknown' });
  });
  it('allows only fixed launcher failure codes and enumerated stderr context',()=>{
    expect(onlineAppFailureCode(Error(secret))).toBe('online-application-gate-failed');
    expect(onlineAppFailureCode({message:secret,stack:secret})).toBe('online-application-gate-failed');
    expect(onlineAppFailureCode(Error('injected transport death'))).toBe('injected transport death');
    expect(onlineAppFailureCode(Error('injected worker death'))).toBe('injected worker death');
    expect(onlineAppStderrDiagnostic('guest')).toEqual({code:'APP_NATIVE_STDERR',role:'guest'});
    expect(onlineAppStderrDiagnostic(secret)).toEqual({code:'APP_NATIVE_STDERR',role:'unknown'});
  });
  it('does not disclose uncaught exception messages or stacks',()=>{
    const h=driver();h.proc.emit('uncaughtException',Error(secret));
    expect(h.error.mock.calls).toEqual([['APP_DRIVER_UNCAUGHT']]);expect(h.app.exit).toHaveBeenCalledWith(1);
  });
  it('redacts hostile preload paths and page error text while retaining fixed context',()=>{
    const h=driver();h.contents.emit('preload-error',{},secret,Error(secret));h.contents.emit('console-message',{level:'error',message:secret});
    expect(h.error.mock.calls).toEqual([['APP_PRELOAD_ERROR',{role:'guest',page:'application'}],['APP_PAGE_ERROR',{role:'guest',page:'application'}]]);
    expect(JSON.stringify(h.error.mock.calls)).not.toContain('private');
  });
  it('returns a fixed driver failure without reflecting arbitrary commands or errors',async()=>{
    const h=driver();h.proc.emit('message',{command:'status',requestId:7});h.proc.emit('message',{command:secret,requestId:8});
    await vi.waitFor(()=>expect(h.proc.send).toHaveBeenCalledTimes(2));
    expect(h.proc.send.mock.calls.map(([message])=>message)).toEqual(expect.arrayContaining([
      {id:7,error:'app-driver-command-failed',command:'status',reason:'command-failed'}, {id:8,error:'app-driver-command-failed',command:'unknown',reason:'command-failed'}
    ]));
    expect(JSON.stringify(h.proc.send.mock.calls)).not.toContain('private');
  });
});
