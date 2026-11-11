import { describe, it, expect } from 'vitest';
import { Phase } from '../src/renderer/src/sim/director';
import { buildHudModel, deviceKindOf, glyphName, targetWindow, targetRowText } from '../src/renderer/src/render/hudModel';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation, shiftBar } from '../src/renderer/src/sim/power';
import { HEAT_MAX, COOLANT_POOL, TORP_START, TORP_CAP, ENCOUNTER_MAX } from '../src/renderer/src/sim/tuning';
import type { EngineeringPanel, WeaponsPanel, SciencePanel, NavigationPanel } from '../src/renderer/src/render/hudModel';
import { Skill } from '../src/renderer/src/sim/skills';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { EndReason } from '../src/renderer/src/sim/crew';
import { ENEMY_SLOT, ENEMY_SLOTS, ENEMY_SHIELDS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { EnemySystem } from '../src/renderer/src/sim/enemy';
import { makeState, room, run, teleport, placeDebris, seconds, setSkill, intents, placeEnemy, placeShot, quiet, disableSystem, guardDebris } from './helpers/sim';

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : i === 1 ? 'kb:1' : `gp:${i}` }));

describe('deviceKindOf and glyphName', () => {
  it('maps slot keys to device kinds', () => {
    expect(deviceKindOf('kb:0')).toBe('kb0'); expect(deviceKindOf('kb:1')).toBe('kb1');
    expect(deviceKindOf('gp:0')).toBe('pad'); expect(deviceKindOf('gp:7')).toBe('pad');
    expect(deviceKindOf(null)).toBeNull(); expect(deviceKindOf('x')).toBeNull();
  });
  it('picks the glyph per action and device, none for a null device', () => {
    expect(glyphName('interact', 'kb0')).toBe('prompt.kb.E'); expect(glyphName('confirm', 'kb0')).toBe('prompt.kb.F'); expect(glyphName('cancel', 'kb0')).toBe('prompt.kb.Q');
    expect(glyphName('interact', 'kb1')).toBe('prompt.kb.Enter'); expect(glyphName('confirm', 'kb1')).toBe('prompt.kb.ShiftRight'); expect(glyphName('cancel', 'kb1')).toBe('prompt.kb.Backspace');
    expect(glyphName('interact', 'pad')).toBe('prompt.pad.A'); expect(glyphName('confirm', 'pad')).toBe('prompt.pad.X'); expect(glyphName('cancel', 'pad')).toBe('prompt.pad.B');
    expect(glyphName('interact', null)).toBeNull();
  });
});

