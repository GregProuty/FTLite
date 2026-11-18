// The duel's side readout (H-1 spec §7 item 9, §8): both hulls, the shield pips, the room levels and repair, the
// Weapons extras (lock, charge, hold timer, magazine), the other character's status and, standing, the strip about the
// ship outside. Pure (it draws nothing): rows of label and value that the panel draws; every row fits the 220-px column
// (tested). The ship colours come from shipColours.ts so both screens agree.
import { extinguishProgress, pointBurning } from '../../sim/duel/fire';
import type { DuelState } from '../../sim/duel/state';
import { classOf, Contact, missileOf, Room, targetOf } from '../../sim/tactical/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
import { hostilityLine } from './scienceModel';
import { Health, Life, LifeState } from '../../sim/components';
import { HEALTH_MAX } from '../../sim/tuning';
import { LASER_CHARGE_UNITS, MAGAZINE, SHIELD_LAYERS } from '../../sim/tactical/tuning';
import { AMBER, DIM, TEXT, WARN, GOOD } from '../theme';
import { CREW_SHIP, ENEMY_SHIP } from '../tactical/shipColours';
import { bearingDeg } from '../tactical/weaponsModel';
import { READOUT_COLUMN, ROOM_NAMES } from './interiorModel';

export type ReadoutMode = 'helm' | 'weapons' | 'science' | 'interior';
export type OtherStatus = 'AT HELM' | 'AT WEAPONS' | 'AT SCIENCE' | 'WALKING' | 'REPAIRING' | 'DOWNED' | 'STANDING BY';

/** The HEALTH row turns red under this (duel-health spec §2). */
export const HEALTH_LOW = 30;
/** The incoming-missile warning range (spec §8). */
export const INCOMING_RANGE = 600;
export const READOUT_MARGIN = 8, READOUT_W = READOUT_COLUMN - 2 * READOUT_MARGIN;

/** What a row means, beside its tints (CRT map spec section 2): the console views' CRT readout draws by emphasis and the
 *  interior ignores it. `alert` an inverse bar blinking main/hot; `warn` and `good` hot text; `crew` main text and solid
 *  pips; `enemy` an inverse bar (a heading or a value) and hollow pips. */
export type ReadoutEmphasis = 'good' | 'warn' | 'alert' | 'crew' | 'enemy';

export interface ReadoutRow {
  label: string; value: string;
  labelTint: number; valueTint: number;
  /** Shield pips drawn after the label: `n` lit of `max`. */
  pips?: { n: number; max: number; colour: number };
  /** A thin bar along the bottom of the row: 0..1 filled (the laser charge, a room's repair progress). */
  bar?: { fill: number; colour: number };
  emphasis?: ReadoutEmphasis;
}

const row = (label: string, value = '', labelTint = DIM, valueTint = TEXT): ReadoutRow => ({ label, value, labelTint, valueTint });
const heading = (label: string, tint: number): ReadoutRow => row(label, '', tint, tint);
/** The row with an emphasis, or unchanged when there is none (so rows without one carry no `emphasis` key). */
const em = (r: ReadoutRow, emphasis: ReadoutEmphasis | null): ReadoutRow => (emphasis ? { ...r, emphasis } : r);
/** A room's level as text. Weapons and Engines at 2 are off (owner 2026-11-17): OFFLINE. Shields at 2 keeps its layers
 *  and only stops recharging, so it stays DMG 2. */
const level = (n: number, room: number): string => (n === 0 ? 'OK' : n >= 2 && room !== Room.Shields ? 'OFFLINE' : `DMG ${n}`);
const levelTint = (n: number): number => (n === 0 ? GOOD : n === 1 ? AMBER : WARN);

export interface ReadoutInput {
  duel: DuelState;
  mode: ReadoutMode;
  /** The player the keyboard drives; the other's status is shown. */
  active: 0 | 1;
  other: OtherStatus;
  /** On an Artemis console (spec §2): no view heading (the tab strip says it) and no LASER block (the station block shows it). */
  console?: boolean;
}

