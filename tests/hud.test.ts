import { describe, it, expect } from 'vitest';
import { buildHudModel, deviceKindOf, glyphName } from '../src/renderer/src/render/hudModel';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation, shiftBar } from '../src/renderer/src/sim/power';
import { HEAT_MAX, COOLANT_POOL, TORP_START, TORP_CAP } from '../src/renderer/src/sim/tuning';
import type { EngineeringPanel, WeaponsPanel, SciencePanel, NavigationPanel } from '../src/renderer/src/render/hudModel';
import { makeState, room, run, teleport, placeDebris, seconds } from './helpers/sim';

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
    s.spawner.nextSpawnTick = 1e9;
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
    expect(panel.targets).toEqual([{ stableId: 10, room: 'Weapons Bay', eta: 5, frequency: null }, { stableId: 30, room: 'Bridge', eta: 10, frequency: null }]);
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
    expect(p.targets).toEqual([{ stableId: 10, room: 'Bridge', eta: 5, frequency: 2, scan: 1 }, { stableId: 20, room: 'Weapons Bay', eta: 10, frequency: null, scan: 0.4 }]);
    expect(p.cursor).toBe(1); expect(p.scanning).toBe(true);
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
});
