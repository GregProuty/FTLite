// The Weapons station block (spec 2026-11-17-artemis-consoles §4.1; FTL targeting spec §1): one card per weapon, FTL-
// style. LASER: its charge value and bar, the `x2` burst mark, its target room and FIRE (Space, a single press that fires
// a full laser). TORPEDO: the magazine, its range state (IN RANGE / OUT OF RANGE, weapons update spec §2) or FLYING, its
// target room and LAUNCH (F). A click on a card picks that weapon up (the contact window opens and a targeting line runs
// to the pointer, TargetingLine); a click on the same card again cancels; a right-click clears its target. 1 and 2 pick
// the laser and the torpedo up from the keyboard. The torpedo homes by itself (homing torpedo spec §3).
// Sci-1 spec §7.4: the frequency row, A B C with the tuned one lit and the weak one marked after a Level 2 scan (keys 3/4/5).
// Feel-i (console feel spec §1, §3): the LASER card flashes FIRING while the shot is lined up, says why not in words on the
// row under the cards (`LASER: OUT OF ARC: HELM TURN RIGHT`), and its frame pulses (the goal glow) while it has no target.
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import type { WeaponsPanel } from '../../render/duel/consoleModel';
import { STATION, stationTop, weaponCard } from '../../render/duel/consoleLayout';
import { FREQ_NAMES } from '../../render/duel/scienceModel';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
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

type Weapon = 'laser' | 'torpedo';
/** The room words, rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (as the contact window's labels). */
const ROOM_LABELS = ['WEAP', 'SHLD', 'ENG'] as const;
/** A target room's words on a card: `TGT SHLD`, or `TGT --` with none. */
export const targetText = (room: number): string => `TGT ${room >= 0 ? ROOM_LABELS[room] ?? '--' : '--'}`;
const stop = (e: SyntheticEvent): void => e.preventDefault();

/** Feel-i: the FIRING flash's and the goal glow's rates (Hz) on the CRT clock. */
export const FIRING_FLASH_HZ = 4, GOAL_GLOW_HZ = 1.2;
/** One weapon card's frame and its clickable part (FTL targeting spec §1): lit while picked up. Feel-i: `flash` (FIRING)
 *  blinks the frame hot, `glow` (the goal) pulses it hot and mid. */
function Card({ weapon, lit, crt, flash = false, glow = false, now = 0 }: { weapon: Weapon; lit: boolean; crt: boolean; flash?: boolean; glow?: boolean; now?: number }) {
  const actions = useActions(), c = weaponCard(weapon);
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.button === 2) { if (weapon === 'torpedo') actions.console.torpLock(-1); else actions.console.lock(-1); return; }   // clear its target
    if (e.button === 0) actions.contact.pickUp(weapon);
  };
  const on = (hz: number): boolean => Math.floor(now * 2 * hz) % 2 === 0;
  const edge = lit || (flash && on(FIRING_FLASH_HZ)) || (glow && on(GOAL_GLOW_HZ)) ? (crt ? CRT.hot : AMBER) : crt ? CRT.mid : DIM;
  const thick = flash || glow ? 2 : 1;
  return (
    <>
      <Box x={c.x} y={c.y} w={c.w} h={c.h} attrs={{ 'data-ui-card-frame': weapon, ...(glow ? { 'data-ui-card-goal': '1' } : {}), ...(flash ? { 'data-ui-card-firing': '1' } : {}) }}
        style={{ border: `${thick}px solid ${hex(edge)}`, pointerEvents: 'none' }} />
      <div data-testid={`console-card-${weapon}`} data-ui-card={lit ? 'lit' : 'idle'} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={c.x} y={c.y} w={c.w} h={c.hitH} style={{ pointerEvents: 'auto', cursor: 'pointer', background: lit ? hex(crt ? CRT.glass : BAR_OFF) : 'transparent' }} />
      </div>
    </>
  );
}

