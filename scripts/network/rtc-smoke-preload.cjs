// Gate-only preload, never part of a production entry.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rtcSmokeReport', value => ipcRenderer.send('rtc-smoke-event', value));
ipcRenderer.on('rtc-smoke-port', (event, value) => {
  window.postMessage({ kind: 'rtc-smoke-port', player: value.player, runId: value.runId }, '*', event.ports);
});
