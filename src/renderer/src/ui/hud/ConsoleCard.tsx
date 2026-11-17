// hud.ts's console card (UI-iii): the panel at cardRect, the tab bar and its rule, then consoleRows' eight cell rows,
// the selector, two footers and the charge strip, in hud.ts's child order.
import { memo, useMemo } from 'react';
import { tabLabel, type HudPlayer } from '../../render/hudModel';
import { CARD_ROW, cardRect } from '../../render/hudLayout';
import { AMBER, DIM, LINE, PAD, RULE, TEXT, WARN } from '../../render/theme';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { CellRow } from '../stage/CellRow';
import { hex } from '../stage/color';
import { Panel } from '../stage/Panel';
import { Row } from '../stage/Row';
import type { RowPart } from '../stage/rowLayout';
import { consoleRows } from './consoleRows';

export const ConsoleCard = memo(function ConsoleCard({ i, p, flash }: { i: number; p: HudPlayer; flash: readonly number[] }) {
  const tabbed = !!p.tabs, r = cardRect(i, tabbed), BX = r.x + PAD, BY = r.y + (tabbed ? LINE + 2 : 0);
  const v = useMemo(() => consoleRows(p, flash), [p.console, flash]);   // consoleRows reads only p.console
  const tabs: RowPart[] | null = p.tabs ? p.tabs.flatMap((t, k) => [...(k ? [{ text: '|', tint: DIM }] : []), { text: tabLabel(t, p.tabFocus), tint: t.offline ? WARN : t.active ? (p.tabFocus ? AMBER : TEXT) : DIM }]) : null;
  return (
    <>
      <Panel {...r} />
      {tabs && <Row x={r.x + PAD} y={r.y} parts={tabs} />}
      {tabbed && <Box x={r.x + PAD} y={r.y + LINE + 1} w={r.w - 2 * PAD} h={1} style={{ background: hex(RULE) }} />}
      {v.rows.map((o, k) => o ? <CellRow key={k} x={BX} y={BY + k * LINE} c={CARD_ROW} o={o} /> : null)}
      {v.selector && <Row x={BX} y={BY} parts={v.selector} />}
      <Row x={BX} y={BY + 7 * LINE} parts={v.footA} />
      <Row x={BX} y={BY + 8 * LINE} parts={v.footB} />
      {v.bar && <Bar x={BX} y={BY + 9 * LINE + 1} w={CARD_ROW.width} h={3} fill={v.bar.fill} colour={v.bar.colour} />}
    </>
  );
});
