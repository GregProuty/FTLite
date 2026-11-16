import { BrowserWindow, ipcMain, MessageChannelMain, powerMonitor, utilityProcess, type IpcMainEvent } from 'electron';
import { join } from 'node:path';
import { matchesIdentity, TRANSPORT_CHANNEL, TRANSPORT_READY_CHANNEL, type HostIdentity } from '../../shared/hostProcessProtocol';
import { SESSION_PROTOCOL_VERSION } from '../../shared/netSession';
import type { HostPlatform } from './hostProcess';
import { createRtcTransport } from './rtcTransport';
import { RTC_REQUEST_CHANNEL, RTC_RESPONSE_CHANNEL } from '../../shared/rtcSession';

export function createHostPlatform(): HostPlatform {
  return {
    spawn() {
      const child = utilityProcess.fork(join(__dirname, 'authorityHost.js'), [], { serviceName: 'FTLite authority', stdio: 'pipe' });
      // Electron may reject kill() until its asynchronous spawn completes. Keep this
      // intent independent of the owner's subscriptions, which teardown removes.
      let killRequested = false, killSent = false, exited = false;
      function terminate(): void {
        if (exited || killSent) return;
        try { killSent = child.kill(); } catch { /* retain intent for the spawn event */ }
      }
      const spawned = () => { if (killRequested) terminate(); };
      const cleanup = () => {
        exited = true; child.off('spawn', spawned); child.off('exit', cleanup);
      };
      child.on('spawn', spawned); child.on('exit', cleanup);
      return {
        postMessage: (message, ports) => child.postMessage(message, ports),
        onMessage(cb) { child.on('message', cb); return () => { child.off('message', cb); }; },
        onExit(cb) { child.on('exit', cb); return () => { child.off('exit', cb); }; },
        kill() { killRequested = true; terminate(); }
      };
    },
    createTransport(identity: HostIdentity) {
      const window = new BrowserWindow({ show: false, webPreferences: {
        preload: join(__dirname, '../preload/networkTransport.js'), sandbox: true, contextIsolation: true,
        nodeIntegration: false, backgroundThrottling: false, webSecurity: true
      } });
      const ready = new Set<() => void>(), exited = new Set<() => void>();
      const contents = window.webContents;
      let disposed = false, announced = false;
      const controller = createRtcTransport(identity, {
        send(message, ports) {
          if (disposed || !announced) throw Error('transport-unavailable');
          window.webContents.postMessage(RTC_REQUEST_CHANNEL, message, ports);
        },
        onResponse(callback) {
          const receive = (event: IpcMainEvent, message: unknown) => {
            if (disposed || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.ports?.length) {
              for (const port of event.ports ?? []) port.close(); return;
            }
            callback(message);
          };
          ipcMain.on(RTC_RESPONSE_CHANNEL, receive);
          return () => { ipcMain.off(RTC_RESPONSE_CHANNEL, receive); };
        },
        dispose() {
          // Public controller disposal is a transport exit for its host owner.
          // Owner-driven disposal sets disposed first, avoiding recursive notification.
          if (!disposed) for (const callback of [...exited]) callback();
          dispose();
        }
      });
      function dispose() {
        if (disposed) return; disposed = true;
        void controller.dispose();
        ipcMain.off(TRANSPORT_READY_CHANNEL, announce); ready.clear(); exited.clear();
        window.off('closed', exit); contents.off('render-process-gone', exit);
        if (!window.isDestroyed()) window.destroy();
      }
      const announce = (event: IpcMainEvent, message: unknown) => {
        // Validate both webContents and its main frame. Other windows/subframes cannot start a host.
        if (disposed || announced || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
          || event.ports?.length || !matchesIdentity(message, identity)) {
          for (const port of event.ports ?? []) port.close(); return;
        }
        announced = true; for (const callback of [...ready]) callback();
      };
      ipcMain.on(TRANSPORT_READY_CHANNEL, announce);
      const exit = () => { for (const callback of [...exited]) callback(); dispose(); };
      window.on('closed', exit);
      window.webContents.on('render-process-gone', exit);
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', event => event.preventDefault());
      const initial = { protocolVersion: SESSION_PROTOCOL_VERSION, ...identity };
      return {
        controller,
        async load() {
          const developmentURL = process.env['ELECTRON_RENDERER_URL'];
          if (developmentURL) {
            const page = new URL('/networkTransport.html', developmentURL); page.searchParams.set('identity', JSON.stringify(initial));
            await window.loadURL(page.href);
          } else await window.loadFile(join(__dirname, '../renderer/networkTransport.html'), { query: { identity: JSON.stringify(initial) } });
        },
        connect(port) { if (disposed || !announced) throw Error('transport-unavailable'); window.webContents.postMessage(TRANSPORT_CHANNEL, initial, [port]); },
        onReady(cb) { ready.add(cb); if (announced) cb(); return () => { ready.delete(cb); }; },
        onExit(cb) { exited.add(cb); return () => { exited.delete(cb); }; },
        dispose
      };
    },
    createChannel: () => new MessageChannelMain(),
    onSuspend(cb) { powerMonitor.on('suspend', cb); return () => { powerMonitor.off('suspend', cb); }; },
    onResume(cb) { powerMonitor.on('resume', cb); return () => { powerMonitor.off('resume', cb); }; }
  };
}
