import { createSimState, type SimState } from '../../src/renderer/src/sim/state';
import { Position, Health, Life, Stable, Seated } from '../../src/renderer/src/sim/components';
import { StationKind } from '../../src/renderer/src/sim/stationKinds';
import { enemyRoomOfSlot } from '../../src/renderer/src/sim/debrisTargets';
import { DEBRIS_SLOTS, SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { step } from '../../src/renderer/src/sim/step';
import { sitDown } from '../../src/renderer/src/sim/stations';
import { navRows, NodeType } from '../../src/renderer/src/sim/run';
import { NEUTRAL_INTENT, type Intent } from '../../src/shared/intent';
import { DEFAULT_CHARACTERS } from '../../src/renderer/src/sim/characters';
import { mapM, placeDebris, placeEnemy, setEvent, setNodeTypes } from './sim';
import { readFileSync } from 'node:fs';
const golden = JSON.parse(readFileSync('tests/golden/basic.json', 'utf8')) as { replay: { intents: number[][][] } };

type Plain = Record<string, unknown>;
function canonical(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>, (n) => n === 0 ? 0 : n);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical((value as Plain)[k])]));
  return value === 0 ? 0 : value;
}
export function targetProjection(s: SimState, slot: number): unknown {
  if (slot < 0) return null;
  if (slot >= DEBRIS_SLOTS) return s.enemy.present ? { kind: 'enemy-room', stableId: s.enemy.stableId, room: enemyRoomOfSlot(slot) } : null;
  return s.debris.active[slot] ? { kind: 'debris', stableId: s.debris.stableId[slot] } : null;
}
/** Persistent gameplay state, named independently of flatten/snapshot and future command translators.
 * Derived layout/world and tick scratch are not persistent gameplay; every other field is retained
 * except cursor/page/repeat/nav-row memory. Target cursors become gameplay identity first.
 */
export function projectGameplay(s: SimState): Record<string, unknown> {
  const out: Plain = {};
  const omitted = new Set(['layout', 'derived', 'world', 'crew', 'injectionScratch', 'scratch', 'stick']);
  for (const key of Object.keys(s).sort()) if (!omitted.has(key)) out[key] = canonical((s as unknown as Plain)[key]);
  const stations = out.stations as Plain; delete stations.cursor; delete stations.page;
  delete (out.groups as Plain).bar;
  for (const key of ['navSig', 'navSelect', 'navIndex']) delete (out.run as Plain)[key];
  for (const [family, kind] of [['weapons', StationKind.Weapons], ['science', StationKind.Science]] as const) {
    const station = s.derived.stationOfKind[kind]!;
    (out[family] as Plain).target = targetProjection(s, station < 0 ? -1 : s.stations.cursor[station]!);
  }
  out.layoutId = s.layout.id; out.layoutHash = s.derived.layoutHash;
  out.crew = s.crew.map((eid, pid) => ({ pid, stableId: Stable.id[eid], x: Position.x[eid], y: Position.y[eid], health: Health.cur[eid], life: Life.state[eid], bleed: Life.bleed[eid], reviveProgress: Life.reviveProgress[eid], reviverPid: Life.reviverPid[eid], station: Seated.station[eid] }));
  return out;
}
/** First exact difference in canonical field order. Observation tick wins over array index. */
export function firstDifference(expected: unknown, actual: unknown): { tick: number; field: string } | null {
  const visit = (a: unknown, b: unknown, field: string, tick: number): { tick: number; field: string } | null => {
    if (a && typeof a === 'object' && typeof (a as Plain).tick === 'number') tick = (a as Plain).tick as number;
    if (Object.is(a, b)) return null;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return { tick, field };
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return { tick, field: `${field}.length` };
      for (let i = 0; i < a.length; i++) { const d = visit(a[i], b[i], `${field}[${i}]`, tick); if (d) return d; }
      return null;
    }
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) { const d = visit((a as Plain)[key], (b as Plain)[key], field ? `${field}.${key}` : key, tick); if (d) return d; }
    return null;
  };
  return visit(expected, actual, '', 0);
}

