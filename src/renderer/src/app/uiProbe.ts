// The text-parity probe (UI-ii Task 5, `?mode=uiprobe`): Pixi BitmapText on the left half, <PixelText> on the right.
import { BitmapText, Graphics } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../shared/resolution';
import type { Renderer } from '../render/renderer';
import { AMBER, DIM, GOOD, TEXT } from '../render/theme';
import { CREW_SHIP } from '../render/tactical/shipColours';
import type { DuelUiView } from '../ui/views';
import { PROBE_SAMPLES } from '../ui/probe/samples';

/** A fixture duel view for `?mode=uiprobe&probe=duel`: readout rows, the end card and all three banners. */
export function duelProbeFixture(): DuelUiView {
  return {
    readout: { rows: [
      { label: 'WEAPONS', value: '', labelTint: AMBER, valueTint: AMBER },
      { label: 'HULL', value: '18/30', labelTint: DIM, valueTint: TEXT },
      { label: 'SHIELD', value: '', labelTint: DIM, valueTint: TEXT, pips: { n: 1, max: 2, colour: CREW_SHIP } },
      { label: 'LASER', value: 'READY — 98%', labelTint: DIM, valueTint: GOOD, bar: { fill: 0.6, colour: AMBER } }
    ], help: ['TAB: SWITCH', 'ENTER: REMATCH…'] },
    end: { title: 'VICTORY', tint: GOOD, length: 'DUEL LENGTH 1:23', prompt: 'ENTER: REMATCH   ESC: LEAVE' },
    banners: { interior: 'PAUSED', tactical: 'PAUSED TACTICAL', notice: 'YOU: HELM' },
    overlay: null,
    crt: false
  };
}

export function startUiProbe(renderer: Renderer, withText = true): void {
  for (const child of renderer.app.stage.children) child.visible = false;
  const bg = new Graphics().rect(0, 0, INTERNAL_W, INTERNAL_H).fill(0x05060a);
  renderer.app.stage.addChild(bg);
  if (!withText) return;
  for (const p of PROBE_SAMPLES) {
    const t = new BitmapText({ text: p.text, style: { fontFamily: renderer.assets.fontFamily, fontSize: p.size } });
    t.tint = p.tint; t.anchor.set(p.anchorX, p.anchorY); t.roundPixels = true; t.position.set(p.x, p.y);
    renderer.app.stage.addChild(t);
  }
}
