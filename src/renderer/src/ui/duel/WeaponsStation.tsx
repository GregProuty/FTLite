// The Weapons station block (spec 2026-11-17-artemis-consoles §4.1; FTL targeting spec §1; Engineering spike §10.3, §11):
// one card per weapon slot, FTL-style, in slot order. PEW PEW: its bars and ARRIVES WITH W-1 (the W-1 skill-shot weapon
// arrives from its own branch; on this one its bars do nothing, and the card has no charge, target or pick-up). BEAM
// (today's laser): its charge value and bar, the `x2` burst mark (by its bars), its target and FIRE (Space, a single press
// that fires a full charge). TORPEDO: the magazine, its range state (IN RANGE / OUT OF RANGE, weapons update spec §2) or
// FLYING, its target and LAUNCH (F). A click on BEAM or TORPEDO picks it up (the contact window opens and a targeting line
// runs to the pointer, TargetingLine); a click on the same card again cancels; a right-click clears its target (spike ii
// §6.5: the rock target when set, else the room). Under each card four pips show the bars on that weapon (the fourth is the
// overdrive's, dashed): a left click adds a bar, a right click removes one. 1 and 2 pick the beam and the torpedo up.
// Sci-1 spec §7.4: the frequency row, A B C with the tuned one lit and the weak one marked after a Level 2 scan (keys 3/4/5).
// Feel-i (console feel spec §1, §3): the BEAM card flashes FIRING while the shot is lined up, says why not in words on the
// row under the cards (`BEAM: OUT OF ARC: HELM TURN RIGHT`), and its frame pulses (the goal glow) while it has no target.
// Spike ii: TGT ROCK on a card with a rock target, the hint names rocks, the ROCKS tally.
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import type { WeaponsPanel } from '../../render/duel/consoleModel';
import { STATION, stationTop, weaponCard, type CardWeapon } from '../../render/duel/consoleLayout';
import { FREQ_NAMES } from '../../render/duel/scienceModel';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, TEXT } from '../../render/theme';
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
/** A target's words on a card: `TGT SHLD`, `TGT --` with none, or `TGT ROCK` with a rock target (spike ii §6.5). */
export const targetText = (room: number, rock = false): string => (rock ? 'TGT ROCK' : `TGT ${room >= 0 ? ROOM_LABELS[room] ?? '--' : '--'}`);
const stop = (e: SyntheticEvent): void => e.preventDefault();

/** Feel-i: the FIRING flash's and the goal glow's rates (Hz) on the CRT clock. */
export const FIRING_FLASH_HZ = 4, GOAL_GLOW_HZ = 1.2;
/** Engineering spike §10.3: a weapon's pips (3 bars and the overdrive's 4th) and their size. */
export const WEAPON_PIPS = 4, PIP_W = 16, PIP_H = 10, PIP_GAP = 4;
const SLOT: Record<CardWeapon, number> = { pew: 0, laser: 1, torpedo: 2 };

/** One weapon card's frame and its clickable part (FTL targeting spec §1): lit while picked up. Feel-i: `flash` (FIRING)
 *  blinks the frame hot, `glow` (the goal) pulses it hot and mid. */
function Card({ weapon, lit, crt, flash = false, glow = false, now = 0, rock = false }: { weapon: Weapon; lit: boolean; crt: boolean; flash?: boolean; glow?: boolean; now?: number; rock?: boolean }) {
  const actions = useActions(), c = weaponCard(weapon);
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.button === 2) {   // clear its target: spike ii §6.5, the rock target when set, else the room
      if (rock) actions.console.rockLock?.(weapon, -1);
      else if (weapon === 'torpedo') actions.console.torpLock(-1); else actions.console.lock(-1);
      return;
    }
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

