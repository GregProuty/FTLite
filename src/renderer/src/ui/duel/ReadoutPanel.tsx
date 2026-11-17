// Placed 'status' it is the console's status table (Artemis spec §2): top left, no help lines.
// The duel's readout column (readoutPanel.ts's layout): rows of label and right-anchored value, shield pips after the
// label, a thin bar under a row, and help lines at the native size, in a panel sized to its content. On a CRT screen (CRT
// map spec section 2) the rows draw by emphasis in the amber ramp: labels mid, values main, headings main, `good` and
// `warn` hot, `alert` an inverse bar blinking main/hot, `enemy` an inverse bar, crew pips solid hot, enemy pips hollow.
import { Fragment, memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_MARGIN, READOUT_ROWS, READOUT_W, type ReadoutRow } from '../../render/duel/readoutModel';
import { BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD, textPx } from '../../render/theme';
import { ALERT_BLINK_HZ, blink, CRT } from '../../render/tactical/crtTheme';
import { STATUS } from '../../render/duel/consoleLayout';
import { useUi } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const HELP_LINES = 5, HELP_LINE = 14, PIP = 12, PIP_GAP = 4;
/** An inverse bar behind a row's text: from 5 below the row's top to 27 (the caps at +8, descenders to +26). */
export const INVERSE_TOP = 5, INVERSE_H = 22, INVERSE_PAD = 4;

/** How a row draws on the CRT screen: its label and value tones, which part (if any) sits on an inverse bar of `block`, and its bar's fill. */
export interface CrtRowLook { label: number; value: number; inverse: 'label' | 'value' | null; block: number; bar: number }
export function crtRowLook(r: ReadoutRow, t: number): CrtRowLook {
  const heading = r.value === '' && !r.pips && r.label !== '';
  const look: CrtRowLook = { label: heading ? CRT.main : CRT.mid, value: CRT.main, inverse: null, block: CRT.main, bar: CRT.main };
  switch (r.emphasis) {
    case 'good': look.value = CRT.hot; look.bar = CRT.hot; break;
    case 'warn': look.value = CRT.hot; look.bar = CRT.hot; break;   // the bar under a damaged room is its repair progress
    case 'alert': look.inverse = heading ? 'label' : 'value'; look.block = blink(t, ALERT_BLINK_HZ) ? CRT.hot : CRT.main; break;
    case 'enemy': if (!r.pips) look.inverse = heading ? 'label' : 'value'; break;
    default: break;
  }
  if (look.inverse === 'label') look.label = CRT.glass;
  if (look.inverse === 'value') look.value = CRT.glass;
  return look;
}

export const ReadoutPanel = memo(function ReadoutPanel(props: { rows: readonly ReadoutRow[]; help: readonly string[]; placement?: 'column' | 'status' }) {
  const status = props.placement === 'status';
  const X = status ? STATUS.x : INTERNAL_W - READOUT_W - READOUT_MARGIN, Y = status ? STATUS.y : READOUT_MARGIN;
  const l = useUi((s) => s.layout), hairline = Math.max(1, Math.round(l.scale * l.dpr)) / l.dpr;   // Pixi's 1-internal-px pip stroke, scaled like Panel's border
  const { crt, now } = useCrt();
  const n = Math.min(props.rows.length, READOUT_ROWS), h = status ? 0 : Math.min(props.help.length, HELP_LINES);
  const helpY = PAD + LINE * n + PAD, height = helpY + h * HELP_LINE + PAD;
  return (
    <>
      <Panel x={X} y={Y} w={READOUT_W} h={height} />
      {props.rows.slice(0, n).map((r, k) => {
        const y = Y + PAD - 6 + LINE * k, look = crt ? crtRowLook(r, now) : null;
        const pip = (p: number) => {
          const lit = p < r.pips!.n, x = X + READOUT_W - PAD - (r.pips!.max - p) * (PIP + PIP_GAP) + PIP_GAP;
          const style = !look ? { background: hex(lit ? r.pips!.colour : BAR_OFF), border: `${hairline}px solid ${hex(r.pips!.colour, lit ? 1 : 0.5)}` }
            : r.emphasis === 'enemy' ? { background: hex(lit ? CRT.glass : CRT.faint), border: `${lit ? 2 * hairline : hairline}px solid ${hex(lit ? CRT.main : CRT.dim)}` }
            : { background: hex(lit ? CRT.hot : CRT.faint), border: `${hairline}px solid ${hex(lit ? CRT.hot : CRT.dim)}` };
          return <Box key={p} x={x} y={y + 9} w={PIP} h={PIP} attrs={{ 'data-ui-pip': lit ? 'lit' : 'off' }} style={style} />;
        };
        return (
          <Fragment key={k}>
            {look?.inverse === 'label' && <Box x={X + PAD - INVERSE_PAD} y={y + INVERSE_TOP} w={READOUT_W - 2 * PAD + 2 * INVERSE_PAD} h={INVERSE_H} attrs={{ 'data-ui-inverse': 'label' }} style={{ background: hex(look.block) }} />}
            {look?.inverse === 'value' && <Box x={X + READOUT_W - PAD - textPx(r.value) - INVERSE_PAD} y={y + INVERSE_TOP} w={textPx(r.value) + 2 * INVERSE_PAD} h={INVERSE_H} attrs={{ 'data-ui-inverse': 'value' }} style={{ background: hex(look.block) }} />}
            <PixelText text={r.label} x={X + PAD} y={y} size={FONT_SIZE} tint={look ? look.label : r.labelTint} />
            <PixelText text={r.value} x={X + READOUT_W - PAD} y={y} size={FONT_SIZE} tint={look ? look.value : r.valueTint} anchorX={1} />
            {r.pips && Array.from({ length: r.pips.max }, (_, p) => pip(p))}
            {r.bar && <Bar x={X + PAD} y={y + LINE + 1} w={READOUT_W - 2 * PAD} h={3} fill={r.bar.fill} colour={look ? look.bar : r.bar.colour} />}
          </Fragment>
        );
      })}
      {props.help.slice(0, h).map((line, k) => <PixelText key={k} text={line} x={X + PAD} y={Y + helpY + k * HELP_LINE} size={FONT_NATIVE} tint={crt ? CRT.mid : DIM} />)}
    </>
  );
});
