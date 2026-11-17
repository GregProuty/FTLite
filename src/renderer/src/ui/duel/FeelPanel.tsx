// The flight view's feel panel (feelPanel.ts's layout): the title, six label/value rows and the help lines.
import { Fragment, memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { FEEL_HELP, FEEL_HELP_LINE, FEEL_PANEL_H, FEEL_PANEL_MARGIN, FEEL_PANEL_W, FEEL_ROWS } from '../../render/tactical/feelModel';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD, TEXT } from '../../render/theme';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const X = INTERNAL_W - FEEL_PANEL_W - FEEL_PANEL_MARGIN, Y = FEEL_PANEL_MARGIN;

export const FeelPanel = memo(function FeelPanel({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <>
      <Panel x={X} y={Y} w={FEEL_PANEL_W} h={FEEL_PANEL_H} />
      <PixelText text="FLIGHT FEEL" x={X + PAD} y={Y + PAD - 6} size={FONT_SIZE} tint={AMBER} />
      {rows.slice(0, FEEL_ROWS).map(([label, value], k) => (
        <Fragment key={k}>
          <PixelText text={label} x={X + PAD} y={Y + PAD - 6 + LINE * (k + 1)} size={FONT_SIZE} tint={DIM} />
          <PixelText text={value} x={X + FEEL_PANEL_W - PAD} y={Y + PAD - 6 + LINE * (k + 1)} size={FONT_SIZE} tint={TEXT} anchorX={1} />
        </Fragment>
      ))}
      {FEEL_HELP.map((line, k) => <PixelText key={k} text={line} x={X + PAD} y={Y + PAD + LINE * (FEEL_ROWS + 1) + PAD + k * FEEL_HELP_LINE} size={FONT_NATIVE} tint={DIM} />)}
    </>
  );
});
