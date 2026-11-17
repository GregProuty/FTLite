// The pause banners and the online notice (spec §6 placements): FONT_SIZE x 1.5, TEXT, centred on their points.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { FONT_SIZE, TEXT } from '../../render/theme';
import { PixelText } from '../stage/PixelText';
import type { Banners as BannerLines } from '../views';

const SIZE = FONT_SIZE * 1.5, PLAY_CX = (INTERNAL_W - READOUT_COLUMN) / 2;

export const Banners = memo(function Banners({ banners }: { banners: BannerLines }) {
  return (
    <>
      {banners.interior !== null && <PixelText text={banners.interior} x={PLAY_CX} y={80} size={SIZE} tint={TEXT} anchorX={0.5} anchorY={0.5} />}
      {banners.tactical !== null && <PixelText text={banners.tactical} x={INTERNAL_W / 2} y={INTERNAL_H / 2 - 80} size={SIZE} tint={TEXT} anchorX={0.5} anchorY={0.5} />}
      {banners.notice !== null && <PixelText text={banners.notice} x={PLAY_CX} y={130} size={SIZE} tint={TEXT} anchorX={0.5} anchorY={0.5} />}
    </>
  );
});
