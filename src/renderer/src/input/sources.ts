import type { SourceSample } from './deviceManager';

export const DEADZONE = 0.2;

export function radialDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const len = Math.sqrt(x * x + y * y);
  if (len < dz) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - dz) / (1 - dz)) / len;
  return { x: x * scaled, y: y * scaled };
}

const CLUSTERS = [
  { key: 'kb:0', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', interact: 'KeyE', confirm: 'KeyF', cancel: 'KeyQ' },
  { key: 'kb:1', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', interact: 'Enter', confirm: 'ShiftRight', cancel: 'Backspace' }
];

/** Two keyboard clusters as virtual devices. Held keys are cleared on blur so nothing sticks after alt-tab (spec §8). */
export function createKeyboardSources(target: Window) {
  const held = new Set<string>();
  const presses = new Map<string, number>();   // keydown events (not auto-repeat) per code since the last sample
  const down = (e: KeyboardEvent): void => {
    if (!e.repeat) presses.set(e.code, (presses.get(e.code) ?? 0) + 1);
    held.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Backspace') e.preventDefault();
  };
  const up = (e: KeyboardEvent): void => { held.delete(e.code); };
  const blur = (): void => { held.clear(); presses.clear(); };
  target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur);
  return {
    sample(): SourceSample[] {
      const count = (code: string): number => presses.get(code) ?? 0;
      const out: SourceSample[] = CLUSTERS.map((c) => {
        const x = (held.has(c.right) ? 1 : 0) - (held.has(c.left) ? 1 : 0), y = (held.has(c.down) ? 1 : 0) - (held.has(c.up) ? 1 : 0);
        const len = Math.sqrt(x * x + y * y) || 1;
        const anyKeys = [c.up, c.down, c.left, c.right, c.interact, c.confirm, c.cancel];
        return {
          key: c.key, moveX: x / len, moveY: y / len,
          interact: held.has(c.interact), confirm: held.has(c.confirm), cancel: held.has(c.cancel),
          any: anyKeys.some((k) => held.has(k)),
          presses: { interact: count(c.interact), confirm: count(c.confirm), cancel: count(c.cancel), any: anyKeys.reduce((n, k) => n + count(k), 0) }
        };
      });
      presses.clear();
      return out;
    },
    destroy(): void { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); }
  };
}

/** Poll once per frame. `index` is ephemeral and the id string is never parsed (spec §6). */
export function sampleGamepads(): SourceSample[] {
  const out: SourceSample[] = [];
  for (const p of navigator.getGamepads()) {
    if (!p) continue;
    const b = (i: number): boolean => p.buttons[i]?.pressed ?? false;
    let { x, y } = radialDeadzone(p.axes[0] ?? 0, p.axes[1] ?? 0, DEADZONE);
    if (b(12)) y = -1; if (b(13)) y = 1; if (b(14)) x = -1; if (b(15)) x = 1;
    const any = p.buttons.some((btn) => btn.pressed) || Math.abs(p.axes[0] ?? 0) > DEADZONE || Math.abs(p.axes[1] ?? 0) > DEADZONE;
    out.push({ key: `gp:${p.index}`, moveX: x, moveY: y, interact: b(0), confirm: b(2), cancel: b(1), any });
  }
  return out;
}
