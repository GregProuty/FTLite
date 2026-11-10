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
import { failStation } from '../src/renderer/src/sim/power';
import type { EngineeringPanel } from '../src/renderer/src/render/hudModel';
import { makeState, room, run, teleport } from './helpers/sim';

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
    expect(m0.stations.find((st) => st.kind === StationKind.LifeSupport)).toEqual({ kind: 4, name: 'Life Support', level: 2, max: 3, online: true, occupant: null });
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
    expect(panel.rows[StationKind.Weapons]).toEqual({ kind: 1, name: 'Weapons', level: 2, max: 3, failed: false });
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
});
