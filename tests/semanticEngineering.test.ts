import { describe, it, expect } from 'vitest';
import { makeState, quiet, grantScrap } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { applyConsoleCommand } from '../src/renderer/src/sim/commands';
import type { Command } from '../src/renderer/src/net/contracts';
import { powerUsed, powerCapacity } from '../src/renderer/src/sim/power';
import { hashState } from '../src/renderer/src/sim/hash';
import { cardRows, createCardUiState, reconcileUi, translateTick } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { buildHudModel } from '../src/renderer/src/render/hudModel';
import { doorsCursorTile } from '../src/renderer/src/render/hazardTiles';
import { botFrame } from '../src/renderer/src/clientControl/botClient';
const setup = () => { const s = makeState(); quiet(s); const station = s.derived.stationOfKind[StationKind.Engineering]!; sitDown(s, 0, station); return { s, station }; };
const apply = (s: ReturnType<typeof makeState>, command: Command) => applyConsoleCommand(s, { runId: 'run', id: { player: 0, sequence: 1 }, requestedTick: s.tick, command });
describe('semantic Engineering', () => {
  it('routes one bar with capacity/floor checks and stamps only changes', () => {
    const { s, station } = setup(), target = s.derived.stationOfKind[StationKind.Weapons]!; s.tick = 9;
    expect(apply(s, { kind: 'power', station, target, delta: 1 }).status).toBe('applied'); expect(s.skills.lastEngChangeTick).toBe(9);
    expect(powerUsed(s)).toBeLessThanOrEqual(powerCapacity(s));
    expect(apply(s, { kind: 'power', station, target: station, delta: -1 }).status).toBe('noop');
    s.power.capacity = powerUsed(s); expect(apply(s, { kind: 'power', station, target, delta: 1 }).status).toBe('noop');
    expect(apply(s, { kind: 'power', station: target, target, delta: -1 })).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
  });
  it('cycles coolant against the shared pool and stamps productive changes', () => {
    const { s, station } = setup(), target = s.derived.stationOfKind[StationKind.Weapons]!; s.tick = 12;
    for (const value of [1, 2, 0]) { expect(apply(s, { kind: 'coolant', station, target }).status).toBe('applied'); expect(s.stations.coolant[target]).toBe(value); }
    expect(s.skills.lastEngChangeTick).toBe(12); expect(apply(s, { kind: 'coolant', station, target: station }).status).toBe('noop');
    s.stations.coolant[s.derived.stationOfKind[StationKind.Navigation]!] = 2; s.stations.coolant[s.derived.stationOfKind[StationKind.Science]!] = 2;
    apply(s, { kind: 'coolant', station, target }); expect(s.stations.coolant[target]).toBe(0);
  });
  it('guards purchases with expected levels and charges duplicate requests once', () => {
    const { s, station } = setup(); grantScrap(s, 200); const c = { kind: 'buyUpgrade', station, system: StationKind.Weapons, expectedLevel: 0 } as const;
    expect(apply(s, c).status).toBe('applied'); expect(apply(s, c)).toMatchObject({ status: 'rejected', reason: 'stale-target' }); expect(s.run.scrap).toBe(170);
    expect(apply(s, { kind: 'buyReactor', station, expectedBonus: 0 }).status).toBe('applied'); expect(apply(s, { kind: 'buyReactor', station, expectedBonus: 0 }).reason).toBe('stale-target'); expect(s.run.scrap).toBe(145);
    s.stations.level[station] = 0; expect(apply(s, { ...c, expectedLevel: 1 }).reason).toBe('unavailable');
  });
  it('opens upgrades and BACK without changing authority state or using the bridge', () => {
    const { s, station } = setup(), ui = createCardUiState('run', s.playerCount); reconcileUi(s, ui, 'run', []); ui.stations[station]!.rowKey = 'upgrades';
    const before = hashState(s), frame = { ...NEUTRAL_FRAME, confirmPresses: 1 };
    const out = translateTick(s, ui, [frame], 0); expect(out.commands).toEqual([]); expect(out).not.toHaveProperty('legacyCardInput'); expect(ui.stations[station]!.page).toBe('upgrades'); expect(hashState(s)).toBe(before);
    ui.stations[station]!.rowKey = 'back'; translateTick(s, ui, [frame], 1); expect(ui.stations[station]).toEqual({ page: 'main', rowKey: 'upgrades' }); expect(hashState(s)).toBe(before);
  });
  it('keeps unique identity keys even when the ship lacks multiple station kinds', () => {
    const { s, station } = setup(); s.derived.stationOfKind[StationKind.Navigation] = -1; s.derived.stationOfKind[StationKind.Doors] = -1;
    const rows = cardRows(s, station); expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
  });
  it('reads client UI for migrated rows, HUD and bot decisions with canonical slots guarded', () => {
    for (const kind of [StationKind.Engineering, StationKind.Doors]) {
      const s = makeState(), station = s.derived.stationOfKind[kind]!, ui = createCardUiState('run', s.playerCount); sitDown(s, 0, station); reconcileUi(s, ui, 'run', []);

      Object.defineProperty(s.stations, 'cursor', { get() { throw new Error('migrated cursor read'); } }); Object.defineProperty(s.stations, 'page', { get() { throw new Error('migrated page read'); } });
      expect(() => { cardRows(s, station, ui); translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1 }], 0); buildHudModel(s, { mode: 'couch', ui: ui }, { slots: [], phase: 'running', message: '', credits: null, progress: null, calloutFlash: [] }); doorsCursorTile(s, ui); botFrame(s, ui, 0); }).not.toThrow();
    }
  });
  it('preserves standalone offline coolant but blocks grouped offline Engineering', () => {
    const { s, station } = setup(), target = s.derived.stationOfKind[StationKind.Weapons]!; s.stations.failed[station] = 1;
    expect(apply(s, { kind: 'power', station, target, delta: 1 }).status).toBe('noop');
    expect(apply(s, { kind: 'coolant', station, target }).status).toBe('applied');
    s.derived.stationGroup[station] = 0; s.derived.groupStations.push([station, target]);
    expect(apply(s, { kind: 'coolant', station, target }).reason).toBe('unavailable');
  });
});
