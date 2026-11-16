import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { INTERNAL_W, INTERNAL_H } from '../shared/resolution';
import { resolveOnlineConfig } from './network/onlineConfig';
import { createOnlineSession } from './network/onlineSession';
import { createOnlinePlatform } from './network/onlinePlatform';
import { registerOnlineIpc } from './network/onlineIpc';
import { registerOnlineExit } from './network/onlineExit';
import { createSeatStore } from './network/seatStore';
import { createMirrorStore } from './network/mirrorStore';
import { validateSectorMirror } from './network/onlineSector';
import { createRoomServiceClient } from '../network/session/serviceClient';

function createWindow(): void {
  const packaged = app.isPackaged;
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    minWidth: INTERNAL_W,
    minHeight: INTERNAL_H,
    fullscreen: packaged,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      devTools: !packaged,
      autoplayPolicy: 'no-user-gesture-required',
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true
    }
  });
  // Capture one configured origin and native networking implementation for this owner.
  const nativeFetch = globalThis.fetch, NativeWebSocket = globalThis.WebSocket;
  const configured = resolveOnlineConfig({ packaged, localServiceUrl: process.env['FTLITE_LOCAL_SERVICE_URL'] });
  const config = typeof nativeFetch === 'function' && typeof NativeWebSocket === 'function' ? configured : { enabled: false } as const;
  const scheduler = { setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const owner = createOnlineSession({
    config, seatStore: createSeatStore(app.getPath('userData')), mirrorStore: createMirrorStore(app.getPath('userData'), validateSectorMirror), platform: createOnlinePlatform(win),
    clock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, scheduler,
    nonce: () => randomBytes(16).toString('hex'),
    service() {
      if (!config.enabled) throw Error('online-disabled');
      return createRoomServiceClient({ baseUrl: config.baseUrl, allowInsecureLocalhost: config.allowInsecureLocalhost,
        fetch: (url, init) => nativeFetch(url, init), createWebSocket: url => new NativeWebSocket(url),
        clock: { nowMs: () => Date.now(), ...scheduler } });
    }
  });
  registerOnlineIpc(win, owner);
  registerOnlineExit(app, win, owner);
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });
