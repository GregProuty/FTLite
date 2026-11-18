// What a duel character can do from where it stands (H-1 spec §5). Pure reads of the duel state, mirroring the sim's own
// rules (sim/duel/step.ts repairPhase, today's sit validation), so the client only sends commands the sim would admit.
import { Life, LifeState, Position, Seated } from '../../sim/components';
import { roomAt } from '../../sim/grid';
import { inReachOfTile } from '../../sim/interact';
import { stationOnline } from '../../sim/stations';
import { pointBurning } from '../../sim/duel/fire';
import type { DuelState } from '../../sim/duel/state';

export type Seat = 'helm' | 'weapons' | 'science' | 'flight' | 'standing';

/** Valkyrn spec §5: Navigation and Weapons share one console group (the Flight seat: Helm and Weapons in one). */
export function flightSeat(d: DuelState): boolean {
  const g = d.interior.derived.stationGroup[d.nav];
  return g !== undefined && g >= 0 && g === d.interior.derived.stationGroup[d.weapons];
}

/** Where player pid's character is: seated at Navigation (the Helm), at Weapons, at both (the Flight seat, Valkyrn spec §5),
 *  at Science (Sci-1 spec §6.1), or standing. A player the duel does not have (n = 1's player 1) is standing. */
export function seatOf(d: DuelState, pid: number): Seat {
  const eid = d.interior.crew[pid];
  if (eid === undefined) return 'standing';
  const station = Seated.station[eid]!;
  if (station >= 0 && (station === d.nav || station === d.weapons) && flightSeat(d)) return 'flight';
  return station === d.nav ? 'helm' : station === d.weapons ? 'weapons' : d.science >= 0 && station === d.science ? 'science' : 'standing';
}

/** The tactical Room player pid would repair (or put out, duel-fire spec §1.4) by holding E now, or −1: the first damaged
 *  or burning room (in Room order, as the sim picks) whose repair room the character stands in, in reach of its repair
 *  tile. Seated characters repair nothing. */
export function repairInReach(d: DuelState, pid: number): number {
  const eid = d.interior.crew[pid]!;
  if (Seated.station[eid]! >= 0 || Life.state[eid] !== LifeState.Conscious) return -1;
  const here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!), ship = d.tactical.systems[0];
  const p = d.points.find((q) => (ship.rooms[q.tacticalRoom]! > 0 || pointBurning(d, q)) && q.room === here && inReachOfTile(d.interior, eid, q.tile));
  return p ? p.tacticalRoom : -1;
}

/** The free role console (Navigation, Weapons or Science) player pid can sit at now, or −1: today's sit rule, from inside the
 *  console's room and in reach of its tile. */
export function consoleInReach(d: DuelState, pid: number): number {
  const st = d.interior, eid = st.crew[pid]!;
  if (Seated.station[eid]! >= 0 || Life.state[eid] !== LifeState.Conscious) return -1;
  const here = roomAt(st, Position.x[eid]!, Position.y[eid]!);
  for (const i of [d.nav, d.weapons, d.science]) {
    if (i < 0) continue;   // a layout without a Science console
    // As the sim's sit check: no member of the console's group occupied, and at least one online.
    const g = st.derived.stationGroup[i], members = g !== undefined && g >= 0 ? st.derived.groupStations[g]! : [i];
    if (members.some((j) => st.stations.occupant[j]! >= 0) || !members.some((j) => stationOnline(st, j)) || st.derived.stationRoom[i] !== here) continue;
    if (inReachOfTile(st, eid, st.derived.stationTile[i]!)) return i;
  }
  return -1;
}

/** The lock cycle Weapons → Shields → Engines → Weapons (Room order); `dir` +1 next (E), −1 previous (Q). */
export function cycleLock(room: number, dir: 1 | -1): number { return (((room + dir) % 3) + 3) % 3; }
/** The torpedo's target stepped `steps` times through Rooms 0..2 (FTL targeting spec §1, E / Q while it is picked up):
 *  from no target (−1) the first step lands on Room 0 forward (E) or Room 2 backward (Q), then each cycles as cycleLock. */
export function stepTorpRoom(room: number, steps: number): number {
  const dir: 1 | -1 = steps > 0 ? 1 : -1;
  let r = room;
  for (let n = 0; n < Math.abs(steps); n++) r = r < 0 ? (dir > 0 ? 0 : 2) : cycleLock(r, dir);
  return r;
}
