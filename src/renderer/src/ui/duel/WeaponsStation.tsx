// The Weapons station block (spec 2026-11-17-artemis-consoles §4.1; FTL targeting spec §1; Engineering spike §10.3, §11):
// the three weapon slots in slot order. PEW PEW (W-1, pew pew spec §1): the PEW row first, its three charge pips (each
// fills as its third recharges) and the click hint; the left click on the Weapons map fires it, so it has no pick-up card
// and 1 / 2 never pick it up. BEAM (today's laser): its charge value and bar, the `x2` burst mark (by its bars), its target
// and FIRE (Space, a single press that fires a full charge). TORPEDO: the magazine, its range state (IN RANGE / OUT OF
// RANGE, weapons update spec §2) or FLYING, its target and LAUNCH (F). A click on BEAM or TORPEDO picks it up (the contact
// window opens and a targeting line runs to the pointer, TargetingLine); a click on the same card again cancels; a
// right-click clears its target (spike ii §6.5: the rock target when set, else the room). Engineering spike §10.3: four pips
// show the bars on each weapon (pew pew's on the PEW row under its charge pips, the others under their cards; the fourth is
// the overdrive's, dashed): a left click adds a bar, a right click removes one; FREE names the bars not yet spent.
// W-2 (pew pew spec §2): the BEAM card's AUTO / MAN tag in its header row, lit in MANUAL; a click toggles the mode, as Z does.
// W-3 (pew pew spec §3): the TORPEDO card's AUTO / MAN tag likewise (V); in MANUAL the card says MANUAL, and a MANUAL torpedo in flight STEER LMB while it can turn (W-4 spec §10: the left mouse flies it) (FLYING in its boost, COASTING once its fuel is spent).
// Sci-1 spec §7.4: the frequency row, A B C with the tuned one lit and the weak one marked after a Level 2 scan (keys 3/4/5).
// Feel-i (console feel spec §1, §3): the BEAM card flashes FIRING while the shot is lined up, says why not in words on the
// row under the cards (`BEAM: OUT OF ARC: HELM TURN RIGHT`), and its frame pulses (the goal glow) while it has no target.
// Spike ii: TGT ROCK on a card with a rock target, the hint names rocks, the ROCKS tally.
// W-4 spec §10 (W-4a): on the Hound (a panel with `autocannon`) the block is PEW PEW, AUTOCANNON and TORPEDO in slot order, the
// selected card's frame hot (a card click selects; TORPEDO is also picked up), AUTOCANNON's rate and heat bar with OVERHEAT,
// no BEAM and no FIRE, and the frequency row's key hint 4/5/6; a laser class keeps the BEAM block below.
// W-4 amendment §2.5: on the Hound's block the TORPEDO tag flips the torpedo through the console's mode channel (R with the
// torpedo selected does the same).
// W-4 spec §10 (W-4b), amendment §2.5: each gun card has its own AUTO / MAN tag and each tag is its own switch (R flips the
// selected weapon's, Shift+R both guns'): lit while that gun is set to MAN; its word is what the gun does now: MAN for the gun
// in hand, else AUTO, or HOLD while the hold keeps AUTO quiet. The second hint row names the target room.
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import type { WeaponsPanel } from '../../render/duel/consoleModel';
import { CARD_PIPS_H, PEW_ROW_H, STATION, stationTop, weaponCard, weaponPips } from '../../render/duel/consoleLayout';
import { FREQ_NAMES } from '../../render/duel/scienceModel';
import { ROOM_NAMES } from '../../render/duel/interiorModel';
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

/** One weapon card's frame and its clickable part (FTL targeting spec §1): lit while picked up. Feel-i: `flash` (FIRING)
 *  blinks the frame hot, `glow` (the goal) pulses it hot and mid. */
