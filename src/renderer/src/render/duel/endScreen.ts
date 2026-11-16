// The duel's end screen (H-1 spec §4 End): the outcome, the duel's length and how to start the next one. The model is
// pure; the layer is made once and only sets text and visibility.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { Outcome } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { drawPanel } from '../panel';
import { AMBER, BACKDROP, BACKDROP_ALPHA, DIM, FONT_SIZE, GOOD, TEXT, TITLE_SIZE, WARN } from '../theme';

export interface EndView { title: string; tint: number; length: string; prompt: string }

/** The end card for a decided duel, or null while it runs. `ticks` is the duel's length in tactical ticks. `menu` adds
 *  the main-menu key when the duel runs inside the app (main menu spec). */
export function endModel(outcome: number, ticks: number, seed: number, menu = false): EndView | null {
  if (outcome === Outcome.Running) return null;
  const title = outcome === Outcome.CrewWins ? 'VICTORY' : outcome === Outcome.EnemyWins ? 'DEFEAT' : 'BOTH SHIPS LOST';
  const tint = outcome === Outcome.CrewWins ? GOOD : outcome === Outcome.EnemyWins ? WARN : AMBER;
  const s = Math.floor(ticks / TICK_HZ);
  return { title, tint, length: `DUEL LENGTH ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, prompt: `ENTER: NEW DUEL (SEED ${seed + 1})${menu ? '   M: MAIN MENU' : ''}` };
}

export interface EndScreen { container: Container; draw(view: EndView | null): void }

const CARD_W = 560, CARD_H = 200;

export function createEndScreen(opts: { fontFamily: string }): EndScreen {
  const container = new Container();
  container.visible = false;
  const backdrop = new Graphics().rect(0, 0, INTERNAL_W, INTERNAL_H).fill({ color: BACKDROP, alpha: BACKDROP_ALPHA * 0.6 });
  const card = drawPanel(new Graphics(), (INTERNAL_W - CARD_W) / 2, (INTERNAL_H - CARD_H) / 2, CARD_W, CARD_H);
  container.addChild(backdrop, card);
  const mk = (size: number, tint: number, y: number): BitmapText => {
    const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.tint = tint; t.roundPixels = true; t.anchor.set(0.5, 0); t.position.set(INTERNAL_W / 2, y); container.addChild(t); return t;
  };
  const top = (INTERNAL_H - CARD_H) / 2;
  const title = mk(TITLE_SIZE, TEXT, top + 24), length = mk(FONT_SIZE, DIM, top + 96), prompt = mk(FONT_SIZE, AMBER, top + 140);
  return {
    container,
    draw(view) {
      container.visible = view !== null;
      if (!view) return;
      if (title.text !== view.title) title.text = view.title;
      title.tint = view.tint;
      if (length.text !== view.length) length.text = view.length;
      if (prompt.text !== view.prompt) prompt.text = view.prompt;
    }
  };
}
