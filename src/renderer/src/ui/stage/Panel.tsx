import { memo } from 'react';
import { useUi } from '../context';
import { PANEL_ALPHA, PANEL_BORDER, PANEL_BORDER_W, PANEL_FILL, PANEL_INNER } from '../../render/theme';
import { Box } from './Box';
import { hex } from './color';

/** The themed panel (drawPanel's look): the fill at PANEL_ALPHA, a 2 px border and a 1 px inner highlight, scaled and rounded. */
export const Panel = memo(function Panel(props: { x: number; y: number; w: number; h: number }) {
  const l = useUi((s) => s.layout), px = (n: number): number => Math.max(1, Math.round(n * l.scale * l.dpr)) / l.dpr;
  return <Box {...props} attrs={{ 'data-ui-panel': '' }} style={{ background: hex(PANEL_FILL, PANEL_ALPHA), borderStyle: 'solid', borderColor: hex(PANEL_BORDER), borderWidth: px(PANEL_BORDER_W), boxShadow: `inset 0 0 0 ${px(1)}px ${hex(PANEL_INNER)}` }} />;
});
