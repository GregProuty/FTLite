// The Crew3D art toggle at boot (Crew3D spec section 4), mirroring feelBoot.ts: read once from localStorage (a denied
// storage gives the default, on), and in dev builds only, F8 switches between the 3D crew and the old art and saves the
// choice. Not a player-facing setting.
import { loadCrew3d, nextCrew3d, saveCrew3d, type Crew3dSetting } from '../render/crew3dModel';
import type { FeelStorage } from '../render/feel';
import type { KeySource } from './feelBoot';

export interface Crew3dTarget { crew3d?(): Crew3dSetting; setCrew3d?(setting: Crew3dSetting): void }

export function installCrew3d(target: Crew3dTarget, opts: { storage: () => FeelStorage; keys: KeySource; dev: boolean; log?: (message: string) => void }): void {
  target.setCrew3d?.(loadCrew3d(opts.storage));
  if (!opts.dev) return;
  opts.keys.addEventListener('keydown', (e) => {
    if (e.code !== 'F8') return;
    const next = nextCrew3d(target.crew3d?.() ?? 'on');
    target.setCrew3d?.(next); saveCrew3d(opts.storage, next);
    opts.log?.(`crew3d: ${next}`);
  });
}