/** Engineering spike §10.3: a weapon's bar pips under its card; a left click adds a bar, a right click removes one. */
function Pips({ weapon, bars, crt }: { weapon: CardWeapon; bars: number; crt: boolean }) {
  const actions = useActions(), c = weaponCard(weapon), slot = SLOT[weapon], x0 = c.x + 6;
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 0) actions.console.weaponPower?.(slot, 1); else if (e.button === 2) actions.console.weaponPower?.(slot, -1); };
  return (
    <>
      {Array.from({ length: WEAPON_PIPS }, (_, k) => {
        const lit = k < bars, od = k === WEAPON_PIPS - 1;
        return <Box key={k} x={x0 + k * (PIP_W + PIP_GAP)} y={c.pipsY} w={PIP_W} h={PIP_H} attrs={{ 'data-ui-weapon-pip': `${slot}:${k}:${lit ? 'on' : 'off'}` }}
          style={{ background: lit ? hex(od ? (crt ? CRT.hot : AMBER) : (crt ? CRT.main : AMBER)) : 'transparent', border: `1px ${od ? 'dashed' : 'solid'} ${hex(crt ? CRT.mid : DIM)}` }} />;
      })}
      <div data-testid={`console-weapon-pips-${slot}`} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={x0} y={c.pipsY} w={WEAPON_PIPS * (PIP_W + PIP_GAP) - PIP_GAP} h={PIP_H} style={{ pointerEvents: 'auto', cursor: 'pointer' }} />
      </div>
    </>
  );
}

/** The Weapons station's how-to hint (spike ii: a rock is a target too). */
export const WEAPONS_HINT = 'CLICK A WEAPON, THEN A ROOM OR ROCK';
/** Engineering spike §10.3: the free Weapons bars' words, right-aligned on the reason row (every refusal and reason starts
 *  at the block's left edge, so the two never meet: the test measures the widest). */
export const freeText = (n: number): string => `FREE ${n}`;

