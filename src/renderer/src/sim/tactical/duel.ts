// One headless duel tick (spec §4 to §9). H-0c wraps this in the duel step that also runs the Cutter interior and the
// authority's commands; here the crew's inputs arrive ready-made and the enemy's come from the hunter.
import { hunterThink } from './hunter';
import { flyMissile, resolveMissiles } from './missiles';
import { flyShip } from './physics';
import { resolveContacts } from './contacts';
import { NO_AXES, Outcome, type TacticalState } from './state';
import { DEFAULT_FLIGHT, type FlightTuning } from './tuning';
import { applyWeaponsInput, tickWeapons, type ShipInput } from './weapons';

/**
 * Order, fixed: think (the hunter reads the state as it stands), weapon commands (both ships, in order), ships fly,
 * missiles fly, ship contacts, missile contacts, weapon clocks, outcome, tick. Does nothing once the duel has ended.
 */
export function stepDuel(state: TacticalState, crew: ShipInput, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  if (state.outcome !== Outcome.Running) return;
  state.events = [];
  const inputs: [ShipInput, ShipInput] = [crew, hunterThink(state)];
  const enemyLaunches = state.ships[1].missilesLaunched;
  for (let i = 0; i < 2; i++) applyWeaponsInput(state, i, inputs[i]!);
  if (state.ships[1].missilesLaunched > enemyLaunches) state.hunter.lastLaunch = state.tick;   // a refused launch costs no cooldown
  state.ships.forEach((s, i) => flyShip(s, inputs[i]!.helm ? inputs[i]!.axes : NO_AXES, tuning));
  for (let i = 0; i < 2; i++) flyMissile(state, i, inputs[i]!.weapons ? inputs[i]!.steer : 0);
  resolveContacts(state);
  resolveMissiles(state);
  for (let i = 0; i < 2; i++) tickWeapons(state, i, inputs[i]!);
  const crewDown = state.ships[0].hull <= 0, enemyDown = state.ships[1].hull <= 0;
  state.outcome = crewDown && enemyDown ? Outcome.Draw : crewDown ? Outcome.EnemyWins : enemyDown ? Outcome.CrewWins : Outcome.Running;
  state.tick++;
}
