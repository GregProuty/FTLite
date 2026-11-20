// One headless duel tick (spec §4 to §9). The duel step (sim/duel/step.ts) wraps this with the Cutter interior and the
// authority's commands; here the crew's inputs arrive ready-made for its slot, the hunter-class slot's come from the
// hunter, and any other active slot is uncrewed.
import { hunterThink } from './hunter';
import { manualTorpTurn } from './manualTorpedo';
import { flyMissile, resolveMissiles } from './missiles';
import { stepRounds } from './gun';
import { stepPew } from './pew';
import { flightFor, flySlot } from './physics';
import { hostilityStep, salvageStep, scanStep } from './science';
import { resolveContacts } from './contacts';
import { beginRockTick } from './rocks';
import { stepRocks } from './rockContacts';
import { classOf, CREW_SLOT, missileOf, NO_AXES, Outcome, type TacticalState } from './state';
import type { FlightTuning } from './tuning';
import { applyWeaponsInput, tickWeapons, UNCREWED_INPUT, type ShipInput } from './weapons';

/** The active slot the hunter's brain flies (its class's AI profile), or −1. There is one hunter brain per encounter. */
export function hunterSlot(state: TacticalState): number {
  return state.ships.findIndex((s, i) => s.active && i !== CREW_SLOT && classOf(state, i).ai === 'hunter');
}

/**
 * Order, fixed (Sci-1 spec §4.6): think (the hunter reads the state as it stands), weapon commands (every active ship, in slot order),
 * ships fly, missiles fly (W-3: a MANUAL one by its Weapons input), ship contacts, missile contacts, gun rounds (Valkyrn spec §7.2), pew rounds (W-1), weapon clocks, hostility, scan progress (the crew input's scanner), salvage, outcome, tick. The crew wins when every other
 * active ship's hull is gone. Does nothing once the duel has ended.
 */
export function stepDuel(state: TacticalState, crew: ShipInput, tuning?: FlightTuning): void {   // playtest2feedback §2: `tuning` overrides every slot; absent, flightFor
  if (state.outcome !== Outcome.Running) return;
  state.events = []; beginRockTick(state);   // spike ii §3.1: the transient masks start empty every tick
  const hunter = hunterSlot(state), n = state.ships.length;
  const inputs = state.ships.map((s, i) => (!s.active ? UNCREWED_INPUT : i === CREW_SLOT ? crew : i === hunter ? hunterThink(state, i) : UNCREWED_INPUT));
  const hunterLaunches = hunter >= 0 ? state.systems[hunter]!.missilesLaunched : 0;
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) applyWeaponsInput(state, i, inputs[i]!);
  if (hunter >= 0 && state.systems[hunter]!.missilesLaunched > hunterLaunches) state.hunter.lastLaunch = state.tick;   // a refused launch costs no cooldown
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flySlot(state, i, inputs[i]!.helm ? inputs[i]!.axes : NO_AXES, tuning ?? flightFor(state, i));
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) {   // homing torpedo spec: an AUTO one steers itself, attended or not
    // W-3 (pew pew spec §3): a MANUAL one turns by its ship's Weapons input, and only while that console is attended.
    const m = missileOf(state, i), input = inputs[i]!;
    flyMissile(state, i, m && m.manual && input.weapons ? manualTorpTurn(m, input.torpHeading) : 0);
  }
  stepRocks(state);   // SPIKE (destructible asteroids): fragments fly and meet the planet and the other rocks
  resolveContacts(state, true);   // spike ii §5.1: rocks are bodies in the duel
  resolveMissiles(state);
  stepRounds(state);   // Valkyrn spec §7.2: after the ships fly and contacts resolve, so a round also moves on its spawn tick
  stepPew(state);   // W-1 (pew pew spec §1): after the gun rounds, against the post-move ships and the torpedoes still flying
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) tickWeapons(state, i, inputs[i]!);
  hostilityStep(state, hunter);
  scanStep(state, crew.scanner);
  salvageStep(state);
  const down = (i: number): boolean => state.systems[i]!.hull <= 0;
  const crewDown = down(CREW_SLOT), others = state.ships.map((s, i) => i).filter((i) => i !== CREW_SLOT && state.ships[i]!.active);
  const enemyDown = others.length > 0 && others.every(down);
  state.outcome = crewDown && enemyDown ? Outcome.Draw : crewDown ? Outcome.EnemyWins : enemyDown ? Outcome.CrewWins : Outcome.Running;
  beginRockTick(state);   // impl review R1-F1: and end empty, so a read between ticks sees what a clone or restore sees
  state.tick++;
}
