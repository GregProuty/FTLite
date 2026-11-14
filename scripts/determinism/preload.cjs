const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('determinism', Object.freeze({
  engine: `Electron ${process.versions.electron}; Chromium ${process.versions.chrome}; V8 ${process.versions.v8}`,
  report: value => ipcRenderer.send('determinism-result', value)
}));
