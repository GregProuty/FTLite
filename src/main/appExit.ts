import type { App, BrowserWindow, Event, IpcMain, IpcMainInvokeEvent } from 'electron';
import { APP_PREPARE_EXIT_CHANNEL } from '../shared/onlineSession';

export const APP_EXIT_TIMEOUT_MS = 3000;
/** Close and quit share one exit save (web build spec §3.3 job 6): main asks the page to run its session's prepareExit
 *  over app:prepare-exit and closes when the page answers or after 3 s, whichever comes first. */
export function registerAppExit(app: Pick<App, 'on' | 'off' | 'quit'>, win: BrowserWindow, ipc: Pick<IpcMain, 'handle' | 'removeHandler'>, timeoutMs = APP_EXIT_TIMEOUT_MS): void {
  const contents = win.webContents;
  let work: Promise<void> | undefined, ready = false, quitting = false, request = 0, answer: (() => void) | undefined;
  ipc.removeHandler(APP_PREPARE_EXIT_CHANNEL);
  ipc.handle(APP_PREPARE_EXIT_CHANNEL, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (win.isDestroyed() || contents.isDestroyed() || event.sender !== contents || event.senderFrame !== contents.mainFrame
      || args.length !== 1 || args[0] !== request || !answer) return false;
    answer(); return true;
  });
  function finish(event: Event, quit: boolean): void {
    if (ready) return;
    event.preventDefault(); quitting ||= quit;
    if (work) return;
    // Install ownership before calling out: the page may request another close.
    work = new Promise<void>(resolve => {
      const timer = setTimeout(done, timeoutMs);
      function done(): void { clearTimeout(timer); answer = undefined; contents.off('render-process-gone', done); resolve(); }
      answer = done;
      if (win.isDestroyed() || contents.isDestroyed()) { done(); return; }
      contents.once('render-process-gone', done);
      try { contents.send(APP_PREPARE_EXIT_CHANNEL, ++request); } catch { done(); }
    });
    void work.then(() => {
      ready = true; ipc.removeHandler(APP_PREPARE_EXIT_CHANNEL);
      if (quitting) app.quit(); else if (!win.isDestroyed()) win.close();
    });
  }
  const close = (event: Event) => finish(event, false), quit = (event: Event) => finish(event, true);
  win.on('close', close); app.on('before-quit', quit);
  win.once('closed', () => { win.off('close', close); app.off('before-quit', quit); ipc.removeHandler(APP_PREPARE_EXIT_CHANNEL); });
}
