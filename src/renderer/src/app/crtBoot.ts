// The CRT setting at boot (CRT map spec section 4), mirroring feelBoot.ts: read once from localStorage (a denied storage
// gives the default, subtle), and in dev builds only, F10 cycles full, subtle, off and saves the choice. No menu entry.
import { loadCrt, nextCrt, saveCrt, type CrtSetting } from '../render/crt';
import type { FeelStorage } from '../render/feel';
import type { KeySource } from './feelBoot';

/** Where the setting goes: main.ts's target writes the renderer (the Pixi filter) and the UI store's `crt` slice (React). */
export interface CrtTarget { crt(): CrtSetting; setCrt(setting: CrtSetting): void }

export function installCrt(target: CrtTarget, opts: { storage: () => FeelStorage; keys: KeySource; dev: boolean; log?: (message: string) => void }): void {
  target.setCrt(loadCrt(opts.storage));
  if (!opts.dev) return;
  opts.keys.addEventListener('keydown', (e) => {
    if (e.code !== 'F10') return;
    const next = nextCrt(target.crt());
    target.setCrt(next); saveCrt(opts.storage, next);
    opts.log?.(`crt: ${next}`);
  });
}
