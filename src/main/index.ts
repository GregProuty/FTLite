import { app, BrowserWindow, ipcMain, Menu } from 'electron';
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
import { validateModeMirror } from './network/onlineModes';
import { appendDuelRecord, duelRecordCallAllowed } from './network/duelRecords';
import { createRoomServiceClient } from '../network/session/serviceClient';
import { DUEL_RECORD_CHANNEL, FULLSCREEN_KEY, WINDOW_FULLSCREEN_CHANNEL } from '../shared/onlineSession';
declare const __FTLITE_PACKAGED_SERVICE_ORIGIN__: string;

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
  const configured = resolveOnlineConfig({ packaged, localServiceUrl: process.env['FTLITE_LOCAL_SERVICE_URL'], serviceUrl: process.env['FTLITE_SERVICE_URL'],
    packagedServiceOrigin: packaged ? __FTLITE_PACKAGED_SERVICE_ORIGIN__ : undefined });
  const config = typeof nativeFetch === 'function' && typeof NativeWebSocket === 'function' ? configured : { enabled: false } as const;
  const scheduler = { setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  // Test-only entries (H-2 spec §10), honoured only by an unpackaged build, as FTLITE_MODE is: the sector's online forms
  // (FTLITE_SECTOR_ONLINE_TEST=1) and a fixed first duel seed for the forced round end (FTLITE_DUEL_TEST_SEED).
  const sectorTestEntry = !packaged && process.env['FTLITE_SECTOR_ONLINE_TEST'] === '1';
  const testSeed = packaged ? undefined : process.env['FTLITE_DUEL_TEST_SEED'];
  const duelTestSeed = testSeed !== undefined && /^\d{1,10}$/.test(testSeed) && Number(testSeed) <= 0xffffffff ? Number(testSeed) : undefined;
  const owner = createOnlineSession({
    config, seatStore: createSeatStore(app.getPath('userData')), mirrorStore: createMirrorStore(app.getPath('userData'), validateModeMirror), platform: createOnlinePlatform(win),
    sectorTestEntry, duelTestSeed,
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
    if (input.type === 'keyDown' && input.key === FULLSCREEN_KEY) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // Settings' fullscreen toggle (main menu spec), trusted as onlineIpc.ts trusts its callers: only this window's own main
  // frame may ask. No argument reads the state; one boolean sets it; anything else is refused (answers false, no change).
  ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL);
  ipcMain.handle(WINDOW_FULLSCREEN_CHANNEL, (event, ...args: unknown[]) => {
    if (win.isDestroyed() || win.webContents.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return false;
    if (args.length > 1 || (args.length === 1 && typeof args[0] !== 'boolean')) return false;
    if (args.length === 0) return win.isFullScreen();
    win.setFullScreen(args[0] as boolean);
    return args[0];
  });
  // The duel playtest record (H-2 spec §8), trusted as the fullscreen channel is: only this window's main frame.
  ipcMain.removeHandler(DUEL_RECORD_CHANNEL);
  ipcMain.handle(DUEL_RECORD_CHANNEL, (event, ...args: unknown[]) => {
    if (!duelRecordCallAllowed(win.isDestroyed() || win.webContents.isDestroyed() ? null : win.webContents, event, args)) return false;
    return appendDuelRecord(app.getPath('userData'), args[0]);
  });
  win.on('closed', () => { ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL); ipcMain.removeHandler(DUEL_RECORD_CHANNEL); });
  // FTLITE_MODE (H-1 spec §3): `flight` opens the dev flight view and `duel` the solo duel; the renderer reads it as `?mode=`.
  const mode = process.env['FTLITE_MODE'];
  if (process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL']);
    if (mode) url.searchParams.set('mode', mode);
    win.loadURL(url.toString());
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), mode ? { query: { mode } } : undefined);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });
