// The CRT screen overlay and bezel (CRT map spec section 3): on the letterbox rectangle, over the console overlays and
// under the end card and the latency overlay, pointer events off (the Stage's). Scanlines every 3 device pixels, a fine
// aperture grille, a corner vignette and a slow flicker, each scaled by the setting; then the bezel, which stays at `off`.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { BEZEL_PX, BEZEL_RADIUS, crtFlicker } from '../../render/crt';
import { useUi } from '../context';
import { Box } from './Box';
import { useCrt } from './CrtContext';

/** The bezel's dark warm brown and its inner shadow. */
export const BEZEL_COLOUR = '#24170d', BEZEL_SHADOW = 'rgba(0, 0, 0, 0.85)';
const FILL = { position: 'absolute', inset: 0 } as const;

export const CrtScreen = memo(function CrtScreen() {
  const { crt, scale, now } = useCrt(), l = useUi((s) => s.layout);
  if (!crt) return null;
  const dev = 1 / l.dpr, px = (n: number): number => Math.max(1, Math.round(n * l.scale * l.dpr)) / l.dpr;
  const flicker = crtFlicker(now, scale.flicker);
  return (
    <Box x={0} y={0} w={INTERNAL_W} h={INTERNAL_H} attrs={{ 'data-ui-crt': '' }} style={{ overflow: 'hidden' }}>
      {scale.scanline > 0 && <div data-ui-crt-scanlines="" style={{ ...FILL, backgroundImage: `linear-gradient(to bottom, rgba(0, 0, 0, ${0.45 * scale.scanline}) ${dev}px, transparent ${dev}px)`, backgroundSize: `100% ${3 * dev}px` }} />}
      {scale.mask > 0 && <div data-ui-crt-mask="" style={{ ...FILL, backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, ${0.3 * scale.mask}) ${dev}px, transparent ${dev}px)`, backgroundSize: `${3 * dev}px 100%` }} />}
      {scale.vignette > 0 && <div data-ui-crt-vignette="" style={{ ...FILL, background: `radial-gradient(ellipse at 50% 50%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, ${0.6 * scale.vignette}) 100%)` }} />}
      {flicker > 0 && <div data-ui-crt-flicker="" style={{ ...FILL, background: `rgba(0, 0, 0, ${flicker.toFixed(3)})` }} />}
      <div data-ui-crt-bezel="" style={{ position: 'absolute', left: px(BEZEL_PX), top: px(BEZEL_PX), right: px(BEZEL_PX), bottom: px(BEZEL_PX), borderRadius: px(BEZEL_RADIUS),
        boxShadow: `0 0 0 ${px(BEZEL_PX + BEZEL_RADIUS)}px ${BEZEL_COLOUR}, inset 0 0 ${px(10)}px ${px(2)}px ${BEZEL_SHADOW}` }} />
    </Box>
  );
});
