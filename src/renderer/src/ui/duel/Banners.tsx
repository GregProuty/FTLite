// The pause banners and the online notice (spec §6 placements): FONT_SIZE x 1.5, TEXT, centred on their points.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useCrt } from '../stage/CrtContext';
import { PixelText } from '../stage/PixelText';
import type { Banners as BannerLines } from '../views';

const SIZE = FONT_SIZE * 1.5, PLAY_CX = (INTERNAL_W - READOUT_COLUMN) / 2;

/** On a CRT screen the banners are `hot`. */
export const Banners = memo(function Banners({ banners, cx = PLAY_CX }: { banners: BannerLines; cx?: number }) {
  const TEXT_TINT = useCrt().crt ? CRT.hot : TEXT;
  return (
    <>
      {banners.interior !== null && <PixelText text={banners.interior} x={cx} y={80} size={SIZE} tint={TEXT_TINT} anchorX={0.5} anchorY={0.5} />}
      {banners.tactical !== null && <PixelText text={banners.tactical} x={INTERNAL_W / 2} y={INTERNAL_H / 2 - 80} size={SIZE} tint={TEXT_TINT} anchorX={0.5} anchorY={0.5} />}
      {banners.notice !== null && <PixelText text={banners.notice} x={cx} y={130} size={SIZE} tint={TEXT_TINT} anchorX={0.5} anchorY={0.5} />}
    </>
  );
});
