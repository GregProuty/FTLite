// The Helm station block (spec 2026-11-17-artemis-consoles §4.2, Artemis-ii): the set-and-forget throttle (six press
// notches; the set one lit with a `<` pointer, and the notches from 25 up to it filled), heading and speed, and the turn
// buttons that hold A and D. W and S step the throttle a notch (§5.4); a notch click asks for its level. Feel-i (console
// feel spec §2): AUTO-FACE holds Space, turning the nose onto the enemy's lead point while held.
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

/** The notches top to bottom (spec §4.2): the label, the level the click asks for, the button's name. */
export const NOTCHES: readonly { label: string; level: number; name: string }[] = [
  { label: '100', level: 4, name: '100' }, { label: '75', level: 3, name: '75' }, { label: '50', level: 2, name: '50' },
  { label: '25', level: 1, name: '25' }, { label: 'STOP', level: 0, name: 'stop' }, { label: 'REV', level: -1, name: 'rev' }
];

export const HelmStation = memo(function HelmStation({ helm }: { helm: HelmPanel }) {
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('helm'), x0 = STATION.x + 8, y0 = top + 6, rx = STATION.x + 140, h = helm.held, set = helm.throttle;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.helm} />
      <PixelText text="THROTTLE" x={x0} y={y0} size={FONT_NATIVE} tint={dim} />
      {NOTCHES.map((n, k) => {
        const y = y0 + 18 + k * 26, filled = n.level >= 1 && n.level <= set;
        return (
          <Fragment key={n.name}>
            <Button name={`throttle-${n.name}`} label={n.label} x={x0} y={y} w={52} h={22} lit={n.level === set} onPress={() => actions.console.throttle(n.level)} />
            <Box x={x0 + 58} y={y} w={14} h={22} attrs={{ 'data-ui-throttle': n.label, 'data-ui-lit': filled ? '1' : '0' }}
              style={{ background: hex(filled ? (crt ? CRT.main : AMBER) : (crt ? CRT.faint : BAR_OFF)), border: `1px solid ${hex(dim)}` }} />
            {n.level === set && <PixelText text="<" x={x0 + 78} y={y + 2} size={FONT_SIZE} tint={main} />}
          </Fragment>
        );
      })}
      <Box x={STATION.x + 130} y={y0} w={1} h={186} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text={`HDG ${String(helm.heading).padStart(3, '0')}`} x={rx} y={y0} size={FONT_NATIVE} tint={dim} />
      <PixelText text={`SPD ${helm.speed}`} x={rx} y={y0 + 18} size={FONT_SIZE} tint={main} />
      <Button name="turn-left" label="<" hint="A" x={rx} y={y0 + 52} w={70} h={24} lit={h.left} onHold={(on) => actions.console.hold('KeyA', on)} />
      <Button name="turn-right" label=">" hint="D" x={rx + 78} y={y0 + 52} w={70} h={24} lit={h.right} onHold={(on) => actions.console.hold('KeyD', on)} />
      <PixelText text="HOLD TO TURN" x={rx} y={y0 + 80} size={FONT_NATIVE} tint={dim} />
      <Button name="auto-face" label="AUTO-FACE" hint="SPC" x={rx} y={y0 + 100} w={148} h={24} lit={h.fire} onHold={(on) => actions.console.hold('Space', on)} />
      <PixelText text="HOLD: NOSE ON ENEMY" x={rx} y={y0 + 128} size={FONT_NATIVE} tint={dim} />
      <PixelText text="W/S  THROTTLE" x={rx} y={y0 + 156} size={FONT_NATIVE} tint={dim} />
    </>
  );
});
