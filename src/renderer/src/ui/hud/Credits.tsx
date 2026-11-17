// hud.ts's credits overlay (UI-iii): CREDITS_LINES lines from the scroll and the footer.
import { memo } from 'react';
import { CREDITS, CREDITS_LINES } from '../../render/hudLayout';
import { DIM, FONT_SIZE, LINE, TEXT } from '../../render/theme';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

export const CREDITS_FOOTER = 'Up/Down: scroll    Confirm or Cancel: close';

export const Credits = memo(function Credits({ lines, scroll }: { lines: readonly string[]; scroll: number }) {
  return (
    <>
      <Panel {...CREDITS} />
      {Array.from({ length: CREDITS_LINES }, (_, i) => { const s = lines[scroll + i] ?? ''; return s ? <PixelText key={i} text={s} x={CREDITS.x + 16} y={CREDITS.y + 12 + i * LINE} size={FONT_SIZE} tint={TEXT} /> : null; })}
      <PixelText text={CREDITS_FOOTER} x={CREDITS.x + 16} y={CREDITS.y + CREDITS.h - LINE - 8} size={FONT_SIZE} tint={DIM} />
    </>
  );
});