export const WeaponsStation = memo(function WeaponsStation({ weapons, aim = null }: { weapons: WeaponsPanel; aim?: Weapon | null }) {
  const actions = useActions(), { crt, now } = useCrt();
  const top = stationTop('weapons'), x0 = STATION.x + 8, y0 = top + 6, right = STATION.x + STATION.w - 8;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, c = weapons.charge;
  const barColour = crt ? crtRowLook(c, now).bar : c.bar?.colour ?? TEXT;
  const L = weaponCard('laser'), T = weaponCard('torpedo'), lx = L.x + 6, tx = T.x + 6;
  const reason = weapons.laserReason ?? null, firing = reason === 'FIRING';
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.weapons} />
      <Card weapon="laser" lit={aim === 'laser'} crt={crt} flash={firing} glow={weapons.goal === true && aim !== 'laser'} now={now} />
      <PixelText text="LASER" x={lx} y={L.y + 6} size={FONT_NATIVE} tint={aim === 'laser' ? hot : dim} />
      <PixelText text={`x${weapons.burst}`} x={lx + 48} y={L.y + 6} size={FONT_NATIVE} tint={main} />
      <PixelText text="1" x={L.x + L.w - 6} y={L.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={firing ? 'FIRING' : c.value} x={lx} y={L.y + 20} size={FONT_SIZE} tint={firing ? hot : main} />
      <Bar x={lx} y={L.y + 44} w={L.w - 12} h={6} fill={c.bar?.fill ?? 0} colour={barColour} />
      <PixelText text={targetText(weapons.laserTarget)} x={lx} y={L.y + 56} size={FONT_NATIVE} tint={weapons.laserTarget >= 0 ? hot : dim} />
      <Button name="fire" label="FIRE" hint="SPC" x={lx} y={L.y + L.hitH + 4} w={L.w - 12} h={24} onPress={() => actions.console.press('fireDown')} />
      <Card weapon="torpedo" lit={aim === 'torpedo'} crt={crt} />
      <PixelText text="TORPEDO" x={tx} y={T.y + 6} size={FONT_NATIVE} tint={aim === 'torpedo' ? hot : dim} />
      <PixelText text="2" x={T.x + T.w - 6} y={T.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={`MAG ${weapons.magazine}`} x={tx} y={T.y + 20} size={FONT_SIZE} tint={main} />
      {weapons.missileFlying
        ? <PixelText text="FLYING" x={tx} y={T.y + 42} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={weapons.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={weapons.torpedoInRange ? main : dim} />}
      <PixelText text={targetText(weapons.torpTarget)} x={tx} y={T.y + 56} size={FONT_NATIVE} tint={weapons.torpTarget >= 0 ? hot : dim} />
      <Button name="launch" label="LAUNCH" hint="F" x={tx} y={T.y + T.hitH + 4} w={T.w - 12} h={24} disabled={!weapons.canLaunch} onPress={() => actions.console.press('launch')} />
      {reason !== null && !firing
        ? <PixelText text={`LASER: ${reason}`} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={firing ? 'LASER: FIRING' : 'CLICK A WEAPON, THEN A ROOM'} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={firing ? hot : dim} />}
      <PixelText text={reason !== null && !firing ? 'CLICK A WEAPON, THEN A ROOM' : 'RIGHT-CLICK A WEAPON: CLEAR'} x={x0} y={y0 + 134} size={FONT_NATIVE} tint={dim} />
      <Box x={x0} y={y0 + 156} w={right - x0} h={1} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text="FREQ" x={x0} y={y0 + 174} size={FONT_NATIVE} tint={main} />
      {FREQ_NAMES.map((label, f) => <Button key={f} name={`freq-${f}`} label={label} x={x0 + 52 + f * 56} y={y0 + 170} w={52} h={24}
        lit={weapons.freq === f} onPress={() => actions.console.frequency(f)} />)}
      {weapons.weakFreq !== null && <Box x={x0 + 52 + weapons.weakFreq * 56 + 41} y={y0 + 164} w={7} h={7} attrs={{ 'data-ui-weak-freq': FREQ_NAMES[weapons.weakFreq] ?? '' }}
        style={{ background: hex(crt ? CRT.hot : AMBER), transform: 'rotate(45deg)' }} />}
      <PixelText text="3/4/5" x={right} y={y0 + 174} size={FONT_NATIVE} tint={dim} anchorX={1} />
    </>
  );
});
