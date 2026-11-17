// The duel's readout column (readoutPanel.ts's layout): rows of label and right-anchored value, shield pips after the
// label, a thin bar under a row, and help lines at the native size, in a panel sized to its content.
import { Fragment, memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_MARGIN, READOUT_ROWS, READOUT_W, type ReadoutRow } from '../../render/duel/readoutModel';
import { BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD } from '../../render/theme';
import { useUi } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const HELP_LINES = 5, HELP_LINE = 14, PIP = 12, PIP_GAP = 4;
const X = INTERNAL_W - READOUT_W - READOUT_MARGIN, Y = READOUT_MARGIN;

export const ReadoutPanel = memo(function ReadoutPanel(props: { rows: readonly ReadoutRow[]; help: readonly string[] }) {
  const l = useUi((s) => s.layout), hairline = Math.max(1, Math.round(l.scale * l.dpr)) / l.dpr;   // Pixi's 1-internal-px pip stroke, scaled like Panel's border
  const n = Math.min(props.rows.length, READOUT_ROWS), h = Math.min(props.help.length, HELP_LINES);
  const helpY = PAD + LINE * n + PAD, height = helpY + h * HELP_LINE + PAD;
  return (
    <>
      <Panel x={X} y={Y} w={READOUT_W} h={height} />
      {props.rows.slice(0, n).map((r, k) => {
        const y = Y + PAD - 6 + LINE * k;
        return (
          <Fragment key={k}>
            <PixelText text={r.label} x={X + PAD} y={y} size={FONT_SIZE} tint={r.labelTint} />
            <PixelText text={r.value} x={X + READOUT_W - PAD} y={y} size={FONT_SIZE} tint={r.valueTint} anchorX={1} />
            {r.pips && Array.from({ length: r.pips.max }, (_, p) => {
              const lit = p < r.pips!.n, x = X + READOUT_W - PAD - (r.pips!.max - p) * (PIP + PIP_GAP) + PIP_GAP;
              return <Box key={p} x={x} y={y + 9} w={PIP} h={PIP} attrs={{ 'data-ui-pip': lit ? 'lit' : 'off' }}
                style={{ background: hex(lit ? r.pips!.colour : BAR_OFF), border: `${hairline}px solid ${hex(r.pips!.colour, lit ? 1 : 0.5)}` }} />;
            })}
            {r.bar && <Bar x={X + PAD} y={y + LINE + 1} w={READOUT_W - 2 * PAD} h={3} fill={r.bar.fill} colour={r.bar.colour} />}
          </Fragment>
        );
      })}
      {props.help.slice(0, h).map((line, k) => <PixelText key={k} text={line} x={X + PAD} y={Y + helpY + k * HELP_LINE} size={FONT_NATIVE} tint={DIM} />)}
    </>
  );
});
