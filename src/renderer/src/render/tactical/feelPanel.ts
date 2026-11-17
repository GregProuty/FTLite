// The flight view's feel panel (H-1 spec §9), in the readout's place on the right. Made once; a frame only sets text.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { drawPanel } from '../panel';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD, TEXT } from '../theme';

import { FEEL_HELP as HELP, FEEL_HELP_LINE as HELP_LINE, FEEL_PANEL_H, FEEL_PANEL_W, FEEL_ROWS as ROWS } from './feelModel';
export { FEEL_PANEL_H, FEEL_PANEL_MARGIN, FEEL_PANEL_W } from './feelModel';

export interface FeelPanel { container: Container; draw(rows: readonly (readonly [string, string])[]): void }

export function createFeelPanel(opts: { fontFamily: string; x: number; y: number }): FeelPanel {
  const container = new Container();
  container.position.set(opts.x, opts.y);
  container.addChild(drawPanel(new Graphics(), 0, 0, FEEL_PANEL_W, FEEL_PANEL_H));
  const mk = (text: string, size: number, tint: number, x: number, y: number, anchorX = 0): BitmapText => {
    const t = new BitmapText({ text, style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.tint = tint; t.roundPixels = true; t.anchor.set(anchorX, 0); t.position.set(x, y); container.addChild(t); return t;
  };
  mk('FLIGHT FEEL', FONT_SIZE, AMBER, PAD, PAD - 6);
  const labels: BitmapText[] = [], values: BitmapText[] = [];
  for (let k = 0; k < ROWS; k++) {
    const y = PAD - 6 + LINE * (k + 1);
    labels.push(mk('', FONT_SIZE, DIM, PAD, y));
    values.push(mk('', FONT_SIZE, TEXT, FEEL_PANEL_W - PAD, y, 1));
  }
  HELP.forEach((line, k) => mk(line, FONT_NATIVE, DIM, PAD, PAD + LINE * (ROWS + 1) + PAD + k * HELP_LINE));
  return {
    container,
    draw(rows) {
      for (let k = 0; k < ROWS; k++) {
        const [l, v] = rows[k] ?? ['', ''];
        if (labels[k]!.text !== l) labels[k]!.text = l;
        if (values[k]!.text !== v) values[k]!.text = v;
      }
    }
  };
}
