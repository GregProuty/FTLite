import { ipcMain, powerMonitor, type BrowserWindow, type IpcMainInvokeEvent, type MessagePortMain } from 'electron';
import { copyOnlineStatus, ONLINE_CHANNELS, ONLINE_STATUS_CHANNEL, validateOnlineAction, validateOnlineResult,
  type OnlineStatus, type OnlineStatusEnvelope, type Unsubscribe } from '../../shared/onlineSession';
import type { OnlineSessionOwner } from './onlineSession';

let registered: BrowserWindow | undefined;
const invalidStatus = (): OnlineStatus => ({ phase: 'error', role: null, ownSeat: null, snapshot: null,
  attachmentEpoch: 0, error: 'invalid-status', retryAtMs: null, persistent: false, actions: [] });
/** One visible session owner. No renderer can select another owner or invoke an arbitrary channel. */
export function registerOnlineIpc(win: BrowserWindow, owner: OnlineSessionOwner): Unsubscribe {
  // Windows may not show the newly constructed application window until loading.
  // Registration is main-owned; each invocation still checks visibility and exact sender/frame.
  if (registered || win.isDestroyed()) throw Error('online-registration-invalid');
  const contents = win.webContents;
  registered = win;
  let removed = false, revision = 1;
  const safe = (value: OnlineStatus): OnlineStatus => { try { return copyOnlineStatus(value); } catch { return invalidStatus(); } };
  let current: OnlineStatus;
  try { current = safe(owner.status()); } catch { current = invalidStatus(); }
  const envelope = (): OnlineStatusEnvelope => ({ version: 1, revision, status: copyOnlineStatus(current) });
  function trusted(event: IpcMainInvokeEvent): boolean {
    const ports = (event as IpcMainInvokeEvent & { ports?: MessagePortMain[] }).ports ?? [];
    for (const port of ports) { try { port.close(); } catch {} }
    return !removed && !ports.length && !win.isDestroyed() && !win.webContents.isDestroyed() && win.isVisible()
      && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  }
  for (const [type, channel] of Object.entries(ONLINE_CHANNELS)) ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!trusted(event)) return { ok: false, code: 'unauthorized' };
    const action = args[0];
    if (args.length !== 1 || !validateOnlineAction(action) || action.type !== type) return { ok: false, code: 'invalid-action' };
    try {
      const result = await owner.dispatch(structuredClone(action));
      return validateOnlineResult(result) ? structuredClone(result) : { ok: false, code: 'invalid-status' };
    } catch { return { ok: false, code: 'unavailable' }; }
  });
  ipcMain.handle(ONLINE_STATUS_CHANNEL, (event, ...args: unknown[]) => {
    if (!trusted(event)) return { ok: false, code: 'unauthorized' };
    return args.length ? { ok: false, code: 'invalid-action' } : envelope();
  });
  const unsubscribe = owner.subscribe(status => {
    if (removed || revision >= Number.MAX_SAFE_INTEGER) return;
    current = safe(status); revision++;
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      try { win.webContents.send(ONLINE_STATUS_CHANNEL, envelope()); } catch { /* window may be closing */ }
    }
  });
  function lifecycle(channel: string): void {
    if (!removed && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      try { win.webContents.send(channel); } catch { /* already closing */ }
    }
  }
  const suspend = () => { if (!removed) { void owner.suspend().catch(() => {}); lifecycle('app:suspend'); } };
  const resume = () => lifecycle('app:resume');
  function remove(): void {
    if (removed) return; removed = true; registered = undefined;
    for (const channel of [...Object.values(ONLINE_CHANNELS), ONLINE_STATUS_CHANNEL]) ipcMain.removeHandler(channel);
    unsubscribe(); powerMonitor.off('suspend', suspend); powerMonitor.off('resume', resume);
    win.off('closed', remove); contents.off('render-process-gone', remove);
    void owner.dispose().catch(() => {});
  }
  powerMonitor.on('suspend', suspend); powerMonitor.on('resume', resume);
  win.on('closed', remove); win.webContents.on('render-process-gone', remove);
  return remove;
}
