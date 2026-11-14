const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const url = process.argv[2], profile = app.commandLine.getSwitchValue('user-data-dir');
if (!url || !profile || new URL(url).hostname !== '127.0.0.1') throw Error('invalid harness launch');
app.setPath('userData', profile);
app.disableHardwareAcceleration();
let window, reported = false;
async function report(value, status = 0) {
  if (reported) return; reported = true;
  try {
    const target = new URL(`/result/${new URL(url).searchParams.get('token')}`, url);
    const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) status = 1;
  } catch (error) { console.error(error); status = 1; }
  app.exit(status);
}
app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } });
  ipcMain.on('determinism-result', (event, value) => {
    if (event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame) void report(value, value?.error ? 1 : 0);
  });
  window.webContents.on('render-process-gone', (_, details) => void report({ error: `renderer gone: ${details.reason}` }, 1));
  window.webContents.on('did-fail-load', (_, code, description) => void report({ error: `page load ${code}: ${description}` }, 1));
  await window.loadURL(url);
}).catch(error => report({ error: String(error.stack ?? error) }, 1));
