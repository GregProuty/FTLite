// The fail path of the background-tab measurement (web build spec §3.5): a hidden hosting tab may be throttled, so while
// this tab hosts a lobby or a match and is hidden, its title (what the player sees on the tab strip) says so.
import type { OnlineStatus } from '../../../../shared/onlineSession';

export const KEEP_VISIBLE_TEXT = 'Keep this tab visible: the match runs on your computer';
const HOSTING: readonly OnlineStatus['phase'][] = ['lobby', 'connecting', 'syncing', 'running', 'paused', 'saving'];
export function watchHostVisibility(deps: { document: Pick<Document, 'visibilityState' | 'title' | 'addEventListener' | 'removeEventListener'>;
  onStatus(cb: (status: Pick<OnlineStatus, 'role' | 'phase'>) => void): () => void }): () => void {
  const doc = deps.document;
  let hosting = false, shown = false, saved = doc.title;
  const apply = () => {
    const show = hosting && doc.visibilityState === 'hidden';
    if (show && !shown) { saved = doc.title; doc.title = KEEP_VISIBLE_TEXT; shown = true; }
    else if (!show && shown) { doc.title = saved; shown = false; }
  };
  const off = deps.onStatus(status => { hosting = status.role === 'host' && HOSTING.includes(status.phase); apply(); });
  doc.addEventListener('visibilitychange', apply);
  return () => { off(); doc.removeEventListener('visibilitychange', apply); hosting = false; apply(); };
}