export const WeaponsStation = memo(function WeaponsStation({ weapons, aim = null }: { weapons: WeaponsPanel; aim?: Weapon | null }) {
  const actions = useActions(), { crt, now } = useCrt();
  const top = stationTop('weapons'), x0 = STATION.x + 8, y0 = top + 6, right = STATION.x + STATION.w - 8;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, c = weapons.charge;
  const barColour = crt ? crtRowLook(c, now).bar : c.bar?.colour ?? TEXT;
  const P = weaponCard('pew'), L = weaponCard('laser'), T = weaponCard('torpedo'), px = P.x + 6, lx = L.x + 6, tx = T.x + 6;
  const reason = weapons.laserReason ?? null, firing = reason === 'FIRING', bars = weapons.weaponBars ?? null;
  const laserRock = weapons.laserRock === true, torpRock = weapons.torpRock === true || weapons.torpRockFlying === true;
  // Feel-ii §2.8: a refused FIRE or LAUNCH flashes, and the row under the cards names why for REFUSAL_SHOW_S. Engineering
  // spike §10.4: a refused beam lock (E/Q on an unseen enemy, the `laser` control) flashes FIRE and reads BEAM.
  const refused = weapons.refused ?? null, flash = (k: string): boolean => (refused?.control === k || (k === 'fire' && refused?.control === 'laser')) && refused.flash;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.weapons} />
      <div data-testid="console-pew-frame" onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={P.x} y={P.y} w={P.w} h={P.h} attrs={{ 'data-ui-card-frame': 'pew' }} style={{ border: `1px solid ${hex(dim)}`, pointerEvents: 'auto' }} />
      </div>
      <PixelText text="PEW PEW" x={px} y={P.y + 4} size={FONT_NATIVE} tint={dim} />
      <PixelText text="ARRIVES" x={px} y={P.y + 20} size={FONT_NATIVE} tint={dim} />
      <PixelText text="WITH W-1" x={px} y={P.y + 36} size={FONT_NATIVE} tint={dim} />
      <Card weapon="laser" lit={aim === 'laser'} crt={crt} flash={firing} glow={weapons.goal === true && aim !== 'laser'} now={now} rock={laserRock} />
      <PixelText text="BEAM" x={lx} y={L.y + 4} size={FONT_NATIVE} tint={aim === 'laser' ? hot : dim} />
      <PixelText text={`x${weapons.burst}`} x={lx + 36} y={L.y + 4} size={FONT_NATIVE} tint={main} />
      <PixelText text="1" x={L.x + L.w - 6} y={L.y + 4} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={firing ? 'FIRING' : c.value} x={lx} y={L.y + 20} size={FONT_NATIVE} tint={firing ? hot : main} />
      <Bar x={lx} y={L.y + 36} w={L.w - 12} h={6} fill={c.bar?.fill ?? 0} colour={barColour} />
      <PixelText text={targetText(weapons.laserTarget, laserRock)} x={lx} y={L.y + 44} size={FONT_NATIVE} tint={weapons.laserTarget >= 0 || laserRock ? hot : dim} />
      <Button name="fire" label="FIRE" hint="SPC" x={lx} y={L.pipsY + 14} w={L.w - 12} h={24} flash={flash('fire')} onPress={() => actions.console.press('fireDown')} />
      <Card weapon="torpedo" lit={aim === 'torpedo'} crt={crt} rock={weapons.torpRock === true} />
      <PixelText text="TORPEDO" x={tx} y={T.y + 4} size={FONT_NATIVE} tint={aim === 'torpedo' ? hot : dim} />
      <PixelText text="2" x={T.x + T.w - 6} y={T.y + 4} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={`MAG ${weapons.magazine}`} x={tx} y={T.y + 20} size={FONT_NATIVE} tint={main} />
      {weapons.missileFlying
        ? <PixelText text="FLYING" x={tx} y={T.y + 32} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={weapons.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 32} size={FONT_NATIVE} tint={weapons.torpedoInRange ? main : dim} />}
      <PixelText text={targetText(weapons.torpTarget, torpRock)} x={tx} y={T.y + 44} size={FONT_NATIVE} tint={weapons.torpTarget >= 0 || torpRock ? hot : dim} />
      <Button name="launch" label="LAUNCH" hint="F" x={tx} y={T.pipsY + 14} w={T.w - 12} h={24} dim={!weapons.canLaunch} flash={flash('launch')} onPress={() => actions.console.press('launch')} />
      {bars && (['pew', 'laser', 'torpedo'] as const).map((w) => <Pips key={w} weapon={w} bars={bars[SLOT[w]] ?? 0} crt={crt} />)}
      {bars && <PixelText text={freeText(weapons.weaponFree ?? 0)} x={right} y={y0 + 116} size={FONT_NATIVE} tint={(weapons.weaponFree ?? 0) > 0 ? hot : dim} anchorX={1} />}
      {refused !== null
        ? <PixelText text={`${refused.control === 'launch' ? 'LAUNCH' : refused.control === 'laser' ? 'BEAM' : 'FIRE'}: ${refused.reason}`} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={hot} />
        : reason !== null && !firing
        ? <PixelText text={`BEAM: ${reason}`} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={firing ? 'BEAM: FIRING' : WEAPONS_HINT} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={firing ? hot : dim} />}
      <PixelText text={reason !== null && !firing ? WEAPONS_HINT : 'RIGHT-CLICK A WEAPON: CLEAR'} x={x0} y={y0 + 134} size={FONT_NATIVE} tint={dim} />
      <Box x={x0} y={y0 + 156} w={right - x0} h={1} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text="FREQ" x={x0} y={y0 + 174} size={FONT_NATIVE} tint={main} />
      {FREQ_NAMES.map((label, f) => <Button key={f} name={`freq-${f}`} label={label} x={x0 + 52 + f * 56} y={y0 + 170} w={52} h={24}
        lit={weapons.freq === f} onPress={() => actions.console.frequency(f)} />)}
      {weapons.weakFreq !== null && <Box x={x0 + 52 + weapons.weakFreq * 56 + 41} y={y0 + 164} w={7} h={7} attrs={{ 'data-ui-weak-freq': FREQ_NAMES[weapons.weakFreq] ?? '' }}
        style={{ background: hex(crt ? CRT.hot : AMBER), transform: 'rotate(45deg)' }} />}
      <PixelText text="3/4/5" x={right} y={y0 + 174} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={`ROCKS ${weapons.rocks ?? 0}`} x={right} y={y0 + 134} size={FONT_NATIVE} tint={(weapons.rocks ?? 0) > 0 ? main : dim} anchorX={1} />
    </>
  );
});
