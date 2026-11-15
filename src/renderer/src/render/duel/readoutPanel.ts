// The duel's side readout panel (H-1 spec §7 item 9, §8): draws readoutRows in the 220-px column on the right. Every
// display object is made at creation; a frame redraws the Graphics and sets text, so nothing is allocated per frame.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { INTERNAL_W } from '../../../../shared/resolution';
import { drawPanel } from '../panel';
import { BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD } from '../theme';
import { READOUT_MARGIN, READOUT_ROWS, READOUT_W, type ReadoutRow } from './readoutModel';

const HELP_LINES = 5, HELP_LINE = 14, PIP = 12, PIP_GAP = 4;

export interface ReadoutPanel { container: Container; draw(rows: readonly ReadoutRow[], help: readonly string[]): void }

export function createReadoutPanel(opts: { fontFamily: string }): ReadoutPanel {
  const container = new Container();
  container.position.set(INTERNAL_W - READOUT_W - READOUT_MARGIN, READOUT_MARGIN);
  const bg = new Graphics(), marks = new Graphics();
  container.addChild(bg, marks);
  const mk = (size: number, anchorX: number): BitmapText => {
    const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.roundPixels = true; t.anchor.set(anchorX, 0); container.addChild(t); return t;
  };
  const labels: BitmapText[] = [], values: BitmapText[] = [], help: BitmapText[] = [];
  for (let k = 0; k < READOUT_ROWS; k++) { labels.push(mk(FONT_SIZE, 0)); values.push(mk(FONT_SIZE, 1)); }
  for (let k = 0; k < HELP_LINES; k++) { const t = mk(FONT_NATIVE, 0); t.tint = DIM; help.push(t); }
  const setText = (t: BitmapText, s: string): void => { if (t.text !== s) t.text = s; };
  let shownRows = -1, shownHelp = -1;
  return {
    container,
    draw(rows, lines) {
      const n = Math.min(rows.length, READOUT_ROWS), h = Math.min(lines.length, HELP_LINES);
      const helpY = PAD + LINE * n + PAD, height = helpY + h * HELP_LINE + PAD;
      if (n !== shownRows || h !== shownHelp) { bg.clear(); drawPanel(bg, 0, 0, READOUT_W, height); shownRows = n; shownHelp = h; }
      marks.clear();
      for (let k = 0; k < READOUT_ROWS; k++) {
        const r = rows[k], l = labels[k]!, v = values[k]!, y = PAD - 6 + LINE * k;
        l.visible = v.visible = k < n && r !== undefined;
        if (!r || k >= n) continue;
        setText(l, r.label); setText(v, r.value); l.tint = r.labelTint; v.tint = r.valueTint;
        l.position.set(PAD, y); v.position.set(READOUT_W - PAD, y);
        if (r.pips) for (let p = 0; p < r.pips.max; p++) {
          const x = READOUT_W - PAD - (r.pips.max - p) * (PIP + PIP_GAP) + PIP_GAP, lit = p < r.pips.n;
          marks.rect(x, y + 9, PIP, PIP).fill(lit ? r.pips.colour : BAR_OFF).stroke({ width: 1, color: r.pips.colour, alpha: lit ? 1 : 0.5 });
        }
        if (r.bar) {
          const w = READOUT_W - 2 * PAD;
          marks.rect(PAD, y + LINE + 1, w, 3).fill(BAR_OFF).rect(PAD, y + LINE + 1, Math.round(w * Math.max(0, Math.min(1, r.bar.fill))), 3).fill(r.bar.colour);
        }
      }
      help.forEach((t, k) => { t.visible = k < h; if (k < h) { setText(t, lines[k]!); t.position.set(PAD, helpY + k * HELP_LINE); } });
    }
  };
}
