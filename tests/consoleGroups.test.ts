import { cardSelection } from './helpers/cardUi';
import { describe, it, expect } from 'vitest';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { createSimState, type SimState } from '../src/renderer/src/sim/state';
import { step, fixtureRunner } from './helpers/rawInput';
import { Seated } from '../src/renderer/src/sim/components';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { failStation, shiftBar } from '../src/renderer/src/sim/power';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { NEUTRAL_INTENT, type Intent } from '../src/shared/intent';
import { RECRUITS, teleport, quiet } from './helpers/sim';

type GroupedJson = typeof starter & { consoleGroups: { tile: [number, number]; kinds: string[] }[] };
/** The starter with two console groups (spec Demo-x-a section 1): the Helm (Navigation + Weapons) on the Bridge, Ops (Science + Engineering + Doors) in the Science Lab. */
function grouped(): GroupedJson {
  const j = JSON.parse(JSON.stringify(starter)) as GroupedJson;
  for (const st of j.stations) {
    if (st.id === 'weapons') { st.room = 'A'; st.tile = [2, 2]; }
    if (st.id === 'engineering' || st.id === 'doors') { st.room = 'D'; st.tile = [12, 2]; }
  }
  j.consoleGroups = [{ tile: [2, 2], kinds: ['navigation', 'weapons'] }, { tile: [12, 2], kinds: ['science', 'engineering', 'doors'] }];
  return j;
}
const GROUPED = parseShip(grouped());
const at = (s: SimState, kind: number): number => s.derived.stationOfKind[kind]!;
function state(): SimState { const s = createSimState(GROUPED, 2, 1, RECRUITS); quiet(s); return s; }
const press = (p: Partial<Intent>): Intent[] => [{ ...NEUTRAL_INTENT, ...p }, NEUTRAL_INTENT];
/** One stick edge for P1: the direction for one tick, then a neutral tick. */
function edge(s: SimState, moveX: number, moveY: number): void { step(s, press({ moveX, moveY })); step(s, press({})); }
function sitAt(s: SimState, x: number, y: number): void { teleport(s, 0, x + 0.5, y + 0.5); step(s, press({ confirmPressed: true })); step(s, press({})); }

