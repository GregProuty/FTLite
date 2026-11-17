// hud.ts's side container (UI-iii): the clock card, the threats panel and the power panel, hidden in the lobby and at
// game over. Re-renders per model; its children are memo, so canvases redraw only on change.
import { memo } from 'react';
import { clockLine, directorText, sectorLine, STATION_SHORT, threatTint, timeLine, type HudModel } from '../../render/hudModel';
import { CLOCK, POWER, POWER_ROW, THREAT_ROWS, THREATS } from '../../render/hudLayout';
import { AMBER, DIM, FONT_SIZE, LINE, PAD, TEXT, WARN } from '../../render/theme';
import { CellRow } from '../stage/CellRow';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { Row } from '../stage/Row';

const CLOCK_TINTS = [TEXT, TEXT, DIM, DIM, DIM] as const;

export const SidePanels = memo(function SidePanels({ m, flash }: { m: HudModel; flash: readonly number[] }) {
  const clock = [clockLine(m), sectorLine(m), timeLine(m), directorText(m), m.run.quirk];
  return (
    <>
      <Panel {...CLOCK} />
      {clock.map((s, k) => s ? <PixelText key={k} text={s} x={CLOCK.x + PAD} y={CLOCK.y + k * LINE} size={FONT_SIZE} tint={CLOCK_TINTS[k]!} /> : null)}
      <Panel {...THREATS} />
      {Array.from({ length: THREAT_ROWS }, (_, i) => { const t = m.threats[i]; return t ? <Row key={i} x={THREATS.x + PAD} y={THREATS.y + i * LINE} parts={[{ icon: t.icon, text: t.text, tint: threatTint(t) }]} /> : null; })}
      <Panel {...POWER} />
      <PixelText text={`POWER ${m.power.used}/${m.power.capacity}`} x={POWER.x + PAD} y={POWER.y} size={FONT_SIZE} tint={AMBER} />
      {Array.from({ length: 7 }, (_, k) => {
        const st = m.stations.find((s) => s.kind === k); if (!st) return null;
        const lit = flash.includes(k);
        return <CellRow key={k} x={POWER.x + PAD} y={POWER.y + (k + 1) * LINE} c={POWER_ROW} o={{ icon: st.icon, iconTint: st.iconTint, name: STATION_SHORT[k]!, level: st.level, max: st.max, status: st.online ? (st.occupant !== null ? `P${st.occupant + 1}` : '') : 'OFF', cursor: lit, tint: lit ? AMBER : st.online ? TEXT : WARN, heat: st.heat, coolant: st.coolant }} />;
      })}
    </>
  );
});
