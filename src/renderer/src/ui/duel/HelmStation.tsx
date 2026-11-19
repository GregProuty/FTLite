// The Helm station block (spec 2026-11-17-artemis-consoles §4.2, Artemis-ii): the set-and-forget throttle (six press
// notches; the set one lit with a `<` pointer, and the notches from 25 up to it filled), heading and speed, and the turn
// buttons that hold A and D. W and S step the throttle a notch (§5.4); a notch click asks for its level. Feel-i (console
// feel spec §2): AUTO-FACE holds Space, turning the nose onto the enemy's lead point while held.
// Playtest2feedback §6: on a newtonianHelm class (helm.crew) the block is CrewHelmStation: the held throttle bar, the Engines cap and the PORT / STBD thrusters (owner 2026-11-19: no HELM POWER split, no PRESSURE gauge).
import { Fragment, memo, useRef } from 'react';
import { THR_MAX, THR_MIN, type CrewHelmPanel, type HelmPanel } from '../../render/duel/consoleModel';   // the throttle range comes through the model: the UI imports no sim values
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

const NotchHelmStation = memo(function NotchHelmStation({ helm }: { helm: HelmPanel }) {   // the Valkyrn's Flight seat (Artemis-ii, unchanged)
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('helm'), x0 = STATION.x + 8, y0 = top + 6, rx = STATION.x + 140, h = helm.held, set = helm.throttle;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, wheel = useRef(0);
  // Feel-ii §2.8: a refused control flashes, and its reason takes the hint line under it for REFUSAL_SHOW_S.
  const r = helm.refused ?? null, flash = (c: string): boolean => r?.control === c && r.flash;
  const hint = (c: string, text: string, y: number) => r?.control === c
    ? <PixelText text={r.reason} x={rx} y={y} size={FONT_NATIVE} tint={hot} />
    : <PixelText text={text} x={rx} y={y} size={FONT_NATIVE} tint={dim} />;
  const hold = helm.holdHeading ?? -1, holdDeg = hold >= 0 ? ((Math.round((hold / 256) * 360) % 360) + 360) % 360 : -1;
  // Engineering spike §10.2: notches above the Engines bars' cap are locked, and so is REV with no Engines bar.
  const cap = helm.cap ?? 4, locked = (level: number): boolean => level > cap || (level < 0 && cap <= 0);
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.helm} />
      <PixelText text="THROTTLE" x={x0} y={y0} size={FONT_NATIVE} tint={dim} />
      {/* Feel-ii §1.4: the wheel over the throttle steps its presets (up is more), a notch per THROTTLE_WHEEL_PX; the
          wrapper holds the notch buttons too, so wheeling over a notch steps it as well. */}
      <div data-testid="console-throttle-wheel" onWheel={(e) => {
        wheel.current += e.deltaMode === 1 ? e.deltaY * 100 / 3 : e.deltaY;
        const n = Math.trunc(wheel.current / THROTTLE_WHEEL_PX);
        if (n !== 0) { wheel.current -= n * THROTTLE_WHEEL_PX; actions.console.throttle(Math.max(cap <= 0 ? 0 : -1, Math.min(cap, set - n))); }
      }}>
        <Box x={x0} y={y0} w={124} h={186} style={{ pointerEvents: 'auto' }} />
      {NOTCHES.map((n, k) => {
        const y = y0 + 18 + k * 26, filled = n.level >= 1 && n.level <= set;
        return (
          <Fragment key={n.name}>
            <Button name={`throttle-${n.name}`} label={n.label} x={x0} y={y} w={52} h={22} lit={n.level === set} disabled={locked(n.level)} flash={n.level === set && flash('throttle')} onPress={() => actions.console.throttle(n.level)} />
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

/** Playtest2feedback §6: the held throttle bar's labels and their per mille, top to bottom. */
const THR_LABELS: readonly [string, number][] = [['100', 1000], ['75', 750], ['50', 500], ['25', 250], ['0', 0], ['REV', -250]];
const BAR_H = 150, BAR_W = 18;

/** Playtest2feedback §6: the crew Helm's block. On the left, the throttle bar from REV (−25) to 100, filled from 0 to the
 *  shown thrMille. A line marks the Engines cap, and the parts past the cap and the floor are drawn locked (dark). Owner
 *  2026-11-19: no PRESSURE gauge (the cold gas is free). On the right are the heading and speed, and (owner 2026-11-19, in
 *  place of §5's HELM POWER split) the Engines bars and the cap they set; the bars themselves are Engineering's, on the
 *  console's power strip. Below them are PORT and STBD (they hold A and D, the side thrusters), AUTO-FACE, and the key hints. */
const CrewHelmStation = memo(function CrewHelmStation({ helm, crew }: { helm: HelmPanel; crew: CrewHelmPanel }) {
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('helm'), x0 = STATION.x + 8, y0 = top + 6, rx = STATION.x + 140, h = helm.held;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, faint = crt ? CRT.faint : BAR_OFF;
  const r = helm.refused ?? null, flash = (c: string): boolean => r?.control === c && r.flash;
  const hint = (controls: readonly string[], text: string, y: number) => r && controls.includes(r.control)
    ? <PixelText text={r.reason} x={rx} y={y} size={FONT_NATIVE} tint={hot} />
    : <PixelText text={text} x={rx} y={y} size={FONT_NATIVE} tint={dim} />;
  const barX = x0 + 34, barTop = y0 + 18, yAt = (m: number): number => barTop + Math.round(((THR_MAX - m) / (THR_MAX - THR_MIN)) * BAR_H);
  const zeroY = yAt(0), valueY = yAt(crew.thrMille), capY = yAt(crew.cap), floorY = yAt(crew.floor);
  const hold = helm.holdHeading ?? -1, holdDeg = hold >= 0 ? ((Math.round((hold / 256) * 360) % 360) + 360) % 360 : -1;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.helm} />
      <PixelText text="THROTTLE" x={x0} y={y0} size={FONT_NATIVE} tint={flash('throttle') ? hot : dim} />
      {THR_LABELS.map(([label, m]) => <PixelText key={label} text={label} x={x0} y={yAt(m) - 4} size={FONT_NATIVE} tint={dim} />)}
      <Box x={barX} y={barTop} w={BAR_W} h={BAR_H} attrs={{ 'data-ui-thr-bar': String(crew.thrMille) }} style={{ border: `1px solid ${hex(dim)}` }} />
      {capY > barTop && <Box x={barX} y={barTop} w={BAR_W} h={capY - barTop} attrs={{ 'data-ui-thr-locked': 'cap' }} style={{ background: hex(faint) }} />}
      {floorY < barTop + BAR_H && <Box x={barX} y={floorY} w={BAR_W} h={barTop + BAR_H - floorY} attrs={{ 'data-ui-thr-locked': 'floor' }} style={{ background: hex(faint) }} />}
      {valueY !== zeroY && <Box x={barX + 2} y={Math.min(zeroY, valueY)} w={BAR_W - 4} h={Math.abs(zeroY - valueY)} attrs={{ 'data-ui-thr-fill': '1' }} style={{ background: hex(hot) }} />}
      <Box x={barX - 2} y={zeroY} w={BAR_W + 4} h={1} style={{ background: hex(dim) }} />
      <Box x={barX - 4} y={capY} w={BAR_W + 8} h={1} attrs={{ 'data-ui-thr-cap': String(crew.cap) }} style={{ background: hex(main) }} />
      <Box x={STATION.x + 130} y={y0} w={1} h={186} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text={`HDG ${String(helm.heading).padStart(3, '0')}${holdDeg >= 0 ? ` TO ${String(holdDeg).padStart(3, '0')}` : ''}`} x={rx} y={y0} size={FONT_NATIVE} tint={holdDeg >= 0 ? main : dim} />
      <PixelText text={`SPD ${helm.speed}`} x={rx} y={y0 + 18} size={FONT_SIZE} tint={main} />
      <PixelText text={`ENGINES ${crew.bars}`} x={rx} y={y0 + 40} size={FONT_NATIVE} tint={dim} />
      <PixelText text={`CAP ${crew.cap / 10}%${crew.floor < 0 ? '' : '  NO REV'}`} x={rx} y={y0 + 56} size={FONT_SIZE} tint={crew.cap > 0 ? main : hot} />   {/* owner 2026-11-19: 1 bar = 25 %, reverse needs a bar */}
      <Button name="rcs-port" label="PORT" hint="A" x={rx} y={y0 + 90} w={70} h={24} lit={h.left} onHold={(on) => actions.console.hold('KeyA', on)} />
      <Button name="rcs-stbd" label="STBD" hint="D" x={rx + 78} y={y0 + 90} w={70} h={24} lit={h.right} onHold={(on) => actions.console.hold('KeyD', on)} />
      <Button name="auto-face" label="AUTO-FACE" hint="SPC" x={rx} y={y0 + 118} w={148} h={24} lit={h.fire} flash={flash('auto-face')} onHold={(on) => actions.console.hold('Space', on)} />
      {hint(['throttle'], 'W/S THR  A/D Q/E GAS', y0 + 150)}
      {hint(['turn', 'heading', 'auto-face'], 'LMB STEER  RMB HDG', y0 + 170)}   {/* two rows, the lowest at y0 + 170 as the existing block's; RMB HEADING is in the controls list */}
    </>
  );
});

/** The Helm station block: the crew Helm's (playtest2feedback §6) or the notched throttle (Artemis-ii). */
export const HelmStation = memo(function HelmStation({ helm }: { helm: HelmPanel }) {
  return helm.crew ? <CrewHelmStation helm={helm} crew={helm.crew} /> : <NotchHelmStation helm={helm} />;
});
