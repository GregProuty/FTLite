import { sitDown } from '../../src/renderer/src/sim/stations'
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
