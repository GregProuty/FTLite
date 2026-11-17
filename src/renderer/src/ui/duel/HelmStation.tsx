// The Helm station block (spec 2026-11-17-artemis-consoles §4.2, Artemis-i): the throttle column (lit from the held
// W and S keys), heading and speed, and THRUST, REV and turn buttons that hold W, S, A and D.
import { Fragment, memo } from 'react';
import type { HelmPanel } from '../../render/duel/consoleModel';
import { STATION, stationTop } from '../../render/duel/consoleLayout';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const NOTCHES = ['100', '75', '50', '25', 'STOP', 'REV'] as const;
export const HelmStation = memo(function HelmStation({ helm }: { helm: HelmPanel }) {
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('helm'), x0 = STATION.x + 8, y0 = top + 6, rx = STATION.x + 140, h = helm.held;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT;
  const lit = h.up && !h.down ? '100' : h.down && !h.up ? 'REV' : 'STOP';
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.helm} />
      <PixelText text="THROTTLE" x={x0} y={y0} size={FONT_NATIVE} tint={dim} />
      {NOTCHES.map((label, k) => {
        const y = y0 + 18 + k * 26, on = label === lit;
        return (
          <Fragment key={label}>
            <PixelText text={label} x={x0} y={y + 4} size={FONT_NATIVE} tint={main} />
            <Box x={x0 + 40} y={y} w={14} h={20} attrs={{ 'data-ui-throttle': label, 'data-ui-lit': on ? '1' : '0' }}
              style={{ background: hex(on ? (crt ? CRT.main : AMBER) : (crt ? CRT.faint : BAR_OFF)), border: `1px solid ${hex(dim)}` }} />
            {on && <PixelText text="<" x={x0 + 60} y={y + 2} size={FONT_SIZE} tint={main} />}
          </Fragment>
        );
      })}
      <Box x={STATION.x + 130} y={y0} w={1} h={186} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text={`HDG ${String(helm.heading).padStart(3, '0')}`} x={rx} y={y0} size={FONT_NATIVE} tint={dim} />
      <PixelText text={`SPD ${helm.speed}`} x={rx} y={y0 + 18} size={FONT_SIZE} tint={main} />
      <Button name="thrust" label="THRUST" hint="W" x={rx} y={y0 + 52} w={148} h={24} lit={h.up} onHold={(on) => actions.console.hold('KeyW', on)} />
      <Button name="reverse" label="REV" hint="S" x={rx} y={y0 + 82} w={148} h={24} lit={h.down} onHold={(on) => actions.console.hold('KeyS', on)} />
      <Button name="turn-left" label="<" hint="A" x={rx} y={y0 + 122} w={70} h={24} lit={h.left} onHold={(on) => actions.console.hold('KeyA', on)} />
      <Button name="turn-right" label=">" hint="D" x={rx + 78} y={y0 + 122} w={70} h={24} lit={h.right} onHold={(on) => actions.console.hold('KeyD', on)} />
      <PixelText text="HOLD TO TURN" x={rx} y={y0 + 156} size={FONT_NATIVE} tint={dim} />
    </>
  );
});
