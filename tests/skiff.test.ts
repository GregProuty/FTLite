import { describe, it, expect } from 'vitest';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { reachableTiles } from '../src/renderer/src/sim/ship/reachability';
import { createSimState, type SimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { Seated } from '../src/renderer/src/sim/components';
import { botIntent } from '../src/renderer/src/sim/bot';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { StationKind, STATION_IDS } from '../src/renderer/src/sim/stationKinds';
import { failStation, powerUsed, powerCapacity } from '../src/renderer/src/sim/power';
import { interactTarget, TargetKind } from '../src/renderer/src/sim/interact';
import { buildHudModel, tabText } from '../src/renderer/src/render/hudModel';
import { shipForCrew, shipLine } from '../src/renderer/src/sim/ship/fleet';
import { createSession } from '../src/renderer/src/app/session';
import type { SlotInfo, SourceSample } from '../src/renderer/src/input/deviceManager';
import type { ShipLayout } from '../src/renderer/src/sim/ship/schema';
import { NEUTRAL_INTENT, type Intent } from '../src/shared/intent';
import { TORP_LOAD_TIME, TORP_START } from '../src/renderer/src/sim/tuning';
import { RECRUITS, teleport, quiet, seconds, LAYOUT } from './helpers/sim';

const SKIFF = parseShip(skiff);
const room = (id: string): string => SKIFF.rooms.find((r) => r.id === id)!.name;
function state(): SimState { const s = createSimState(SKIFF, 2, 1, RECRUITS); quiet(s); return s; }
const press = (p: Partial<Intent>): Intent[] => [{ ...NEUTRAL_INTENT, ...p }, NEUTRAL_INTENT];
function edge(s: SimState, moveX: number, moveY: number): void { step(s, press({ moveX, moveY })); step(s, press({})); }
function sitAt(s: SimState, tile: readonly number[]): void { teleport(s, 0, tile[0]! + 0.5, tile[1]! + 0.5); step(s, press({ confirmPressed: true })); step(s, press({})); }
const HELM = [16, 4], OPS = [12, 3];
const slots = (n: number): SlotInfo[] => [0, 1, 2, 3].map((k) => ({ status: k < n ? 'active' : 'empty', key: k < n ? `kb:${k % 2}` : null }) as SlotInfo);

describe('the Skiff (spec Demo-x-a section 2)', () => {
  it('parses, smaller than the cutter: 18 x 9, eight rooms, seven doors, eight breach sites, two airlocks, no magazine', () => {
    expect([SKIFF.width, SKIFF.height]).toEqual([18, 9]);
    expect(SKIFF.width * SKIFF.height).toBeLessThan(parseShip(cutter).width * parseShip(cutter).height);
    expect(SKIFF.rooms.map((r) => r.name)).toEqual(['Bridge', 'Ops', 'Corridor', 'Life Support', 'Medbay', 'Engines', 'Reactor', 'Hold']);
    expect(SKIFF.edges).toHaveLength(7); expect(SKIFF.breachSites).toHaveLength(8);
    expect(SKIFF.airlocks.map((a) => room(a.room))).toEqual(['Engines', 'Hold']);
    expect(SKIFF.magazine).toBeUndefined(); expect(deriveLayout(SKIFF).magazineTile).toBe(-1);
  });
  it('has the Helm group on the Bridge and the Ops group in Ops; Life Support and Medbay keep their own consoles', () => {
    expect(SKIFF.consoleGroups).toEqual([{ tile: HELM, kinds: ['navigation', 'weapons'] }, { tile: OPS, kinds: ['science', 'engineering', 'doors'] }]);
    const where = Object.fromEntries(STATION_IDS.map((id) => [id, room(SKIFF.stations.find((st) => st.id === id)!.room)]));
    expect(where).toEqual({ navigation: 'Bridge', weapons: 'Bridge', science: 'Ops', engineering: 'Ops', doors: 'Ops', lifeSupport: 'Life Support', medbay: 'Medbay' });
  });
  it('reaches every console tile from every spawn', () => {
    const passable = (x: number, y: number): boolean => { const c = SKIFF.rows[y]!.charAt(x); return c !== '#' && c !== ' '; };
    for (const sp of SKIFF.spawns) {
      const reach = reachableTiles(SKIFF.width, SKIFF.height, sp, passable);
      for (const st of SKIFF.stations) expect(reach.has(st.tile[1] * SKIFF.width + st.tile[0]), `${st.id} from ${sp}`).toBe(true);
    }
  });
  it('starts with the Helm, Ops, Life Support and Medbay powered and two spare bars for Engineering to route', () => {
    const s = state();
    for (let i = 0; i < s.stations.level.length; i++) expect(s.stations.level[i], STATION_IDS[s.derived.stationKind[i]!]).toBeGreaterThan(0);
    expect(powerCapacity(s) - powerUsed(s)).toBe(2);
  });
  it('loads a torpedo by itself while the Helm is manned, on either tab, and offers no magazine pickup', () => {
    const s = state(); sitAt(s, HELM);
    expect(s.weapons.torpedoStock).toBe(TORP_START); expect(s.weapons.torpedoLoaded).toBe(0);
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    for (let t = 0; t < seconds(TORP_LOAD_TIME * 6) && !s.weapons.torpedoLoaded; t++) step(s, press({}));   // well inside six load times at a Recruit's output
    expect(Seated.station[s.crew[0]!]).toBe(s.derived.stationOfKind[StationKind.Navigation]); expect(s.stations.occupant[wpn]).toBe(0);
    expect(s.weapons.torpedoLoaded).toBe(1); expect(s.weapons.torpedoStock).toBe(TORP_START - 1);
    expect(interactTarget(s, 1).kind).not.toBe(TargetKind.Pickup);
  });
  it('runs 600 ticks with two bots, the captain bot seating at the Helm', () => {
    const s = createSimState(SKIFF, 2, 1, DEFAULT_CHARACTERS);
    for (let t = 0; t < 600; t++) step(s, [botIntent(s, 0), botIntent(s, 1)]);
    expect(s.tick).toBe(600);
  });
});

describe('the console card tab bar (spec Demo-x-a section 1)', () => {
  it('shows HELM | WEAPONS with the active tab, the bar focus, a switch and an offline tab', () => {
    const s = state(); sitAt(s, HELM);
    const p = (): ReturnType<typeof buildHudModel>['players'][number] => buildHudModel(s, slots(2), 'running', '').players[0]!;
    expect(p().tabs!.map(tabText)).toEqual(['HELM', 'WEAPONS']); expect(p().tabs!.map((t) => t.active)).toEqual([true, false]); expect(p().tabFocus).toBe(false);
    expect(p().seated).toBe(StationKind.Navigation); expect(p().console!).toMatchObject({ kind: 'navigation' });
    edge(s, 0, -1); expect(p().tabFocus).toBe(true);
    edge(s, 1, 0); expect(p().tabs!.map((t) => t.active)).toEqual([false, true]); expect(p().seated).toBe(StationKind.Weapons); expect(p().console!).toMatchObject({ kind: 'weapons' });
    failStation(s, s.derived.stationOfKind[StationKind.Weapons]!);
    expect(p().tabs!.map(tabText)).toEqual(['HELM', 'WEAPONS OFFLINE']); expect(p().seated).toBe(StationKind.Weapons);
  });
  it('shows SCIENCE | ENGINEERING | DOORS at Ops, no tabs at a single console, and the group in the Sit prompt', () => {
    const s = state();
    teleport(s, 0, OPS[0]! + 0.5, OPS[1]! + 1.5);
    expect(buildHudModel(s, slots(2), 'running', '').players[0]!.confirmPrompt).toBe('Sit: Science + Engineering + Doors');
    teleport(s, 0, HELM[0]! + 0.5, HELM[1]! + 0.5);
    expect(buildHudModel(s, slots(2), 'running', '').players[0]!.confirmPrompt).toBe('Sit: Helm + Weapons');
    sitAt(s, OPS);
    expect(buildHudModel(s, slots(2), 'running', '').players[0]!.tabs!.map(tabText)).toEqual(['SCIENCE', 'ENGINEERING', 'DOORS']);
    const t = createSimState(LAYOUT, 2, 1, RECRUITS); quiet(t); sitAt(t, LAYOUT.stations.find((st) => st.id === 'navigation')!.tile);
    expect(buildHudModel(t, slots(2), 'running', '').players[0]!.tabs).toBeNull();
  });
});

describe('which ship flies (spec Demo-x-a section 3)', () => {
  it('is the Skiff for one or two players and the cutter for three or four; the lobby names it', () => {
    expect([1, 2, 3, 4].map(shipForCrew)).toEqual(['skiff', 'skiff', 'cutter', 'cutter']);
    expect(shipLine(0)).toBe('Ship: Skiff (2 crew)'); expect(shipLine(2)).toBe('Ship: Skiff (2 crew)'); expect(shipLine(3)).toBe('Ship: Cutter (4 crew)');
    expect(buildHudModel(null, slots(2), 'lobby', '').lobbyShip).toBe('Ship: Skiff (2 crew)');
    expect(buildHudModel(null, slots(4), 'lobby', '').lobbyShip).toBe('Ship: Cutter (4 crew)');
    expect(buildHudModel(state(), slots(2), 'running', '').lobbyShip).toBe('');
  });
  it('the session asks for the ship by the run\'s player count', () => {
    const asked: number[] = [];
    let samples: SourceSample[] = [], t = 0;
    const session = createSession({ layout: (n: number): ShipLayout => { asked.push(n); return SKIFF; }, sampleDevices: () => samples, renderer: null, hud: null, now: () => t, saveCrash: () => {} });
    const frame = (o: Partial<SourceSample>[]): void => { samples = o.map((x, k) => ({ key: `kb:${k}`, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, any: false, ...x })); t += 16; session.frame(); };
    frame([{ interact: true }, { interact: true }]); frame([{}, {}]); frame([{ confirm: true }, {}]); frame([{}, {}]);
    expect(asked).toEqual([2]); expect(session.state!.layout.id).toBe('skiff');
  });
});
