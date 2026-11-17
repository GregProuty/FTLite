// Fixture HUD models for the UI-iii visual probe (`?mode=uiprobe&probe=hud&fixture=N`). Each is a real cutter model from
// buildHudModel, then patched with literal panels so every part of the HUD is drawn. Plain data; the sim state is disposed.
import { buildHudModel, lobbyLines, EVENT_CARD_HELP, TAB_NAMES, type ConsolePanel, type DebrisTarget, type EngineeringPanel, type HudModel, type HudPlayer, type HudTab, type MapModel, type MapNode, type UpgradeRow, type HudSlotStatus } from '../render/hudModel';
import { createCardUi } from '../clientControl/cardController';
import { createSimState, disposeSimState } from '../sim/state';
import { parseShip } from '../sim/ship/schema';
import cutter from '../sim/ship/cutter.json';
import { StationKind } from '../sim/stationKinds';

const active: HudSlotStatus = 'active';
const SLOTS = [{ status: active, key: 'kb:0' }, { status: active, key: 'kb:1' }, { status: active, key: 'gp:2' }, { status: active, key: 'gp:3' }];

function base(phase: HudModel['phase']): HudModel {
  const state = createSimState(parseShip(cutter), 4, 7);
  try { return buildHudModel(state, { mode: 'couch', ui: createCardUi() }, { slots: SLOTS, phase, message: '' }); } finally { disposeSimState(state); }
}
const withPlayer = (m: HudModel, pid: number, patch: Partial<HudPlayer>): void => { m.players[pid] = { ...m.players[pid]!, ...patch }; };
const tabs = (activeKind: number): HudTab[] => [StationKind.Navigation, StationKind.Weapons, StationKind.Science, StationKind.Engineering].map((kind) => ({ kind, name: TAB_NAMES[kind]!, active: kind === activeKind, offline: false }));
const node = (type: MapNode['type'], o: Partial<MapNode> = {}): MapNode => ({ type, current: false, reachable: false, selected: false, past: false, ...o });
const MAP: MapModel = {
  columns: [[node('empty', { past: true })], [node('event', { current: true })], [node('hazard', { reachable: true }), node('shop', { reachable: true, selected: true })], [node('asteroid'), node('unknown'), node('event')], [node('unknown'), node('hazard')], [node('exit')]].map((nodes) => ({ nodes })),
  edges: [{ from: [0, 0], to: [1, 0] }, { from: [1, 0], to: [2, 0] }, { from: [1, 0], to: [2, 1] }, { from: [2, 0], to: [3, 0] }, { from: [2, 1], to: [3, 1] }, { from: [2, 1], to: [3, 2] }, { from: [3, 0], to: [4, 0] }, { from: [3, 1], to: [4, 1] }, { from: [3, 2], to: [4, 1] }, { from: [4, 0], to: [5, 0] }, { from: [4, 1], to: [5, 0] }],
  column: 1, sector: 0, fleet: 0, jump: 'READY'
};
const target = (o: Partial<DebrisTarget>): DebrisTarget => ({ stableId: 1, kind: 'debris', room: 'Aft Passage', eta: 12, frequency: 2, hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null, ...o });
const engineering = (m: HudModel, page: number, cursor: number): EngineeringPanel => {
  const upgrades: UpgradeRow[] = [
    { row: 0, name: 'Navigation', level: 'lvl 2/4', price: '30', enabled: true, cursor: cursor === 0 },
    { row: 1, name: 'Weapons', level: 'lvl 3/6', price: '45', enabled: true, cursor: cursor === 1 },
    { row: 3, name: 'Engineering', level: 'lvl 4/6', price: 'MAX', enabled: false, cursor: cursor === 3 },
    { row: 7, name: 'Reactor', level: '+1 bar', price: '35', enabled: false, cursor: cursor === 7 },
    { row: 8, name: 'BACK', level: '', price: '', enabled: true, cursor: cursor === 8 }
  ];
  return { rows: m.stations.map((s) => ({ kind: s.kind, name: s.name, level: s.level, max: s.max, failed: s.kind === StationKind.Medbay, heat: s.heat, coolant: s.coolant, overdriven: s.overdriven, unpowered: s.unpowered })), cursor, pool: 3, coolantFree: 2, page, upgrades: page === 1 ? upgrades : [], scrap: 60 };
};
const weaponsPanel = (): ConsolePanel => ({ kind: 'weapons', charge: 0.6, selector: 0, torpedo: { stock: 2, cap: 4, loaded: true, load: 1, fetch: false, fed: false }, targets: [target({ kind: 'shot', room: 'Weapons', eta: 5, frequency: 3 }), target({ stableId: 2, kind: 'enemy', room: 'Hull', eta: -1, frequency: 1, hull: 0.64, shieldsUp: true, layers: 2, layersMax: 3, weaponCharge: 0.4 })], cursor: 0, first: 0, locked: false, loot: [{ selector: 1, short: 'Ion', charge: 0.3, powered: true, empty: false }], swap: null, rows: 6, enemyFreq: 1, freqUnknown: false, shieldsUp: true, shot: { text: 'Hit: shields down', tone: 'hit' } });

