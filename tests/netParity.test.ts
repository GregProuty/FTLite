import { createCardUiState } from '../src/renderer/src/clientControl/cardController';
import { targetRef, scienceTargetSlot } from '../src/renderer/src/sim/debrisTargets';
import { describe, expect, it } from 'vitest';
import { Health } from '../src/renderer/src/sim/components';
import { makeState, placeDebris, placeEnemy } from './helpers/sim';
import { ENEMY_WEAPONS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { firstDifference, projectGameplay } from './helpers/gameplayTrace';
// tests/fixtures/net1a-baseline.json is a retired historical oracle (engine refactor R-0): no default test reads it.
// `npm run bless -- --baseline` re-runs its pinned scenarios on demand. These tests keep the projection itself honest.

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
    const ui = createCardUiState('test', s.playerCount); ui.stations.push({ rowKey: 'evade:0', page: 'upgrades' }); ui.groupBar.push(true);
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
  it('detects deliberate corruption of the stored oracle independently of execution', () => {
    const s = makeState(), expected = [{ tick: 0, state: projectGameplay(s) }];
    const actual = structuredClone(expected);
    (actual[0]!.state as Record<string, unknown>).hull = -123;
    expect(firstDifference(expected, actual)).toEqual({ tick: 0, field: '[0].state.hull' });
  });
});
