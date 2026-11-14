import { targetRef, scienceTargetSlot } from '../src/renderer/src/sim/debrisTargets';
import { describe, expect, it } from 'vitest';
import { Health } from '../src/renderer/src/sim/components';
import { makeState, placeDebris, placeEnemy } from './helpers/sim';
import { ENEMY_WEAPONS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { firstDifference, projectGameplay, scenarios, runScenario } from './helpers/gameplayTrace';
import { readFileSync } from 'node:fs';
const baseline = JSON.parse(readFileSync('tests/fixtures/net1a-baseline.json', 'utf8')) as { scenarios: ReturnType<typeof runScenario>[] };

describe('independent Net-1a baseline oracle', () => {
  it('reports exact health and RNG paths at the changed tick', () => {
    const s = makeState(); s.tick = 17;
    const expected = projectGameplay(s); Health.cur[s.crew[0]!] = Health.cur[s.crew[0]!]! - 1;
    expect(firstDifference(expected, projectGameplay(s))).toEqual({ tick: 17, field: 'crew[0].health' });
    Health.cur[s.crew[0]!] = Health.cur[s.crew[0]!]! + 1; s.rng.combat.s ^= 1;
    expect(firstDifference(expected, projectGameplay(s))).toEqual({ tick: 17, field: 'rng.combat.s' });
  });
  it('ignores only client UI memory, keeping the weapon selector', () => {
    const s = makeState(), expected = projectGameplay(s);
    s.stations.cursor[0] = 8; s.stations.page[0] = 1; s.run.navSig = 3;
    s.run.navSelect = 4; s.run.navIndex = 5;
    expect(firstDifference(expected, projectGameplay(s))).toBeNull();
    s.weapons.selector = 2;
    expect(firstDifference(expected, projectGameplay(s))?.field).toBe('weapons.selector');
  });
  it('retains stable selected targets, enemy room identity and selector while nulling system/SWAP rows', () => {
    const s = makeState(); const w = s.derived.stationOfKind[StationKind.Weapons]!, sc = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, 0, 10000, 1, 99); placeDebris(s, 1, 10000, 1, 100);
    s.weapons.target = { kind: 'object', stableId: 99 }; s.science.target = targetRef(s, 1);
    const expected = projectGameplay(s);
    expect((expected.weapons as Record<string, unknown>).target).toEqual({ kind: 'debris', stableId: 99 });
    expect((expected.science as Record<string, unknown>).target).toEqual({ kind: 'debris', stableId: 100 });
    s.weapons.target = { kind: 'object', stableId: 100 };
    expect(firstDifference(expected, projectGameplay(s))?.field).toBe('weapons.target.stableId');
    placeEnemy(s); s.weapons.target = { kind: 'enemy', stableId: s.enemy.stableId, room: 0 };
    expect((projectGameplay(s).weapons as Record<string, unknown>).target).toEqual({ kind: 'enemy-room', stableId: s.enemy.stableId, room: 0 });
    for (const cursor of [-1, -2]) { s.science.target = targetRef(s, cursor); expect((projectGameplay(s).science as Record<string, unknown>).target).toBeNull(); }
  });
  it('short scripts exercise their named gameplay transitions', () => {
    const end = (name: string) => baseline.scenarios.find((s) => s.name === name)!.observations.at(-1)!.state;
    const read = (name: string, section: string, key: string) => (end(name)[section] as Record<string, unknown>)[key];
    expect(read('charge-completion-direction-confirm-destroyed-target', 'telemetry', 'shots')).toBe(1);
    expect(read('multi-seat-vote-direction-confirm', 'run', 'eventChoice')).toBe(1);
    expect(read('multi-seat-jump-and-visit-reset', 'run', 'column')).toBe(1);
    expect(read('navigation-ready-tick-jump', 'run', 'column')).toBe(1);
    const ready = baseline.scenarios.find((s) => s.name === 'navigation-ready-tick-jump')!;
    expect((ready.observations[1]!.state.run as Record<string, unknown>).column, 'Confirm must jump on the very tick the drive fills').toBe(1);
    expect(read('multi-seat-jump-and-visit-reset', 'science', 'system')).toBe(0);
    expect((read('sector-jump-visit-reset', 'run', 'visited') as number[])[7], 'new sector resets visited marks').toBe(0);
    expect(read('sector-jump-visit-reset', 'run', 'sector')).toBe(1);
    expect(read('mid-step-row-reconciliation', 'telemetry', 'jumps')).toBe(1);
    const ops = baseline.scenarios.find((s) => s.name === 'skiff-held-stick-tabs-2')!;
    // Held Right creates exactly one tab change per repeat deadline, even across offline tabs.
    const changes = ops.observations.filter((o, i, all) => i > 0 && JSON.stringify((o.state.groups as Record<string, unknown>).tab) !== JSON.stringify((all[i - 1]!.state.groups as Record<string, unknown>).tab)).map((o) => o.tick);
    expect(changes).toEqual([1, 9, 17, 25]);
  });
  for (const scenario of scenarios) it(scenario.name, () => {
    const expected = baseline.scenarios.find((s) => s.name === scenario.name)!;
    expect(expected, 'missing pinned baseline').toBeDefined();
    const actual = runScenario(scenario);
    expect(firstDifference(expected.observations, actual.observations)).toBeNull();
    expect(actual).toEqual(expected);
  });
  it('detects deliberate corruption of the stored oracle independently of execution', () => {
    const expected = structuredClone(baseline.scenarios[0]!.observations);
    const actual = structuredClone(expected);
    (actual[0]!.state as Record<string, unknown>).hull = -123;
    expect(firstDifference(expected, actual)).toEqual({ tick: 0, field: '[0].state.hull' });
  });
});