function Card({ weapon, lit, crt, flash = false, glow = false, now = 0, rock = false, onSelect, selected = false }: { weapon: Weapon | 'autocannon'; lit: boolean; crt: boolean; flash?: boolean; glow?: boolean; now?: number; rock?: boolean; onSelect?: () => void; selected?: boolean }) {
  const actions = useActions(), c = weaponCard(weapon);
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (weapon === 'autocannon') {   // W-4 spec §10: the autocannon has no target and no pick-up; a left click selects it
      if (e.button === 0) onSelect?.();
      return;
    }
    if (e.button === 2) {   // clear its target: spike ii §6.5, the rock target when set, else the room
      if (rock) actions.console.rockLock?.(weapon, -1);
      else if (weapon === 'torpedo') actions.console.torpLock(-1); else actions.console.lock(-1);
      return;
    }
    if (e.button === 0) { onSelect?.(); actions.contact.pickUp(weapon); }   // W-4 spec §10: TORPEDO selects and is picked up
  };
  const on = (hz: number): boolean => Math.floor(now * 2 * hz) % 2 === 0;
  const edge = lit || selected || (flash && on(FIRING_FLASH_HZ)) || (glow && on(GOAL_GLOW_HZ)) ? (crt ? CRT.hot : AMBER) : crt ? CRT.mid : DIM;
  const thick = flash || glow ? 2 : 1;
  return (
    <>
      <Box x={c.x} y={c.y} w={c.w} h={c.h} attrs={{ 'data-ui-card-frame': weapon, ...(selected ? { 'data-ui-card-selected': '1' } : {}), ...(glow ? { 'data-ui-card-goal': '1' } : {}), ...(flash ? { 'data-ui-card-firing': '1' } : {}) }}
        style={{ border: `${thick}px solid ${hex(edge)}`, pointerEvents: 'none' }} />
      <div data-testid={`console-card-${weapon}`} data-ui-card={lit ? 'lit' : 'idle'} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={c.x} y={c.y} w={c.w} h={c.hitH} style={{ pointerEvents: 'auto', cursor: 'pointer', background: lit ? hex(crt ? CRT.glass : BAR_OFF) : 'transparent' }} />
      </div>
    </>
  );
}

/** Engineering spike §10.3: a weapon's bar pips under its card; a left click adds a bar, a right click removes one. */
function Pips({ slot, bars, crt, flash = false }: { slot: 0 | 1 | 2; bars: number; crt: boolean; flash?: boolean }) {
  const actions = useActions(), { x: x0, y } = weaponPips(slot);
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 0) actions.console.weaponPower?.(slot, 1); else if (e.button === 2) actions.console.weaponPower?.(slot, -1); };
  return (
    <>
      {Array.from({ length: WEAPON_PIPS }, (_, k) => {
        const lit = k < bars, od = k === WEAPON_PIPS - 1;
        return <Box key={k} x={x0 + k * (PIP_W + PIP_GAP)} y={y} w={PIP_W} h={PIP_H} attrs={{ 'data-ui-weapon-pip': `${slot}:${k}:${lit ? 'on' : 'off'}` }}
          style={{ background: lit ? hex(od ? (crt ? CRT.hot : AMBER) : (crt ? CRT.main : AMBER)) : 'transparent', border: `1px ${od ? 'dashed' : 'solid'} ${hex(flash ? (crt ? CRT.hot : AMBER) : (crt ? CRT.mid : DIM))}` }} />;   // W-4 spec §9: `flash` is a refused W/S on this slot
      })}
      <div data-testid={`console-weapon-pips-${slot}`} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={x0} y={y} w={WEAPON_PIPS * (PIP_W + PIP_GAP) - PIP_GAP} h={PIP_H} style={{ pointerEvents: 'auto', cursor: 'pointer' }} />
      </div>
    </>
  );
}

/** The TORPEDO card's body under its header (both blocks): the AUTO / MAN tag (`onMode` flips it), MAG, the status word
 *  (STEER LMB / COASTING / FLYING in flight, MANUAL, else IN RANGE / OUT OF RANGE), the target and LAUNCH. */
