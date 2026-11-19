import { contextBridge, ipcRenderer } from 'electron';
import { APP_PREPARE_EXIT_CHANNEL, APP_RESUME_CHANNEL, APP_SUSPEND_CHANNEL, DUEL_RECORD_CHANNEL, ONLINE_CONFIG_CHANNEL, WINDOW_FULLSCREEN_CHANNEL,
  type FtlitePreloadApi, type Unsubscribe } from '../shared/onlineSession';
import { DISABLED_PAGE_ONLINE_CONFIG, validatePageOnlineConfig, type PageOnlineConfig } from '../shared/onlineConfig';

function lifecycle(channel: typeof APP_SUSPEND_CHANNEL | typeof APP_RESUME_CHANNEL, callback: () => void): Unsubscribe {
  const listener = () => callback(); ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.off(channel, listener); };
}
/** Main's resolved online configuration (web build spec §3.3), read once and frozen. Anything malformed is disabled. */
function readOnlineConfig(): PageOnlineConfig {
  try {
    const value: unknown = ipcRenderer.sendSync(ONLINE_CONFIG_CHANNEL);
    if (validatePageOnlineConfig(value)) return Object.freeze({ ...value });
  } catch { /* disabled below */ }
  return Object.freeze({ ...DISABLED_PAGE_ONLINE_CONFIG });
}
// The close handshake: main pushes a request number; the page's handler runs; the same number is answered.
let exitHandler: (() => Promise<void>) | undefined;
ipcRenderer.on(APP_PREPARE_EXIT_CHANNEL, (_event, request: unknown) => {
  if (!Number.isSafeInteger(request) || (request as number) <= 0) return;
  const handler = exitHandler;
  void Promise.resolve().then(() => handler?.()).catch(() => {}).finally(() => { void ipcRenderer.invoke(APP_PREPARE_EXIT_CHANNEL, request).catch(() => {}); });
});
const api: FtlitePreloadApi = {
  onlineConfig: readOnlineConfig(),
  onSuspend: callback => lifecycle(APP_SUSPEND_CHANNEL, callback),
  onResume: callback => lifecycle(APP_RESUME_CHANNEL, callback),
  onPrepareExit(handler) {
    if (typeof handler !== 'function') return () => {};
    exitHandler = handler;
    return () => { if (exitHandler === handler) exitHandler = undefined; };
  },
  async recordDuel(record) { try { return (await ipcRenderer.invoke(DUEL_RECORD_CHANNEL, structuredClone(record))) === true; } catch { return false; } },
  window: {
    async isFullScreen() { try { return (await ipcRenderer.invoke(WINDOW_FULLSCREEN_CHANNEL)) === true; } catch { return false; } },
    async setFullScreen(on) { try { return (await ipcRenderer.invoke(WINDOW_FULLSCREEN_CHANNEL, on === true)) === true; } catch { return false; } }
  }
};
contextBridge.exposeInMainWorld('ftlite', api);
