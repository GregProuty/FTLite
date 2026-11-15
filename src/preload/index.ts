import { contextBridge, ipcRenderer } from 'electron';
import { copyOnlinePortDescriptor, ONLINE_CHANNELS, ONLINE_PORT_CHANNEL, ONLINE_PORT_SOURCE, ONLINE_STATUS_CHANNEL,
  validateOnlineAction, validateOnlinePortEnvelope, validateOnlineResult, validateOnlineStatusEnvelope,
  type FtlitePreloadApi, type OnlineAction, type OnlineResult, type Unsubscribe } from '../shared/onlineSession';

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
  online: {
    host: capacity => action({ type: 'host', capacity }),
    join: code => action({ type: 'join', code }),
    ready: ready => action({ type: 'ready', ready }),
    removeSeat: seatId => action({ type: 'remove-seat', seatId }),
    viewState: (epoch, phase) => action({ type: 'view-state', epoch, phase }),
    reconnect: () => action({ type: 'reconnect' }),
    start: () => action({ type: 'start' }),
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
    onStatus(callback) {
      const listener = (_event: unknown, value: unknown) => { if (validateOnlineStatusEnvelope(value)) callback(value); };
      ipcRenderer.on(ONLINE_STATUS_CHANNEL, listener);
      return () => { ipcRenderer.off(ONLINE_STATUS_CHANNEL, listener); };
    }
  }
};
contextBridge.exposeInMainWorld('ftlite', api);