/** The laser's CHARGE row (OFFLINE, FROZEN, HOLD n.n or a percentage, with its bar): the readout's and the Weapons station's. */
export function chargeRow(d: DuelState): ReadoutRow {
  const t = d.tactical, crewSys = t.systems[0], flying = missileOf(t, 0) !== null, full = crewSys.laserCharge >= LASER_CHARGE_UNITS;
  if (crewSys.rooms[Room.Weapons] >= 2) return em({ ...row('CHARGE', 'OFFLINE', DIM, WARN), bar: { fill: 0, colour: AMBER } }, 'warn');   // Weapons 2: the laser is off
  // FTL targeting spec §2: a full crew laser stays full until it fires, so it reads READY (no vent countdown).
  const value = flying ? 'FROZEN' : full ? 'READY' : `${Math.floor((crewSys.laserCharge / LASER_CHARGE_UNITS) * 100)}%`;
  return em({ ...row('CHARGE', value, DIM, full && !flying ? GOOD : TEXT), bar: { fill: crewSys.laserCharge / LASER_CHARGE_UNITS, colour: full ? GOOD : AMBER } }, full && !flying ? 'good' : null);
}

/** The shown character's health (duel-health spec §2): `72/100` rounded up (a living character never reads 0), red under
 *  HEALTH_LOW, `DOWNED` when downed. */
export function healthRow(d: DuelState, pid: number): ReadoutRow {
  const eid = d.interior.crew[pid]!;
  if (Life.state[eid] === LifeState.Downed) return em(row('HEALTH', 'DOWNED', DIM, WARN), 'alert');
  const hp = Math.ceil(Health.cur[eid]!), low = hp < HEALTH_LOW;
  return em(row('HEALTH', `${hp}/${HEALTH_MAX}`, DIM, low ? WARN : TEXT), low ? 'alert' : null);
}

