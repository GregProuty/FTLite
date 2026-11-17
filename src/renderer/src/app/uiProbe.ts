// The text-parity probe (UI-ii Task 5, `?mode=uiprobe`): Pixi BitmapText on the left half, <PixelText> on the right.
import { BitmapText, Graphics } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../shared/resolution';
import type { Renderer } from '../render/renderer';
import { PROBE_SAMPLES } from '../ui/probe/samples';

export function startUiProbe(renderer: Renderer): void {
  for (const child of renderer.app.stage.children) child.visible = false;
  const bg = new Graphics().rect(0, 0, INTERNAL_W, INTERNAL_H).fill(0x05060a);
  renderer.app.stage.addChild(bg);
  for (const p of PROBE_SAMPLES) {
    const t = new BitmapText({ text: p.text, style: { fontFamily: renderer.assets.fontFamily, fontSize: p.size } });
    t.tint = p.tint; t.anchor.set(p.anchorX, p.anchorY); t.roundPixels = true; t.position.set(p.x, p.y);
    renderer.app.stage.addChild(t);
  }
}
