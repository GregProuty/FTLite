import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { onlineAppFailureCode, onlineAppStderrDiagnostic } from '../scripts/network/online-app-diagnostics';

const secret = 'seatToken=private-seat localTicket=private-ticket SDP=private-sdp candidate=192.0.2.9';
function driver() {
  const app = Object.assign(new EventEmitter(), { isPackaged: false, setPath: vi.fn(), disableHardwareAcceleration: vi.fn(), exit: vi.fn(),
    commandLine: { appendSwitch: vi.fn(), getSwitchValue: (key: string) => ({ 'online-app-dir': resolve('test-profile'),
      'online-app-role': 'guest', 'user-data-dir': resolve('test-profile/guest') })[key] } });
  const proc = Object.assign(new EventEmitter(), { versions: { electron: '37.10.3' }, send: vi.fn() });
  class Port extends EventEmitter { close() {} start() {} postMessage() {} }
  class Channel { port1 = new Port(); port2 = new Port(); }
  const error = vi.fn();
  runInNewContext(readFileSync('scripts/network/online-app-smoke.cjs', 'utf8'), {
    require(name: string) {
      if(name === 'electron') return {app, BrowserWindow: {}, MessageChannelMain: Channel, utilityProcess:{fork:vi.fn()}, ipcMain:new EventEmitter(), powerMonitor:new EventEmitter()};
      if(name === 'node:path') return {resolve,join,sep:process.platform === 'win32' ? '\\' : '/'};
      if(name === 'node:fs') return {readFileSync,writeFileSync:vi.fn()};
      if(name === './rtc-smoke-native.cjs') return ()=>{};
      if(name === '../../out/main/index.js') return {};
      throw Error('unexpected test import');
    }, process:proc, console:{error}, setTimeout, Buffer,
  });
  const contents = Object.assign(new EventEmitter(), { executeJavaScript:vi.fn().mockRejectedValue(Error(secret)) });
  const window = Object.assign(new EventEmitter(), { webContents:contents,loadFile:vi.fn(),destroy:vi.fn(),isDestroyed:()=>false });
  app.emit('browser-window-created',{},window);
  return {app,proc,error,contents};
}
describe('application driver diagnostics',()=>{
  it('allows only fixed launcher failure codes and enumerated stderr context',()=>{
    expect(onlineAppFailureCode(Error(secret))).toBe('online-application-gate-failed');
    expect(onlineAppFailureCode({message:secret,stack:secret})).toBe('online-application-gate-failed');
    expect(onlineAppFailureCode(Error('injected transport death'))).toBe('injected transport death');
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
      {id:7,error:'app-driver-command-failed',command:'status'}, {id:8,error:'app-driver-command-failed',command:'unknown'}
    ]));
    expect(JSON.stringify(h.proc.send.mock.calls)).not.toContain('private');
  });
});
