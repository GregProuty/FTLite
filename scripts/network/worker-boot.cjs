// Electron check (web build spec §3.2): the built page, loaded from file://, starts the module host Worker and it answers.
// FTLITE_BOOT_PAGE points it at another built page (the packaged check below). No preload and no service: the Worker is asked to initialize with a foreign digest and must refuse it.
const { app, BrowserWindow } = require('electron');
const { resolve } = require('node:path');
app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const timer = setTimeout(() => { console.error('WORKER BOOT FAIL: timeout'); app.exit(1); }, 15000);
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    await win.loadFile(process.env.FTLITE_BOOT_PAGE || resolve(__dirname, '../../out/renderer/index.html'));
    const answer = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./assets/authorityWorker.js', location.href), { type: 'module' });
      worker.addEventListener('error', event => reject(String(event.message || 'worker error')));
      worker.addEventListener('message', event => { worker.terminate(); resolve(event.data); });
      worker.postMessage({ kind: 'initialize', protocolVersion: 2, modeId: 'duel', schemaVersion: 2, simVersion: 1, contentDigest: '0'.repeat(64), hostGeneration: 1 });
    })`);
    if (answer?.kind !== 'fatal' || answer.reason !== 'incompatible-identity') throw Error('unexpected answer ' + JSON.stringify(answer));
    console.log('WORKER BOOT PASS: module Worker started from the file:// page and answered');
    clearTimeout(timer); app.exit(0);
  } catch (error) { console.error('WORKER BOOT FAIL:', error?.message ?? error); clearTimeout(timer); app.exit(1); }
});
