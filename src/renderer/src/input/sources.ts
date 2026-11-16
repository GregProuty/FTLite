import type { SourceSample } from './deviceManager';

/** The one keyboard cluster (WASD), the online sector's only input device. The Settings controls list reads it. */
export const SECTOR_KEYS = { key: 'kb:0', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', interact: 'KeyE', confirm: 'KeyF', cancel: 'KeyQ', callout: 'KeyR' } as const;
const CLUSTERS = [SECTOR_KEYS];

/** The keyboard as one virtual device. Held keys are cleared on blur so nothing sticks after alt-tab (spec §8). */
export function createKeyboardSources(target: Window) {
  const held = new Set<string>();
  const presses = new Map<string, number>();   // keydown events (not auto-repeat) per code since the last sample
  const down = (e: KeyboardEvent): void => {
    const element = e.target as Element | null;
    if (element?.closest?.('input, select, textarea, button, [contenteditable="true"]')) return;
    if (!e.repeat) presses.set(e.code, (presses.get(e.code) ?? 0) + 1);
    held.add(e.code);
  };
  const up = (e: KeyboardEvent): void => { held.delete(e.code); };
  const blur = (): void => { held.clear(); presses.clear(); };
  target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur);
  return {
    reset: blur,
    sample(): SourceSample[] {
      const count = (code: string): number => presses.get(code) ?? 0;
      const out: SourceSample[] = CLUSTERS.map((c) => {
        const x = (held.has(c.right) ? 1 : 0) - (held.has(c.left) ? 1 : 0), y = (held.has(c.down) ? 1 : 0) - (held.has(c.up) ? 1 : 0);
        const len = Math.sqrt(x * x + y * y) || 1;
        const anyKeys = [c.up, c.down, c.left, c.right, c.interact, c.confirm, c.cancel, c.callout];
        return {
          key: c.key, moveX: x / len, moveY: y / len,
          interact: held.has(c.interact), confirm: held.has(c.confirm), cancel: held.has(c.cancel), callout: held.has(c.callout),
          any: anyKeys.some((k) => held.has(k)),
          presses: { interact: count(c.interact), confirm: count(c.confirm), cancel: count(c.cancel), any: anyKeys.reduce((n, k) => n + count(k), 0), callout: count(c.callout) }
        };
      });
      presses.clear();
      return out;
    },
    destroy(): void { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); }
  };
}
