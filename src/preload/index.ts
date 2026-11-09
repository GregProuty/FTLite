import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ftlite', {
  onSuspend(cb: () => void): void { ipcRenderer.on('app:suspend', () => cb()); },
  onResume(cb: () => void): void { ipcRenderer.on('app:resume', () => cb()); }
});
