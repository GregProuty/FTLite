import { describe, it, expect } from 'vitest';
import { makeState, quiet, placeDebris, placeEnemy, room } from './helpers/sim';
import { sitDown, standUp, selectTab } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { applyConsoleCommand } from '../src/renderer/src/sim/commands';
import { stepCommands } from '../src/renderer/src/sim/step';
import type { Command, TargetRef } from '../src/renderer/src/net/contracts';
import { createCardUiState, reconcileUi, translateTick } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { startTargetScan, lockFrequency, scanStep, startSystemScan, systemScanStep } from '../src/renderer/src/sim/science';
import { createRng } from '../src/shared/rng';
import { flatten, unflatten } from '../src/renderer/src/sim/flatten';
import { hashState } from '../src/renderer/src/sim/hash';
import { isProductive } from '../src/renderer/src/sim/productive';
import { debrisSystem } from '../src/renderer/src/sim/debris';
import { buildHudModel } from '../src/renderer/src/render/hudModel';
import { botFrame } from '../src/renderer/src/clientControl/botClient';
import { createFixtureRunner } from './helpers/authorityFixture';
import { DT, SCAN_TIME, LOCK_SECONDS, TICK_HZ, XP_RATE } from '../src/renderer/src/sim/tuning';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { firstDifference } from './helpers/gameplayTrace';
import { Skill } from '../src/renderer/src/sim/skills';
import { visitRef } from '../src/renderer/src/sim/commands';
const setup = () => { const s = makeState(2); quiet(s); placeDebris(s, room(s, 'A'), 600, 1, 99); const station = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 1, station); return { s, station, target: { kind: 'object', stableId: 99 } as TargetRef }; };
const envelope = (s: ReturnType<typeof makeState>, command: Command, player = 1, sequence = 1) => ({ runId: 'run', id: { player, sequence }, requestedTick: s.tick, command });
const apply = (s: ReturnType<typeof makeState>, command: Command) => applyConsoleCommand(s, envelope(s, command));
describe('semantic Science', () => {
  it('scan chooses its explicit live target independently of the prior selection', () => {
    const { s, station } = setup(); placeDebris(s, room(s, 'A'), 600, 1, 100);
    const target = { kind: 'object', stableId: 100 } as const;
    expect(startTargetScan(s, station, target)).toBe(true); expect(s.science.target).toEqual(target);
    scanStep(s); expect(s.debris.scan[0]).toBe(0); expect(s.debris.scan[1]).toBeGreaterThan(0);
  });
  it('initializes and resets the authoritative target on every sit including group members', () => {
    const { s, station, target } = setup(); expect(s.science.target).toEqual(target);
    s.science.target = null; standUp(s, 1); sitDown(s, 1, station); expect(s.science.target).toEqual(target);
    standUp(s, 1); const nav = s.derived.stationOfKind[StationKind.Navigation]!;
    s.derived.stationGroup[station] = 0; s.derived.stationGroup[nav] = 0; s.derived.groupStations.push([nav, station]); s.groups.tab = new Uint8Array(1);
    s.science.target = null; sitDown(s, 1, nav); expect(s.science.target).toEqual(target);
  });
  it('pauses at null without clearing scanning, runs system scan independently, and respects tab/stand/offline', () => {
    const { s, station, target } = setup(); expect(startTargetScan(s, station, target)).toBe(true); scanStep(s);
    const progress = s.debris.scan[0]; apply(s, { kind: 'selectTarget', station, target: null }); scanStep(s);
    expect(s.debris.scan[0]).toBe(progress); expect(s.science.scanning).toBe(1); expect(isProductive(s, station)).toBe(true); // warned incoming debris remains productive even on the system row
    expect(startSystemScan(s, station)).toBe(true); systemScanStep(s); expect(s.science.system).toBeGreaterThan(0); expect(s.science.scanning).toBe(1);
    apply(s, { kind: 'selectTarget', station, target }); expect(isProductive(s, station)).toBe(true);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!; standUp(s, 1); s.derived.stationGroup[station] = 0; s.derived.stationGroup[nav] = 0; s.derived.groupStations.push([station, nav]); s.groups.tab = new Uint8Array(1); sitDown(s, 1, station);
    startTargetScan(s, station, target); selectTab(s, 1, 0, 1); scanStep(s); expect(s.debris.scan[0]).toBeGreaterThan(progress!);
    s.stations.level[station] = 0; const kept = s.debris.scan[0]; scanStep(s); expect(s.debris.scan[0]).toBe(kept);
    standUp(s, 1); expect(s.science.scanning).toBe(0);
  });
  it('advances old target in housekeeping before direction plus Confirm selects and scans the next target', () => {
    const { s, station, target } = setup(); placeDebris(s, room(s, 'A'), 600, 1, 100); startTargetScan(s, station, target);
    const ui = createCardUiState('run', 2); reconcileUi(s, ui, 'run', []);
    const actions = translateTick(s, ui, [NEUTRAL_FRAME, { ...NEUTRAL_FRAME, moveY: 1, confirmPresses: 1 }], s.tick);
    expect(actions.legacyCardInput).toEqual([]); expect(actions.commands.map(e => e.command.kind)).toEqual(['selectTarget', 'scan']);
    const results = stepCommands(s, { held: [], commands: actions.commands, legacyCardInput: [] });
    expect(results.map(r => r.status)).toEqual(['applied', 'applied']); expect(s.debris.scan[0]).toBeGreaterThan(0); expect(s.debris.scan[1]).toBe(0); expect(s.science.target).toEqual({ kind: 'object', stableId: 100 });
  });
  it('rejects stale scan after an earlier player destroys its target while removal still retargets automatically', () => {
    const { s, station, target } = setup(); placeDebris(s, room(s, 'A'), 600, 1, 100);
    const weapons = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, weapons); s.weapons.charge = 1; s.rng.combat = createRng(7);
    const runner = createFixtureRunner(s), observe = () => ({ tick: s.tick, science: { scanning: s.science.scanning, target: s.science.target } });
    const actual = [observe()];
    try {
      runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }, { ...NEUTRAL_FRAME, confirmPresses: 1 }]); actual.push(observe());
      expect(s.scratch.commandResults.map(r => [r.status, r.reason])).toEqual([['applied', undefined], ['rejected', 'stale-target']]);
      expect(s.science.target).toEqual({ kind: 'object', stableId: 100 }); expect(s.science.scanning).toBe(0);
      // Before the authority boundary, removeDebris retargeted the numeric
      // cursor before player 1's implicit Confirm: it started scanning 100.
      const oldImplicit = [
        { tick: 0, science: { scanning: 0, target } },
        { tick: 1, science: { scanning: 1, target: { kind: 'object', stableId: 100 } } }
      ];
      expect(firstDifference(oldImplicit, actual)).toEqual({ tick: 1, field: '[1].science.scanning' });
      runner.advance([NEUTRAL_FRAME, NEUTRAL_FRAME]); expect(s.debris.scan[1]).toBe(0);
      // A fresh press uses the new publication and can explicitly scan 100.
      runner.advance([NEUTRAL_FRAME, { ...NEUTRAL_FRAME, confirmPresses: 1 }]); expect(s.science.scanning).toBe(1);
    } finally { runner.dispose(); }
  });
  it('locks only the identified scanned enemy and rejects subsystem scan targets', () => {
    const { s, station } = setup(); placeEnemy(s); const id = s.enemy.stableId; s.enemy.scanned = 1;
    expect(lockFrequency(s, station, id + 1)).toBe(false); expect(lockFrequency(s, station, id)).toBe(true);
    expect(lockFrequency(s, station, id)).toBe(false); expect(startTargetScan(s, station, { kind: 'enemy', stableId: id, room: 0 })).toBe(false);
    expect(apply(s, { kind: 'selectTarget', station, target: { kind: 'enemy', stableId: id, room: 0 } }).reason).toBe('stale-target');
  });
  it('publishes scan completion, known frequency and then locks through the byte path', () => {
    const s = makeState(1); quiet(s); placeEnemy(s); const station = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 0, station);
    s.enemy.scan = 1 - DT * stationOutput(s, station) / SCAN_TIME;
    const runner = createFixtureRunner(s);
    try {
      runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]); expect(s.science.scanning).toBe(1);
      runner.advance([NEUTRAL_FRAME]); expect(runner.view().enemy.scanned).toBe(1);
      const before = s.tick; runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);
      expect(s.enemy.lockUntilTick).toBe(before + LOCK_SECONDS * TICK_HZ);
    } finally { runner.dispose(); }
  });
  it('preserves scan progress and exact XP observation order when visiting the system row', () => {
    const s = makeState(1); quiet(s); placeEnemy(s); const station = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 0, station);
    const target = { ...s.science.target! }, increment = DT * stationOutput(s, station) / SCAN_TIME, runner = createFixtureRunner(s);
    try {
      runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]); expect(s.enemy.scan).toBe(0); expect(s.skills.xp[Skill.Science]).toBe(XP_RATE * DT);
      runner.advance([{ ...NEUTRAL_FRAME, moveY: 1, confirmPresses: 1 }]);
      expect(s.science.target).toBeNull(); expect(s.science.scanning).toBe(1); expect(s.enemy.scan).toBe(increment); expect(s.science.systemState).toBe(1); expect(s.skills.xp[Skill.Science]).toBe(XP_RATE * DT);
      runner.advance([NEUTRAL_FRAME]); expect(s.enemy.scan).toBe(increment); expect(s.science.system).toBeGreaterThan(0); expect(s.skills.xp[Skill.Science]).toBe(XP_RATE * DT);
      runner.advance([NEUTRAL_FRAME], [{ player: 0, command: { kind: 'selectTarget', station, target } }]);
      expect(s.enemy.scan).toBe(increment); expect(s.skills.xp[Skill.Science]).toBe(2 * XP_RATE * DT);
      runner.advance([NEUTRAL_FRAME]); expect(s.enemy.scan).toBe(2 * increment); expect(s.skills.xp[Skill.Science]).toBe(3 * XP_RATE * DT);
    } finally { runner.dispose(); }
  });
  it('rejects stale visit/enemy identities and inactive or offline Science commands', () => {
    const { s, station, target } = setup();
    expect(apply(s, { kind: 'systemScan', station, visit: { ...visitRef(s), arrivalTick: -1 } }).reason).toBe('stale-target');
    expect(apply(s, { kind: 'lockFrequency', station, enemyId: 999 }).reason).toBe('stale-target');
    s.stations.level[station] = 0;
    expect(apply(s, { kind: 'scan', station, target }).reason).toBe('unavailable');
    expect(apply(s, { kind: 'systemScan', station, visit: visitRef(s) }).reason).toBe('unavailable');
    standUp(s, 1); expect(apply(s, { kind: 'scan', station, target }).reason).toBe('invalid-seat');
  });
  it('auto-selects warnings and round-trips authoritative identities distinctly', () => {
    const { s, station } = setup(); s.science.target = null; s.debris.warned[0] = 0; debrisSystem(s); expect(s.science.target).toEqual({ kind: 'object', stableId: 99 });
    const copy = makeState(2), refs: (TargetRef | null)[] = [null, { kind: 'object', stableId: 99 }, { kind: 'object', stableId: 100 }, { kind: 'enemy', stableId: 99, room: 4 }];
    const hashes = refs.map(target => { s.science.target = target; unflatten(copy, flatten(s)); expect(copy.science.target).toEqual(target); return hashState(s); }); expect(new Set(hashes).size).toBe(refs.length);
    const ui = createCardUiState('run', 2); reconcileUi(s, ui, 'run', []);
    Object.defineProperty(s.stations, 'cursor', { get() { throw new Error('migrated cursor read'); } });
    expect(() => { translateTick(s, ui, [NEUTRAL_FRAME, NEUTRAL_FRAME], s.tick); buildHudModel(s, [], 'running', '', null, null, [], ui); botFrame(s, ui, 1); isProductive(s, station); scanStep(s); }).not.toThrow();
  });
});
