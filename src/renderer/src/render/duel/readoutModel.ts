// The duel's side readout (H-1 spec §7 item 9, §8): both hulls, the shield pips, the room levels and repair, the
// Weapons extras (lock, charge, hold timer, magazine), the other character's status and, standing, the strip about the
// ship outside. Pure (it draws nothing): rows of label and value that the panel draws; every row fits the 220-px column
// (tested). The ship colours come from the map-view layer so both screens agree.
import type { DuelState } from '../../sim/duel/state';
import { missileOf, targetOf } from '../../sim/tactical/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
import { LASER_CHARGE_UNITS, LASER_HOLD_TICKS, MAGAZINE, SHIELD_LAYERS, SHIP_HULL } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { AMBER, DIM, TEXT, WARN, GOOD } from '../theme';
import { CREW_SHIP, ENEMY_SHIP } from '../tactical/tacticalLayer';
import { bearingDeg } from '../tactical/weaponsModel';
import { READOUT_COLUMN, ROOM_NAMES } from './interiorModel';

export type ReadoutMode = 'helm' | 'weapons' | 'interior';
export type OtherStatus = 'AT HELM' | 'AT WEAPONS' | 'WALKING' | 'REPAIRING';

/** The incoming-missile warning range (spec §8). */
export const INCOMING_RANGE = 600;
export const READOUT_MARGIN = 8, READOUT_W = READOUT_COLUMN - 2 * READOUT_MARGIN;

export interface ReadoutRow {
  label: string; value: string;
  labelTint: number; valueTint: number;
  /** Shield pips drawn after the label: `n` lit of `max`. */
  pips?: { n: number; max: number; colour: number };
  /** A thin bar along the bottom of the row: 0..1 filled (the laser charge, a room's repair progress). */
  bar?: { fill: number; colour: number };
}

const row = (label: string, value = '', labelTint = DIM, valueTint = TEXT): ReadoutRow => ({ label, value, labelTint, valueTint });
const heading = (label: string, tint: number): ReadoutRow => row(label, '', tint, tint);
const level = (n: number): string => (n === 0 ? 'OK' : `DMG ${n}`);
const levelTint = (n: number): number => (n === 0 ? GOOD : n === 1 ? AMBER : WARN);

export interface ReadoutInput {
  duel: DuelState;
  mode: ReadoutMode;
  /** The player the keyboard drives; the other's status is shown. */
  active: 0 | 1;
  other: OtherStatus;
}

export function readoutRows(input: ReadoutInput): ReadoutRow[] {
  const d = input.duel, t = d.tactical, target = targetOf(t, 0), other = input.active === 0 ? 1 : 0;
  const crew = t.ships[0], enemy = t.ships[target]!, crewSys = t.systems[0], enemySys = t.systems[target]!;
  const rows: ReadoutRow[] = [
    heading(input.mode === 'helm' ? 'HELM' : input.mode === 'weapons' ? 'WEAPONS' : 'ON FOOT', AMBER),
    heading('CUTTER', CREW_SHIP),
    row('HULL', `${crewSys.hull}/${SHIP_HULL}`, DIM, crewSys.hull <= SHIP_HULL / 4 ? WARN : TEXT),
    { ...row('SHIELD'), pips: { n: crewSys.shields, max: SHIELD_LAYERS, colour: CREW_SHIP } }
  ];
  for (let r = 0; r < 3; r++) {
    const n = crewSys.rooms[r]!, progress = d.repair[r]! / REPAIR_UNITS, out = row(ROOM_NAMES[r]!, level(n), DIM, levelTint(n));
    rows.push(n > 0 && progress > 0 ? { ...out, bar: { fill: progress, colour: GOOD } } : out);
  }
  rows.push(heading('HUNTER', ENEMY_SHIP));
  rows.push(row('HULL', `${enemySys.hull}/${SHIP_HULL}`, DIM, enemySys.hull <= SHIP_HULL / 4 ? GOOD : TEXT));
  rows.push({ ...row('SHIELD'), pips: { n: enemySys.shields, max: SHIELD_LAYERS, colour: ENEMY_SHIP } });
  rows.push(row('ROOMS', enemySys.rooms.map((n, r) => `${ROOM_NAMES[r]!.charAt(0)}${n}`).join(' ')));
  if (input.mode === 'weapons') {
    const flying = missileOf(t, 0) !== null, full = crewSys.laserCharge >= LASER_CHARGE_UNITS;
    rows.push(heading('LASER', AMBER));
    rows.push(row('LOCK', ROOM_NAMES[crewSys.lock]!));
    const value = flying ? 'FROZEN' : full ? `HOLD ${((LASER_HOLD_TICKS - crewSys.laserHold) / TICK_HZ).toFixed(1)}` : `${Math.floor((crewSys.laserCharge / LASER_CHARGE_UNITS) * 100)}%`;
    rows.push({ ...row('CHARGE', value, DIM, full && !flying ? GOOD : TEXT), bar: { fill: crewSys.laserCharge / LASER_CHARGE_UNITS, colour: full ? GOOD : AMBER } });
    rows.push(row('MAG', `${crewSys.magazine}/${MAGAZINE}${flying ? ' FLYING' : ''}`));
  }
  rows.push(row('OTHER', d.present[other] ? 'PRESENT' : 'AWAY', DIM, d.present[other] ? TEXT : DIM));
  rows.push(row('', input.other));
  if (input.mode === 'interior') {
    const helm = d.interior.stations.occupant[d.nav]!, gun = d.interior.stations.occupant[d.weapons]!;
    const crewed = (pid: number): boolean => pid >= 0 && d.present[pid as 0 | 1];
    rows.push(heading('OUTSIDE', AMBER));
    rows.push(row('HELM', crewed(helm) ? 'CREWED' : 'EMPTY', DIM, crewed(helm) ? TEXT : WARN));
    if (!crewed(helm)) rows.push(row('', 'COASTING', DIM, WARN));
    rows.push(row('WEAPONS', crewed(gun) ? 'CREWED' : 'EMPTY', DIM, crewed(gun) ? TEXT : WARN));
    const dx = enemy.x - crew.x, dy = enemy.y - crew.y;
    rows.push(row('ENEMY', `${Math.round(Math.sqrt(dx * dx + dy * dy))}`));
    rows.push(row('BEARING', String(bearingDeg(dx, dy)).padStart(3, '0')));
    const m = missileOf(t, target);
    if (m && (m.x - crew.x) ** 2 + (m.y - crew.y) ** 2 <= INCOMING_RANGE * INCOMING_RANGE) rows.push(heading('MISSILE INBOUND', WARN));
  }
  return rows;
}

/** Key help under the rows, per screen (spec §5 table). */
export function readoutHelp(mode: ReadoutMode): string[] {
  if (mode === 'helm') return ['W/S THRUST   A/D TURN', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];
  if (mode === 'weapons') return ['SPACE HOLD: CHARGE, FIRE', 'F MISSILE   A/D STEER', 'E/Q LOCK   C CAMERA', 'X STAND   TAB SWITCH', 'ESC PAUSE'];
  return ['WASD WALK', 'E SIT   HOLD E REPAIR', 'TAB SWITCH   ESC PAUSE'];
}

/** Rows the readout pool holds: the longest list (standing, Helm empty, a missile inbound) is 21. */
export const READOUT_ROWS = 22;
