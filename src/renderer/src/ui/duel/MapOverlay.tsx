// The tactical map's screen overlay (tacticalLayer.ts's lines 216-222): the zoom text, the scale bar with its end
// ticks (2 px lines centred on their paths) and units label, and the snap-back hint while the camera is free.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { PixelText } from '../stage/PixelText';
import type { MapOverlayView } from '../views';

const BX = 16, BY = INTERNAL_H - 28;

export const MapOverlay = memo(function MapOverlay({ overlay }: { overlay: MapOverlayView }) {
  const px = overlay.scaleBar.px, line = { background: hex(DIM) };
  return (
    <>
      <PixelText text={overlay.zoomText} x={16} y={INTERNAL_H - 64} size={FONT_SIZE} tint={DIM} />
      <Box x={BX} y={BY - 1} w={px} h={2} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <Box x={BX - 1} y={BY - 5} w={2} h={10} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <Box x={BX + px - 1} y={BY - 5} w={2} h={10} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <PixelText text={`${overlay.scaleBar.units} u`} x={BX + px + 8} y={BY - 8} size={FONT_NATIVE} tint={DIM} />
      {overlay.snapHint && <PixelText text="C: SNAP BACK" x={INTERNAL_W / 2} y={INTERNAL_H - 12} size={FONT_SIZE} tint={AMBER} anchorX={0.5} anchorY={1} />}
    </>
  );
});
