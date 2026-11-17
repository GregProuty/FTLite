// The duel's end card (endScreen.ts's layout): a dimmed backdrop and a 560 x 200 panel with the outcome, the length and the keys.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { EndView } from '../../render/duel/endScreen';
import { AMBER, BACKDROP, BACKDROP_ALPHA, DIM, FONT_SIZE, TITLE_SIZE } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const CARD_W = 560, CARD_H = 200, TOP = (INTERNAL_H - CARD_H) / 2;

export const EndCard = memo(function EndCard({ end }: { end: EndView }) {
  return (
    <>
      <Box x={0} y={0} w={INTERNAL_W} h={INTERNAL_H} style={{ background: hex(BACKDROP, BACKDROP_ALPHA * 0.6) }} />
      <Panel x={(INTERNAL_W - CARD_W) / 2} y={TOP} w={CARD_W} h={CARD_H} />
      <PixelText text={end.title} x={INTERNAL_W / 2} y={TOP + 24} size={TITLE_SIZE} tint={end.tint} anchorX={0.5} />
      <PixelText text={end.length} x={INTERNAL_W / 2} y={TOP + 96} size={FONT_SIZE} tint={DIM} anchorX={0.5} />
      <PixelText text={end.prompt} x={INTERNAL_W / 2} y={TOP + 140} size={FONT_SIZE} tint={AMBER} anchorX={0.5} />
    </>
  );
});
