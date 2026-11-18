import { sitDown } from '../../src/renderer/src/sim/stations'
import { Position } from '../../src/renderer/src/sim/components'
import { createDuel, type DuelState } from '../../src/renderer/src/sim/duel/state'

/**
 * The old seated start: the Helm player at Navigation and the other player at
 * Weapons. createDuel now leaves both standing at the spawns (start-aboard spec),
 * so tests whose subject is not the start call this right after createDuel.
 */
export function seatDuelCrew(d: DuelState): void {
  sitDown(d.interior, d.helmPlayer, d.nav)
  sitDown(d.interior, 1 - d.helmPlayer, d.weapons)
}

/** createDuel, then the old seated start (seatDuelCrew). */
export function createSeatedDuel(...args: Parameters<typeof createDuel>): DuelState {
  const d = createDuel(...args);
  seatDuelCrew(d);
  return d;
}

/** Put pid's character, standing, on station `station`'s console tile: in reach of a sit there (Sci-1's test idiom). */
export function standAtStation(d: DuelState, pid: number, station: number): void {
  const tile = d.interior.derived.stationTile[station]!, w = d.interior.derived.width, eid = d.interior.crew[pid]!
  Position.x[eid] = (tile % w) + 0.5; Position.y[eid] = Math.floor(tile / w) + 0.5
}
