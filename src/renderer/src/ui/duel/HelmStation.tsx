// The Helm station block (spec 2026-11-17-artemis-consoles §4.2, Artemis-ii): the set-and-forget throttle (six press
// notches; the set one lit with a `<` pointer, and the notches from 25 up to it filled), heading and speed, and the turn
// buttons that hold A and D. W and S step the throttle a notch (§5.4); a notch click asks for its level. Feel-i (console
// feel spec §2): AUTO-FACE holds Space, turning the nose onto the enemy's lead point while held.
import { Fragment, memo, useRef } from 'react';
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
/** Feel-ii §1.4: wheel delta px a throttle step takes (as the map's THROTTLE_WHEEL_PX, app/duel/input.ts). */
export const THROTTLE_WHEEL_PX = 100;

export const NOTCHES: readonly { label: string; level: number; name: string }[] = [
  { label: '100', level: 4, name: '100' }, { label: '75', level: 3, name: '75' }, { label: '50', level: 2, name: '50' },
  { label: '25', level: 1, name: '25' }, { label: 'STOP', level: 0, name: 'stop' }, { label: 'REV', level: -1, name: 'rev' }
];

export const HelmStation = memo(function HelmStation({ helm }: { helm: HelmPanel }) {
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('helm'), x0 = STATION.x + 8, y0 = top + 6, rx = STATION.x + 140, h = helm.held, set = helm.throttle;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, wheel = useRef(0);
  // Feel-ii §2.8: a refused control flashes, and its reason takes the hint line under it for REFUSAL_SHOW_S.
  const r = helm.refused ?? null, flash = (c: string): boolean => r?.control === c && r.flash;
  const hint = (c: string, text: string, y: number) => r?.control === c
    ? <PixelText text={r.reason} x={rx} y={y} size={FONT_NATIVE} tint={hot} />
    : <PixelText text={text} x={rx} y={y} size={FONT_NATIVE} tint={dim} />;
  const hold = helm.holdHeading ?? -1, holdDeg = hold >= 0 ? ((Math.round((hold / 256) * 360) % 360) + 360) % 360 : -1;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.helm} />
      <PixelText text="THROTTLE" x={x0} y={y0} size={FONT_NATIVE} tint={dim} />
      {/* Feel-ii §1.4: the wheel over the throttle steps its presets (up is more), a notch per THROTTLE_WHEEL_PX; the
          wrapper holds the notch buttons too, so wheeling over a notch steps it as well. */}
      <div data-testid="console-throttle-wheel" onWheel={(e) => {
        wheel.current += e.deltaMode === 1 ? e.deltaY * 100 / 3 : e.deltaY;
        const n = Math.trunc(wheel.current / THROTTLE_WHEEL_PX);
        if (n !== 0) { wheel.current -= n * THROTTLE_WHEEL_PX; actions.console.throttle(Math.max(-1, Math.min(4, set - n))); }
      }}>
        <Box x={x0} y={y0} w={124} h={186} style={{ pointerEvents: 'auto' }} />
      {NOTCHES.map((n, k) => {
        const y = y0 + 18 + k * 26, filled = n.level >= 1 && n.level <= set;
        return (
          <Fragment key={n.name}>
            <Button name={`throttle-${n.name}`} label={n.label} x={x0} y={y} w={52} h={22} lit={n.level === set} flash={n.level === set && flash('throttle')} onPress={() => actions.console.throttle(n.level)} />
            <Box x={x0 + 58} y={y} w={14} h={22} attrs={{ 'data-ui-throttle': n.label, 'data-ui-lit': filled ? '1' : '0' }}
              style={{ background: hex(filled ? (crt ? CRT.main : AMBER) : (crt ? CRT.faint : BAR_OFF)), border: `1px solid ${hex(dim)}` }} />
            {n.level === set && <PixelText text="<" x={x0 + 78} y={y + 2} size={FONT_SIZE} tint={main} />}
          </Fragment>
        );
      })}
      </div>
      <Box x={STATION.x + 130} y={y0} w={1} h={186} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text={`HDG ${String(helm.heading).padStart(3, '0')}${holdDeg >= 0 ? ` TO ${String(holdDeg).padStart(3, '0')}` : ''}`} x={rx} y={y0} size={FONT_NATIVE} tint={holdDeg >= 0 ? main : dim} />
      <PixelText text={`SPD ${helm.speed}`} x={rx} y={y0 + 18} size={FONT_SIZE} tint={main} />
      <Button name="turn-left" label="<" hint="A" x={rx} y={y0 + 52} w={70} h={24} lit={h.left} flash={flash('turn')} onHold={(on) => actions.console.hold('KeyA', on)} />
      <Button name="turn-right" label=">" hint="D" x={rx + 78} y={y0 + 52} w={70} h={24} lit={h.right} flash={flash('turn')} onHold={(on) => actions.console.hold('KeyD', on)} />
      {hint('turn', 'HOLD TO TURN', y0 + 80)}
      <Button name="auto-face" label="AUTO-FACE" hint="SPC" x={rx} y={y0 + 100} w={148} h={24} lit={h.fire} flash={flash('auto-face')} onHold={(on) => actions.console.hold('Space', on)} />
      {hint('auto-face', 'HOLD: NOSE ON ENEMY', y0 + 128)}
      {hint('throttle', 'W/S  THROTTLE', y0 + 152)}
      {hint('heading', helm.flight ? 'MOUSE: STEER' : 'R-CLICK MAP: HEADING', y0 + 170)}   {/* Valkyrn spec §5.1: no click-to-heading on Flight */}
    </>
  );
});