export function readoutRows(input: ReadoutInput): ReadoutRow[] {
  const d = input.duel, t = d.tactical, target = targetOf(t, 0), other = input.active === 0 ? 1 : 0;
  const crew = t.ships[0], enemy = t.ships[target]!, crewSys = t.systems[0], enemySys = t.systems[target]!;
  const crewHull = classOf(t, 0).hull, enemyHull = classOf(t, target).hull;   // the Hunter's hull is its own (weapons update spec §3)
  const rows: ReadoutRow[] = [
    ...(input.console ? [] : [heading(input.mode === 'helm' ? 'HELM' : input.mode === 'weapons' ? 'WEAPONS' : input.mode === 'science' ? 'SCIENCE' : 'ON FOOT', AMBER)]),
    em(heading(d.interior.layout.id.toUpperCase(), CREW_SHIP), 'crew'),
    em(row('HULL', `${crewSys.hull}/${crewHull}`, DIM, crewSys.hull <= crewHull / 4 ? WARN : TEXT), crewSys.hull <= crewHull / 4 ? 'alert' : null),
    { ...row('SHIELD'), pips: { n: crewSys.shields, max: Math.max(SHIELD_LAYERS, crewSys.shields), colour: CREW_SHIP }, emphasis: 'crew' }   // Shield loot can add a layer (Sci-1 spec §4.5)
  ];
  for (let r = 0; r < 3; r++) {
    const point = d.points.find((p) => p.tacticalRoom === r);
    if (point && pointBurning(d, point)) {   // duel-fire spec §2: FIRE in the damage red, the bar the extinguish progress
      const out = em(row(ROOM_NAMES[r]!, 'FIRE', DIM, WARN), 'alert'), done = extinguishProgress(d, point);
      rows.push(done > 0 ? { ...out, bar: { fill: done, colour: GOOD } } : out);
      continue;
    }
    const n = crewSys.rooms[r]!, progress = d.repair[r]! / REPAIR_UNITS, out = em(row(ROOM_NAMES[r]!, level(n, r), DIM, levelTint(n)), n === 0 ? 'good' : 'warn');
    rows.push(n > 0 && progress > 0 ? { ...out, bar: { fill: progress, colour: GOOD } } : out);
  }
  const seen = t.known[Contact.Enemy];   // Sci-1: what a scan shows; level 0 hides it all, level 1 the rooms
  rows.push(em(heading(seen === 0 ? 'CONTACT' : 'HUNTER', ENEMY_SHIP), 'enemy'));
  const hostile = input.console ? hostilityLine(t) : null;   // Sci-1 spec §7.1: the consoles' hostility line
  if (hostile) rows.push(em(heading(hostile.text, WARN), hostile.alert ? 'alert' : 'warn'));
  rows.push(seen === 0 ? row('HULL', '?') : em(row('HULL', `${enemySys.hull}/${enemyHull}`, DIM, enemySys.hull <= enemyHull / 4 ? GOOD : TEXT), enemySys.hull <= enemyHull / 4 ? 'good' : null));
  rows.push(seen === 0 ? { ...row('SHIELD', '?'), emphasis: 'enemy' } : { ...row('SHIELD'), pips: { n: enemySys.shields, max: SHIELD_LAYERS, colour: ENEMY_SHIP }, emphasis: 'enemy' });
  rows.push(seen < 2 ? row('ROOMS', seen === 0 ? '?' : '? ? ?') : em(row('ROOMS', enemySys.rooms.map((n, r) => `${ROOM_NAMES[r]!.charAt(0)}${n}`).join(' ')), enemySys.rooms.some((n) => n > 0) ? 'warn' : null));
  if (input.mode === 'weapons' && !input.console) {
    const flying = missileOf(t, 0) !== null;
    rows.push(heading('LASER', AMBER));
    rows.push(em(row('LOCK', ROOM_NAMES[crewSys.lock]!), 'enemy'));
    rows.push(chargeRow(d));
    rows.push(row('MAG', `${crewSys.magazine}/${MAGAZINE}${flying ? ' FLYING' : ''}`));
  }
  rows.push(healthRow(d, input.active));
  rows.push(row('OTHER', d.present[other] ? 'PRESENT' : 'AWAY', DIM, d.present[other] ? TEXT : DIM));
  rows.push(row('', input.other));
  if (input.mode === 'interior') {
    const helm = d.interior.stations.occupant[d.nav]!, gun = d.interior.stations.occupant[d.weapons]!;
    const crewed = (pid: number): boolean => pid >= 0 && d.present[pid as 0 | 1];
    rows.push(heading('OUTSIDE', AMBER));
    rows.push(em(row('HELM', crewed(helm) ? 'CREWED' : 'EMPTY', DIM, crewed(helm) ? TEXT : WARN), crewed(helm) ? null : 'alert'));
    if (!crewed(helm)) rows.push(em(row('', 'COASTING', DIM, WARN), 'alert'));
    rows.push(em(row('WEAPONS', crewed(gun) ? 'CREWED' : 'EMPTY', DIM, crewed(gun) ? TEXT : WARN), crewed(gun) ? null : 'alert'));
    const dx = enemy.x - crew.x, dy = enemy.y - crew.y;
    rows.push(row('ENEMY', `${Math.round(Math.sqrt(dx * dx + dy * dy))}`));
    rows.push(row('BEARING', String(bearingDeg(dx, dy)).padStart(3, '0')));
    const m = missileOf(t, target);
    if (m && (m.x - crew.x) ** 2 + (m.y - crew.y) ** 2 <= INCOMING_RANGE * INCOMING_RANGE) rows.push(em(heading('TORPEDO INBOUND', WARN), 'alert'));
  }
  return rows;
}

/** Key help under the rows, per screen (spec §5 table). */
export function readoutHelp(mode: ReadoutMode): string[] {
  if (mode === 'helm') return ['W/S THROTTLE   A/D TURN', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];
  if (mode === 'weapons') return ['1/2 PICK WEAPON, CLICK ROOM', 'SPACE FIRE   F TORPEDO', 'E/Q LASER TARGET   C CAMERA', 'X STAND   TAB SWITCH', 'ESC PAUSE'];   // FTL targeting spec §1
  if (mode === 'science') return ['S SCAN   T NEXT CONTACT', 'CLICK A CONTACT: DESIGNATE', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];
  return ['WASD WALK', 'E SIT   HOLD E REPAIR/EXTINGUISH', 'STAND BY DOWNED TO REVIVE', 'WHEEL ZOOM  DRAG PAN  C FOLLOW', 'TAB SWITCH   ESC PAUSE'];
}

/** Rows the readout pool holds: the longest list (standing, Helm empty, a missile inbound) is 22. */
export const READOUT_ROWS = 22;
