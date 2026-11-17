// The tactical map's screen overlay (tacticalLayer.ts's lines 216-222): the zoom text, the scale bar with its end
// ticks (2 px lines centred on their paths) and units label, and the snap-back hint while the camera is free. On a CRT
// screen (CRT map spec section 2) the zoom text, bar and units are `mid` and the snap hint `main`.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, textPx } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { PixelText } from '../stage/PixelText';
import type { MapOverlayView } from '../views';

/** The scale bar's left end and baseline, the zoom text's top and the snap hint's bottom (internal pixels). */
export const BX = 16, BY = INTERNAL_H - 28, ZOOM_Y = INTERNAL_H - 64, SNAP_Y = INTERNAL_H - 12;

export const MapOverlay = memo(function MapOverlay({ overlay, placement = 'column' }: { overlay: MapOverlayView; placement?: 'column' | 'console' }) {
  const { crt } = useCrt(), dim = crt ? CRT.mid : DIM, accent = crt ? CRT.main : AMBER;
  const px = overlay.scaleBar.px, line = { background: hex(dim) };
  const units = `${overlay.scaleBar.units} u`;
  const bar = (bx: number) => (
    <>
      <Box x={bx} y={BY - 1} w={px} h={2} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <Box x={bx - 1} y={BY - 5} w={2} h={10} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <Box x={bx + px - 1} y={BY - 5} w={2} h={10} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <PixelText text={units} x={bx + px + 8} y={BY - 8} size={FONT_NATIVE} tint={dim} />
    </>
  );
  // Artemis spec §2: the side column shows zoom and snap; only the scale bar stays, at the bottom right
  if (placement === 'console') return bar(INTERNAL_W - 16 - textPx(units, 1) - 8 - px);
  return (
    <>
      <PixelText text={overlay.zoomText} x={BX} y={ZOOM_Y} size={FONT_SIZE} tint={dim} />
      {bar(BX)}
      {overlay.snapHint && <PixelText text="C: SNAP BACK" x={INTERNAL_W / 2} y={SNAP_Y} size={FONT_SIZE} tint={accent} anchorX={0.5} anchorY={1} />}
    </>
  );
});