type Mutation = { readonly tick: number; readonly op: string; readonly args: readonly (number | string)[] };
type Sample = { readonly tick: number; readonly pid: number; readonly input: Readonly<Partial<Intent>> };
export type GameplayScenario = { readonly name: string; readonly layout: 'starter' | 'skiff' | 'cutter'; readonly seed: number; readonly characters: readonly number[]; readonly unlocks: readonly string[]; readonly ticks: number; readonly every: number; readonly setup: readonly Mutation[]; readonly inputs: readonly Sample[]; readonly golden?: boolean };
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
const mutation = (tick: number, op: string, ...args: (number | string)[]): Mutation => ({ tick, op, args });
const sample = (tick: number, pid: number, input: Partial<Intent>): Sample => ({ tick, pid, input });
const scenario = (name: string, setup: Mutation[], inputs: Sample[], ticks = 24, layout: GameplayScenario['layout'] = 'starter', seed = 1, players = 2): GameplayScenario => ({ name, layout, seed, characters: Array.from({ length: players }, (_, i) => DEFAULT_CHARACTERS[i]!), unlocks: [], ticks, every: 1, setup, inputs });
export const scenarios: readonly GameplayScenario[] = freeze([
  ...(['starter', 'skiff', 'cutter'] as const).flatMap((layout) => [1, 2, 3].map((seed) => scenario(`${layout}-seed-${seed}`, [], [sample(0, 0, { moveX: 0.8, moveY: 0.8 }), sample(3, 0, { interactHeld: true }), sample(9, 1, { moveX: 0.5, moveY: 0.5 }), sample(11, 1, { moveX: 0.5000000000000001 })], 24, layout, seed))),
  scenario('charge-completion-direction-confirm-destroyed-target', [mutation(0, 'quiet'), mutation(0, 'debris'), mutation(0, 'seat', 0, StationKind.Weapons), mutation(0, 'set', 'weapons.charge', 0.9999), mutation(3, 'set', 'debris.active.0', 0)], [sample(1, 0, { moveY: 1, confirmPressed: true }), sample(4, 0, { confirmPressed: true })]),
  scenario('science-system-and-swap-null', [mutation(0, 'quiet'), mutation(0, 'enemy'), mutation(0, 'seat', 0, StationKind.Science), mutation(2, 'set', 'stations.cursor.2', -1), mutation(4, 'set', 'stations.cursor.2', -2)], [sample(1, 0, { confirmPressed: true })], 8),
  ...[StationKind.Science, StationKind.Navigation].map((kind) => scenario(`skiff-held-stick-tabs-${kind}`, [mutation(0, 'quiet'), mutation(0, 'seat', 0, kind), mutation(0, 'bar', kind), mutation(10, 'offline', kind)], Array.from({ length: 32 }, (_, tick) => sample(tick, 0, { moveX: 1 })), 32, 'skiff')),
  scenario('multi-seat-vote-direction-confirm', [mutation(0, 'quiet'), mutation(0, 'map'), mutation(0, 'event', 4), mutation(0, 'seat', 0, StationKind.Navigation), mutation(0, 'seat', 1, StationKind.Engineering), mutation(0, 'choice')], [sample(1, 0, { moveY: 1, confirmPressed: true }), sample(1, 1, { confirmPressed: true }), sample(3, 1, { confirmPressed: true })], 190),
  scenario('multi-seat-jump-and-visit-reset', [mutation(0, 'quiet'), mutation(0, 'map'), mutation(0, 'set', 'science.system', 0.7), mutation(0, 'set', 'science.systemState', 1), mutation(0, 'seat', 0, StationKind.Navigation), mutation(0, 'seat', 1, StationKind.Engineering)], [sample(1, 0, { confirmPressed: true }), sample(2, 1, { confirmPressed: true })], 8),
  scenario('navigation-ready-tick-jump', [mutation(0, 'quiet'), mutation(0, 'map'), mutation(0, 'seat', 0, StationKind.Navigation), mutation(0, 'set', 'run.jumpCharge', 0.9999)], [sample(0, 0, { confirmPressed: true })], 8, 'starter', 1, 1),
  scenario('sector-jump-visit-reset', [mutation(0, 'quiet'), mutation(0, 'map'), mutation(0, 'set', 'run.visited.7', 1), mutation(0, 'set', 'run.column', 5), mutation(0, 'seat', 0, StationKind.Navigation)], [sample(1, 0, { confirmPressed: true })], 8, 'starter', 1, 1),
  scenario('mid-step-row-reconciliation', [mutation(0, 'quiet'), mutation(0, 'map'), mutation(0, 'shop'), mutation(0, 'seat', 0, StationKind.Navigation), mutation(1, 'lastJumpRow'), mutation(3, 'set', 'run.shopWeapon', 0)], [sample(3, 0, { confirmPressed: true })], 8, 'starter', 1, 1),
  { name: 'golden-2026-four-7200', layout: 'starter', seed: 2026, characters: [...DEFAULT_CHARACTERS], unlocks: [], ticks: 7200, every: 60, setup: [], inputs: [], golden: true },
]);
function mutate(s: SimState, m: Mutation): void {
  const a = m.args, n = Number(a[0]);
  switch (m.op) {
    case 'set': { const path = String(a[0]).split('.'); let at = s as unknown as Plain; for (const key of path.slice(0, -1)) at = at[key] as Plain; at[path.at(-1)!] = a[1]; break; }
    case 'quiet': s.director.nextSpawnTick = 1e9; s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; break;
    case 'seat': sitDown(s, n, s.derived.stationOfKind[Number(a[1])]!); break;
    case 'debris': placeDebris(s, 0, 1000000, 1); placeDebris(s, 1, 1000000, 1); break;
    case 'enemy': placeEnemy(s); break;
    case 'map': mapM(s); break;
    case 'event': setEvent(s, n); break;
    case 'bar': s.groups.bar[s.derived.stationGroup[s.derived.stationOfKind[n]!]!] = 1; break;
    case 'offline': s.stations.level[s.derived.stationOfKind[n]!] = 0; break;
    case 'choice': s.stations.cursor[s.derived.stationOfKind[StationKind.Navigation]!] = navRows(s).findIndex((r) => r.select === 'choice'); break;
    case 'lastJumpRow': s.stations.cursor[s.derived.stationOfKind[StationKind.Navigation]!] = navRows(s).map((r) => r.select).lastIndexOf('jump'); break;
    case 'shop': s.run.column = 1; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Shop }); s.run.shopWeapon = 1; s.run.scrap = 999; break;
    default: throw new Error(`unknown baseline setup mutation ${m.op}`);
  }
}
export function runScenario(spec: GameplayScenario) {
  const layout = parseShip({ starter, skiff, cutter }[spec.layout]);
  const s = createSimState(layout, spec.characters.length, spec.seed, spec.characters, { unlocked: spec.unlocks });
  const observations: { tick: number; state: Plain }[] = [];
  const decisions: { tick: number; inputs: Intent[]; rng: unknown }[] = [];
  for (let tick = 0; tick < spec.ticks; tick++) {
    for (const m of spec.setup) if (m.tick === tick) mutate(s, m);
    if (tick % spec.every === 0) observations.push({ tick: s.tick, state: projectGameplay(s) });
    const inputs = Array.from({ length: s.playerCount }, () => ({ ...NEUTRAL_INTENT }));
    if (spec.golden) for (let pid = 0; pid < s.playerCount; pid++) { const [x, y, bits] = golden.replay.intents[tick]![pid]!; inputs[pid] = { moveX: x!, moveY: y!, interactHeld: !!(bits! & 1), interactPressed: !!(bits! & 2), confirmPressed: !!(bits! & 4), cancelPressed: !!(bits! & 8) }; }
    else for (const input of spec.inputs) if (input.tick === tick) inputs[input.pid] = { ...NEUTRAL_INTENT, ...input.input };
    const before = JSON.stringify(s.rng);
    step(s, inputs);
    if (inputs.some((i) => i.confirmPressed || i.cancelPressed || i.interactPressed) || JSON.stringify(s.rng) !== before) decisions.push({ tick, inputs, rng: canonical(s.rng) });
  }
  observations.push({ tick: s.tick, state: projectGameplay(s) });
  return { name: spec.name, observations, decisions, summary: { tick: s.tick, hull: s.hull, ended: s.ended, telemetry: canonical(s.telemetry), simVersion: SIM_VERSION } };
}
