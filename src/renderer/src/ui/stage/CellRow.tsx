// hud.ts's cellRow (spec Demo-x-c section 1): the selected row's dark amber bar, an optional station glyph, the name,
// the power cells (green on, dark off with a 1 px edge, red failed, amber overdrive past the maximum), the heat strip,
// the status (WARN for OFF/FAIL, else DIM), coolant, and the Upgrades page's two columns.
import { memo } from 'react';
import type { CellColumns } from '../../render/hudLayout';
import { HUD_MAX_CELLS } from '../../render/hudModel';
import { tintColor, type IconKind, type IconTint } from '../../render/roomIconModel';
import { AMBER, BAR_FAIL, BAR_OFF, BAR_ON, CELL_EDGE, DIM, FONT_SIZE, LINE, SELECT_BG, WARN } from '../../render/theme';
import { Bar } from './Bar';
import { Box } from './Box';
import { hex } from './color';
import { useHairline } from './hairline';
import { Icon } from './Icon';
import { PixelText } from './PixelText';

export interface CellRowSet { icon?: IconKind; iconTint?: IconTint; name: string; level: number; max: number; status: string; cursor: boolean; tint: number; failed?: boolean; heat?: number; coolant?: number; cols?: readonly [string, string] }

export const CellRow = memo(function CellRow({ x, y, c, o }: { x: number; y: number; c: CellColumns; o: CellRowSet }) {
  const hair = useHairline(), shown = Math.max(o.max, o.level), heat = Math.max(0, Math.min(1, o.heat ?? 0));
  const text = (t: string, dx: number, tint: number) => t ? <PixelText text={t} x={x + dx} y={y} size={FONT_SIZE} tint={tint} /> : null;
  return (
    <>
      {o.cursor && <Box x={x - 4} y={y + 3} w={c.width + 8} h={LINE} attrs={{ 'data-ui-select': '' }} style={{ background: hex(SELECT_BG) }} />}
      {c.glyph && o.icon && <Icon name={`glyph.${o.icon}`} x={x + 8 - 10} y={y + 15 - 10} tint={tintColor(o.iconTint ?? 'normal')} />}
      {text(o.name, c.nameX, o.tint)}
      {Array.from({ length: shown }, (_, k) => {
        const off = !o.failed && k >= o.level, fill = o.failed ? BAR_FAIL : off ? BAR_OFF : k >= o.max ? AMBER : BAR_ON;
        return <Box key={k} x={x + c.cellsX + k * c.step} y={y + 8} w={c.cell} h={14} attrs={{ 'data-ui-cell': hex(fill) }}
          style={{ background: hex(fill), boxShadow: off ? `inset 0 0 0 ${hair}px ${hex(CELL_EDGE)}` : undefined }} />;
      })}
      {heat > 0 && <Bar x={x + c.cellsX} y={y + 23} w={HUD_MAX_CELLS * c.step - 2} h={2} fill={heat} colour={WARN} />}
      {text(o.status, c.statusX, o.status === 'OFF' || o.status === 'FAIL' ? WARN : DIM)}
      {text(o.coolant ? `C${o.coolant}` : '', c.coolantX, DIM)}
      {o.cols && text(o.cols[0], c.colAX, o.tint)}
      {o.cols && text(o.cols[1], c.colBX, o.tint)}
    </>
  );
});