function TorpedoCardBody({ weapons, onMode, flash }: { weapons: WeaponsPanel; onMode: () => void; flash: boolean }) {
  const actions = useActions(), { crt } = useCrt();
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER;
  const T = weaponCard('torpedo'), tx = T.x + 6, torpRock = weapons.torpRock === true || weapons.torpRockFlying === true;
  return (
    <>
      {weapons.torpManual !== undefined
        ? <Button name="torp-mode" label={weapons.torpManual ? 'MAN' : 'AUTO'} x={tx + 66} y={T.y + 2} w={36} h={18} lit={weapons.torpManual} onPress={onMode} />
        : null}
      <PixelText text={`MAG ${weapons.magazine}`} x={tx} y={T.y + 20} size={FONT_SIZE} tint={main} />
      {weapons.missileFlying
        ? <PixelText text={weapons.torpSteer === true ? 'STEER LMB' : weapons.torpCoast === true ? 'COASTING' : 'FLYING'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={hot} />
        : weapons.torpManual === true
        ? <PixelText text="MANUAL" x={tx} y={T.y + 42} size={FONT_NATIVE} tint={main} />
        : <PixelText text={weapons.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={weapons.torpedoInRange ? main : dim} />}
      <PixelText text={targetText(weapons.torpTarget, torpRock)} x={tx} y={T.y + 56} size={FONT_NATIVE} tint={weapons.torpTarget >= 0 || torpRock ? hot : dim} />
      <Button name="launch" label="LAUNCH" hint="F" x={tx} y={T.pipsY + 14} w={T.w - 12} h={24} dim={!weapons.canLaunch} flash={flash} onPress={() => actions.console.press('launch')} />
    </>
  );
}

/** Sci-1 spec §7.4: the frequency row under the divider (both blocks): A B C with the tuned one lit, the weak one marked, and
 *  the key hint (`hint`: 4/5/6 on the Hound, 3/4/5 on a laser class) at the right. */
function FreqRow({ weapons, hint }: { weapons: WeaponsPanel; hint: string }) {
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('weapons'), x0 = STATION.x + 8, y0 = top + 6 + PEW_ROW_H + CARD_PIPS_H, right = STATION.x + STATION.w - 8;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT;
  return (
    <>
      <Box x={x0} y={y0 + 156} w={right - x0} h={1} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text="FREQ" x={x0} y={y0 + 174} size={FONT_NATIVE} tint={main} />
      {FREQ_NAMES.map((label, f) => <Button key={f} name={`freq-${f}`} label={label} x={x0 + 52 + f * 56} y={y0 + 170} w={52} h={24}
        lit={weapons.freq === f} onPress={() => actions.console.frequency(f)} />)}
      {weapons.weakFreq !== null && <Box x={x0 + 52 + weapons.weakFreq * 56 + 41} y={y0 + 164} w={7} h={7} attrs={{ 'data-ui-weak-freq': FREQ_NAMES[weapons.weakFreq] ?? '' }}
        style={{ background: hex(crt ? CRT.hot : AMBER), transform: 'rotate(45deg)' }} />}
      <PixelText text={hint} x={right} y={y0 + 174} size={FONT_NATIVE} tint={dim} anchorX={1} />
    </>
  );
}

/** The Weapons station's how-to hint (spike ii: a rock is a target too). */
export const WEAPONS_HINT = 'CLICK A WEAPON, THEN A ROOM OR ROCK';
/** Engineering spike §10.3: the free Weapons bars' words, right-aligned on the reason row (every refusal and reason starts
 *  at the block's left edge, so the two never meet: the test measures the widest). */
export const freeText = (n: number): string => `FREE ${n}`;

/** W-4 spec §10: the pew pew charge pips' left edge from the block's left edge on the Hound (`PEW PEW` is 45 px, so the pips
 *  move right of today's 44; W-4b's AUTO / MAN tag goes between the label and the pips). */
export const HOUND_PEW_PIPS_X = 100;
const PEW_ROW_HINT_Y = 10;

/** W-4 amendment §2.5: the Hound block's second hint row. It names the mode key and the target room (WEAPONS, SHIELDS or
 *  ENGINES); while the torpedo has a target (a room or a rock) it names the room and the torpedo's clear instead, since only
 *  two rows fit above the divider. */
export const houndRoomHint = (lock: number, torpTarget: boolean): string => {
  const name = ROOM_NAMES[lock] ?? ROOM_NAMES[1]!;
  return torpTarget ? `Q/E ROOM: ${name} · RMB TORPEDO: CLEAR` : `R AUTO/MAN · Q/E ROOM: ${name}`;
};

/** W-4 spec §10 (W-4a): the Hound's block: PEW PEW (the PEW row as a card), AUTOCANNON (in the beam's rectangle) and TORPEDO,
 *  the selected card's frame hot, bar pips under each, the reason row, the second row and the frequency row (4/5/6). */
function HoundWeapons({ weapons, aim }: { weapons: WeaponsPanel; aim: Weapon | null }) {
  const actions = useActions(), { crt, now } = useCrt();
  const top = stationTop('weapons'), x0 = STATION.x + 8, y0 = top + 6 + PEW_ROW_H + CARD_PIPS_H, right = STATION.x + STATION.w - 8;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER;
  const A = weaponCard('autocannon'), T = weaponCard('torpedo'), ax = A.x + 6, tx = T.x + 6;
  const gun = weapons.autocannon!, selected = weapons.selected ?? 0, bars = weapons.weaponBars ?? null, pew = weapons.pew ?? [];
  const refused = weapons.refused ?? null, flash = (k: string): boolean => refused?.control === k && refused.flash;
  const powerFlash = (slot: number): boolean => refused?.control === 'power' && refused.flash && selected === slot;
  const blinkOn = Math.floor(now * 2 * FIRING_FLASH_HZ) % 2 === 0;
  const pewHot = selected === 0, edge = pewHot ? hot : crt ? CRT.mid : DIM;
  const select = (slot: 0 | 1 | 2) => (): void => actions.console.select?.(slot);
  const gunTag = (slot: 0 | 1): string => (weapons.gunsHand === slot ? 'MAN' : weapons.gunsHold ? 'HOLD' : 'AUTO');   // amendment §2.5: what the gun does now
  const who = (c: string): string => (c === 'launch' ? 'TORPEDO' : c === 'pew' ? 'PEW' : c === 'autocannon' ? 'AUTOCANNON' : c === 'power' ? 'POWER' : c === 'laser' ? 'ROOM' : /* fire, and any other control */ 'FIRE');   // W-4 amendment §3.6: on the Hound the laser control is the target room's refusal
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.weapons} />
      <Box x={STATION.x + 4} y={top + 2} w={STATION.w - 8} h={PEW_ROW_H} attrs={{ 'data-ui-card-frame': 'pew', ...(pewHot ? { 'data-ui-card-selected': '1' } : {}) }}
        style={{ border: `1px solid ${hex(edge)}`, pointerEvents: 'none' }} />
      <PixelText text="PEW PEW" x={x0} y={top + PEW_ROW_HINT_Y} size={FONT_NATIVE} tint={pewHot ? hot : main} />
      {pew.map((f, k) => <Box key={`pip-${k}`} x={x0 + HOUND_PEW_PIPS_X + k * 34} y={top + 12} w={28} h={8} attrs={{ 'data-ui-pew-pip': String(k), 'data-ui-pew-fill': f.toFixed(2) }}
        style={{ background: hex(crt ? CRT.faint : BAR_OFF) }} />)}
      {pew.map((f, k) => f > 0 ? <Box key={`fill-${k}`} x={x0 + HOUND_PEW_PIPS_X + k * 34} y={top + 12} w={Math.max(1, Math.round(28 * f))} h={8} style={{ background: hex(f >= 1 ? hot : dim) }} /> : null)}
      <PixelText text="1" x={right} y={top + PEW_ROW_HINT_Y} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <div data-testid="console-card-pew" data-ui-card={pewHot ? 'lit' : 'idle'} role="button" onPointerDown={(e) => { e.preventDefault(); if (e.button === 0) select(0)(); }} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={x0} y={top + 6} w={right - x0} h={16} style={{ pointerEvents: 'auto', cursor: 'pointer' }} />
      </div>
      <Button name="gun-mode-pew" label={gunTag(0)} x={x0 + textPx('PEW PEW', 1) + 8} y={top + 4} w={36} h={18} lit={weapons.pewManual === true} onPress={() => actions.console.mode?.(0)} />
      <Card weapon="autocannon" lit={false} selected={selected === 1} onSelect={select(1)} crt={crt} />
      <PixelText text="AUTOCANNON" x={ax} y={A.y + 6} size={FONT_NATIVE} tint={selected === 1 ? hot : dim} />
      <Button name="gun-mode-autocannon" label={gunTag(1)} x={ax + textPx('AUTOCANNON', 1) + 8} y={A.y + 2} w={36} h={18} lit={weapons.gunManual === true} onPress={() => actions.console.mode?.(1)} />
      <PixelText text="2" x={A.x + A.w - 6} y={A.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={gun.rate} x={ax} y={A.y + 20} size={FONT_SIZE} tint={gun.rate === 'OFF' ? dim : main} />
      {gun.offline
        ? <PixelText text="OFFLINE" x={ax} y={A.y + 42} size={FONT_NATIVE} tint={hot} />
        : gun.locked && blinkOn ? <PixelText text="OVERHEAT" x={ax} y={A.y + 42} size={FONT_NATIVE} tint={hot} /> : null}
      <Bar x={ax} y={A.y + 56} w={A.w - 12} h={6} fill={gun.heat} colour={gun.locked ? hot : main} />
      {gun.locked && <Box x={ax} y={A.y + 56} w={A.w - 12} h={6} attrs={{ 'data-ui-overheat': '1' }} style={{ pointerEvents: 'none' }} />}
      <Card weapon="torpedo" lit={aim === 'torpedo'} crt={crt} rock={weapons.torpRock === true} selected={selected === 2} onSelect={select(2)} />
      <PixelText text="TORPEDO" x={tx} y={T.y + 6} size={FONT_NATIVE} tint={aim === 'torpedo' || selected === 2 ? hot : dim} />
      <PixelText text="3" x={T.x + T.w - 6} y={T.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <TorpedoCardBody weapons={weapons} onMode={() => actions.console.mode?.(2)} flash={flash('launch')} />
      {bars && ([0, 1, 2] as const).map((slot) => <Pips key={slot} slot={slot} bars={bars[slot] ?? 0} crt={crt} flash={powerFlash(slot)} />)}
      <PixelText text={refused !== null ? `${who(refused.control)}: ${refused.reason}` : 'LMB FIRE · A/D SELECT · W/S POWER'} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={refused !== null ? hot : dim} />
      {bars && <PixelText text={freeText(weapons.weaponFree ?? 0)} x={right} y={y0 + 116} size={FONT_NATIVE} tint={(weapons.weaponFree ?? 0) > 0 ? hot : dim} anchorX={1} />}
      <PixelText text={houndRoomHint(weapons.lock, weapons.torpTarget >= 0 || weapons.torpRock === true)} x={x0} y={y0 + 134} size={FONT_NATIVE} tint={dim} />
      <PixelText text={`ROCKS ${weapons.rocks ?? 0}`} x={right} y={y0 + 134} size={FONT_NATIVE} tint={(weapons.rocks ?? 0) > 0 ? main : dim} anchorX={1} />
      <FreqRow weapons={weapons} hint="4/5/6" />
    </>
  );
}

export const WeaponsStation = memo(function WeaponsStation({ weapons, aim = null }: { weapons: WeaponsPanel; aim?: Weapon | null }) {
  const actions = useActions(), { crt, now } = useCrt();
  if (weapons.autocannon) return <HoundWeapons weapons={weapons} aim={aim} />;   // W-4 spec §10: the Hound's block; a laser class keeps the BEAM block below
  const top = stationTop('weapons'), x0 = STATION.x + 8, y0 = top + 6 + PEW_ROW_H + CARD_PIPS_H, right = STATION.x + STATION.w - 8;   // y0: the rows under the cards start CARD_PIPS_H lower (Engineering spike §10.3)
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, c = weapons.charge;
  const barColour = crt ? crtRowLook(c, now).bar : c.bar?.colour ?? TEXT;
  const L = weaponCard('laser'), T = weaponCard('torpedo'), lx = L.x + 6, tx = T.x + 6;
  const reason = weapons.laserReason ?? null, firing = reason === 'FIRING', bars = weapons.weaponBars ?? null;
  const laserRock = weapons.laserRock === true;
  // Feel-ii §2.8: a refused FIRE or LAUNCH flashes, and the row under the cards names why for REFUSAL_SHOW_S. Engineering
  // spike §10.4: a refused beam lock (E/Q on an unseen enemy, the `laser` control) flashes FIRE and reads BEAM.
  const refused = weapons.refused ?? null, flash = (k: string): boolean => (refused?.control === k || (k === 'fire' && refused?.control === 'laser')) && refused.flash;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.weapons} />
      {weapons.pew ? <>
        <PixelText text="PEW" x={x0} y={top + 10} size={FONT_NATIVE} tint={main} />
        {weapons.pew.map((f, k) => <Box key={`pip-${k}`} x={x0 + 44 + k * 34} y={top + 12} w={28} h={8} attrs={{ 'data-ui-pew-pip': String(k), 'data-ui-pew-fill': f.toFixed(2) }}
          style={{ background: hex(crt ? CRT.faint : BAR_OFF) }} />)}
        {weapons.pew.map((f, k) => f > 0 ? <Box key={`fill-${k}`} x={x0 + 44 + k * 34} y={top + 12} w={Math.max(1, Math.round(28 * f))} h={8} style={{ background: hex(f >= 1 ? hot : dim) }} /> : null)}
        <PixelText text="L-CLICK MAP" x={right} y={top + 10} size={FONT_NATIVE} tint={dim} anchorX={1} />
      </> : null}
      <Card weapon="laser" lit={aim === 'laser'} crt={crt} flash={firing} glow={weapons.goal === true && aim !== 'laser'} now={now} rock={laserRock} />
      <PixelText text="BEAM" x={lx} y={L.y + 6} size={FONT_NATIVE} tint={aim === 'laser' ? hot : dim} />
      <PixelText text={`x${weapons.burst}`} x={lx + 48} y={L.y + 6} size={FONT_NATIVE} tint={main} />
      <PixelText text="1" x={L.x + L.w - 6} y={L.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      {weapons.laserManual !== undefined
        ? <Button name="laser-mode" label={weapons.laserManual ? 'MAN' : 'AUTO'} x={lx + 66} y={L.y + 2} w={36} h={18} lit={weapons.laserManual} onPress={() => actions.console.press('laserMode')} />
        : null}
      <PixelText text={firing ? 'FIRING' : c.value} x={lx} y={L.y + 20} size={FONT_SIZE} tint={firing ? hot : main} />
      <Bar x={lx} y={L.y + 44} w={L.w - 12} h={6} fill={c.bar?.fill ?? 0} colour={barColour} />
      <PixelText text={targetText(weapons.laserTarget, laserRock)} x={lx} y={L.y + 56} size={FONT_NATIVE} tint={weapons.laserTarget >= 0 || laserRock ? hot : dim} />
      <Button name="fire" label="FIRE" hint="SPC" x={lx} y={L.pipsY + 14} w={L.w - 12} h={24} flash={flash('fire')} onPress={() => actions.console.press('fireDown')} />
      <Card weapon="torpedo" lit={aim === 'torpedo'} crt={crt} rock={weapons.torpRock === true} />
      <PixelText text="TORPEDO" x={tx} y={T.y + 6} size={FONT_NATIVE} tint={aim === 'torpedo' ? hot : dim} />
      <PixelText text="2" x={T.x + T.w - 6} y={T.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <TorpedoCardBody weapons={weapons} onMode={() => actions.console.press('torpMode')} flash={flash('launch')} />
      {refused !== null
        ? <PixelText text={`${refused.control === 'launch' ? 'LAUNCH' : refused.control === 'pew' ? 'PEW' : refused.control === 'laser' ? 'BEAM' : 'FIRE'}: ${refused.reason}`} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={hot} />
        : reason !== null && !firing
        ? <PixelText text={`BEAM: ${reason}`} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={firing ? 'BEAM: FIRING' : WEAPONS_HINT} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={firing ? hot : dim} />}
      {bars && ([0, 1, 2] as const).map((slot) => <Pips key={slot} slot={slot} bars={bars[slot] ?? 0} crt={crt} />)}
      {bars && <PixelText text={freeText(weapons.weaponFree ?? 0)} x={right} y={y0 + 116} size={FONT_NATIVE} tint={(weapons.weaponFree ?? 0) > 0 ? hot : dim} anchorX={1} />}
      <PixelText text={reason !== null && !firing ? WEAPONS_HINT : 'RIGHT-CLICK A WEAPON: CLEAR'} x={x0} y={y0 + 134} size={FONT_NATIVE} tint={dim} />
      <FreqRow weapons={weapons} hint="3/4/5" />
      <PixelText text={`ROCKS ${weapons.rocks ?? 0}`} x={right} y={y0 + 134} size={FONT_NATIVE} tint={(weapons.rocks ?? 0) > 0 ? main : dim} anchorX={1} />
    </>
  );
});
