// Feel-i (spec 2026-11-17-console-feel-design §1): the sit-down card. For 4 s after sitting (or until the first action), on
// the first three sits at a seat per session, a small card under the ship names the seat's goal and its keys on one row. It
// takes no pointer, fades over its last half second, and draws in the console's CRT ramp (the theme's colours off CRT).
import { memo } from 'react';
import { INFO_BAND } from '../../render/duel/consoleLayout';
import type { SitCardView } from '../../render/duel/sitModel';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, textPx } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

/** The card's box. UI round §2.4a: always at the top, under the pause line, in the map's top band, clear of the station
 *  blocks at the bottom; centred on the band (INFO_BAND). The model's `top` no longer moves it. */
export const SIT_CARD_TOP_Y = 100, SIT_CARD_H = 76, SIT_CARD_PAD = 14;
/** Feel-ii §3.9: the card's y while the online notice (Banners, centred at y 130, FONT_SIZE × 1.5) shows: below it. */
export const SIT_CARD_UNDER_Y = 156;
export const sitCardCx = (INFO_BAND.left + INFO_BAND.right) / 2;

const SIT_KEY_GAP = 28;
const keysWidth = (keys: readonly string[]): number => keys.reduce((n, k) => n + textPx(k, 1), 0) + SIT_KEY_GAP * (keys.length - 1);
/** The card's box: centred on the band, clamped left so a wide card ends 8 px before the enemy window. */
export function sitCardBox(card: { title: string; keys: readonly string[]; under?: boolean }): { x: number; y: number; w: number; h: number } {
  const w = Math.max(textPx(card.title, FONT_SIZE / FONT_NATIVE), keysWidth(card.keys)) + 2 * SIT_CARD_PAD;
  return { x: Math.min(Math.round(sitCardCx - w / 2), INFO_BAND.right - 8 - w), y: card.under ? SIT_CARD_UNDER_Y : SIT_CARD_TOP_Y, w, h: SIT_CARD_H };
}

export const SitCard = memo(function SitCard({ card }: { card: SitCardView }) {
  const { crt } = useCrt(), title = crt ? CRT.hot : AMBER, keys = crt ? CRT.main : DIM;
  const gap = SIT_KEY_GAP, keysW = keysWidth(card.keys), { x, y: y0, w } = sitCardBox(card), cx = x + w / 2;
  let kx = Math.round(cx - keysW / 2);
  return (
    <div data-ui-sit-card={card.seat} data-ui-sit-y={y0} style={{ opacity: card.alpha, pointerEvents: 'none' }}>
      <Panel x={x} y={y0} w={w} h={SIT_CARD_H} />
      <PixelText text={card.title} x={cx} y={y0 + 10} size={FONT_SIZE} tint={title} anchorX={0.5} />
      {card.keys.map((k) => { const at = kx; kx += textPx(k, 1) + gap; return <PixelText key={k} text={k} x={at} y={y0 + 48} size={FONT_NATIVE} tint={keys} />; })}
    </div>
  );
});
