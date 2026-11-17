// The Weapons station block (spec 2026-11-17-artemis-consoles §4.1): laser charge and FIRE, the lock room, the missile
// magazine and LAUNCH, and the steer buttons that hold A and D while a missile flies.
import { memo } from 'react';
import type { WeaponsPanel } from '../../render/duel/consoleModel';
import { STATION, stationTop } from '../../render/duel/consoleLayout';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, TEXT, textPx } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { crtRowLook } from './ReadoutPanel';

const LOCKS = ['WEAP', 'SHLD', 'ENG'] as const;
export const WeaponsStation = memo(function WeaponsStation({ weapons }: { weapons: WeaponsPanel }) {
  const actions = useActions(), { crt, now } = useCrt();
  const top = stationTop('weapons'), x0 = STATION.x + 8, y0 = top + 6, right = STATION.x + STATION.w - 8;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, c = weapons.charge;
  const barColour = crt ? crtRowLook(c, now).bar : c.bar?.colour ?? TEXT;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.weapons} />
      <PixelText text="LASER" x={x0} y={y0} size={FONT_NATIVE} tint={dim} />
      <PixelText text={c.label} x={x0} y={y0 + 18} size={FONT_SIZE} tint={main} />
      <Bar x={x0 + 84} y={y0 + 30} w={120} h={6} fill={c.bar?.fill ?? 0} colour={barColour} />
      <PixelText text={c.value} x={right} y={y0 + 18} size={FONT_SIZE} tint={main} anchorX={1} />
      <Button name="fire" label="FIRE" hint="SPC" x={x0} y={y0 + 48} w={132} h={24} lit={weapons.fireHeld} onHold={(on) => actions.console.hold('Space', on)} />
      <PixelText text="LOCK" x={x0} y={y0 + 80} size={FONT_NATIVE} tint={main} />
      {LOCKS.map((label, r) => <Button key={r} name={`lock-${r}`} label={label} x={x0 + 40 + r * 56} y={y0 + 80} w={52} h={24}
        lit={weapons.lock === r} onPress={() => actions.console.lock(r)} />)}
      <PixelText text="E/Q" x={right} y={y0 + 80} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <Box x={x0} y={y0 + 112} w={right - x0} h={1} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text="MISSILE" x={x0} y={y0 + 118} size={FONT_NATIVE} tint={dim} />
      <PixelText text={`MAG ${weapons.magazine}`} x={x0} y={y0 + 134} size={FONT_SIZE} tint={main} />
      {weapons.missileFlying && <PixelText text="FLYING" x={x0 + textPx(`MAG ${weapons.magazine}`) + 8} y={y0 + 138} size={FONT_NATIVE} tint={crt ? CRT.hot : AMBER} />}
      <Button name="launch" label="LAUNCH" hint="F" x={right - 120} y={y0 + 134} w={120} h={24} disabled={!weapons.canLaunch} onPress={() => actions.console.press('launch')} />
      <PixelText text="STEER" x={x0} y={y0 + 170} size={FONT_NATIVE} tint={main} />
      <Button name="steer-left" label="<" hint="A" x={x0 + 52} y={y0 + 170} w={64} h={24} disabled={!weapons.missileFlying} lit={weapons.held.left}
        onHold={(on) => actions.console.hold('KeyA', on)} />
      <Button name="steer-right" label=">" hint="D" x={x0 + 120} y={y0 + 170} w={64} h={24} disabled={!weapons.missileFlying} lit={weapons.held.right}
        onHold={(on) => actions.console.hold('KeyD', on)} />
    </>
  );
});
