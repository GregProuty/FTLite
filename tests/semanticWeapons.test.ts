import { describe, it, expect } from 'vitest';
import { makeState, quiet, placeDebris, placeEnemy, room } from './helpers/sim';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { applyConsoleCommand } from '../src/renderer/src/sim/commands';
import { stepCommands } from '../src/renderer/src/sim/step';
import type { Command, TargetRef } from '../src/renderer/src/net/contracts';
import { createCardUiState, reconcileUi, translateTick } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { removeDebris } from '../src/renderer/src/sim/debris';
import { createRng, nextFloat } from '../src/shared/rng';
import { flatten, unflatten } from '../src/renderer/src/sim/flatten';
import { weaponRef, fireWeaponAt, PULSE_WEAPON_ID, TORPEDO_WEAPON_ID, Weapon } from '../src/renderer/src/sim/weapons';
import { resolveTarget, targetRef, ENEMY_SHIELDS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { hashState } from '../src/renderer/src/sim/hash';
import { buildHudModel } from '../src/renderer/src/render/hudModel';
import { enemyWindowModel, freshWindowAnim } from '../src/renderer/src/render/enemyWindowModel';
import { botFrame } from '../src/renderer/src/clientControl/botClient';
import { Skill } from '../src/renderer/src/sim/skills';
import { XP_PER_SHOT } from '../src/renderer/src/sim/tuning';
import { createFixtureRunner } from './helpers/authorityFixture';
const setup = () => { const s = makeState(); quiet(s); placeDebris(s, room(s, 'A'), 600, 1, 99); const station = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, station); return { s, station, target: { kind: 'object', stableId: 99 } as TargetRef }; };
const envelope = (s: ReturnType<typeof makeState>, command: Command, sequence = 1) => ({ runId: 'run', id: { player: 0, sequence }, requestedTick: s.tick, command });
const apply = (s: ReturnType<typeof makeState>, command: Command) => applyConsoleCommand(s, envelope(s, command));
const pulse = { selector: 0, expectedWeaponId: 1 };
describe('semantic Weapons', () => {
  it.each(['warning/destruction', 'enemy arrival/departure'] as const)('forgets old SWAP focus after automatic %s through the byte runner', (path) => {
    const s = makeState(1); quiet(s); s.enemy.nextArrivalTick = 1e9;
    const station = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, station);
    s.weapons.slot.set([1, 2]); s.weapons.cargo = 3;
    const runner = createFixtureRunner(s);
    try {
      runner.advance([{ ...NEUTRAL_FRAME, moveY: 1 }]); // select SWAP with no targets
      runner.advance([NEUTRAL_FRAME]);
      expect(runner.ui.stations[station]!.rowKey).toBe('swap'); expect(runner.view().weapons.target).toBeNull();
      if (path === 'warning/destruction') {
        placeDebris(s, room(s, 'A'), 60, 0); s.weapons.charge = 1; s.rng.combat = createRng(7);
      } else { s.run.calm = 0; s.enemy.nextArrivalTick = s.tick; }
      runner.refresh(); runner.advance([NEUTRAL_FRAME]);
      expect(runner.view().weapons.target?.kind).toBe(path === 'warning/destruction' ? 'object' : 'enemy');
      if (path === 'warning/destruction') {
        runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);
        expect(s.telemetry.shots).toBe(1); expect(s.debris.active.some(Boolean)).toBe(false);
      } else {
        s.enemy.departTick = s.tick; runner.refresh(); runner.advance([NEUTRAL_FRAME]);
        expect(s.enemy.present).toBe(0);
      }
      expect(runner.view().weapons.target).toBeNull();
      runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);
      expect(Array.from(s.weapons.slot)).toEqual([1, 2]); expect(s.weapons.cargo).toBe(3);
      expect(runner.ui.stations[station]!.rowKey).not.toBe('swap');
    } finally { runner.dispose(); }
  });
  it('initializes and reinitializes authoritative target on sit without client input', () => {
    const { s, station, target } = setup(); expect(s.weapons.target).toEqual(target);
    apply(s, { kind: 'selectTarget', station, target: null }); expect(s.weapons.target).toBeNull();
    standUp(s, 0); sitDown(s, 0, station); expect(s.weapons.target).toEqual(target);
  });
  it('sends ordered target selection and fire even just below ready; housekeeping charges before C', () => {
    const { s, station } = setup(); placeDebris(s, room(s, 'A'), 600, 1, 100); s.weapons.charge = 0.9999;
    const ui = createCardUiState('run', s.playerCount); reconcileUi(s, ui, 'run', []);
    const out = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1, confirmPresses: 1 }], s.tick);
    expect(out).not.toHaveProperty('legacyCardInput'); expect(out.commands.map(e => e.command.kind)).toEqual(['selectTarget', 'fire']);
    expect(out.commands[1]!.command).toMatchObject({ weapon: pulse, target: { kind: 'object', stableId: 100 } });
    const result = stepCommands(s, { held: [], commands: out.commands,  });
    expect(result.map(r => r.status)).toEqual(['applied', 'applied']); expect(s.telemetry.shots).toBe(1); expect(s.weapons.lastShotTarget).toBe(1);
    expect(s.stations).not.toHaveProperty('cursor');
  });
  it('a real miss is applied and consumes one RNG draw, charge and awards shot XP', () => {
    const { s, station, target } = setup(); let seed = 1; while (nextFloat(createRng(seed)) < 0.9) seed++;
    s.rng.combat = createRng(seed); const expected = createRng(seed); nextFloat(expected); s.weapons.charge = 1;
    expect(apply(s, { kind: 'fire', station, weapon: pulse, target }).status).toBe('applied');
    expect(s.weapons.lastShotResult).toBe(0); expect(s.weapons.charge).toBe(0); expect(s.rng.combat).toEqual(expected); expect(s.telemetry.shots).toBe(1); expect(s.skills.lastShotTick).toBe(s.tick);
    expect(apply(s, { kind: 'fire', station, weapon: pulse, target }).reason).toBe('unavailable');
  });
  it('rejects replacement equipment and a removed target reused in the same pool slot', () => {
    const { s, station, target } = setup(); s.weapons.slot[0] = 2; s.weapons.charge2[0] = 1;
    expect(apply(s, { kind: 'fire', station, weapon: { selector: 4, expectedWeaponId: 1 }, target }).reason).toBe('stale-target');
    removeDebris(s, 0); placeDebris(s, room(s, 'A'), 600, 1, 101); s.weapons.charge = 1;
    expect(apply(s, { kind: 'fire', station, weapon: pulse, target }).reason).toBe('stale-target'); expect(s.telemetry.shots).toBe(0);
  });
  it('guards cargo and equipped identities and the no-enemy swap requirement', () => {
    const { s, station } = setup(); s.weapons.cargo = 2; s.weapons.slot[1] = 1; const c = { kind: 'swapCargo', station, slot: 1, expectedCargo: 2, expectedEquipped: 1 } as const;
    expect(apply(s, { ...c, expectedCargo: 3 }).reason).toBe('stale-target'); expect(apply(s, { ...c, expectedEquipped: 3 }).reason).toBe('stale-target');
    placeEnemy(s); expect(apply(s, c).reason).toBe('unavailable'); s.enemy.present = 0;
    expect(apply(s, c).status).toBe('applied'); expect(s.weapons.slot[1]).toBe(2); expect(s.weapons.cargo).toBe(1);
  });
  it('returns from a removed SWAP row to the first target on the next input', () => {
    const { s, station, target } = setup(), ui = createCardUiState('run', s.playerCount); reconcileUi(s, ui, 'run', []);
    ui.stations[station]!.rowKey = 'swap'; s.weapons.target = null; s.weapons.cargo = 0; s.weapons.charge = 1;
    const out = translateTick(s, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], s.tick);
    expect(out.commands.map(e => e.command.kind)).toEqual(['selectTarget', 'fire']); expect(out.commands[1]!.command).toMatchObject({ target });
  });
  it('does not mutate authoritative configuration from view-side weapon choice or explicit fire parameters', () => {
    const { s, station, target } = setup(); s.weapons.charge = 1; const before = hashState(s), ui = createCardUiState('run', s.playerCount); reconcileUi(s, ui, 'run', []);
    const out = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveX: 1 }], s.tick);
    expect(out.commands.map(e => e.command.kind)).toEqual(['selectWeapon']); expect(hashState(s)).toBe(before); expect(s.telemetry.shots).toBe(0);
    placeDebris(s, room(s, 'A'), 600, 1, 100); s.weapons.target = { kind: 'object', stableId: 100 };
    s.rng.combat = createRng(4); const aim = structuredClone(s.weapons.target);
    fireWeaponAt(s, { selector: 1, expectedWeaponId: PULSE_WEAPON_ID }, target);
    expect(s.weapons.selector).toBe(0); expect(s.weapons.target).toEqual(aim); expect(s.weapons.lastShotSelector).toBe(1); expect(s.skills.xp[Skill.Weapons]).toBe(XP_PER_SHOT);
    expect(apply(s, { kind: 'selectWeapon', station, weapon: { selector: 0, expectedWeaponId: TORPEDO_WEAPON_ID } }).reason).toBe('stale-target');
    expect(apply(s, { kind: 'selectWeapon', station, weapon: { selector: 3, expectedWeaponId: PULSE_WEAPON_ID } }).reason).toBe('stale-target');
  });
  it('loads the torpedo before processing Confirm even when the publication says unloaded', () => {
    const { s } = setup(); s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoad = 0.9999;
    const ui = createCardUiState('run', s.playerCount); reconcileUi(s, ui, 'run', []);
    const out = translateTick(s, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], s.tick);
    expect(out.commands[0]!.command).toMatchObject({ kind: 'fire', weapon: weaponRef(s) });
    expect(stepCommands(s, { held: [], commands: out.commands,  })[0]!.status).toBe('applied'); expect(s.weapons.torpedoLoaded).toBe(0); expect(s.telemetry.shots).toBe(1);
  });
  it('rejects an old enemy identity and invalid rooms, and later fire after an earlier kill', () => {
    const { s, station } = setup(); placeEnemy(s); const old = targetRef(s, ENEMY_SHIELDS_SLOT)!; s.enemy.stableId++;
    expect(apply(s, { kind: 'fire', station, weapon: pulse, target: old }).reason).toBe('stale-target');
    expect(resolveTarget(s, { kind: 'enemy', stableId: s.enemy.stableId, room: 5 })).toBeNull();
    const target = { kind: 'object', stableId: 99 } as const; s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.rng.combat = createRng(7);
    const results = stepCommands(s, { held: [], commands: [envelope(s, { kind: 'fire', station, weapon: pulse, target }), envelope(s, { kind: 'fire', station, weapon: weaponRef(s, Weapon.Torpedo), target }, 2)],  });
    expect(results.map(r => [r.status, r.reason])).toEqual([['applied', undefined], ['rejected', 'stale-target']]); expect(s.weapons.torpedoLoaded).toBe(1);
  });
  it('encodes target kind, identity and enemy room canonically and round-trips every variant', () => {
    const { s } = setup(), copy = makeState();
    const refs: (TargetRef | null)[] = [null, { kind: 'object', stableId: 99 }, { kind: 'object', stableId: 100 }, { kind: 'enemy', stableId: 99, room: 0 }, { kind: 'enemy', stableId: 99, room: 1 }];
    const hashes = refs.map(target => { s.weapons.target = target; unflatten(copy, flatten(s)); expect(copy.weapons.target).toEqual(target); return hashState(s); });
    expect(new Set(hashes).size).toBe(refs.length);
  });
  it('resets the Weapons member target when sitting and re-sitting a console group', () => {
    const { s, station, target } = setup(), sci = s.derived.stationOfKind[StationKind.Science]!; standUp(s, 0);
    s.derived.stationGroup[station] = 0; s.derived.stationGroup[sci] = 0; s.derived.groupStations.push([sci, station]);
    s.groups.tab = new Uint8Array(1);
    s.weapons.target = null; s.weapons.selector = Weapon.Torpedo; sitDown(s, 0, sci);
    expect(s.weapons.target).toEqual(target); expect(s.weapons.selector).toBe(Weapon.Torpedo);
    s.weapons.target = null; standUp(s, 0); sitDown(s, 0, sci); expect(s.weapons.target).toEqual(target);
  });
  it('reads authoritative aim throughout HUD, reticle, bots and input with canonical cursor slots guarded', () => {
    const { s, station } = setup(); placeEnemy(s); const ui = createCardUiState('run', s.playerCount); reconcileUi(s, ui, 'run', []);

    Object.defineProperty(s.stations, 'cursor', { get() { throw new Error('migrated cursor read'); } }); Object.defineProperty(s.stations, 'page', { get() { throw new Error('migrated page read'); } });
    expect(() => { translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1 }], 0); buildHudModel(s, [], 'running', '', null, null, [], ui); enemyWindowModel(s, s.tick, freshWindowAnim()); botFrame(s, ui, 0); }).not.toThrow();
  });
});
