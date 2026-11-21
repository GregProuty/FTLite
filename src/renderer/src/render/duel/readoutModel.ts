// The duel's readout row helpers. UI round §2.2: the readout panel is gone; this keeps the row helpers the Weapons cards
// (chargeRow), the HUD (healthRow's rule, level) and the ship view (crewStatus) use. Pure (it draws nothing).
import { repairInReach, seatOf } from '../../app/duel/controls';
import type { DuelState } from '../../sim/duel/state';
import { classOf, missileOf, Room } from '../../sim/tactical/state';
import { Health, Life, LifeState } from '../../sim/components';
import { HEALTH_MAX } from '../../sim/tuning';
import { LASER_CHARGE_UNITS } from '../../sim/tactical/tuning';
import { AMBER, DIM, GOOD, TEXT, WARN } from '../theme';

/** A crew row's status (Sci-2 spec §5.2), by precedence: DOWNED, AWAY, the console sat at, REPAIRING, ON FOOT. */
export type CrewStatus = 'DOWNED' | 'AWAY' | 'HELM' | 'WEAPONS' | 'SCIENCE' | 'REPAIRING' | 'ON FOOT';

/** The HEALTH row turns red under this (duel-health spec §2). */
export const HEALTH_LOW = 30;

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
/** The row with an emphasis, or unchanged when there is none (so rows without one carry no `emphasis` key). */
const em = (r: ReadoutRow, emphasis: ReadoutEmphasis | null): ReadoutRow => (emphasis ? { ...r, emphasis } : r);
/** A room's level as text. Weapons and Engines at 2 are off (owner 2026-11-17): OFFLINE. Shields at 2 keeps its layers
 *  and only stops recharging, so it stays DMG 2. */
export const level = (n: number, room: number): string => (n === 0 ? 'OK' : n >= 2 && room !== Room.Shields ? 'OFFLINE' : `DMG ${n}`);

/** The laser's CHARGE row (OFFLINE, FROZEN, HOLD n.n or a percentage, with its bar): the readout's and the Weapons station's. */
export function chargeRow(d: DuelState): ReadoutRow {
  const t = d.tactical, crewSys = t.systems[0], flying = missileOf(t, 0) !== null, full = crewSys.laserCharge >= LASER_CHARGE_UNITS;
  const gun = classOf(t, 0).slots.gun;
  if (classOf(t, 0).slots.laser === null && gun) {   // Valkyrn spec §7.4: the gun's heat in the laser's place
    if (crewSys.rooms[Room.Weapons] >= 2) return em({ ...row('HEAT', 'OFFLINE', DIM, WARN), bar: { fill: 0, colour: AMBER } }, 'warn');
    const fill = Math.max(0, Math.min(1, crewSys.gunHeat / gun.heatMax));
    return crewSys.gunLocked === true ? em({ ...row('HEAT', 'OVERHEAT', DIM, WARN), bar: { fill, colour: WARN } }, 'warn')
      : em({ ...row('HEAT', `${Math.floor(fill * 100)}%`, DIM, TEXT), bar: { fill, colour: AMBER } }, null);
  }
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

/** Player pid's status (Sci-2 spec §5.2), from the duel state alone: DOWNED; AWAY (a seated away character too); HELM,
 *  WEAPONS or SCIENCE, the console it sits at; REPAIRING, standing in reach of a repair point whose work has started
 *  (repairInReach plus progress, Sci-2 Decision 5); else ON FOOT. */
export function crewStatus(d: DuelState, pid: number): CrewStatus {
  if (Life.state[d.interior.crew[pid]!] === LifeState.Downed) return 'DOWNED';
  if (!d.present[pid]) return 'AWAY';
  const s = seatOf(d, pid);
  if (s !== 'standing') return s === 'helm' || s === 'flight' ? 'HELM' : s === 'weapons' ? 'WEAPONS' : 'SCIENCE';   // Valkyrn spec §5: Flight reads HELM
  const r = repairInReach(d, pid);
  if (r < 0) return 'ON FOOT';
  const p = d.points.find((q) => q.tacticalRoom === r);
  return d.repair[r]! > 0 || (p !== undefined && d.interior.rooms.fireRepair[p.room]! > 0) ? 'REPAIRING' : 'ON FOOT';
}
