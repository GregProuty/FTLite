import { contextBridge, ipcRenderer } from 'electron';
import { copyOnlinePortDescriptor, DUEL_RECORD_CHANNEL, ONLINE_CHANNELS, ONLINE_LINK_STATS_CHANNEL, ONLINE_PORT_CHANNEL, ONLINE_PORT_SOURCE, ONLINE_STATUS_CHANNEL, WINDOW_FULLSCREEN_CHANNEL,
  validateOnlineAction, validateOnlineLinkStats, validateOnlinePortEnvelope, validateOnlineResult, validateOnlineStatusEnvelope,
  type DuelCrewSize, type FtlitePreloadApi, type OnlineAction, type OnlineResult, type Unsubscribe } from '../shared/onlineSession';

async function action(value: OnlineAction): Promise<OnlineResult> {
  if (!validateOnlineAction(value)) return { ok: false, code: 'invalid-action' };
  try {
    const result: unknown = await ipcRenderer.invoke(ONLINE_CHANNELS[value.type], value);
    return validateOnlineResult(result) ? result : { ok: false, code: 'invalid-status' };
  } catch { return { ok: false, code: 'unavailable' }; }
}
function lifecycle(channel: 'app:suspend' | 'app:resume', callback: () => void): Unsubscribe {
  const listener = () => callback(); ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.off(channel, listener); };
}
let lastEpoch = 0;
ipcRenderer.on(ONLINE_PORT_CHANNEL, (event, value: unknown) => {
  const close = () => { for (const port of event.ports) { try { port.close(); } catch {} } };
  if (event.ports.length !== 1 || !validateOnlinePortEnvelope(value) || value.descriptor.epoch <= lastEpoch) { close(); return; }
  try {
    window.postMessage({ source: ONLINE_PORT_SOURCE, version: 1, descriptor: copyOnlinePortDescriptor(value.descriptor) }, '*', event.ports);
    lastEpoch = value.descriptor.epoch;
  } catch { close(); }
});
const api: FtlitePreloadApi = {
  onSuspend: callback => lifecycle('app:suspend', callback),
  onResume: callback => lifecycle('app:resume', callback),
  async recordDuel(record) { try { return (await ipcRenderer.invoke(DUEL_RECORD_CHANNEL, structuredClone(record))) === true; } catch { return false; } },
  window: {
    async isFullScreen() { try { return (await ipcRenderer.invoke(WINDOW_FULLSCREEN_CHANNEL)) === true; } catch { return false; } },
    async setFullScreen(on) { try { return (await ipcRenderer.invoke(WINDOW_FULLSCREEN_CHANNEL, on === true)) === true; } catch { return false; } }
  },
  online: {
    host: room => action(room?.mode === 'sector' ? { type: 'host', mode: 'sector', capacity: room.capacity } : { type: 'host', mode: 'duel', capacity: room?.capacity as DuelCrewSize }),
    join: (code, mode) => action(mode ? { type: 'join', code, mode } : { type: 'join', code }),
    ready: ready => action({ type: 'ready', ready }),
    removeSeat: seatId => action({ type: 'remove-seat', seatId }),
    viewState: (epoch, phase) => action({ type: 'view-state', epoch, phase }),
    reconnect: () => action({ type: 'reconnect' }),
    rehost: () => action({ type: 'rehost' }),
    start: helmPlayer => action(helmPlayer === undefined ? { type: 'start' } : { type: 'start', helmPlayer }),
    retry: () => action({ type: 'retry' }),
    leave: () => action({ type: 'leave' }),
    forgetSeat: () => action({ type: 'forget-seat' }),
    async readStatus() {
      try {
        const value: unknown = await ipcRenderer.invoke(ONLINE_STATUS_CHANNEL);
        if (validateOnlineStatusEnvelope(value)) return value;
        if (validateOnlineResult(value) && !value.ok) return value;
        return { ok: false, code: 'invalid-status' };
      } catch { return { ok: false, code: 'unavailable' }; }
    },
    async linkStats() {
      try { const value: unknown = await ipcRenderer.invoke(ONLINE_LINK_STATS_CHANNEL); return validateOnlineLinkStats(value) ? { route: value.route, rttMs: value.rttMs } : null; }
      catch { return null; }
    },
    onStatus(callback) {
      const listener = (_event: unknown, value: unknown) => { if (validateOnlineStatusEnvelope(value)) callback(value); };
      ipcRenderer.on(ONLINE_STATUS_CHANNEL, listener);
      return () => { ipcRenderer.off(ONLINE_STATUS_CHANNEL, listener); };
    }
  }
};
contextBridge.exposeInMainWorld('ftlite', api);
