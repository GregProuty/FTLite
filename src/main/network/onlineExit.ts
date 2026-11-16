import type { App, BrowserWindow, Event } from 'electron';
import type { OnlineSessionOwner } from './onlineSession';

/** Close and quit share the owner's bounded save before native resource retirement. */
export function registerOnlineExit(app: App, win: BrowserWindow, owner: Pick<OnlineSessionOwner, 'prepareExit' | 'dispose'>): void {
  let work: Promise<void> | undefined, ready = false, quitting = false;
  function finish(event: Event, quit: boolean) {
    if (ready) return;
    event.preventDefault(); quitting ||= quit;
    if (work) return;
    // Install ownership before calling out: status observers may request another close.
    work = Promise.resolve().then(() => owner.prepareExit()).then(() => owner.dispose());
    void work.catch(() => {}).then(() => {
      ready = true;
      if (quitting) app.quit(); else if (!win.isDestroyed()) win.close();
    });
  }
  const close = (event: Event) => finish(event, false), quit = (event: Event) => finish(event, true);
  win.on('close', close); app.on('before-quit', quit);
  win.once('closed', () => { win.off('close', close); app.off('before-quit', quit); });
}