describe('console groups in the schema (spec Demo-x-a section 1)', () => {
  it('parses two groups and relaxes the one-station-per-tile rule for their members only', () => {
    expect(GROUPED.consoleGroups).toHaveLength(2);
    const j = grouped(); const mb = j.stations.find((st) => st.id === 'medbay')!; mb.tile = [12, 2]; mb.room = 'D';
    expect(() => parseShip(j)).toThrow(/two stations on one tile/);
  });
  it('defaults to no groups, and the starter is unchanged', () => {
    expect(parseShip(starter).consoleGroups).toEqual([]);
    expect(deriveLayout(parseShip(starter)).groupStations).toEqual([]);
  });
  it('rejects an unknown kind, a kind in two groups, a one-kind group, a group tile outside a room and a member off the group tile', () => {
    const bad = (f: (j: GroupedJson) => void): GroupedJson => { const j = grouped(); f(j); return j; };
    expect(() => parseShip(bad((j) => { j.consoleGroups[0]!.kinds = ['navigation', 'shields']; }))).toThrow(/console group 0/);
    expect(() => parseShip(bad((j) => { j.consoleGroups[1]!.kinds = ['science', 'engineering', 'doors', 'weapons']; }))).toThrow(/in two console groups/);
    expect(() => parseShip(bad((j) => { j.consoleGroups[0]!.kinds = ['navigation']; }))).toThrow(/at least two kinds/);
    expect(() => parseShip(bad((j) => { j.consoleGroups[0]!.tile = [0, 0]; }))).toThrow(/not a floor tile of a room/);
    expect(() => parseShip(bad((j) => { j.consoleGroups[0]!.kinds = ['navigation', 'medbay']; }))).toThrow(/station medbay is not on its console group's tile/);
  });
  it('derives each station\'s group and the members in tab order; the order moves the layout hash', () => {
    const d = deriveLayout(GROUPED), k = (kind: number): number => d.stationOfKind[kind]!;
    expect(d.groupStations).toEqual([[k(StationKind.Navigation), k(StationKind.Weapons)], [k(StationKind.Science), k(StationKind.Engineering), k(StationKind.Doors)]]);
    expect(d.stationGroup[k(StationKind.Medbay)]).toBe(-1);
    expect(d.stationGroup[k(StationKind.Doors)]).toBe(1);
    const j = grouped(); j.consoleGroups[1]!.kinds = ['engineering', 'science', 'doors'];
    expect(deriveLayout(parseShip(j)).layoutHash).not.toBe(d.layoutHash);
  });
});

describe('seating at a console group', () => {
  it('seats the player at every member, on the first tab', () => {
    const s = state(); sitAt(s, 2, 2);
    expect(s.stations.occupant[at(s, StationKind.Navigation)]).toBe(0);
    expect(s.stations.occupant[at(s, StationKind.Weapons)]).toBe(0);
    expect(Seated.station[s.crew[0]!]).toBe(at(s, StationKind.Navigation));
    expect(s.groups.tab[0]).toBe(0); expect(Number(fixtureRunner(s).ui.groupBar[0])).toBe(0);
  });
  it('Up from the first row reaches the tab bar, Left/Right switch tabs, Down goes back; sitting again opens the first tab', () => {
    const s = state(); sitAt(s, 12, 2);
    expect(Seated.station[s.crew[0]!]).toBe(at(s, StationKind.Science));
    edge(s, 0, -1); expect(Number(fixtureRunner(s).ui.groupBar[1])).toBe(1);
    edge(s, 1, 0); expect(s.groups.tab[1]).toBe(1); expect(Seated.station[s.crew[0]!]).toBe(at(s, StationKind.Engineering));
    edge(s, 1, 0); expect(s.groups.tab[1]).toBe(2); expect(Seated.station[s.crew[0]!]).toBe(at(s, StationKind.Doors));
    edge(s, 1, 0); expect(s.groups.tab[1]).toBe(0);   // wraps
    edge(s, -1, 0); expect(s.groups.tab[1]).toBe(2);
    edge(s, 0, 1); expect(Number(fixtureRunner(s).ui.groupBar[1])).toBe(0); expect(s.groups.tab[1]).toBe(2);
    step(s, press({ cancelPressed: true })); step(s, press({}));
    expect(Number(fixtureRunner(s).ui.groupBar[1])).toBe(0);
    sitAt(s, 12, 2); expect(s.groups.tab[1]).toBe(0); expect(Seated.station[s.crew[0]!]).toBe(at(s, StationKind.Science));
  });
  it('input reaches only the active tab\'s station', () => {
    const s = state(); sitAt(s, 12, 2);
    const eng = at(s, StationKind.Engineering), doors = at(s, StationKind.Doors), sci = at(s, StationKind.Science), wpn = at(s, StationKind.Weapons);
    edge(s, 0, -1); edge(s, 1, 0); edge(s, 0, 1);   // the Engineering tab, back on the rows
    const doorsCursor = cardSelection(s, doors).cursor!, sciCursor = s.stations.cursor[sci]!;
    expect(cardSelection(s, eng).cursor).toBe(StationKind.Engineering);
    edge(s, 0, -1); edge(s, 0, -1);   // up to the Weapons row (kind 1)
    expect(cardSelection(s, eng).cursor).toBe(StationKind.Weapons); expect(cardSelection(s, doors).cursor).toBe(doorsCursor);
    const level = s.stations.level[wpn]!;
    edge(s, -1, 0); expect(s.stations.level[wpn]).toBe(level - 1);   // Left pulls a bar
    edge(s, 0, -1); expect(Number(fixtureRunner(s).ui.groupBar[1])).toBe(0); expect(cardSelection(s, eng).cursor).toBe(0);   // row 0
    edge(s, 0, -1); expect(Number(fixtureRunner(s).ui.groupBar[1])).toBe(1);
    edge(s, 1, 0); edge(s, 0, 1); edge(s, 0, 1);   // the Doors tab: Down moves the Doors cursor only
    expect(cardSelection(s, doors).cursor).toBe(doorsCursor + 1); expect(cardSelection(s, eng).cursor).toBe(0); expect(s.stations.cursor[sci]).toBe(sciCursor);
  });
  it('one member failing leaves the officer seated on the others; all failing stands the officer up', () => {
    const s = state(); sitAt(s, 2, 2);
    const nav = at(s, StationKind.Navigation), wpn = at(s, StationKind.Weapons);
    failStation(s, wpn);
    expect(Seated.station[s.crew[0]!]).toBe(nav); expect(s.stations.occupant[nav]).toBe(0); expect(s.stations.occupant[wpn]).toBe(0);
    failStation(s, nav);
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[nav]).toBe(-1); expect(s.stations.occupant[wpn]).toBe(-1);
  });
  it('a member pulled to zero bars leaves the officer seated; a station outside a group still stands its officer up', () => {
    const s = state(); sitAt(s, 12, 2);
    const sci = at(s, StationKind.Science);
    while (s.stations.level[sci]! > 0) shiftBar(s, sci, -1);
    expect(Seated.station[s.crew[0]!]).toBe(sci); expect(s.stations.occupant[at(s, StationKind.Doors)]).toBe(0);
    const mb = at(s, StationKind.Medbay); sitDown(s, 1, mb); failStation(s, mb);
    expect(Seated.station[s.crew[1]!]).toBe(-1);
  });
  it('seats when only a later member is online, and refuses when every member is offline', () => {
    const s = state(); failStation(s, at(s, StationKind.Navigation)); sitAt(s, 2, 2);
    expect(s.stations.occupant[at(s, StationKind.Weapons)]).toBe(0);
    standUp(s, 0); failStation(s, at(s, StationKind.Weapons)); sitAt(s, 2, 2);
    expect(Seated.station[s.crew[0]!]).toBe(-1);
  });
  it('standing clears every member', () => {
    const s = state(); sitAt(s, 12, 2); standUp(s, 0);
    for (const k of [StationKind.Science, StationKind.Engineering, StationKind.Doors]) expect(s.stations.occupant[at(s, k)]).toBe(-1);
  });
  it('the authoritative tab round-trips while client focus never changes the hash', () => {
    const s = state(); sitAt(s, 12, 2); edge(s, 0, -1); edge(s, 1, 0);
    const t = loadSnapshot(GROUPED, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s)); expect(t.groups.tab[1]).toBe(1); expect('bar' in t.groups).toBe(false);
    const h = hashState(s); s.groups.tab[0] = 1; expect(hashState(s)).not.toBe(h);
    const h2 = hashState(s); fixtureRunner(s).ui.groupBar[0] = true; expect(hashState(s)).toBe(h2);
  });
});

describe('the door-selection outline on a console group (Skiff amendment 11)', () => {
  it('shows only while the Ops officer is on the Doors tab', async () => {
    const { doorsCursorTile } = await import('../src/renderer/src/render/hazardTiles');
    const s = state(); sitAt(s, 12, 2);
    expect(doorsCursorTile(s)).toBe(-1);                                   // Science tab
    edge(s, 0, -1); edge(s, 1, 0); expect(doorsCursorTile(s)).toBe(-1);    // Engineering tab
    edge(s, 1, 0); expect(Seated.station[s.crew[0]!]).toBe(at(s, StationKind.Doors));
    expect(doorsCursorTile(s)).toBeGreaterThanOrEqual(0);                  // Doors tab: the selected door
  });
});
