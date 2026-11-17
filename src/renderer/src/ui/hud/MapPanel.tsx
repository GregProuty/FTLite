// mapPanel.ts in React (UI-iii): the panel, an SVG of the Pursuit's band, the edges, the nodes and the rocks in
// mapPanel.ts's draw order, then the title and the marks as PixelText in stage coordinates.
import { memo, type ReactNode } from 'react';
import { mapTitle, type MapModel } from '../../render/hudModel';
import { MAP_FLEET, MAP_H, MAP_MARKS, MAP_W, NODE_R, nodeX, nodeY, ROCKS } from '../../render/mapModel';
import { WINDOW } from '../../render/enemyWindowModel';
import { AMBER, CELL_EDGE, DIM, FONT_SIZE, PAD, PANEL_FILL, TEXT } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const rocks = (x: number, y: number, colour: number, key: string): ReactNode[] =>
  ROCKS.map((r, i) => <polygon key={`${key}r${i}`} fill={hex(colour)} points={r.map((v, j) => 1.4 * v + (j % 2 === 0 ? x : y)).join(' ')} />);

export const MapPanel = memo(function MapPanel({ map }: { map: MapModel }) {
  const shapes: ReactNode[] = [], marks: ReactNode[] = [];
  if (map.fleet >= 0) {   // the Pursuit's front: a red band across the overrun columns
    const right = Math.min(MAP_W - 2, nodeX(map.fleet) + 30);
    shapes.push(<rect key="fleet" x={2} y={28} width={right - 2} height={MAP_H - 30} fill={hex(MAP_FLEET)} fillOpacity={0.28} />,
      <rect key="front" x={right - 2} y={28} width={2} height={MAP_H - 30} fill={hex(MAP_FLEET)} fillOpacity={0.9} />);
  }
  map.edges.forEach((e, k) => {
    const cur = map.columns[e.from[0]]!.nodes[e.from[1]]!.current, n = map.columns[e.from[0]]!.nodes.length, m = map.columns[e.to[0]]!.nodes.length;
    shapes.push(<line key={`e${k}`} x1={nodeX(e.from[0])} y1={nodeY(e.from[1], n)} x2={nodeX(e.to[0])} y2={nodeY(e.to[1], m)} stroke={hex(cur ? AMBER : DIM)} strokeOpacity={cur ? 1 : 0.7} strokeWidth={2} />);
  });
  const last = map.columns.length - 1;
  let mi = 0;
  map.columns.forEach((col, c) => col.nodes.forEach((nd, k) => {
    const x = nodeX(c), y = nodeY(k, col.nodes.length), key = `${c}:${k}`;
    const filled = nd.current || nd.selected || nd.past, ink = filled ? PANEL_FILL : nd.reachable ? TEXT : DIM;
    if (nd.current || nd.selected) {
      const colour = nd.current ? TEXT : AMBER;
      shapes.push(<circle key={`${key}n`} cx={x} cy={y} r={NODE_R} fill={hex(colour)} />, <circle key={`${key}o`} cx={x} cy={y} r={NODE_R + 5} fill="none" stroke={hex(colour)} strokeWidth={2} />);
    } else if (nd.past) shapes.push(<circle key={`${key}n`} cx={x} cy={y} r={NODE_R} fill={hex(CELL_EDGE)} />);
    else shapes.push(<circle key={`${key}n`} cx={x} cy={y} r={NODE_R} fill={hex(PANEL_FILL)} stroke={hex(nd.reachable ? TEXT : DIM)} strokeWidth={2} />);
    if (nd.type === 'asteroid') shapes.push(...rocks(x, y, ink, key));
    const inside = nd.type === 'shop' ? '$' : nd.type === 'event' ? '!' : nd.type === 'unknown' ? '?' : '';
    if (inside && mi < MAP_MARKS) { mi++; marks.push(<PixelText key={`${key}m`} text={inside} x={WINDOW.x + x + 1} y={WINDOW.y + y - 1} size={FONT_SIZE} tint={ink} anchorX={0.5} anchorY={0.5} />); }
    if (c === last && mi < MAP_MARKS) { mi++; marks.push(<PixelText key={`${key}x`} text="EXIT" x={WINDOW.x + x - 8} y={WINDOW.y + y + 30} size={FONT_SIZE} tint={AMBER} anchorX={0.5} anchorY={0.5} />); }
  }));
  return (
    <>
      <Panel x={WINDOW.x} y={WINDOW.y} w={MAP_W} h={MAP_H} />
      <Box x={WINDOW.x} y={WINDOW.y} w={MAP_W} h={MAP_H}>
        <svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`} shapeRendering="crispEdges" style={{ position: 'absolute', left: 0, top: 0 }}>{shapes}</svg>
      </Box>
      <PixelText text={mapTitle(map)} x={WINDOW.x + PAD} y={WINDOW.y} size={FONT_SIZE} tint={AMBER} />
      {marks}
    </>
  );
});