/** The probe's fixtures, indexed by the `fixture` query parameter. */
export const HUD_FIXTURES: (() => HudModel)[] = [
  // 0: running, four players, threats, the map and a notice
  () => ({ ...base('running'), hull: 24, map: MAP, notice: ['Jump drive ready', 'Navigation: pick a beacon'], threats: [{ icon: 'icon.fire', text: 'Fire: Aft Passage' }, { icon: 'icon.breach', text: 'Breach: Weapons' }, { icon: 'icon.power', text: 'Power: Medbay' }, { icon: 'icon.sensors', text: 'Shot Weapons 5s freq 3' }, { icon: 'icon.sensors', text: 'Shop here', info: true }], simSeconds: 83 }),
  // 1: P0 seated at Weapons with tabs, loot line and a shot result; P1 at Engineering page 0 with a flash
  () => { const m = base('running'); withPlayer(m, 0, { seated: StationKind.Weapons, console: weaponsPanel(), tabs: tabs(StationKind.Weapons), tabFocus: true, cancelPrompt: 'Stand' }); withPlayer(m, 1, { seated: StationKind.Engineering, console: engineering(m, 0, 1), tabs: tabs(StationKind.Engineering), cancelPrompt: 'Stand' }); return { ...m, map: MAP, calloutFlash: [StationKind.Weapons, StationKind.Engineering] }; },
  // 2: Engineering upgrades, Science with system results, Navigation with an EVADING row, Doors with an open airlock
  () => {
    const m = base('running');
    withPlayer(m, 0, { seated: StationKind.Engineering, console: engineering(m, 1, 1), tabs: tabs(StationKind.Engineering), cancelPrompt: 'Stand' });
    withPlayer(m, 1, { seated: StationKind.Science, console: { kind: 'science', leadSeconds: 8, targets: [{ ...target({ eta: 9 }), scan: 0.4 }], cursor: 1, first: 0, scanning: true, lock: 'LOCK: Confirm', system: { text: 'Scan systems', enabled: true, results: ['Weapons: charged', 'Shields: 2/3', 'Engines: online'] } }, tabs: tabs(StationKind.Science), cancelPrompt: 'Stand' });
    withPlayer(m, 2, { seated: StationKind.Navigation, console: { kind: 'navigation', evadeChance: 0.35, jump: { charge: 0.7, ready: false }, here: 'Beacon 2', fuel: 6, fuelAfter: 5, rows: [{ text: 'EVADING', selectable: false, enabled: true, cursor: false, blue: false }, { text: 'Shop  (1 jump)', selectable: true, enabled: true, cursor: true, blue: false }, { text: 'Hazard  (1 jump)', selectable: true, enabled: true, cursor: false, blue: false }, { text: 'Event  (2 jumps)', selectable: true, enabled: false, cursor: false, blue: true }], first: 0, scrap: 60 }, tabs: tabs(StationKind.Navigation), cancelPrompt: 'Stand' });
    withPlayer(m, 3, { seated: StationKind.Doors, console: { kind: 'doors', item: 'Airlock  Weapons', status: 'Open', action: 'Close', openAirlocks: 1 }, tabs: tabs(StationKind.Doors), cancelPrompt: 'Stand' });
    return { ...m, map: MAP, threats: [{ icon: 'icon.breach', text: 'Airlock open: Weapons' }] };
  },
  // 3: an open event card with votes
  () => { const m = base('running'); withPlayer(m, 0, { vote: 'VOTE 1' }); withPlayer(m, 1, { vote: 'VOTE 2' }); return { ...m, map: MAP, eventCard: { title: 'Derelict freighter', text: ['A silent freighter drifts across your path.', 'Its hold seals are intact.'], choices: [{ number: '1.', text: 'Board and salvage', enabled: true, blue: false, votes: ['P1', 'P3'] }, { number: '2.', text: 'Scan it first', enabled: true, blue: true, votes: ['P2'] }, { number: '3.', text: 'Leave it', enabled: false, blue: false, votes: [] }], status: 'Vote 24s', help: EVENT_CARD_HELP } }; },
  // 4: the lobby
  () => ({ ...base('lobby'), lobbyLines: lobbyLines(4), lobbyShip: 'Ship: Cutter (4 crew)', progressLine: 'Best 1240   Runs 7   Victories 2' }),
  // 5: game over with a summary
  () => ({ ...base('gameover'), summary: ['GAME OVER: hull destroyed', 'Sector 2/8   node 4/9', 'Time 7:42   Scrap 130', 'P1 Nav 1 -> 2, Wpn 0 -> 1', 'P2 Eng 2 -> 3', 'P3 no skill gains'], progressLine: 'Best 1240   Runs 8   Victories 2' }),
  // 6: the credits overlay
  () => ({ ...base('running'), credits: ['FTLITE', '', 'Design and code', 'The crew', '', 'Art', 'Pixel ship and room glyphs', '', 'Font m5x7 by Daniel Linssen', '', 'Thanks for playing'], creditsScroll: 40 })
];
