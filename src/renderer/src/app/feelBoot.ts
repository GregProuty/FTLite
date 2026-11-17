// The feel setting at boot (Art-i spec section 7): read once from localStorage (a denied storage gives the default), and
// in dev builds only, F9 cycles full, reduced, off and saves the choice. There is no menu entry in Art-i.
import { loadFeel, nextFeel, saveFeel, type FeelSetting, type FeelStorage } from '../render/feel';

export interface FeelTarget { feel(): FeelSetting; setFeel(setting: FeelSetting): void }
export interface KeySource { addEventListener(type: 'keydown', cb: (e: { code: string }) => void): void }

export function installFeel(target: FeelTarget, opts: { storage: () => FeelStorage; keys: KeySource; dev: boolean; log?: (message: string) => void }): void {
  target.setFeel(loadFeel(opts.storage));
  if (!opts.dev) return;
  opts.keys.addEventListener('keydown', (e) => {
    if (e.code !== 'F9') return;
    const next = nextFeel(target.feel());
    target.setFeel(next); saveFeel(opts.storage, next);
    opts.log?.(`feel: ${next}`);
  });
}
