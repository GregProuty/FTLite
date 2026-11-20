// The duel on the sim module contract (engine refactor spec §6, R-1 and R-2): space (the ship slots' bodies, the
// missile pool, the hunter), ship (each slot's systems record), science (Sci-1), presence, repair, round (H-2 spec §7), helm (Artemis-ii), power (Engineering spike spec §7) and the interior
// wrapper, in canonical order after SIM_VERSION. flattenDuel, the duel snapshot and its restore all come
// from this list; tests/duelModules.test.ts holds every DuelState and TacticalState member to a field or an exclusion.
import { flatten, unflatten } from '../flatten';
import { validateCanonicalValues } from '../snapshotValidation';
import { canonicalFields } from '../canonicalFields';
import { flag, flattenModule, moduleLength, scalar, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { scienceModule, shipModule, spaceModule } from '../tactical/hash';
import { powerModule } from './power';
import type { DuelState } from './state';

/** Who is at the keyboard (spec §8 "present or away"). */
export const presenceModule: SimModule<DuelState> = {
  id: 'presence',
  fields: (d) => presenceFields(d.interior.playerCount),
  notSnapshotted: {},
  commands: ['presence'],
  reasons: ['stale-tick', 'malformed']
};
/** One flag per player, `present.0` .. `present.(n−1)` (Sci-2 spec §4.1), built once per crew size. */
const PRESENCE_BY_CREW = new Map<number, ModuleField<DuelState>[]>();
function presenceFields(n: number): ModuleField<DuelState>[] {
  let fields = PRESENCE_BY_CREW.get(n);
  if (!fields) {
    fields = Array.from({ length: n }, (_, p) => flag<DuelState>(`present.${p}`, (d) => d.present[p]!, (d, v) => { d.present[p] = v; }));
    PRESENCE_BY_CREW.set(n, fields);
  }
  return fields;
}

/** Repair progress per tactical Room, in REPAIR_UNITS. */
export const repairModule: SimModule<DuelState> = {
  id: 'repair',
  fields: () => REPAIR,
  notSnapshotted: {},
  commands: [],
  reasons: []
};
const REPAIR: ModuleField<DuelState>[] = [vector('repair', 3, (d) => d.repair)];

/** The round (H-2 spec §7): which round this is, who flies the Helm by the init, the encounter tick the round began on,
 *  and the tick after its deciding step (−1 while it runs). The round's seed is the space module's own `seed`. */
export const roundModule: SimModule<DuelState> = {
  id: 'round',
  fields: () => ROUND,
  notSnapshotted: {},
  commands: ['rematch'],
  reasons: ['duel-running', 'duel-decided', 'stale-tick', 'unavailable']
};
const ROUND: ModuleField<DuelState>[] = [
  scalar('round', (d) => d.round, (d, v) => { d.round = v; }),
  scalar('helmPlayer', (d) => d.helmPlayer, (d, v) => { d.helmPlayer = v; }),
  scalar('baseTick', (d) => d.baseTick, (d, v) => { d.baseTick = v; }),
  scalar('decidedTick', (d) => d.decidedTick, (d, v) => { d.decidedTick = v; })
];

/** The Helm's throttle (Artemis spec §5.1): one canonical level, set by the `throttle` command (sim/duel/step.ts), and
 *  Feel-ii's held heading (−1 none), set by the `heading` command; the crew Helm's held throttle (playtest2feedback §7); and
 *  helm round 2's latch, gas charge and its idle count (spec §8). */
export const helmModule: SimModule<DuelState> = {
  id: 'helm',
  fields: () => HELM,
  notSnapshotted: {},
  commands: ['throttle', 'heading', 'throttleCut'],   // owner 2026-11-19: no helmPower (the crew Helm's cap is Engineering's Engines bars); helm round 2 §2.3: the tap's cut
  reasons: ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']   // playtest2feedback §3: throttle on the crew Helm's class; Engineering spike §10.2: above the Engines cap
};
const HELM: ModuleField<DuelState>[] = [
  scalar('throttle', (d) => d.throttle, (d, v) => { d.throttle = v; }),
  scalar('holdHeading', (d) => d.holdHeading, (d, v) => { d.holdHeading = v; }),
  // Playtest2feedback §7: the crew Helm's held throttle (owner 2026-11-19: no COMPRESSOR share and no cold gas tank).
  scalar('thrMille', (d) => d.thrMille, (d, v) => { d.thrMille = v; }),
  // Helm round 2 §8: the cut's latch, the cold gas charge and its idle count, in this order after thrMille.
  flag('thrCut', (d) => d.thrCut, (d, v) => { d.thrCut = v; }),
  scalar('gas', (d) => d.gas, (d, v) => { d.gas = v; }),
  scalar('gasIdle', (d) => d.gasIdle, (d, v) => { d.gasIdle = v; })
];

/** The duel ship (the Hound) interior: today's SimState, through the sector snapshot path (flatten / unflatten, validated). */
export const interiorModule: SimModule<DuelState> = {
  id: 'interior',
  fields(d) {
    const fields = canonicalFields(d.interior.layout, d.interior.playerCount), last = fields[fields.length - 1]!, count = last.offset + last.count;
    return [{
      name: 'interior', count,
      read(s, out) { for (const v of flatten(s.interior)) out.push(v); },
      write(s, values, offset) {
        const slice = Array.from({ length: count }, (_, k) => values[offset + k]!);
        validateCanonicalValues(s.interior.layout, s.interior.derived, s.interior.playerCount, slice);
        unflatten(s.interior, Float64Array.from(slice));
      }
    }];
  },
  notSnapshotted: {},
  commands: ['sit', 'stand'],
  reasons: ['not-in-duel', 'unavailable', 'invalid-seat', 'stale-target', 'stale-tick']
};

/** The DuelState members that are not module state, each with its reason. */
export const DUEL_NOT_SNAPSHOTTED: Readonly<Record<string, string>> = {
  points: 'the repair points, resolved from the duel layout by createDuel',
  nav: 'the Navigation station index, from the layout',
  weapons: 'the Weapons station index, from the layout',
  science: 'the Science station index, from the layout',
  crewClass: 'the crew slot\'s class: hashed and snapshotted as the ship module\'s systems.0.cls, and in the snapshot header (Valkyrn spec §6.1)',
  events: 'per-tick repair events, cleared every tick',
  helmVent: 'per-tick scratch: this tick\'s vented thruster axes and boost, recomputed every running tick (playtest2feedback §4)',
  systemRooms: 'each system\'s interior room, derived from the layout by createDuel (Engineering spike Decision 3)'
};

/** The duel's modules in canonical order, each with the part of the DuelState it owns. */
export const DUEL_MODULES: readonly { module: SimModule<never>; state(d: DuelState): unknown; path: string }[] = [
  { module: spaceModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
  { module: shipModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
  { module: scienceModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
  { module: presenceModule as SimModule<never>, state: (d) => d, path: '' },
  { module: repairModule as SimModule<never>, state: (d) => d, path: '' },
  { module: roundModule as SimModule<never>, state: (d) => d, path: '' },
  { module: helmModule as SimModule<never>, state: (d) => d, path: '' },
  { module: powerModule as SimModule<never>, state: (d) => d, path: '' },   // Engineering spike spec §7
  { module: interiorModule as SimModule<never>, state: (d) => d, path: '' }
];

/** Every module's values after SIM_VERSION, in order. */
export function flattenDuelModules(d: DuelState, out: number[]): void {
  for (const { module, state } of DUEL_MODULES) flattenModule(module as SimModule<unknown>, state(d), out);
}
/** The number of values after SIM_VERSION. */
export function duelModulesLength(d: DuelState): number {
  let n = 0; for (const { module, state } of DUEL_MODULES) n += moduleLength(module as SimModule<unknown>, state(d)); return n;
}
/** Write every module's values back from `values[offset]`; returns the offset after them. */
export function unflattenDuelModules(d: DuelState, values: ArrayLike<number>, offset: number): number {
  for (const { module, state } of DUEL_MODULES) offset = unflattenModule(module as SimModule<unknown>, state(d), values, offset);
  return offset;
}
