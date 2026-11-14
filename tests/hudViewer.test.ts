import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHudModel, type HudContext, type Viewer } from '../src/renderer/src/render/hudModel';
import { createCardUiState, reconcileUi } from '../src/renderer/src/clientControl/cardController';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { selectTab, sitDown, standUp } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { hashState } from '../src/renderer/src/sim/hash';
import { TICK_HZ } from '../src/renderer/src/sim/tuning';
import { cutterState, quiet } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import skiff from '../src/renderer/src/sim/ship/skiff.json';

afterEach(() => vi.unstubAllEnvs());
const setup = () => {
  const state = cutterState(1, 3); quiet(state);
  const ui = createCardUiState('viewer', state.playerCount);
  const slots: HudContext['slots'] = [
    { status: 'active', key: 'kb:0' }, { status: 'reconnect', key: null }, { status: 'active', key: 'gp:2' }
  ];
  const context: HudContext = { slots, phase: 'running', message: 'Ready' };
  return { state, ui, context };
};

describe('explicit HUD viewers', () => {
  it('preserves couch content and presentation context without player-layout fields', () => {
    const { state, ui, context } = setup();
    const model = buildHudModel(state, { mode: 'couch', ui }, {
      ...context, credits: { lines: ['Credits'], scroll: 7 }, calloutFlash: [StationKind.Engineering]
    });
    expect(model.players.map(p => [p.pid, p.status, p.deviceKind, p.console])).toEqual([
      [0, 'active', 'kb0', null], [1, 'reconnect', null, null], [2, 'active', 'pad', null]
    ]);
    expect(model).toMatchObject({ phase: 'running', message: 'Ready', hull: 100, credits: ['Credits'], creditsScroll: 7, calloutFlash: [StationKind.Engineering] });
    expect(model).not.toHaveProperty('primaryConsole');
    expect(model).not.toHaveProperty('otherCrewStatus');
    const lobby = buildHudModel(null, { mode: 'couch', ui }, { ...context, phase: 'lobby', progress: { bestScore: 20, runs: 2, victories: 1, newUnlocks: [], unlocked: ['Scrap reserve'] } });
    expect(lobby.progressLine).toBe('Runs 2  Best 20  Unlocked: Scrap reserve');
  });

  it('selects each seated viewer’s own card from the same state, regardless of local slots', () => {
    const { state, ui, context } = setup();
    const nav = state.derived.stationOfKind[StationKind.Navigation]!, weapons = state.derived.stationOfKind[StationKind.Weapons]!;
    sitDown(state, 0, nav); sitDown(state, 1, weapons); reconcileUi(state, ui, 'viewer', []);
    const before = hashState(state);
    const first = buildHudModel(state, { mode: 'player', player: 0, ui }, { ...context, slots: [] });
    const second = buildHudModel(state, { mode: 'player', player: 1, ui }, { ...context, slots: [] });
    expect(first.primaryConsole).toMatchObject({ kind: 'navigation' });
    expect(second.primaryConsole).toMatchObject({ kind: 'weapons' });
    expect(first.otherCrewStatus?.map(p => p.pid)).toEqual([1, 2]);
    expect(second.otherCrewStatus?.map(p => p.pid)).toEqual([0, 2]);
    expect(hashState(state)).toBe(before);
  });

  it('never borrows another card for a standing or downed viewer', () => {
    const { state, ui, context } = setup();
    sitDown(state, 0, state.derived.stationOfKind[StationKind.Weapons]!);
    expect(buildHudModel(state, { mode: 'player', player: 1, ui }, context).primaryConsole).toBeNull();
    Life.state[state.crew[0]!] = LifeState.Downed;
    expect(buildHudModel(state, { mode: 'player', player: 0, ui }, context).primaryConsole).toBeNull();
  });

  it('uses each viewer’s client card memory without mutating UI or canonical state', () => {
    const { state, ui, context } = setup();
    const engineering = state.derived.stationOfKind[StationKind.Engineering]!;
    sitDown(state, 0, engineering); reconcileUi(state, ui, 'viewer', []);
    const otherUi = structuredClone(ui);
    otherUi.stations[engineering]!.page = 'upgrades'; otherUi.stations[engineering]!.rowKey = 'reactor';
    const before = hashState(state), beforeUi = structuredClone([ui, otherUi]);
    expect(buildHudModel(state, { mode: 'player', player: 0, ui }, context).primaryConsole).toMatchObject({ page: 0 });
    const upgrades = buildHudModel(state, { mode: 'player', player: 0, ui: otherUi }, context);
    expect(upgrades.primaryConsole).toMatchObject({ page: 1, upgrades: expect.arrayContaining([expect.objectContaining({ name: 'Reactor', cursor: true })]) });
    expect(hashState(state)).toBe(before); expect([ui, otherUi]).toEqual(beforeUi);
    otherUi.stations[engineering]!.page = 'main';
    expect(upgrades.primaryConsole).toMatchObject({ page: 1 });
  });

  it('follows only the viewer’s active grouped tab, including an offline tab', () => {
    const state = createSimState(parseShip(skiff), 2, 1);
    const ui = createCardUiState('skiff', state.playerCount), nav = state.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(state, 0, nav); reconcileUi(state, ui, 'skiff', []);
    const context: HudContext = { slots: [], phase: 'running', message: '' };
    expect(buildHudModel(state, { mode: 'player', player: 0, ui }, context).primaryConsole).toMatchObject({ kind: 'navigation' });
    selectTab(state, 0, state.derived.stationGroup[nav]!, 1);
    const weapons = state.derived.stationOfKind[StationKind.Weapons]!; state.stations.level[weapons] = 0;
    expect(buildHudModel(state, { mode: 'player', player: 0, ui }, context).primaryConsole).toMatchObject({ kind: 'weapons' });
    expect(buildHudModel(state, { mode: 'player', player: 1, ui }, context).otherCrewStatus![0]).toMatchObject({ role: 'WEAPONS', seated: StationKind.Weapons, offline: true });
  });

  it('projects role, health, seat, connectivity, station failure and downed callouts as detached pills', () => {
    const { state, ui, context } = setup();
    const weapons = state.derived.stationOfKind[StationKind.Weapons]!;
    sitDown(state, 1, weapons); state.stations.failed[weapons] = 1; Health.cur[state.crew[1]!] = 43;
    Life.state[state.crew[2]!] = LifeState.Downed;
    const callouts = [{ pid: 1, tick: state.tick, text: 'Power to Weapons!', icon: 'icon.power', flash: StationKind.Weapons }];
    const model = buildHudModel(state, { mode: 'player', player: 0, ui }, { ...context, callouts });
    expect(model.otherCrewStatus).toEqual([
      { pid: 1, role: 'WEAPONS', health: 43, seated: StationKind.Weapons, status: 'reconnect', offline: true, downed: false, life: LifeState.Conscious, callout: { pid: 1, text: 'Power to Weapons!', icon: 'icon.power' } },
      { pid: 2, role: 'Crew', health: 100, seated: null, status: 'active', offline: false, downed: true, life: LifeState.Downed, callout: { pid: 2, text: 'Help!', icon: 'icon.medical' } }
    ]);
    callouts[0]!.text = 'changed'; context.slots[1]!.status = 'active'; standUp(state, 1);
    expect(model.otherCrewStatus![0]).toMatchObject({ role: 'WEAPONS', status: 'reconnect', callout: { text: 'Power to Weapons!' } });
  });

  it('expires callouts, ignores future callouts and suppresses dead crew bubbles', () => {
    const { state, ui, context } = setup(); state.tick = 3 * TICK_HZ;
    const callouts = [
      { pid: 1, tick: 0, text: 'expired', icon: null, flash: null },
      { pid: 2, tick: state.tick + 1, text: 'future', icon: null, flash: null }
    ];
    expect(buildHudModel(state, { mode: 'player', player: 0, ui }, { ...context, callouts }).otherCrewStatus!.map(p => p.callout)).toEqual([null, null]);
    Life.state[state.crew[1]!] = LifeState.Dead;
    callouts[0]!.tick = state.tick;
    expect(buildHudModel(state, { mode: 'player', player: 0, ui }, { ...context, callouts }).otherCrewStatus![0]).toMatchObject({ life: LifeState.Dead, callout: null });
  });

  it.each([-1, 3, 0.5, NaN, Infinity])('rejects invalid player %s in development', player => {
    vi.stubEnv('DEV', true);
    const { state, ui, context } = setup();
    expect(() => buildHudModel(state, { mode: 'player', player, ui }, context)).toThrow(/viewer/i);
  });

  it('rejects a player without a run in development and returns an empty model in production', () => {
    const { state, ui, context } = setup(); const viewer: Viewer = { mode: 'player', player: 0, ui };
    vi.stubEnv('DEV', true);
    expect(() => buildHudModel(null, viewer, context)).toThrow(/viewer/i);
    vi.stubEnv('DEV', false);
    for (const [s, player] of [[null, 0], [state, -1], [state, 3], [state, NaN], [state, Infinity], [state, 0.5]] as const) {
      const model = buildHudModel(s, { ...viewer, player }, context);
      expect(model).toMatchObject({ players: [], primaryConsole: null, otherCrewStatus: [], hull: 0, stations: [], threats: [], map: null });
    }
  });
});
