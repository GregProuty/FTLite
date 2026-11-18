import { app, BrowserWindow, ipcMain, Menu, powerMonitor, type IpcMainEvent } from 'electron';
import { join } from 'node:path';
import { INTERNAL_W, INTERNAL_H } from '../shared/resolution';
import { DISABLED_PAGE_ONLINE_CONFIG, resolveOnlineConfig, toPageOnlineConfig } from '../shared/onlineConfig';
import { registerAppExit } from './appExit';
import { appendDuelRecord, duelRecordCallAllowed } from './network/duelRecords';
import { APP_RESUME_CHANNEL, APP_SUSPEND_CHANNEL, DUEL_RECORD_CHANNEL, FULLSCREEN_KEY, ONLINE_CONFIG_CHANNEL, WINDOW_FULLSCREEN_CHANNEL } from '../shared/onlineSession';
declare const __FTLITE_PACKAGED_SERVICE_ORIGIN__: string;

/** Electron after the web build (spec §3.3): a thin window with seven jobs. The online session, its peers and the host
 *  Worker run in the page, exactly as in a browser. */
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
      // Job 1: the RTC peers, the session and the lease relay live in this page; a minimized host keeps its 60 Hz.
      backgroundThrottling: false,
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true
    }
  });
  const contents = win.webContents;
  const trusted = (event: { sender: unknown; senderFrame: unknown }) => !win.isDestroyed() && !contents.isDestroyed()
    && event.sender === contents && event.senderFrame === contents.mainFrame;
  // Job 7: the online configuration, from the same environment and packaging rules as before (H-2 spec §10 test entries
  // are honoured only unpackaged), handed to the page once through the preload.
  const configured = resolveOnlineConfig({ packaged, localServiceUrl: process.env['FTLITE_LOCAL_SERVICE_URL'], serviceUrl: process.env['FTLITE_SERVICE_URL'],
    packagedServiceOrigin: packaged ? __FTLITE_PACKAGED_SERVICE_ORIGIN__ : undefined });
  const onlineConfig = toPageOnlineConfig(configured, { packaged, sectorOnlineTest: process.env['FTLITE_SECTOR_ONLINE_TEST'],
    duelTestSeed: process.env['FTLITE_DUEL_TEST_SEED'], testProbe: process.env['FTLITE_ONLINE_TEST_PROBE'] });
  const answerConfig = (event: IpcMainEvent) => { event.returnValue = trusted(event) ? onlineConfig : DISABLED_PAGE_ONLINE_CONFIG; };
  ipcMain.removeAllListeners(ONLINE_CONFIG_CHANNEL);
  ipcMain.on(ONLINE_CONFIG_CHANNEL, answerConfig);
  // Job 5: OS sleep and wake, pushed to the page (its session retires the game, then reconnects).
  const push = (channel: string) => () => { if (!win.isDestroyed() && !contents.isDestroyed()) { try { contents.send(channel); } catch { /* closing */ } } };
  const suspend = push(APP_SUSPEND_CHANNEL), resume = push(APP_RESUME_CHANNEL);
  powerMonitor.on('suspend', suspend); powerMonitor.on('resume', resume);
  // Job 6: the exit save on close, and a page leave prompt never silently blocks a close.
  registerAppExit(app, win, ipcMain);
  contents.on('will-prevent-unload', event => event.preventDefault());
  Menu.setApplicationMenu(null);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  // Job 2: fullscreen, from F11 and from Settings' toggle (only this window's own main frame may ask).
  contents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === FULLSCREEN_KEY) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL);
  ipcMain.handle(WINDOW_FULLSCREEN_CHANNEL, (event, ...args: unknown[]) => {
    if (!trusted(event)) return false;
    if (args.length > 1 || (args.length === 1 && typeof args[0] !== 'boolean')) return false;
    if (args.length === 0) return win.isFullScreen();
    win.setFullScreen(args[0] as boolean);
    return args[0];
  });
  // Job 4: the duel playtest record (H-2 spec §8), trusted as the fullscreen channel is.
  ipcMain.removeHandler(DUEL_RECORD_CHANNEL);
  ipcMain.handle(DUEL_RECORD_CHANNEL, (event, ...args: unknown[]) => {
    if (!duelRecordCallAllowed(win.isDestroyed() || contents.isDestroyed() ? null : contents, event, args)) return false;
    return appendDuelRecord(app.getPath('userData'), args[0]);
  });
  win.on('closed', () => {
    ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL); ipcMain.removeHandler(DUEL_RECORD_CHANNEL); ipcMain.off(ONLINE_CONFIG_CHANNEL, answerConfig);
    powerMonitor.off('suspend', suspend); powerMonitor.off('resume', resume);
  });
  // Job 3: load the page. FTLITE_MODE (H-1 spec §3): `flight` opens the dev flight view and `duel` the solo duel.
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
