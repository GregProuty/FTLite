import { app, BrowserWindow, Menu, powerMonitor } from 'electron';
import { join } from 'node:path';
import { INTERNAL_W, INTERNAL_H } from '../shared/resolution';

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
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  powerMonitor.on('suspend', () => win.webContents.send('app:suspend'));
  powerMonitor.on('resume', () => win.webContents.send('app:resume'));
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
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
