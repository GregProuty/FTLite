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

export const SitCard = memo(function SitCard({ card }: { card: SitCardView }) {
  const { crt } = useCrt(), title = crt ? CRT.hot : AMBER, keys = crt ? CRT.main : DIM;
  const gap = 28, keysW = card.keys.reduce((n, k) => n + textPx(k, 1), 0) + gap * (card.keys.length - 1);
  const w = Math.max(textPx(card.title, FONT_SIZE / FONT_NATIVE), keysW) + 2 * SIT_CARD_PAD, x = Math.round(sitCardCx - w / 2);
  let kx = Math.round(sitCardCx - keysW / 2);
  const y0 = card.under ? SIT_CARD_UNDER_Y : SIT_CARD_TOP_Y;   // UI round §2.4a: always at the top
  return (
    <div data-ui-sit-card={card.seat} data-ui-sit-y={y0} style={{ opacity: card.alpha, pointerEvents: 'none' }}>
      <Panel x={x} y={y0} w={w} h={SIT_CARD_H} />
      <PixelText text={card.title} x={sitCardCx} y={y0 + 10} size={FONT_SIZE} tint={title} anchorX={0.5} />
      {card.keys.map((k) => { const at = kx; kx += textPx(k, 1) + gap; return <PixelText key={k} text={k} x={at} y={y0 + 48} size={FONT_NATIVE} tint={keys} />; })}
    </div>
  );
});
