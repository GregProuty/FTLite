// Harness-only preload; never included in the production build or renderer API.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hostSmokeReport', value => ipcRenderer.send('host-smoke-event', value));
ipcRenderer.on('host-smoke-port', event => {
  window.postMessage({ kind: 'host-smoke-port' }, '*', event.ports);
});
