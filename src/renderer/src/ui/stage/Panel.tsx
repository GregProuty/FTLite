import { memo } from 'react';
import { useUi } from '../context';
import { PANEL_ALPHA, PANEL_BORDER, PANEL_BORDER_W, PANEL_FILL, PANEL_INNER } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { Box } from './Box';
import { hex } from './color';
import { useCrt } from './CrtContext';

/** The CRT panel's double border (VT320 style, CRT map spec section 3): 3 internal pixels, so both lines show. */
export const CRT_PANEL_BORDER_W = 3;

/** The themed panel (drawPanel's look): the fill at PANEL_ALPHA, a 2 px border and a 1 px inner highlight, scaled and rounded.
 *  On a CRT screen: the glass at PANEL_ALPHA with a double mid border. */
export const Panel = memo(function Panel(props: { x: number; y: number; w: number; h: number }) {
  const l = useUi((s) => s.layout), { crt } = useCrt(), px = (n: number): number => Math.max(1, Math.round(n * l.scale * l.dpr)) / l.dpr;
  if (crt) return <Box {...props} attrs={{ 'data-ui-panel': 'crt' }} style={{ background: hex(CRT.glass, PANEL_ALPHA), borderStyle: 'double', borderColor: hex(CRT.mid), borderWidth: px(CRT_PANEL_BORDER_W) }} />;
  return <Box {...props} attrs={{ 'data-ui-panel': '' }} style={{ background: hex(PANEL_FILL, PANEL_ALPHA), borderStyle: 'solid', borderColor: hex(PANEL_BORDER), borderWidth: px(PANEL_BORDER_W), boxShadow: `inset 0 0 0 ${px(1)}px ${hex(PANEL_INNER)}` }} />;
});
