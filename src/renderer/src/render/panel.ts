import { Graphics } from 'pixi.js';
import { PANEL_FILL, PANEL_ALPHA, PANEL_BORDER, PANEL_BORDER_W, PANEL_INNER } from './theme';

/** A themed panel (spec Demo-x-c section 1): the dark fill, a 2 px border and a 1 px inner highlight. */
export function drawPanel(g: Graphics, x: number, y: number, w: number, h: number): Graphics {
  const b = PANEL_BORDER_W;
  g.rect(x, y, w, h).fill({ color: PANEL_FILL, alpha: PANEL_ALPHA });
  g.rect(x + b / 2, y + b / 2, w - b, h - b).stroke({ width: b, color: PANEL_BORDER });
  g.rect(x + b + 0.5, y + b + 0.5, w - 2 * b - 1, h - 2 * b - 1).stroke({ width: 1, color: PANEL_INNER });
  return g;
}

/** A panel that can be moved and resized: one Graphics, redrawn by set(). */
export interface Panel { g: Graphics; set(x: number, y: number, w: number, h: number): void }
export function makePanel(x: number, y: number, w: number, h: number): Panel {
  const g = new Graphics();
  const p: Panel = { g, set(px, py, pw, ph) { g.clear(); drawPanel(g, px, py, pw, ph); } };
  p.set(x, y, w, h);
  return p;
}