describe('buildHudModel', () => {
  it('lists threats with icons by room name and shows the sim clock', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'A')); activateBreach(s, 6);
    run(s, 120);
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.simSeconds).toBe(2);
    expect(m.threats).toEqual([{ icon: 'icon.fire', text: 'Fire: Bridge' }, { icon: 'icon.breach', text: 'Breach: Crew Quarters' }]);
    expect(m.hull).toBe(100);
    expect(m.credits).toBeNull(); expect(m.creditsScroll).toBe(0);
  });
  it('splits Interact and Confirm prompts with their icons and device kinds', () => {
    const s = makeState(3);
    igniteRoom(s, room(s, 'G'));
    teleport(s, 0, 2.5, 8.6);
    const m = buildHudModel(s, slots(3), 'running', '');
    const p0 = m.players[0]!;
    expect(p0.interactPrompt).toBe('Repair fire'); expect(p0.interactIcon).toBe('icon.repair');
    expect(p0.confirmPrompt).toBe('Seal door'); expect(p0.confirmIcon).toBe('icon.door');
    expect(p0.deviceKind).toBe('kb0'); expect(m.players[1]!.deviceKind).toBe('kb1'); expect(m.players[2]!.deviceKind).toBe('pad');
    expect(p0.lifeText).toBe('');
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 12.4;
    teleport(s, 1, 2.5, 9.2);
    const m2 = buildHudModel(s, slots(3), 'running', '');
    expect(m2.players[0]!.interactPrompt).toBe('Revive P2'); expect(m2.players[0]!.interactIcon).toBeNull();
    expect(m2.players[1]!.lifeText).toBe('DOWNED 13s');   // Math.ceil: never shows 0s while still alive
    expect(m2.players[1]!.interactPrompt).toBe(''); expect(m2.players[1]!.confirmPrompt).toBe('');
    Life.state[s.crew[1]!] = LifeState.Dead;
    expect(buildHudModel(s, slots(3), 'running', '').players[1]!.lifeText).toBe('DEAD');
  });
  it('flags low oxygen for a player whose room is below half', () => {
    const s = makeState(1);
    expect(buildHudModel(s, slots(1), 'running', '').players[0]!.lowOxygen).toBe(false);
    const r = room(s, 'G'); s.rooms.o2[r] = s.derived.volume[r]! * 0.4;
    expect(buildHudModel(s, slots(1), 'running', '').players[0]!.lowOxygen).toBe(true);
  });
  it('lobby model without state shows slot status and null device for empty slots', () => {
    const m = buildHudModel(null, [{ status: 'active', key: 'gp:2' }, { status: 'empty', key: null }, { status: 'reconnect', key: null }], 'lobby', 'Press Interact to join');
    expect(m.players).toHaveLength(3);
    expect(m.players[0]!.deviceKind).toBe('pad'); expect(m.players[1]!.status).toBe('empty'); expect(m.players[1]!.deviceKind).toBeNull(); expect(m.players[2]!.deviceKind).toBeNull();
    expect(m.weapons).toEqual({ charge: 0, ready: false, torpedoLoaded: false, torpedoStock: 0 });
  });
  it('passes the credits sub-state through', () => {
    const m = buildHudModel(null, [], 'lobby', '', { lines: ['a', 'b'], scroll: 1 });
    expect(m.credits).toEqual(['a', 'b']); expect(m.creditsScroll).toBe(1);
  });
  it('reports power, stations, a failed station as a threat with the repair prompt and progress', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    const m0 = buildHudModel(s, slots(1), 'running', '');
    expect(m0.power).toEqual({ capacity: 10, used: 9 });
    expect(m0.stations.map((st) => st.kind)).toEqual([0, 6, 1, 2, 5, 4, 3]);
    expect(m0.stations.find((st) => st.kind === StationKind.LifeSupport)).toEqual({ kind: 4, name: 'Life Support', level: 2, max: 3, online: true, occupant: null, heat: 0, coolant: 0, overdriven: false });
    failStation(s, eng); teleport(s, 0, 18.5, 9.5); s.stations.repair[eng] = 0.4;
    const m = buildHudModel(s, slots(1), 'running', '');
    expect(m.threats).toEqual([{ icon: 'icon.power', text: 'Power: Engineering' }]);
    expect(m.stations.find((st) => st.kind === StationKind.Engineering)!.online).toBe(false);
    expect(m.players[0]!.interactPrompt).toBe('Repair power'); expect(m.players[0]!.interactIcon).toBe('icon.power'); expect(m.players[0]!.progress).toBe(0.4);
  });
  it('offers Sit at a same-room console, and shows Stand plus the Engineering panel while seated', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    teleport(s, 0, 17.5, 9.5);
    expect(buildHudModel(s, slots(1), 'running', '').players[0]!.confirmPrompt).toBe('Sit: Engineering');
    sitDown(s, 0, eng); s.stations.cursor[eng] = StationKind.Weapons;
    const p = buildHudModel(s, slots(1), 'running', '').players[0]!;
    expect(p.seated).toBe(StationKind.Engineering); expect(p.cancelPrompt).toBe('Stand'); expect(p.confirmPrompt).toBe(''); expect(p.interactPrompt).toBe('');
    const panel = p.console as EngineeringPanel;
    expect(panel.cursor).toBe(StationKind.Weapons); expect(panel.pool).toBe(1);
    expect(panel.rows[StationKind.Weapons]).toEqual({ kind: 1, name: 'Weapons', level: 2, max: 3, failed: false, heat: 0, coolant: 0, overdriven: false });
    expect(panel.coolantFree).toBe(COOLANT_POOL);
    expect(panel.rows).toHaveLength(7);
  });
  it('shows the Doors panel with the selected door, or No doors on a doorless ship', () => {
    const s = makeState(1);
    const doors = s.derived.stationOfKind[StationKind.Doors]!;
    sitDown(s, 0, doors);
    const p = buildHudModel(s, slots(1), 'running', '').players[0]!;
    const e = s.derived.doorEdges[0]!;
    expect(p.console).toEqual({ doorIndex: 0, rooms: [s.layout.rooms[s.derived.edgeA[e]!]!.name, s.layout.rooms[s.derived.edgeB[e]!]!.name] });
    const noDoors = JSON.parse(JSON.stringify(starter)) as typeof starter;
    for (const edge of noDoors.edges) (edge as { kind: string }).kind = 'opening';
    const t = createSimState(parseShip(noDoors), 1, 1);
    sitDown(t, 0, t.derived.stationOfKind[StationKind.Doors]!);
    expect(buildHudModel(t, slots(1), 'running', '').players[0]!.console).toEqual({ doorIndex: -1 });
  });
  it('lists warned debris as threats in StableId order with the ETA, hides unwarned ones, and exposes tick, charge and impact ticks', () => {
    const s = makeState(1), A = room(s, 'A'), B = room(s, 'B');
    s.director.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(10) + 1, 1, 30); placeDebris(s, B, seconds(3), 1, 10); placeDebris(s, A, seconds(20), 0, 20);
    s.weapons.charge = 1; s.rooms.impactTick[B] = 5;
    const m = buildHudModel(s, slots(1), 'running', '');
    expect(m.threats).toEqual([{ icon: 'icon.sensors', text: 'Debris: Weapons Bay 3s' }, { icon: 'icon.sensors', text: 'Debris: Bridge 11s' }]);
    expect(m.tick).toBe(0); expect(m.weapons).toEqual({ charge: 1, ready: true, torpedoLoaded: false, torpedoStock: TORP_START }); expect(m.impactTick[B]).toBe(5); expect(m.impactTick[A]).toBe(-1);
  });
  it('shows the Weapons panel with charge, targets by StableId and the cursor index', () => {
    const s = makeState(1), A = room(s, 'A'), B = room(s, 'B');
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    placeDebris(s, A, seconds(10), 1, 30); placeDebris(s, B, seconds(5), 1, 10);
    sitDown(s, 0, wpn); s.weapons.charge = 0.25;
    const p = buildHudModel(s, slots(1), 'running', '').players[0]!;
    expect(p.seated).toBe(StationKind.Weapons);
    const panel = p.console as WeaponsPanel;
    expect(panel.kind).toBe('weapons'); expect(panel.charge).toBe(0.25);
    expect(panel.targets).toEqual([{ stableId: 10, room: 'Weapons Bay', eta: 5, frequency: null, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null }, { stableId: 30, room: 'Bridge', eta: 10, frequency: null, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null }]);
    expect(panel.selector).toBe(0); expect(panel.torpedo).toEqual({ stock: TORP_START, cap: TORP_CAP, loaded: false, load: 0 });
    expect(panel.cursor).toBe(0);                                                  // sitDown selected id 10 (slot 1), which is targets[0]
    s.stations.cursor[wpn] = 0;                                                    // slot 0 is id 30: targets[1]
    expect((buildHudModel(s, slots(1), 'running', '').players[0]!.console as WeaponsPanel).cursor).toBe(1);
    s.debris.warned.fill(0); s.stations.cursor[wpn] = -1;
    const empty = buildHudModel(s, slots(1), 'running', '').players[0]!.console as WeaponsPanel;
    expect(empty.targets).toEqual([]); expect(empty.cursor).toBe(-1);
  });
  it('shows the Science and Navigation panels', () => {
    const s = makeState(2), A = room(s, 'A');
    placeDebris(s, A, seconds(10), 1);
    sitDown(s, 0, s.derived.stationOfKind[StationKind.Science]!); sitDown(s, 1, s.derived.stationOfKind[StationKind.Navigation]!);
    const m = buildHudModel(s, slots(2), 'running', '');
    const sciPanel = m.players[0]!.console as SciencePanel, navPanel = m.players[1]!.console as NavigationPanel;
    expect(sciPanel.kind).toBe('science'); expect(sciPanel.leadSeconds).toBeCloseTo(18); expect(sciPanel.targets).toHaveLength(1); expect(sciPanel.cursor).toBe(0); expect(sciPanel.scanning).toBe(false);
    expect(navPanel.kind).toBe('navigation'); expect(navPanel.evadeChance).toBeCloseTo(0.35);
  });
  it('shows a scanned frequency in the threat text and on both panels, with scan progress and the selector and torpedo state', () => {
    const s = makeState(2), A = room(s, 'A'), B = room(s, 'B');
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!, sci = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 300, 1, 10, 2); placeDebris(s, B, 600, 1, 20, 3);
    s.debris.scanned[0] = 1; s.debris.scan[0] = 1; s.debris.scan[1] = 0.4;
    sitDown(s, 0, wpn); sitDown(s, 1, sci); s.science.scanning = 1; s.stations.cursor[sci] = 1;
    s.weapons.selector = 3; s.weapons.torpedoLoaded = 1; s.weapons.torpedoStock = 2; s.weapons.torpedoLoad = 0;
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.threats.map((t) => t.text)).toEqual(['Debris: Bridge 5s F2', 'Debris: Weapons Bay 10s']);
    expect(m.weapons).toEqual({ charge: 0, ready: false, torpedoLoaded: true, torpedoStock: 2 });
    const w = m.players[0]!.console as WeaponsPanel;
    expect(w.selector).toBe(3); expect(w.torpedo).toEqual({ stock: 2, cap: TORP_CAP, loaded: true, load: 0 });
    expect(w.targets.map((t) => t.frequency)).toEqual([2, null]);
    const p = m.players[1]!.console as SciencePanel;
    expect(p.targets).toEqual([{ stableId: 10, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null, room: 'Bridge', eta: 5, frequency: 2, scan: 1 }, { stableId: 20, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null, room: 'Weapons Bay', eta: 10, frequency: null, scan: 0.4 }]);
    expect(p.cursor).toBe(1); expect(p.scanning).toBe(true);
  });
  it('threat rows: the enemy first with its hull percent, shots with and without a scanned frequency; none when absent', () => {
    const s = makeState(1), A = room(s, 'A'); quiet(s);
    expect(buildHudModel(s, slots(1), 'running', '').threats.some((t) => t.text.startsWith('Enemy'))).toBe(false);
    placeEnemy(s); s.enemy.hull = 64;
    placeShot(s, A, 7 * 60, 1); const k2 = placeShot(s, A, 7 * 60, 1, undefined, 2); s.debris.scanned[k2] = 1;
    const th = buildHudModel(s, slots(1), 'running', '').threats;
    expect(th[0]).toEqual({ icon: 'icon.weapons', text: 'Enemy ship: hull 64%' });
    const shotRows = th.filter((t) => t.text.startsWith('Shot'));
    expect(shotRows).toEqual([{ icon: 'icon.sensors', text: `Shot: ${s.layout.rooms[A]!.name} 7s` }, { icon: 'icon.sensors', text: `Shot: ${s.layout.rooms[A]!.name} 7s F2` }]);
  });
  it('target rows: the enemy row on Weapons and Science, nothing throws with the cursor on the enemy or with it unselected', () => {
    const s = makeState(2), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!, c = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 600, 1); placeEnemy(s); s.enemy.hull = 64; sitDown(s, 0, w); sitDown(s, 1, c);
    const k = placeShot(s, A, 420, 1, undefined, 2); s.debris.scanned[k] = 1;
    s.stations.cursor[w] = ENEMY_SLOT;                                   // Science stays on the object
    const m = buildHudModel(s, slots(2), 'running', '');
    const wp = m.players[0]!.console as WeaponsPanel, sp = m.players[1]!.console as SciencePanel;
    expect(wp.targets[1]).toEqual({ stableId: s.enemy.stableId, kind: 'enemy', room: 'Enemy ship', eta: ENCOUNTER_MAX, frequency: null, hull: 0.64, system: null, status: null, shieldsUp: true });
    expect(wp.cursor).toBe(1); expect(wp.first).toBe(0);
    expect(sp.targets[1]).toEqual({ stableId: s.enemy.stableId, kind: 'enemy', room: 'Enemy ship', eta: ENCOUNTER_MAX, frequency: null, hull: 0.64, system: null, status: null, shieldsUp: true, scan: 0 });
    expect(sp.targets[0]!.kind).toBe('debris'); expect(sp.cursor).toBe(0);
    for (const panel of [wp, sp]) expect(panel.targets.find((t) => t.stableId === s.debris.stableId[k])).toMatchObject({ kind: 'shot', frequency: 2, eta: 7, hull: null });
  });
  it('targetWindow follows the cursor; a twelve-entry list with the cursor last gives first 3 on Weapons', () => {
    expect([targetWindow(-1, 3, 6), targetWindow(5, 9, 6), targetWindow(6, 9, 6), targetWindow(8, 9, 6), targetWindow(8, 9, 7), targetWindow(2, 2, 6)]).toEqual([0, 0, 1, 3, 2, 0]);
    const s = makeState(1), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!;
    for (let n = 0; n < 8; n++) placeDebris(s, A, 600, 1); placeEnemy(s);
    sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT;
    const wp = buildHudModel(s, slots(1), 'running', '').players[0]!.console as WeaponsPanel;
    expect(wp.targets).toHaveLength(12); expect(wp.cursor).toBe(8); expect(wp.first).toBe(3);
    s.stations.cursor[w] = ENEMY_SHIELDS_SLOT; const wp2 = buildHudModel(s, slots(1), 'running', '').players[0]!.console as WeaponsPanel; expect(wp2.cursor).toBe(11); expect(wp2.first).toBe(6);
    run(s, 1, () => intents({ cancelPressed: true })); const c = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 0, c); s.stations.cursor[c] = ENEMY_SLOT;
    const sp = buildHudModel(s, slots(1), 'running', '').players[0]!.console as SciencePanel;
    expect(sp.targets).toHaveLength(12); expect(sp.cursor).toBe(8); expect(sp.first).toBe(2);        // seven Science rows
    s.stations.cursor[c] = ENEMY_SHIELDS_SLOT; const sp2 = buildHudModel(s, slots(1), 'running', '').players[0]!.console as SciencePanel; expect(sp2.cursor).toBe(11); expect(sp2.first).toBe(5);
  });
  it('targetRowText renders the exact row strings for debris, shots and the enemy on both panels', () => {
    const debris = { stableId: 1, kind: 'debris' as const, room: 'Engine', eta: 7, frequency: null, hull: null, system: null, status: null, shieldsUp: null };
    expect(targetRowText(debris)).toBe('Engine 7s F?'); expect(targetRowText({ ...debris, frequency: 2 })).toBe('Engine 7s F2'); expect(targetRowText(debris, 0.4)).toBe('Engine 7s F? 40%');
    const shot = { ...debris, kind: 'shot' as const };
    expect(targetRowText(shot)).toBe('Shot Engine 7s F?'); expect(targetRowText({ ...shot, frequency: 2 })).toBe('Shot Engine 7s F2'); expect(targetRowText(shot, 0.4)).toBe('Shot Engine 7s F? 40%'); expect(targetRowText({ ...shot, frequency: 2 }, 0.4)).toBe('Shot Engine 7s F2');
    const enemy = { stableId: 9, kind: 'enemy' as const, room: 'Enemy ship', eta: 87, frequency: null, hull: 0.64, system: null, status: null, shieldsUp: true };
    expect(targetRowText(enemy)).toBe('Enemy 64% 87s S?'); expect(targetRowText(enemy, 0.4)).toBe('Enemy 64% 87s S? 40%');   // marker, then the scan suffix
  });
  it('targetRowText: the hull row markers and scan suffix, the subsystem rows intact and down', () => {
    const hull = { stableId: 9, kind: 'enemy' as const, room: 'Enemy ship', eta: 87, frequency: null as number | null, hull: 0.64, system: null, status: null, shieldsUp: true as boolean | null };
    expect(targetRowText(hull)).toBe('Enemy 64% 87s S?'); expect(targetRowText({ ...hull, frequency: 2 })).toBe('Enemy 64% 87s S2');
    expect(targetRowText({ ...hull, frequency: 2, shieldsUp: false })).toBe('Enemy 64% 87s S-'); expect(targetRowText({ ...hull, shieldsUp: false }, 0.4)).toBe('Enemy 64% 87s S- 40%');
    expect(targetRowText(hull, 0.4)).toBe('Enemy 64% 87s S? 40%'); expect(targetRowText({ ...hull, frequency: 2 }, 1)).toBe('Enemy 64% 87s S2');
    const sys = (system: number, hp: number, repairIn: number | null) => ({ ...hull, hull: null, system, status: { hp, repairIn } });
    expect(targetRowText(sys(0, 30, null))).toBe('Enemy weapons 100%'); expect(targetRowText(sys(0, 15, null))).toBe('Enemy weapons 50%');
    expect(targetRowText(sys(0, 0, 31))).toBe('Enemy weapons DOWN 31s'); expect(targetRowText(sys(1, 0, 1))).toBe('Enemy engines DOWN 1s'); expect(targetRowText(sys(2, 30, null), 0.4)).toBe('Enemy shields 100%');
  });
  it('the model gives four enemy rows with system and status, the Science scan on the hull row only, and threat suffixes per down system', () => {
    const s = makeState(2), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!, c = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 600, 1); placeEnemy(s, 64, 2); sitDown(s, 0, w); sitDown(s, 1, c); s.enemy.scan = 0.4;
    let m = buildHudModel(s, slots(2), 'running', ''); let wp = m.players[0]!.console as WeaponsPanel, sp = m.players[1]!.console as SciencePanel;
    expect(wp.targets.slice(1).map((t) => [t.kind, t.system, t.status, t.shieldsUp, t.frequency, t.hull])).toEqual([
      ['enemy', null, null, true, null, 0.64], ['enemy', 0, { hp: 30, repairIn: null }, true, null, null], ['enemy', 1, { hp: 30, repairIn: null }, true, null, null], ['enemy', 2, { hp: 30, repairIn: null }, true, null, null]]);
    expect(sp.targets.slice(1).map((t) => t.scan)).toEqual([0.4, 0, 0, 0]);
    expect(m.threats[0]).toEqual({ icon: 'icon.weapons', text: 'Enemy ship: hull 64%' });
    s.enemy.scanned = 1;
    expect((buildHudModel(s, slots(2), 'running', '').players[0]!.console as WeaponsPanel).targets[1]).toMatchObject({ frequency: 2, shieldsUp: true });   // revealed, shields still up
    disableSystem(s, EnemySystem.Weapons);
    expect(buildHudModel(s, slots(2), 'running', '').threats[0]!.text).toBe('Enemy ship: hull 64% weapons DOWN');
    disableSystem(s, EnemySystem.Shields);
    m = buildHudModel(s, slots(2), 'running', ''); wp = m.players[0]!.console as WeaponsPanel;
    expect(wp.targets[1]).toMatchObject({ frequency: 2, shieldsUp: false }); expect(wp.targets[2]!.status).toEqual({ hp: 0, repairIn: 45 }); expect(wp.targets[4]!.status).toEqual({ hp: 0, repairIn: 45 });
    expect(m.threats[0]!.text).toBe('Enemy ship: hull 64% weapons DOWN shields DOWN');
    guardDebris(s);                                                                       // a read at slots 8..11 throws: the model must branch before indexing
    expect(() => { for (const slot of ENEMY_SLOTS) { s.stations.cursor[w] = slot; s.stations.cursor[c] = slot; buildHudModel(s, slots(2), 'running', ''); } }).not.toThrow();
  });
  it('reports heat fraction, coolant and overdrive per Engineering row and per station, and the free coolant', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!, nav = s.derived.stationOfKind[StationKind.Navigation]!;
    s.power.capacity = 20; shiftBar(s, nav, 1); shiftBar(s, nav, 1);
    s.stations.heat[nav] = HEAT_MAX / 2; s.stations.coolant[nav] = 2; s.stations.coolant[s.derived.stationOfKind[StationKind.Science]!] = 1;
    sitDown(s, 0, eng);
    const m = buildHudModel(s, slots(1), 'running', '');
    const panel = m.players[0]!.console as EngineeringPanel;
    expect(panel.rows[StationKind.Navigation]).toEqual({ kind: 0, name: 'Navigation', level: 3, max: 2, failed: false, heat: 0.5, coolant: 2, overdriven: true });
    expect(panel.coolantFree).toBe(COOLANT_POOL - 3);
    const st = m.stations.find((x) => x.kind === StationKind.Navigation)!;
    expect(st.level).toBe(3); expect(st.max).toBe(2); expect(st.heat).toBe(0.5); expect(st.coolant).toBe(2); expect(st.overdriven).toBe(true);
  });
  it('reports the six skill levels per player and zeros for empty slots or no state', () => {
    const s = makeState(2);
    setSkill(s, 0, Skill.Navigation, 1); setSkill(s, 0, Skill.Repair, 3); setSkill(s, 1, Skill.Weapons, 10);
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.players[0]!.skills).toEqual([1, 0, 0, 0, 0, 3]); expect(m.players[1]!.skills).toEqual([0, 0, 10, 0, 0, 0]);
    expect(buildHudModel(s, slots(3), 'running', '').players[2]!.skills).toEqual([0, 0, 0, 0, 0, 0]);
    expect(buildHudModel(null, slots(1), 'lobby', '').players[0]!.skills).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('the Engineering footer pool and the strip capacity include bonus bars while a skilled engineer sits, and drop after standing', () => {
    const s = makeState(1), eng = s.derived.stationOfKind[StationKind.Engineering]!;
    s.director.nextSpawnTick = 1e9; setSkill(s, 0, Skill.Engineering, 8); sitDown(s, 0, eng);
    const m1 = buildHudModel(s, slots(1), 'running', '');
    expect((m1.players[0]!.console as EngineeringPanel).pool).toBe(3); expect(m1.power).toEqual({ capacity: 12, used: 9 });
    shiftBar(s, s.derived.stationOfKind[StationKind.Science]!, 1); shiftBar(s, s.derived.stationOfKind[StationKind.Medbay]!, 1); shiftBar(s, s.derived.stationOfKind[StationKind.Medbay]!, 1);
    const m2 = buildHudModel(s, slots(1), 'running', '');
    expect((m2.players[0]!.console as EngineeringPanel).pool).toBe(0); expect(m2.power).toEqual({ capacity: 12, used: 12 });
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(buildHudModel(s, slots(1), 'running', '').power).toEqual({ capacity: 10, used: 10 });
  });
  it("reports each slot's character with trait names, from the state when there is one and from the default list otherwise", () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS);
    const m = buildHudModel(s, slots(3), 'running', '');
    expect(m.players[0]!.character).toEqual({ name: 'Okoro', asset: 'Quick Hands', complication: 'Heavy Boots' });
    expect(m.players[1]!.character).toEqual({ name: 'Lindqvist', asset: 'Cool Head', complication: 'Flammable' });
    expect(m.players[2]!.character).toEqual({ name: 'Reyes', asset: 'Iron Lungs', complication: 'Slow Learner' });   // slot beyond the crew: the default list
    const lobby = buildHudModel(null, slots(4), 'lobby', '');
    expect(lobby.players[3]!.character).toEqual({ name: 'Dubois', asset: 'Sprinter', complication: 'Frail' });
    expect(buildHudModel(makeState(1), slots(1), 'running', '').players[0]!.character).toEqual({ name: 'Recruit', asset: '', complication: '' });
    expect(m.players[1]!.skills).toEqual([0, 3, 0, 0, 0, 0]);                                              // Lindqvist's head start shows as a level
  });
  it('the game-over summary has four headline lines then one skill line per crew member, and is null in every other phase', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS); const t = s.telemetry;
    s.tick = 452 * 60; s.ended = 1; s.endReason = EndReason.Hull;
    t.firstDownTick = 190 * 60 - 1; t.firstDownPid = 0;                       // Okoro at 3:10
    t.mannedTicks.fill(1); t.mannedTicks[StationKind.Doors] = 0; t.mannedTicks[StationKind.Medbay] = 0;
    t.longestIdle.set([95 * 60, 40 * 60, 7 * 60]);
    setSkill(s, 2, Skill.Science, 3); setSkill(s, 0, Skill.Repair, 4); setSkill(s, 0, Skill.Navigation, 1);
    const over = buildHudModel(s, slots(3), 'gameover', 'HULL LOST');
    expect(over.summary).toEqual([
      'Survived 7:32  HULL LOST', 'First down: Okoro 3:10   First death: none', 'Never manned: Medbay, Doors', 'Longest idle: Okoro 95 s, Lindqvist 40 s, Reyes 7 s',   // StationKind order, as in the record
      'Okoro: Navigation 0 -> 1, Repair 3 -> 4', 'Lindqvist: no skill gains', 'Reyes: Science 2 -> 3']);
    for (const phase of ['lobby', 'paused', 'running'] as const) expect(buildHudModel(s, slots(3), phase, '').summary).toBeNull();
    expect(buildHudModel(null, slots(1), 'gameover', '').summary).toBeNull();
    s.endReason = EndReason.Crew; t.mannedTicks.fill(1); t.firstDeathTick = 452 * 60 - 1; t.firstDeathPid = 2;
    const crew = buildHudModel(s, slots(3), 'gameover', 'CREW LOST').summary!;
    expect(crew[0]).toBe('Survived 7:32  CREW LOST'); expect(crew[1]).toBe('First down: Okoro 3:10   First death: Reyes 7:32'); expect(crew[2]).toBe('Every station manned');
    const four = makeState(4, 1, DEFAULT_CHARACTERS); four.ended = 1; four.endReason = EndReason.Hull;
    expect(buildHudModel(four, slots(4), 'gameover', '').summary).toEqual([
      'Survived 0:00  HULL LOST', 'First down: none   First death: none', 'Never manned: Navigation, Weapons, Science, Engineering, Life Support, Medbay, Doors',
      'Longest idle: Okoro 0 s, Lindqvist 0 s, Reyes 0 s, Dubois 0 s',
      'Okoro: no skill gains', 'Lindqvist: no skill gains', 'Reyes: no skill gains', 'Dubois: no skill gains']);
  });
  it('reports the director phase name and stress', () => {
    const s = makeState(2); s.director.phase = Phase.PeakFade; s.director.stress = 0.42;
    expect(buildHudModel(s, slots(2), 'running', '').director).toEqual({ phase: 'Peak Fade', stress: 0.42 });
    expect(buildHudModel(null, slots(1), 'lobby', '').director).toEqual({ phase: 'Build Up', stress: 0 });
  });
});
