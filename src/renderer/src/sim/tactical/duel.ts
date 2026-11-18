// One headless duel tick (spec §4 to §9). The duel step (sim/duel/step.ts) wraps this with the Cutter interior and the
// authority's commands; here the crew's inputs arrive ready-made for its slot, the hunter-class slot's come from the
// hunter, and any other active slot is uncrewed.
import { hunterThink } from './hunter';
import { flyMissile, resolveMissiles } from './missiles';
import { flySlot } from './physics';
import { hostilityStep } from './science';
import { resolveContacts } from './contacts';
import { classOf, CREW_SLOT, NO_AXES, Outcome, type TacticalState } from './state';
import { DEFAULT_FLIGHT, type FlightTuning } from './tuning';
import { applyWeaponsInput, tickWeapons, UNCREWED_INPUT, type ShipInput } from './weapons';

/** The active slot the hunter's brain flies (its class's AI profile), or −1. There is one hunter brain per encounter. */
export function hunterSlot(state: TacticalState): number {
  return state.ships.findIndex((s, i) => s.active && i !== CREW_SLOT && classOf(state, i).ai === 'hunter');
}

/**
 * Order, fixed (Sci-1 spec §4.6): think (the hunter reads the state as it stands), weapon commands (every active ship, in slot order),
 * ships fly, missiles fly, ship contacts, missile contacts, weapon clocks, hostility, outcome, tick. The crew wins when every other
 * active ship's hull is gone. Does nothing once the duel has ended.
 */
export function stepDuel(state: TacticalState, crew: ShipInput, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  if (state.outcome !== Outcome.Running) return;
  state.events = [];
  const hunter = hunterSlot(state), n = state.ships.length;
  const inputs = state.ships.map((s, i) => (!s.active ? UNCREWED_INPUT : i === CREW_SLOT ? crew : i === hunter ? hunterThink(state, i) : UNCREWED_INPUT));
  const hunterLaunches = hunter >= 0 ? state.systems[hunter]!.missilesLaunched : 0;
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) applyWeaponsInput(state, i, inputs[i]!);
  if (hunter >= 0 && state.systems[hunter]!.missilesLaunched > hunterLaunches) state.hunter.lastLaunch = state.tick;   // a refused launch costs no cooldown
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flySlot(state, i, inputs[i]!.helm ? inputs[i]!.axes : NO_AXES, tuning);
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flyMissile(state, i, inputs[i]!.weapons ? inputs[i]!.steer : 0);
  resolveContacts(state);
  resolveMissiles(state);
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) tickWeapons(state, i, inputs[i]!);
  hostilityStep(state, hunter);
  const down = (i: number): boolean => state.systems[i]!.hull <= 0;
  const crewDown = down(CREW_SLOT), others = state.ships.map((s, i) => i).filter((i) => i !== CREW_SLOT && state.ships[i]!.active);
  const enemyDown = others.length > 0 && others.every(down);
  state.outcome = crewDown && enemyDown ? Outcome.Draw : crewDown ? Outcome.EnemyWins : enemyDown ? Outcome.CrewWins : Outcome.Running;
  state.tick++;
}
