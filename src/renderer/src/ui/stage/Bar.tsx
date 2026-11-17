import { memo } from 'react';
import { BAR_OFF } from '../../render/theme';
import { Box } from './Box';
import { hex } from './color';

/** A track and its fill (hud.ts's bar): the fill's width is round(frac * w) internal pixels, clamped to 0..1. */
export const Bar = memo(function Bar(props: { x: number; y: number; w: number; h: number; fill: number; colour: number }) {
  const f = Math.round(Math.max(0, Math.min(1, props.fill)) * props.w);
  return <>
    <Box x={props.x} y={props.y} w={props.w} h={props.h} style={{ background: hex(BAR_OFF) }} />
    {f > 0 && <Box x={props.x} y={props.y} w={f} h={props.h} attrs={{ 'data-ui-bar-fill': '' }} style={{ background: hex(props.colour) }} />}
  </>;
});
