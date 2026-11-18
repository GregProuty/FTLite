// Valkyrn-i test helpers (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §3.1, §5; plan Decision 3). The Valkyrn's
// layout JSON arrives in Part ii, so the sim's tests fly a Valkyrn-shaped copy of the Hound: the four layout fields set
// (class valkyrn, crew 1, the Helm holds unattended, hull valkyrn) and Navigation and Weapons on one tile in one console
// group, the Flight seat. It keeps the id 'hound' because the duel's repair points are keyed by layout id.
import hound from '../../src/renderer/src/sim/ship/hound.json';
import { createDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { parseShip, type ShipLayout } from '../../src/renderer/src/sim/ship/schema';
import { sitDown } from '../../src/renderer/src/sim/stations';

/** The Valkyrn-shaped Hound, with `over` applied last (e.g. `{ crew: 2 }` or `{ shipClass: 'skiff' }`). */
export function valkyrnTestLayout(over: Record<string, unknown> = {}): ShipLayout {
  const nav = hound.stations.find((s) => s.id === 'navigation')!.tile;
  return parseShip({
    ...hound,
    stations: hound.stations.map((s) => (s.id === 'weapons' ? { ...s, room: 'B', tile: nav } : s)),
    consoleGroups: [...hound.consoleGroups, { tile: nav, kinds: ['navigation', 'weapons'] }],
    shipClass: 'valkyrn', crew: 1, helmHoldsUnattended: true, hull: 'valkyrn',
    ...over
  });
}
export const VALKYRN_TEST = valkyrnTestLayout();

/** A crew-of-one duel on the Valkyrn-shaped layout, its class from the layout unless `cls` overrides it. */
export function createValkyrnDuel(seed: number, cls?: number, layout: ShipLayout = VALKYRN_TEST): DuelState {
  return createDuel(layout, seed, 0, 1, cls);
}
/** Seat the pilot at the Flight seat (Navigation's console group): it then attends Navigation and Weapons both. */
export function seatPilot(d: DuelState): void { sitDown(d.interior, 0, d.nav); }
/** createValkyrnDuel, then seatPilot. */
export function createSeatedValkyrn(seed: number, cls?: number): DuelState {
  const d = createValkyrnDuel(seed, cls);
  seatPilot(d);
  return d;
}
