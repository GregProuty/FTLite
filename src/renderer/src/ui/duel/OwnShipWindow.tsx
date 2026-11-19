// The own ship window (own ship window spec §2, §4): the crew's interior at OWN_SHIP, top left, mirroring the contact
// window. Display only: the root takes the pointer and swallows clicks, the context menu and the wheel so nothing reaches
// the map. The view's colours are resolved; React does no blinking.
import { memo, type SyntheticEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { OwnShipView } from '../../render/duel/ownShipModel';
import { OWN_SHIP, OWN_SHIP_BOX, OWN_SHIP_RIGHT, OWN_SHIP_STATUS_Y, OWN_SHIP_TITLE_Y, OWN_SHIP_X0 } from '../../render/duel/consoleLayout';
import { FONT_NATIVE, textPx } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useUi } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { boxCss } from '../stage/geometry';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { segPath } from './svgPaths';

const stop = (e: SyntheticEvent): void => e.preventDefault();
const swallow = (e: ReactWheelEvent): void => e.stopPropagation();
const x0 = OWN_SHIP_X0, right = OWN_SHIP_RIGHT, rowY = OWN_SHIP_STATUS_Y;

export const OwnShipWindow = memo(function OwnShipWindow({ ownShip: v }: { ownShip: OwnShipView }) {
  const l = useUi((s) => s.layout), b = OWN_SHIP_BOX;
  const value = String(v.hull.value), valueW = Math.ceil(textPx(value, 1));
  return (
    <>
      <div data-ui-own-ship="" onPointerDown={stop} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}
        style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(OWN_SHIP.x, OWN_SHIP.y, OWN_SHIP.w, OWN_SHIP.h, l), pointerEvents: 'auto' }} />
      <Panel x={OWN_SHIP.x} y={OWN_SHIP.y} w={OWN_SHIP.w} h={OWN_SHIP.h} />
      {v.flash && <Box x={OWN_SHIP.x} y={OWN_SHIP.y} w={OWN_SHIP.w} h={OWN_SHIP.h} attrs={{ 'data-ui-own-flash': '' }}
        style={{ boxSizing: 'border-box', border: `2px solid ${hex(CRT.hot)}`, pointerEvents: 'none' }} />}
      <PixelText text="OWN SHIP" x={x0} y={OWN_SHIP_TITLE_Y} size={FONT_NATIVE} tint={CRT.main} />
      <PixelText text="SHLD" x={x0} y={rowY} size={FONT_NATIVE} tint={CRT.mid} />
      {Array.from({ length: v.shields.of }, (_, k) => (
        <Box key={k} x={x0 + 36 + k * 12} y={rowY + 4} w={8} h={8} attrs={{ 'data-ui-own-pip': k < v.shields.up ? 'up' : 'down' }}
          style={k < v.shields.up ? { background: hex(CRT.main) } : { border: `1px solid ${hex(CRT.mid)}` }} />
      ))}
      <PixelText text="HULL" x={x0 + 100} y={rowY} size={FONT_NATIVE} tint={CRT.mid} />
      <Bar x={x0 + 136} y={rowY + 6} w={56} h={6} fill={v.hull.fill} colour={CRT.main} />
      {v.hull.block !== null && <Box x={right - valueW - 2} y={rowY} w={valueW + 4} h={FONT_NATIVE} attrs={{ 'data-ui-own-hull-alert': '' }} style={{ background: hex(v.hull.block) }} />}
      <PixelText text={value} x={right} y={rowY} size={FONT_NATIVE} tint={v.hull.block !== null ? CRT.glass : CRT.main} anchorX={1} />
      <svg data-ui-own-ship-box="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" shapeRendering="crispEdges"
        style={{ position: 'absolute', ...boxCss(b.x, b.y, b.w, b.h, l), overflow: 'hidden', pointerEvents: 'none' }}>
        {v.tiles.map((q, k) => <rect key={k} data-ui-own-tile="" x={q.x} y={q.y} width={q.s} height={q.s} fill={hex(q.fill)} />)}
        {v.edges.map((g) => <path key={g.colour} d={segPath(g.segments)} stroke={hex(g.colour)} strokeWidth={1} fill="none" />)}
        {v.hatch.length > 0 && <path d={segPath(v.hatch)} stroke={hex(CRT.main)} strokeWidth={1} fill="none" />}
        {v.fires.map((f, k) => (
          <g key={k} data-ui-own-fire="">
            <rect x={f.x} y={f.y} width={f.w} height={2} fill={hex(CRT.glass)} />
            <rect x={f.x} y={f.y} width={f.w * f.progress} height={2} fill={hex(CRT.main)} />
          </g>
        ))}
        {v.crew.map((c, k) => c.downed
          ? <rect key={k} data-ui-own-crew="downed" x={c.x - 2} y={c.y - 2} width={4} height={4} fill={hex(CRT.glass)} stroke={hex(CRT.hot)} strokeWidth={1} />
          : <g key={k} data-ui-own-crew="up"><rect x={c.x - 2.5} y={c.y - 2.5} width={5} height={5} fill={hex(CRT.glass)} /><rect x={c.x - 1.5} y={c.y - 1.5} width={3} height={3} fill={hex(CRT.hot)} /></g>)}
      </svg>
    </>
  );
});
