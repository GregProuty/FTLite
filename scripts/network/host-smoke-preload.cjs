// Harness-only preload; never included in the production build or renderer API.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hostSmokeReport', value => ipcRenderer.send('host-smoke-event', value));
// Producer page: a port handed over by main.
ipcRenderer.on('host-smoke-port', event => {
  window.postMessage({ kind: 'host-smoke-port' }, '*', event.ports);
});
// Owner page: a game port the page posts to itself goes to main (the documented main-world MessagePort pattern).
window.addEventListener('message', event => {
  if (event.source === window && event.data?.kind === 'host-smoke-port-out' && event.ports.length === 1) ipcRenderer.postMessage('host-smoke-port-out', null, [...event.ports]);
});
