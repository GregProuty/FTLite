import { weaponDef } from '../sim/weaponDefs';
import { LootPlace, Weapon, SWAP_SLOT, canSwap, swapSlot } from '../sim/weapons';
import { ICON_KINDS, stationTint, type IconKind, type IconTint } from './roomIconModel';
import type { SimState } from '../sim/state';
import { Health, Life, LifeState, Position, Seated } from '../sim/components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../sim/interact';
import { DoorState, conditionRoomAt } from '../sim/grid';
import { CONFIRM_SECONDS, VOTE_SECONDS, TICK_HZ, DT, EVADE_BASE, EVADE_SCALE, HEAT_MAX, COOLANT_POOL, TORP_CAP, SKILL_COUNT, ENEMY_SYS_HP, BOARDER_HEALTH, SECTOR_COLUMNS, SECTORS, scrapSurrender, HIT_FLASH_TICKS, ENCOUNTER_NOTICE_SECONDS, ENCOUNTER_REWARD_HULL, ENCOUNTER_START, scrapField, STATION_MAX, UPGRADE_MAX, REACTOR_BONUS_MAX, WEAPON_SLOTS, SLOT_LEVELS, SCAN_RESULT_SECONDS, SCAN_NOTICE_SECONDS, CACHE_FUEL, scrapCache, FIRST_STRIKE_SECONDS, AMBUSH_WARN } from '../sim/tuning';
import { navRows, helmOffline, overrun, nodeLabel, NodeType, reachable, beaconIndex, beaconAt, hereIndex, contentOf, EXIT_JUMP, exitText } from '../sim/run';
import { depthOf, peaceful } from '../sim/depth';
import { EVENTS, EVENT_DEFS, noticeChoices, choiceLabel, choiceEnabled, isBlue } from '../sim/events';
import { skillLevelOf, SKILL_NAMES } from '../sim/skills';
import { CHARACTERS, DEFAULT_CHARACTERS, RECRUIT, characterOf, ASSET_NAMES, COMPLICATION_NAMES, type Character } from '../sim/characters';
import { StationKind, STATION_NAMES } from '../sim/stationKinds';
import { stationOnline, stationOutput } from '../sim/stations';
import { scienceLead, ObjectKind, evadeChance } from '../sim/debris';
import { warnedTargets, ENEMY_SLOT, isEnemySlot, enemySystemOf } from '../sim/debrisTargets';
import { EnemySystem, ENEMY_SYSTEM_NAMES, enemyShieldCap, isWarden, enemyWeaponCharge, fleeSecondsLeft, Encounter, lockActive, lockSecondsLeft, ionSecondsLeft } from '../sim/enemy';
import { canLock, detectChance, SystemScan, ScanFound } from '../sim/science';
import { powerUsed, powerPool, powerCapacity, baseMax, upgradeRows, upgradePrice, reactorPrice, canUpgrade, canBuyReactor, REACTOR_ROW, BACK_ROW } from '../sim/power';
import { isOverdriven, coolantUsed } from '../sim/heat';
import type { SlotInfo, SlotStatus } from '../input/deviceManager';
import { PHASE_NAMES } from '../sim/director';
import { durationSeconds, eventSeconds, telemetryRecord } from '../sim/telemetry';
import { EndReason } from '../sim/crew';
import { boarderMarkers, boardersInRoom } from '../sim/boarders';
import { QUIRK_NAMES } from '../sim/quirks';
import { doorsCursorTarget } from '../sim/doors';
import { shipLine, shipForCrew } from '../sim/ship/fleet';
import { textPx } from './theme';
import { NOTICE } from './hudLayout';
import { navigatorAtHelm } from './enemyWindowModel';

export type DeviceKind = 'kb0' | 'kb1' | 'pad' | null;
export type HudAction = 'interact' | 'confirm' | 'cancel';
export interface HudCharacter { name: string; asset: string; complication: string }
export interface HudPlayer {
  pid: number; status: SlotStatus; deviceKind: DeviceKind;
  health: number; life: number; bleed: number; lowOxygen: boolean; carrying: boolean; vote: string;   // vote: 'VOTE 1' or 'VOTE 2' while an event is open (spec Coop-ii section 3)   // carrying: a torpedo in hand (spec Coop-ii section 2)
  lifeText: string; skills: number[]; character: HudCharacter;
  interactPrompt: string; interactIcon: string | null;
  confirmPrompt: string; confirmIcon: string | null;
  progress: number;
  seated: number | null; console: ConsolePanel | null; cancelPrompt: string;
  tabs: HudTab[] | null; tabFocus: boolean;   // a console group's tab bar while seated there, and whether the stick is on it (spec Demo-x-a section 1)
}
/** One tab of a console group's card: `HELM`, `WEAPONS`, ...; offline when its station is failed or has no bars. */
export interface HudTab { kind: number; name: string; active: boolean; offline: boolean }
/** Tab names by station kind: Navigation is the Helm (spec Demo-x-a section 1). */
export const TAB_NAMES = ['HELM', 'WEAPONS', 'SCIENCE', 'ENGINEERING', 'LIFE SUPPORT', 'MEDBAY', 'DOORS'] as const;
/** A tab's text on the bar: its name, with OFFLINE when its station is offline. */
export function tabText(t: HudTab): string { return t.offline ? `${t.name} OFFLINE` : t.name; }
/** A player block's last line: the skill levels (`N0 E0 W0 S0 C0 R3`); the name sits on the first line and the health is its bar. */
export function skillsLine(skills: readonly number[]): string { return SKILL_NAMES.map((n, k) => `${n[0]}${skills[k]}`).join(' '); }
/** A tab as the card's tab bar draws it at the larger font (spec Demo-x-c section 1): `>` on the active tab while the stick is on the bar, `!` after an offline tab's name (drawn red), so three names fit. */
export function tabLabel(t: HudTab, focus: boolean): string { return `${t.active && focus ? '>' : ''}${t.name}${t.offline ? '!' : ''}`; }
/** The tab bar of a seated player's console group, or null outside a group. */
export function consoleTabs(state: SimState, i: number): HudTab[] | null {
  const d = state.derived, g = d.stationGroup[i]!;
  if (g < 0) return null;
  return d.groupStations[g]!.map((j, k) => ({ kind: d.stationKind[j]!, name: TAB_NAMES[d.stationKind[j]!]!, active: k === state.groups.tab[g], offline: !stationOnline(state, j) }));
}
/** The Sit prompt's console name: a console group joins its members (`Helm + Weapons`). */
/** Short station names by kind: the power panel's rows (spec Demo-x-c section 1: they fit the left column at the larger font). */
export const STATION_SHORT = ['Nav', 'Wpn', 'Sci', 'Eng', 'Life', 'Med', 'Door'] as const;
/** A console group member's name in its Sit prompt: the Helm, Weapons and Doors in full, the long names short (`Sit: Sci + Eng + Doors`, which fits the player block at the larger font). */
export const GROUP_SEAT_NAMES = ['Helm', 'Weapons', 'Sci', 'Eng', 'Life', 'Med', 'Doors'] as const;
export function seatName(state: SimState, i: number): string {
  const d = state.derived, g = d.stationGroup[i]!, name = (j: number): string => (g >= 0 ? GROUP_SEAT_NAMES[d.stationKind[j]!]! : STATION_NAMES[d.stationKind[j]!]!);
  return g < 0 ? name(i) : d.groupStations[g]!.map(name).join(' + ');
}
function thermal(state: SimState, i: number): { heat: number; coolant: number; overdriven: boolean } {
  return i < 0 ? { heat: 0, coolant: 0, overdriven: false } : { heat: state.stations.heat[i]! / HEAT_MAX, coolant: state.stations.coolant[i]!, overdriven: isOverdriven(state, i) };
}
export interface EngineeringPanel { rows: { kind: number; name: string; level: number; max: number; failed: boolean; heat: number; coolant: number; overdriven: boolean; unpowered: boolean }[]; cursor: number; pool: number; coolantFree: number; page: number; upgrades: UpgradeRow[]; scrap: number }   // cursor STATION_COUNT: the UPGRADES row; page 1: the Upgrades page (spec Loop-ii section 2)
/** One Upgrades page row (spec Loop-ii section 2): `Weapons  lvl 3/6  45`, `Reactor  +1 bar  35`, `BACK`; row is the sim cursor value. */
export interface UpgradeRow { row: number; name: string; level: string; price: string; enabled: boolean; cursor: boolean }
export function upgradeRowText(r: UpgradeRow): string { return [r.name, r.level, r.price].filter((t) => t).join('  '); }
/** The Engineering footer: the pool and coolant on the power page, the crew's scrap on the Upgrades page. */
export function engineeringFooter(p: EngineeringPanel): string { return p.page === 1 ? `Scrap ${p.scrap}` : `pool ${p.pool}   coolant ${p.coolantFree}/${COOLANT_POOL}`; }
function upgradeRowsOf(state: SimState, cursor: number): UpgradeRow[] {
  return upgradeRows(state).map((row) => {
    if (row === BACK_ROW) return { row, name: 'BACK', level: '', price: '', enabled: true, cursor: row === cursor };
    if (row === REACTOR_ROW) { const maxed = state.run.reactorBonus >= REACTOR_BONUS_MAX; return { row, name: 'Reactor', level: maxed ? '' : '+1 bar', price: maxed ? 'MAX' : `${reactorPrice(state.run.reactorBonus)}`, enabled: canBuyReactor(state), cursor: row === cursor }; }
    const owned = state.run.upgrades[row]!, maxed = owned >= UPGRADE_MAX;
    return { row, name: STATION_NAMES[row]!, level: `lvl ${baseMax(state, row)}/${STATION_MAX[row]! + UPGRADE_MAX}`, price: maxed ? 'MAX' : `${upgradePrice(owned)}`, enabled: canUpgrade(state, row), cursor: row === cursor };
  });
}
/** The Doors card (spec Demo-vii section 1): the selection, its state and what Confirm does; item null when the ship has neither doors nor airlocks. */
export type DoorsPanel = { kind: 'doors'; item: string; status: string; action: string; openAirlocks: number } | { kind: 'doors'; item: null };
export type TargetKindName = 'debris' | 'shot' | 'rock' | 'enemy';
export interface DebrisTarget { stableId: number; kind: TargetKindName; room: string; eta: number; frequency: number | null; hull: number | null; system: number | null; status: { hp: number; repairIn: number | null; ionIn?: number } | null; shieldsUp: boolean | null; layers: number | null; layersMax: number | null; weaponCharge: number | null; fleeSeconds: number | null }   // the last four: the enemy hull row only (spec Demo-i section 11.4)
export interface WeaponsPanel { kind: 'weapons'; charge: number; selector: number; torpedo: { stock: number; cap: number; loaded: boolean; load: number; fetch: boolean; fed: boolean }; targets: DebrisTarget[]; cursor: number; first: number; locked: boolean; loot: LootSlotView[]; swap: string | null; rows: number }   // loot: the filled extra slots; swap: the SWAP row's text while it shows (after the targets; cursor = targets.length on it); rows: target rows visible (spec Loop-iii section 4)
/** A filled extra slot on the Weapons card: its selector value, short name, charge, whether the Weapons level powers it, and for the missile pod whether the stock is empty. */
export interface LootSlotView { selector: number; short: string; charge: number; powered: boolean; empty: boolean }   // locked: a Science lock runs (spec Coop-i section 1); torpedo.fetch: a magazine ship with nothing in the tube or the loader, fed: a delivered torpedo loading (spec Coop-ii section 2)
export interface SciencePanel { kind: 'science'; leadSeconds: number; targets: (DebrisTarget & { scan: number })[]; cursor: number; first: number; scanning: boolean; lock: string; system: { text: string; enabled: boolean; results: string[] } }   // system: the system scan's row after the targets (cursor = targets.length on it) and its results for SCAN_RESULT_SECONDS (spec Demo-x-b section 3)   // lock: '', 'LOCK: Confirm' or 'LOCKED 6s' (spec Coop-i section 1)
export interface NavigationPanel { kind: 'navigation'; evadeChance: number; jump: { charge: number; ready: boolean }; here: string; fuel: number; fuelAfter: number | null; rows: { text: string; selectable: boolean; enabled: boolean; cursor: boolean; blue: boolean }[]; first: number; scrap: number }
export type ConsolePanel = EngineeringPanel | DoorsPanel | WeaponsPanel | SciencePanel | NavigationPanel;
export interface HudStation { kind: number; name: string; level: number; max: number; online: boolean; occupant: number | null; heat: number; coolant: number; overdriven: boolean; unpowered: boolean; icon: IconKind; iconTint: IconTint }
export interface HudThreat { icon: 'icon.fire' | 'icon.breach' | 'icon.power' | 'icon.sensors' | 'icon.weapons'; text: string }
export interface HudModel {
  phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number; tick: number;
  threats: HudThreat[]; boarders: { stableId: number; x: number; y: number; health: number }[]; power: { capacity: number; used: number }; stations: HudStation[]; weapons: { charge: number; ready: boolean; torpedoLoaded: boolean; torpedoStock: number }; impactTick: number[]; map: MapModel | null;
  players: HudPlayer[]; summary: string[] | null; credits: string[] | null; creditsScroll: number;
  director: { phase: string; stress: number };
  run: { column: number; columns: number; sector: number; fuel: number; quirk: string };
  progressLine: string;
  lobbyLines: string[]; notice: string[];
  lobbyShip: string;   // the lobby line under the title naming the ship (spec Demo-x-a section 3), '' outside the lobby   // the lobby controls card (spec Demo-i section 3) and the run notice (section 4)
  eventCard: EventCard | null;   // the open event, centred over the world while running (spec Demo-x-b section 2)
  calloutFlash: number[];   // station kinds whose Engineering row flashes for a Power to ... callout (spec Coop-i section 3)
}
/** True for any level-0 non-Engineering console that is present and not failed (spec Demo-ii section 3): a repaired console awaiting a bar. */
function unpoweredAt(state: SimState, kind: number, si: number): boolean { return si >= 0 && kind !== StationKind.Engineering && state.stations.failed[si] !== 1 && state.stations.level[si] === 0; }

/** The clock card's first line: hull and fuel (the time has its own line at the larger font, spec Demo-x-c section 1). */
export function clockLine(m: HudModel): string { return `HULL ${Math.round(m.hull)}   FUEL ${m.run.fuel}`; }
/** The clock card's second line (spec Loop-i section 1): where the ship is in the run. */
export function sectorLine(m: HudModel): string { return `SECTOR ${m.run.sector + 1}/${SECTORS}  node ${m.run.column + 1}/${m.run.columns}`; }
/** The clock card's third and fourth lines: the run time, the director's phase and stress. */
export function timeLine(m: HudModel): string { return `TIME ${m.simSeconds}s`; }
export function directorText(m: HudModel): string { return `${m.director.phase}  ${Math.round(m.director.stress * 100)}%`; }
/** The jump text shared by the Navigation footer and the map title. */
export function jumpText(jump: { charge: number; ready: boolean }): string { return jump.ready ? 'READY' : `${Math.floor(jump.charge * 100)}%`; }
/** The Science footer: the lead, then the scan or the lock (spec Coop-i section 1). */
export function scienceFooter(p: SciencePanel): string { return `Lead ${Math.round(p.leadSeconds)}s${p.scanning ? '   Scanning' : ''}${p.lock ? `   ${p.lock}` : ''}`; }
/** The Navigation footer (spec Loop-i section 2): evade, the drive, the fuel (now > after the highlighted jump) and scrap. */
export function navigationFooter(p: NavigationPanel): string { return navigationFooterLines(p).join('  '); }
/** The Navigation footer on the card's two footer lines (spec Demo-x-c section 1): evade and the drive, then fuel and scrap. */
export function navigationFooterLines(p: NavigationPanel): [string, string] { return [`Evade ${Math.round(p.evadeChance * 100)}%  Jump ${jumpText(p.jump)}`, `Fuel ${p.fuelAfter === null ? p.fuel : `${p.fuel}>${p.fuelAfter}`}  Scrap ${p.scrap}`]; }
export interface MapNode { type: 'hazard' | 'event' | 'shop' | 'asteroid' | 'empty' | 'unknown' | 'exit'; current: boolean;   // unknown: not yet visited (spec Loop-i section 4b)
  reachable: boolean; selected: boolean; past: boolean }
export interface MapModel { columns: { nodes: MapNode[] }[]; edges: { from: [number, number]; to: [number, number] }[]; column: number; sector: number; fleet: number; jump: string }   // fleet: floor(pursuit), the last overrun column (spec Loop-i section 3)   // spec section 5; column and jump feed the title
export function mapTitle(m: MapModel): string { return `SECTOR ${m.sector + 1}/${SECTORS}   node ${m.column + 1}/${m.columns.length}   Jump ${m.jump}`; }
const NODE_TYPES = ['hazard', 'event', 'shop', 'asteroid', 'empty'] as const;
function mapBlock(state: SimState | null, phase: HudModel['phase']): MapModel | null {
  if (!state || phase !== 'running') return null;
  const nav = state.derived.stationOfKind[StationKind.Navigation]!;
  if (!navigatorAtHelm(state)) return null;   // a navigator on the Helm tab (a grouped Helm on its Weapons tab shows the enemy window, spec Demo-x-c)
  const r = state.run, reach = reachable(state), row = navRows(state)[state.stations.cursor[nav]!];
  const sel = row && row.select === 'jump' ? row.index : -1;
  const columns: MapModel['columns'] = [], edges: MapModel['edges'] = [], last = r.colNodes.length - 1;
  for (let c = 0; c <= last; c++) {
    const nodes: MapNode[] = [];
    for (let n = 0; n < r.colNodes[c]!; n++) {
      const k = beaconIndex(c, n);
      const t = r.nodeType[k]!, type: MapNode['type'] = c === last ? 'exit' : t === NodeType.Shop ? 'shop' : r.visited[k] || r.revealed[k] ? NODE_TYPES[t] ?? 'hazard' : 'unknown';   // hidden until visited, shops always shown (spec Loop-i section 4b)
      nodes.push({ type, current: c === r.column && n === r.node, reachable: reach.some((b) => b.column === c && b.node === n), selected: k === sel, past: c < r.column });
    }
    columns.push({ nodes });
    if (c > 0 && c < last) for (let n = 0; n + 1 < r.colNodes[c]!; n++) edges.push({ from: [c, n], to: [c, n + 1] });   // the sideways edges between vertical neighbours (spec Loop-i section 1)
    if (c < last) for (let n = 0; n < r.colNodes[c]!; n++) for (let d = 0; d < r.colNodes[c + 1]!; d++) if (r.edgeMask[beaconIndex(c, n)]! & (1 << d)) edges.push({ from: [c, n], to: [c + 1, d] });
  }
  return { columns, edges, column: r.column, sector: r.sector, fleet: Math.floor(r.pursuit), jump: jumpText({ charge: r.jumpCharge, ready: r.jumpCharge >= 1 }) };
}

/** A player's room is "low" on the HUD below this oxygen fraction (a warning, well above SUFFOCATE_FRAC). */
export const HUD_LOW_O2_FRAC = 0.5;

/** Slot key → device kind. The key format is owned by input/sources.ts (`kb:0`, `kb:1`, `gp:<index>`); nothing else is parsed from it. */
export function deviceKindOf(key: string | null): DeviceKind {
  if (key === 'kb:0') return 'kb0'; if (key === 'kb:1') return 'kb1'; if (key?.startsWith('gp:')) return 'pad'; return null;
}

const GLYPHS: Record<Exclude<DeviceKind, null>, Record<HudAction, string>> = {
  kb0: { interact: 'prompt.kb.E', confirm: 'prompt.kb.F', cancel: 'prompt.kb.Q' },
  kb1: { interact: 'prompt.kb.Enter', confirm: 'prompt.kb.ShiftRight', cancel: 'prompt.kb.Backspace' },
  pad: { interact: 'prompt.pad.A', confirm: 'prompt.pad.X', cancel: 'prompt.pad.B' }
};
export function glyphName(action: HudAction, kind: DeviceKind): string | null { return kind ? GLYPHS[kind][action] : null; }

const describe = (c: Character): HudCharacter => ({ name: c.name, asset: ASSET_NAMES[c.asset]!, complication: COMPLICATION_NAMES[c.complication]! });

const EMPTY: Omit<HudPlayer, 'pid' | 'status' | 'deviceKind'> = { health: 0, life: 0, bleed: 0, lowOxygen: false, carrying: false, vote: '', lifeText: '', interactPrompt: '', interactIcon: null, confirmPrompt: '', confirmIcon: null, progress: 0, seated: null, console: null, cancelPrompt: '', tabs: null, tabFocus: false, skills: [0, 0, 0, 0, 0, 0], character: describe(CHARACTERS[RECRUIT]!) };

function player(state: SimState, pid: number): Omit<HudPlayer, 'pid' | 'status' | 'deviceKind'> {
  const eid = state.crew[pid]!;
  const skills = Array.from({ length: SKILL_COUNT }, (_, k) => skillLevelOf(state, pid, k));
  const base = { health: Health.cur[eid]!, life: Life.state[eid]!, bleed: Life.bleed[eid]!, carrying: state.carrying[pid] === 1, vote: state.run.event >= 0 && state.run.eventChoice < 0 && state.run.vote[pid]! >= 0 ? `VOTE ${state.run.vote[pid]! + 1}` : '', skills, character: describe(characterOf(state, pid)) };
  const r = conditionRoomAt(state, Position.x[eid]!, Position.y[eid]!);
  const lowOxygen = r >= 0 && state.rooms.o2[r]! / state.derived.volume[r]! < HUD_LOW_O2_FRAC;
  if (Life.state[eid] === LifeState.Downed) return { ...EMPTY, ...base, lowOxygen, lifeText: `DOWNED ${Math.ceil(Life.bleed[eid]!)}s`, progress: Life.reviveProgress[eid]! };
  if (Life.state[eid] === LifeState.Dead) return { ...EMPTY, ...base, lowOxygen, lifeText: 'DEAD' };
  const seatedAt = Seated.station[eid]!;
  if (seatedAt >= 0) {
    const kind = state.derived.stationKind[seatedAt]!;
    const tabs = consoleTabs(state, seatedAt), g = state.derived.stationGroup[seatedAt]!;
    return { ...base, lowOxygen, lifeText: '', interactPrompt: '', interactIcon: null, confirmPrompt: '', confirmIcon: null, cancelPrompt: 'Stand', progress: 0, seated: kind, console: consolePanel(state, seatedAt, kind), tabs, tabFocus: g >= 0 && state.groups.bar[g] === 1 };
  }
  let interactPrompt = '', interactIcon: string | null = null, progress = 0;
  const t = interactTarget(state, pid);
  if (t.kind === TargetKind.Fight) { interactPrompt = 'Fight boarder'; progress = state.boarders.health[t.index]! / BOARDER_HEALTH; }
  else if (t.kind === TargetKind.Revive) { interactPrompt = `Revive P${t.index + 1}`; progress = Life.reviveProgress[state.crew[t.index]!]!; }
  else if (t.kind === TargetKind.Fire) { interactPrompt = 'Repair fire'; interactIcon = 'icon.repair'; progress = state.rooms.fireRepair[t.index]!; }
  else if (t.kind === TargetKind.Breach) { interactPrompt = 'Repair breach'; interactIcon = 'icon.repair'; progress = state.breaches.repair[t.index]!; }
  else if (t.kind === TargetKind.Power) { interactPrompt = 'Repair power'; interactIcon = 'icon.power'; progress = state.stations.repair[t.index]!; }
  else if (t.kind === TargetKind.Pickup) interactPrompt = 'Take torpedo';     // spec Coop-ii section 2
  else if (t.kind === TargetKind.Deliver) interactPrompt = 'Load torpedo';
  let confirmPrompt = '', confirmIcon: string | null = null;
  const c = confirmTarget(state, pid);
  if (c.kind === ConfirmKind.Door) { confirmPrompt = state.doors.state[c.index] === DoorState.Sealed ? 'Unseal door' : 'Seal door'; confirmIcon = 'icon.door'; }
  else if (c.kind === ConfirmKind.Console) { confirmPrompt = `Sit: ${seatName(state, c.index)}`; }
  const rv = state.run;   // a standing Confirm is a vote or the jump's second confirmation while one is open (spec Coop-ii amendment D7)
  if (rv.event >= 0 && rv.eventChoice < 0) { confirmPrompt = `Vote ${(rv.vote[pid]! + 1) % EVENT_DEFS[rv.event]!.choices.length + 1}`; confirmIcon = null; }   // the option the next press votes for, of two or three (spec Loop-v)
  else if (rv.jumpPending >= 0) { confirmPrompt = 'Agree: jump'; confirmIcon = null; }
  return { ...base, lowOxygen, lifeText: '', interactPrompt, interactIcon, confirmPrompt, confirmIcon, progress, cancelPrompt: '', seated: null, console: null, tabs: null, tabFocus: false };
}

function etaSeconds(state: SimState, slot: number): number { return Math.ceil((state.debris.impactTick[slot]! - state.tick) * DT); }

export const WEAPONS_ROWS = 6, SCIENCE_ROWS = 7;
/** The selector strip (spec Loop-iii section 4): Pulse F1 F2 F3, each filled slot's short name, Torp; the selected one lit. */
export function weaponsStrip(c: WeaponsPanel): { text: string; lit: boolean }[] {
  const items: [string, number][] = [['Pulse F1', Weapon.BeamF1], ['F2', Weapon.BeamF2], ['F3', Weapon.BeamF3], ...c.loot.map((l): [string, number] => [l.short, l.selector]), ['Torp', Weapon.Torpedo]];
  return items.map(([text, sel]) => ({ text, lit: sel === c.selector }));
}
const pct = (v: number): string => (v >= 1 ? 'READY' : `${Math.floor(v * 100)}%`);
/** The footer: the Pulse Laser's charge, the tube and the stock, LOCKED under a Science lock. */
export function weaponsFooter(c: WeaponsPanel): string {
  return weaponsFooterLines(c).join('  ');
}
/** The footer on the card's two footer lines (spec Demo-x-c section 1): the Pulse Laser and the tube, then the stock and the lock. */
export function weaponsFooterLines(c: WeaponsPanel): [string, string] {
  const t = c.torpedo, torp = t.loaded ? 'LOADED' : t.fed ? `${Math.floor(t.load * 100)}%` : t.fetch ? (t.stock > 0 ? 'FETCH' : 'EMPTY') : t.stock > 0 ? `${Math.floor(t.load * 100)}%` : 'EMPTY';
  return [`Pulse ${pct(c.charge)}  Torp ${torp}`, [`Stock ${t.stock}/${t.cap}`, ...(c.locked ? ['LOCKED'] : [])].join('  ')];
}
/** The loot line above the footer: one figure per filled extra slot (READY, a percentage, OFF below its Weapons level, EMPTY for a missile pod with no torpedo); '' with none. */
export function weaponsLootLine(c: WeaponsPanel): string {
  return c.loot.map((l) => `${l.short} ${l.empty ? 'EMPTY' : !l.powered && l.charge < 1 ? 'OFF' : pct(l.charge)}`).join('  ');
}
/** Every target-list row in order: the targets, then the SWAP row while it shows. */
export function weaponsRowTexts(c: WeaponsPanel): string[] { return [...c.targets.map((t) => targetRowText(t)), ...(c.swap ? [c.swap] : [])]; }
/** First visible row: the window starts at 0 until the cursor passes the last row, then scrolls so the cursor is the last visible row (spec Combat-i section 7). */
export function targetWindow(cursor: number, length: number, rows: number): number {
  return Math.max(0, Math.min(Math.max(cursor, 0) - rows + 1, Math.max(0, length - rows)));
}
function target(state: SimState, k: number): DebrisTarget {
  if (isEnemySlot(k)) {
    const e = state.enemy, shieldsUp = e.sysHp[EnemySystem.Shields]! > 0;
    const base = { stableId: e.stableId, kind: 'enemy' as const, room: 'Enemy ship', eta: isWarden(state) ? -1 : Math.ceil((e.departTick - state.tick) * DT),   // -1: the Warden never leaves (spec Loop-iv amendment F2)
      frequency: null as number | null, hull: null as number | null, system: null as number | null, status: null as DebrisTarget['status'], shieldsUp, layers: null as number | null, layersMax: null as number | null, weaponCharge: null as number | null, fleeSeconds: null as number | null };
    if (k === ENEMY_SLOT) return { ...base, hull: e.hull / e.maxHull, frequency: e.scanned ? e.shieldFreq : null, layers: e.shieldLayers, layersMax: enemyShieldCap(state), weaponCharge: enemyWeaponCharge(state), fleeSeconds: fleeSecondsLeft(state) };
    const sys = enemySystemOf(k), hp = e.sysHp[sys]!;
    const ion = hp > 0 ? ionSecondsLeft(state, sys) : 0;   // an ion disable's whole seconds (spec Loop-iii section 1)
    return { ...base, system: sys, status: { hp, repairIn: hp > 0 ? null : Math.ceil((e.sysRepairTick[sys]! - state.tick) / TICK_HZ), ...(ion > 0 ? { ionIn: ion } : {}) } };
  }
  const db = state.debris;
  return { stableId: db.stableId[k]!, kind: db.kind[k] === ObjectKind.Shot ? 'shot' : db.kind[k] === ObjectKind.Rock ? 'rock' : 'debris', room: state.layout.rooms[db.room[k]!]!.name, eta: etaSeconds(state, k), frequency: db.scanned[k] ? db.frequency[k]! : null, hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null };
}
/** Exact target-row strings for the Weapons and Science panels (spec Combat-i section 7). */
export function targetRowText(t: DebrisTarget, scan = 0): string {
  if (t.kind === 'enemy') {                                              // spec Combat-ii section 7
    if (t.system !== null && t.status) return t.status.hp > 0 ? `Enemy ${ENEMY_SYSTEM_NAMES[t.system]} ${Math.round(t.status.hp / ENEMY_SYS_HP * 100)}%${t.status.ionIn ? ` ION ${t.status.ionIn}s` : ''}` : `Enemy ${ENEMY_SYSTEM_NAMES[t.system]} DOWN ${t.status.repairIn}s`;
    const marker = t.shieldsUp === false ? 'S-' : t.frequency !== null ? `S${t.frequency}` : 'S?';
    const layers = t.layers ?? 0, bracket = t.shieldsUp === false ? '' : ` [${'#'.repeat(layers)}${'.'.repeat(Math.max(0, (t.layersMax ?? 0) - layers))}]`, fleeing = (t.fleeSeconds ?? 0) > 0;   // spec Demo-i section 11.4: the layers while shields are up, the weapon charge always, the flee countdown in place of the eta
    return `Enemy ${Math.round((t.hull ?? 0) * 100)}% ${fleeing ? `FLEE ${t.fleeSeconds}s ` : t.eta >= 0 ? `${t.eta}s ` : ''}${marker}${bracket}${t.frequency === null && scan > 0 ? ` ${Math.floor(scan * 100)}%` : ''}`;   // the weapon charge is the enemy window's bar (spec Demo-x-c amendment: the row fits the card at the larger font)
  }
  return `${t.kind === 'shot' ? 'Shot ' : t.kind === 'rock' ? 'Rock ' : ''}${t.room} ${t.eta}s F${t.frequency ?? '?'}${t.frequency === null && scan > 0 ? ` ${Math.floor(scan * 100)}%` : ''}`;
}

/** The lobby controls card (spec Demo-i section 3): ASCII, the real bindings of input/sources.ts. */
export const LOBBY_LINES: readonly string[] = [
  'Move: WASD or left stick      Interact: E / A      Confirm: F / X      Cancel: Q / B',
  'Keyboard 2: arrows, Enter (Interact), Right Shift (Confirm), Backspace (Cancel)',
  'Stand by a console, press Confirm to sit. Up/Down pick a row, Confirm acts, Cancel stands',
  'Hold Interact at a fire, breach, failed console or downed friend. Repairs need a bar',
  'Navigation jumps when the drive reads READY. Events and shops are chosen there',
  'Jump before the ship falls apart. Reach node 8 to win',
  'Callout: R / Slash / Y shows what you need over your head',
  'Science locks the frequency, Weapons fires. Two on one job are faster',
  'Helm: evade as a hit lands. Torpedoes are carried from the hold',
  'Events: everyone votes with Confirm. Jumps need a second Confirm'
];

/** The Skiff's helm line in place of the torpedo-carrying one: its tube loads itself, and its consoles have tabs (spec Demo-x-a sections 1 and 2). */
export const SKIFF_HELM_LINE = 'Helm: evade as a hit lands. Up from the top row, Left/Right: tabs';
/** The lobby card for the players joined so far: the cutter's card, or the Skiff's with its helm line. */
export function lobbyLines(players: number): string[] { return shipForCrew(Math.max(1, players)) === 'skiff' ? LOBBY_LINES.map((l, k) => (k === 8 ? SKIFF_HELM_LINE : l)) : [...LOBBY_LINES]; }

/** The centre notice while running, first match wins (spec Demo-i sections 4 and 11.4 rule 1b, Demo-vi section 2, Loop-ii section 2): a pending jump, a pending event, a purchase for 3 s, the encounter (won, over, contact), a surrender offer, a shop node, then the ready drive. */
export const DROP_NOTICE_SECONDS = 4, PURCHASE_NOTICE_SECONDS = 3, LOOT_NOTICE_SECONDS = 4;
/** The last weapon found, bought or sold for LOOT_NOTICE_SECONDS (spec Loop-iii section 4), else null. */
function lootLine(state: SimState): string | null {
  const w = state.weapons;
  if (w.lootTick < 0 || state.tick - w.lootTick >= LOOT_NOTICE_SECONDS * TICK_HZ) return null;
  const d = weaponDef(w.lootId);
  if (w.lootPlace === LootPlace.Sold) return `Cargo full: sold for ${Math.floor(d.price / 2)}`;
  if (w.lootBought) return `Bought: ${d.name}`;
  return `Found: ${d.name} (${w.lootPlace === LootPlace.Cargo ? 'cargo' : `slot ${w.lootPlace + 1}`})`;
}
/** Whole seconds left on an open event's vote once the first vote started it (spec Demo-x-b section 2). */
function voteSecondsLeft(state: SimState): number { const r = state.run; return r.eventOpenTick < 0 ? VOTE_SECONDS : Math.max(0, Math.ceil((r.eventOpenTick + VOTE_SECONDS * TICK_HZ - state.tick) / TICK_HZ)); }
/** One choice on the event card: its number (`1.`), its label as Navigation shows it, whether it can be taken, blue, and the players voting for it (`P1`). */
export interface EventCardChoice { number: string; text: string; enabled: boolean; blue: boolean; votes: string[] }
/** The centred event card (spec Demo-x-b section 2, FTL's event window): the title, the text rows, the numbered choices with the votes beside them, the vote's state and how to vote. */
export interface EventCard { title: string; text: string[]; choices: EventCardChoice[]; status: string; help: string }
export const EVENT_CARD_HELP = 'Press Confirm to vote   Navigation officer: pick a row';
/** The open event's card, or null when no event waits for a choice. */
export function eventCard(state: SimState): EventCard | null {
  const r = state.run;
  if (r.event < 0 || r.eventChoice >= 0) return null;
  const def = EVENT_DEFS[r.event]!;
  const voters = (k: number): string[] => { const out: string[] = []; for (let pid = 0; pid < state.playerCount; pid++) if (r.vote[pid] === k && Life.state[state.crew[pid]!] === LifeState.Conscious) out.push(`P${pid + 1}`); return out; };
  return {
    title: def.title, text: [...def.text],
    choices: def.choices.map((_, k) => ({ number: `${k + 1}.`, text: choiceLabel(state, r.event, k), enabled: choiceEnabled(state, r.event, k), blue: isBlue(r.event, k), votes: voters(k) })),
    status: r.eventOpenTick < 0 ? 'Waiting for the first vote' : `Deciding in ${voteSecondsLeft(state)}s`,
    help: EVENT_CARD_HELP
  };
}

/** The system scan's row on the Science card (spec Demo-x-b section 3): ready with the officer's chance, running with its progress, or done; the results for SCAN_RESULT_SECONDS after it finished. */
function systemRow(state: SimState, i: number): SciencePanel['system'] {
  const sc = state.science, text = sc.systemState === SystemScan.Ready ? `Scan system  (detect ${Math.round(detectChance(state, i) * 100)}%)` : sc.systemState === SystemScan.Running ? `Scanning system  ${Math.floor(sc.system * 100)}%` : 'System scanned';
  const fresh = sc.systemState === SystemScan.Done && state.tick - sc.systemTick < SCAN_RESULT_SECONDS * TICK_HZ;
  return { text, enabled: sc.systemState === SystemScan.Ready && stationOnline(state, i), results: fresh ? scanResultLines(state) : [] };
}
function cacheText(state: SimState): string { return state.science.systemResult & ScanFound.Fuel ? `+${CACHE_FUEL} fuel` : `+${scrapCache(depthOf(state))} scrap`; }
const charted = (state: SimState): number => state.science.systemResult >> 3;
/** The three result lines of the last system scan. */
export function scanResultLines(state: SimState): string[] {
  const r = state.science.systemResult, n = charted(state);
  return [r & ScanFound.Ship ? `${HIDDEN_SHIP}` : 'No hidden ship found', r & ScanFound.Cache ? `Cache found: ${cacheText(state)}` : 'No cache found', n ? `Charted ${n} beacon${n === 1 ? '' : 's'}` : 'No beacons charted'];
}
/** The notice's summary of the last system scan, SCAN_NOTICE_SECONDS after it finished, else null. */
function scanNotice(state: SimState): string | null {
  const sc = state.science, r = sc.systemResult, n = charted(state);
  if (sc.systemState !== SystemScan.Done || state.tick - sc.systemTick >= SCAN_NOTICE_SECONDS * TICK_HZ) return null;
  const parts = [...(r & ScanFound.Ship ? ['hidden ship detected'] : []), ...(r & ScanFound.Cache ? [`cache ${cacheText(state)}`] : []), ...(n ? [`${n} beacon${n === 1 ? '' : 's'} charted`] : [])];
  return `SCAN: ${parts.length ? parts.join(', ') : 'nothing found'}`;
}
export const HIDDEN_SHIP = 'Hidden ship detected: cloaked raider';
/** Whole seconds to the ambusher's contact. */
const contactSeconds = (state: SimState): number => Math.max(0, Math.ceil((state.enemy.nextArrivalTick - state.tick) / TICK_HZ));

/** The helm-offline line (spec Demo-x-b section 2): first while the Navigation station is failed or unpowered. */
export const HELM_NOTICE = 'HELM OFFLINE: repair Navigation to jump';
/** The centre notice: the helm-offline line over the first line of the ordinary notice while Navigation is down (spec Demo-x-b section 2), else the ordinary notice. */
export function runNotice(state: SimState): string[] {
  if (!helmOffline(state)) return baseNotice(state);
  const rest = baseNotice(state);
  return rest.length ? [HELM_NOTICE, rest[0]!] : [HELM_NOTICE];
}
function baseNotice(state: SimState): string[] {
  const r = state.run, e = state.enemy;
  if (r.jumpPending >= 0) return [`${r.jumpPending === EXIT_JUMP ? exitText(state) : `Jump to ${nodeLabel(beaconAt(r.jumpPending).column, beaconAt(r.jumpPending).node)}`}? (1/2)`, `Anyone standing: press Confirm to agree   ${Math.max(0, Math.ceil((r.jumpPendingTick + CONFIRM_SECONDS * TICK_HZ - state.tick) / TICK_HZ))}s`];   // spec Coop-ii section 3
  if (r.event >= 0 && r.eventChoice < 0) { const ev = EVENTS[r.event]!; return [`EVENT: ${ev.title}   ${r.eventOpenTick < 0 ? 'waiting for a vote' : `vote ${voteSecondsLeft(state)}s`}`, noticeChoices(state, r.event, (line) => textPx(line) <= NOTICE.w)]; }
  if (r.boughtTick >= 0 && state.tick - r.boughtTick < PURCHASE_NOTICE_SECONDS * TICK_HZ) return [r.boughtKind === REACTOR_ROW ? `Reactor +1 (${state.power.capacity} bars)` : `${STATION_NAMES[r.boughtKind]} upgraded to ${baseMax(state, r.boughtKind)}`];   // a purchase at the Engineering console (spec Loop-ii section 2)
  const scan = scanNotice(state); if (scan) { const k = scan.indexOf(', '); return textPx(scan) <= NOTICE.w || k < 0 ? [scan] : [scan.slice(0, k), scan.slice(k + 2)]; }   // too wide at the larger font: the findings over two lines (spec Demo-x-c section 1)   // the system scan's summary (spec Demo-x-b section 3)
  if (r.encounter === Encounter.Pending && !e.present && r.ambushState === 2) return [`${HIDDEN_SHIP}   contact ${contactSeconds(state)}s`, r.jumpCharge >= 1 ? `Jump away, or strike first: shields down ${FIRST_STRIKE_SECONDS}s` : `Strike first: its shields will be down ${FIRST_STRIKE_SECONDS}s`];
  const loot = lootLine(state), window = ENCOUNTER_NOTICE_SECONDS * TICK_HZ;   // the encounter rule (spec Demo-vi section 2): the win or the end for 8 s, the contact warning 8 s ahead
  const field = contentOf(state) === NodeType.Asteroid;   // spec Demo-viii section 1: the field's own lines
  if (r.encounter === Encounter.Won && state.tick - r.encounterTick < window) return field ? [`FIELD CLEARED   +${scrapField(depthOf(state))} scrap`, 'Drive charging fast'] : [`ENEMY DEFEATED   +${ENCOUNTER_REWARD_HULL} hull`, loot ?? 'Drive charging fast'];   // a kill's drop replaces the second line (spec Loop-iii section 4)
  if (loot) return [loot];
  if (r.encounter === Encounter.Over && state.tick - r.encounterTick < window) return field ? [] : ['Enemy gone'];   // a field is only left by a jump, which re-arms the encounter at once (amendment A3)
  if (r.encounter === Encounter.Pending && field && r.encounterTick + ENCOUNTER_START * TICK_HZ - state.tick <= window) return ['Asteroid field ahead'];
  if (r.encounter === Encounter.Pending && r.ambushState === 1) { if (e.nextArrivalTick - state.tick <= AMBUSH_WARN * TICK_HZ) return ['AMBUSH: a hidden ship decloaks!']; }   // an undetected ambusher: only AMBUSH_WARN seconds of warning (spec Demo-x-b section 3)
  else if (r.encounter === Encounter.Pending && e.nextArrivalTick - state.tick <= window) return [r.pursuitFought ? (r.event >= 0 && !overrun(state, r.column) ? 'Contact: elite ship approaching' : 'The Pursuit has caught up: elite ship approaching') : r.finalBeacon ? 'The Warden is coming about' : 'Contact: enemy ship approaching'];   // spec Loop-iv section 1: the Warden's own contact line   // spec Loop-i section 3
  if (state.weapons.torpedoDropTick >= 0 && state.tick - state.weapons.torpedoDropTick < DROP_NOTICE_SECONDS * TICK_HZ) return ['Torpedo dropped'];
  if (peaceful(state)) return ['Safe here. Jump when ready', ...readyLine(state)];   // a peaceful beacon (spec Loop-i section 4b)   // a carried torpedo lost at the cap (spec Coop-ii amendment D5)
  if (e.present && e.fleeing && e.surrenderIntact) return [`ENEMY SURRENDERS   hold fire ${fleeSecondsLeft(state)}s for +${scrapSurrender(depthOf(state))} scrap`];
  if (contentOf(state) === NodeType.Shop) return [`SHOP at ${nodeLabel(r.column, r.node)}   scrap ${r.scrap}`, `Hull +25 (30)  Torps +2 (20)  Fuel +2 (12)${r.shopWeapon ? `  ${weaponDef(r.shopWeapon).short} (${weaponDef(r.shopWeapon).price})` : ''}`];
  return readyLine(state);
}
/** The ready drive's line: someone take Navigation, or just JUMP READY when seated; nothing before it is ready. */
function readyLine(state: SimState): string[] {
  if (state.run.jumpCharge < 1 || helmOffline(state)) return [];   // no ready line while the helm is offline (spec Demo-x-b section 2)
  const nav = state.derived.stationOfKind[StationKind.Navigation]!; return nav >= 0 && state.stations.occupant[nav]! >= 0 ? ['JUMP READY'] : ['JUMP READY   someone take Navigation'];
}

function consolePanel(state: SimState, i: number, kind: number): ConsolePanel | null {
  const d = state.derived;
  if (kind === StationKind.Engineering) {
    const rows = STATION_NAMES.map((name, k) => { const si = d.stationOfKind[k]!; return { kind: k, name, level: si >= 0 ? state.stations.level[si]! : 0, max: baseMax(state, k), failed: si >= 0 && state.stations.failed[si] === 1, unpowered: unpoweredAt(state, k, si), ...thermal(state, si) }; });
    const cursor = state.stations.cursor[i]!;
    return { rows, cursor, pool: powerPool(state), coolantFree: COOLANT_POOL - coolantUsed(state), page: state.stations.page[i]!, upgrades: upgradeRowsOf(state, cursor), scrap: state.run.scrap };
  }
  if (kind === StationKind.Doors) {
    const t = doorsCursorTarget(state, state.stations.cursor[i]!);
    if (!t) return { kind: 'doors', item: null };
    const online = stationOnline(state, i), openAirlocks = state.airlocks.open.reduce((n, v) => n + v, 0), names = state.layout.rooms;
    if (t.kind === 'airlock') {
      const open = state.airlocks.open[t.index] === 1;
      return { kind: 'doors', item: `Airlock  ${names[d.airlockRoom[t.index]!]!.name}`, status: open ? 'AIRLOCK OPEN' : 'Airlock closed', action: online ? (open ? 'Close airlock' : 'Open airlock') : '', openAirlocks };
    }
    const e = t.edge, st = state.doors.state[e]!, sealed = st === DoorState.Sealed, held = st === DoorState.HeldOpen;
    // Online the remote cycle is Auto -> Sealed -> Held open -> Auto (a pending seal counts as sealed); offline it is the plain seal toggle (spec Demo-vii amendments 2 and 19).
    const pendingOrSealed = sealed || state.doors.sealRequested[e] === 1;
    const action = online ? (pendingOrSealed ? 'Hold open' : held ? 'Release' : 'Seal') : (pendingOrSealed ? 'Release' : 'Seal');
    return { kind: 'doors', item: `Door  ${names[d.edgeA[e]!]!.name} / ${names[d.edgeB[e]!]!.name}`, status: sealed ? 'Sealed' : state.doors.sealRequested[e] === 1 ? 'Sealing' : held ? 'Held open' : 'Auto', action, openAirlocks };   // a pending seal (someone in the doorway) reads Sealing (Codex render review 2)
  }
  if (kind === StationKind.Weapons) {
    const slots = warnedTargets(state), c = state.stations.cursor[i]!, w = state.weapons, swap = canSwap(state), cursor = swap && c === SWAP_SLOT ? slots.length : slots.indexOf(c);
    const loot: LootSlotView[] = []; for (let k = 0; k < WEAPON_SLOTS; k++) { const id = w.slot[k]!; if (id) loot.push({ selector: Weapon.Slot1 + k, short: weaponDef(id).short, charge: w.charge2[k]!, powered: state.stations.level[i]! >= SLOT_LEVELS[k]!, empty: weaponDef(id).kind === 'missile' && w.torpedoStock <= 0 }); }
    const rows = loot.length ? WEAPONS_ROWS - 1 : WEAPONS_ROWS, swapText = swap ? `SWAP: cargo ${weaponDef(w.cargo).short} for ${weaponDef(w.slot[swapSlot(state)]!).short}` : null;
    return { kind: 'weapons', charge: w.charge, selector: w.selector, torpedo: { stock: w.torpedoStock, cap: TORP_CAP, loaded: w.torpedoLoaded === 1, load: w.torpedoLoad, fetch: state.derived.magazineTile >= 0 && w.torpedoLoaded === 0 && w.torpedoFed === 0, fed: w.torpedoFed === 1 }, targets: slots.map((k) => target(state, k)), cursor, first: targetWindow(cursor, slots.length + (swap ? 1 : 0), rows), locked: lockActive(state), loot, swap: swapText, rows };
  }
  if (kind === StationKind.Science) {
    const slots = warnedTargets(state), c = state.stations.cursor[i]!, cursor = c < 0 ? slots.length : slots.indexOf(c), system = systemRow(state, i);   // the cursor -1 is the system row (spec Demo-x-b section 3)
    return { kind: 'science', leadSeconds: scienceLead(state), targets: slots.map((k) => ({ ...target(state, k), scan: k === ENEMY_SLOT ? state.enemy.scan : isEnemySlot(k) ? 0 : state.debris.scan[k]! })), cursor, first: targetWindow(cursor, slots.length + 1 + system.results.length, SCIENCE_ROWS), scanning: state.science.scanning === 1, lock: lockActive(state) ? `LOCKED ${lockSecondsLeft(state)}s` : canLock(state, i) ? 'LOCK: Confirm' : '', system };
  }
  if (kind === StationKind.Navigation) {
    const r = state.run, rows = navRows(state), c0 = state.stations.cursor[i]!, c = rows[c0] && rows[c0]!.select !== 'none' ? c0 : rows.findIndex((row) => row.select !== 'none');   // c: the highlighted row, the first selectable one while the sim cursor still sits on a header   // spec Run-ii 9: the event, shop or destination rows, the cursor row, the jump state and scrap
    return { kind: 'navigation', evadeChance: evadeChance(stationOutput(state, i), state.tick < r.evadeUntilTick), jump: { charge: r.jumpCharge, ready: r.jumpCharge >= 1 }, here: nodeLabel(r.column, r.node), fuel: r.fuel, fuelAfter: rows[c] && (rows[c]!.select === 'jump' || rows[c]!.select === 'sector') ? r.fuel - 1 : null, rows: rows.map((row, k) => ({ text: row.text, selectable: row.select !== 'none', enabled: row.enabled, cursor: k === c, blue: row.blue === true })), first: targetWindow(c, rows.length, 7), scrap: r.scrap };
  }
  return null;
}

function clock(seconds: number): string { const whole = Math.floor(seconds); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`; }

/** The six headline lines of the game-over summary (spec 4-ii section 7, Run-iii section 6, Coop-i section 4). */
function headlineSummary(state: SimState): string[] {
  const t = state.telemetry, names = state.crew.map((_, pid) => characterOf(state, pid).name);
  const event = (tick: number, pid: number) => (tick < 0 ? 'none' : `${names[pid]} ${clock(eventSeconds(tick))}`);
  const never: string[] = [];
  for (let k = 0; k < STATION_NAMES.length; k++) if (state.derived.stationOfKind[k]! >= 0 && t.mannedTicks[k] === 0) never.push(STATION_NAMES[k]!);
  return [
    `Survived ${clock(state.tick / TICK_HZ)}  ${state.endReason === EndReason.Hull ? 'HULL LOST' : state.endReason === EndReason.Victory ? 'VICTORY' : 'CREW LOST'}  Reached sector ${state.run.sector + 1} node ${state.run.column + 1}  Score ${telemetryRecord(state, 0).score}`,
    `First down: ${event(t.firstDownTick, t.firstDownPid)}   First death: ${event(t.firstDeathTick, t.firstDeathPid)}`,
    never.length ? `Never manned: ${never.join(', ')}` : 'Every station manned',
    `Longest idle: ${names.map((n, pid) => `${n} ${Math.round(durationSeconds(t.longestIdle[pid]!))} s`).join(', ')}`,
    `Ship: ${QUIRK_NAMES[state.run.quirk]}`,
    `Teamwork  locked shots ${t.lockedShots}  shared repairs ${Math.round(t.teamSeconds)}s  revives ${t.revives}`
  ];
}

/** Best, runs and victories, then the fresh unlocks (spec Run-iii section 6); nothing without progress. */
function progressSummary(p: HudProgress | null): string[] {
  if (!p) return [];
  const lines = [`Best ${p.bestScore}   Runs ${p.runs}   Victories ${p.victories}`];
  if (p.newUnlocks.length) lines.push(`Unlocked: ${p.newUnlocks.join(', ')}`);
  return lines;
}

function gainsSummary(state: SimState): string[] {
  return state.crew.map((_, pid) => {
    const c = characterOf(state, pid), parts: string[] = [];
    for (let k = 0; k < SKILL_COUNT; k++) {
      const base = c.headStart.find((h) => h.skill === k)?.level ?? 0, now = skillLevelOf(state, pid, k);
      if (now > base) parts.push(`${SKILL_NAMES[k]} ${base} -> ${now}`);
    }
    return `${c.name}: ${parts.length ? parts.join(', ') : 'no skill gains'}`;
  });
}

export interface HudProgress { bestScore: number; runs: number; victories: number; newUnlocks: string[]; unlocked: string[] }

export function buildHudModel(state: SimState | null, slots: SlotInfo[], phase: HudModel['phase'], message: string, credits: { lines: readonly string[]; scroll: number } | null = null, progress: HudProgress | null = null, calloutFlash: readonly number[] = []): HudModel {
  const players: HudPlayer[] = slots.map((slot, pid) => {
    const head = { pid, status: slot.status, deviceKind: slot.status === 'active' ? deviceKindOf(slot.key) : null };
    if (!state || pid >= state.playerCount) return { ...head, ...EMPTY, skills: [0, 0, 0, 0, 0, 0], character: describe(CHARACTERS[DEFAULT_CHARACTERS[pid] ?? RECRUIT]!) };
    return { ...head, ...player(state, pid) };
  });
  const threats: HudThreat[] = [];
  if (state) {
    if (helmOffline(state)) threats.push({ icon: 'icon.power', text: 'Helm offline' });   // first (spec Demo-x-b section 2)
    if (state.run.ambushState === 2 && state.run.encounter === Encounter.Pending && !state.enemy.present) threats.push({ icon: 'icon.weapons', text: `Hidden ship: contact ${contactSeconds(state)}s` });   // a detected ambusher (spec Demo-x-b section 3)
    if (state.enemy.present) {   // two rows at the larger font (spec Demo-x-c section 1): the hull, shields and flight; then the other systems that are down
      const e = state.enemy, down = ENEMY_SYSTEM_NAMES.filter((_, sys) => sys !== EnemySystem.Shields && e.sysHp[sys] === 0);
      threats.push({ icon: 'icon.weapons', text: `Enemy ${Math.round(e.hull / e.maxHull * 100)}% shields ${e.sysHp[EnemySystem.Shields]! > 0 ? `${e.shieldLayers}/${enemyShieldCap(state)}` : 'DOWN'}${e.fleeing ? ' FLEEING' : ''}` });
      if (down.length) threats.push({ icon: 'icon.weapons', text: `Down: ${down.join(' ')}` });
    }
    for (let r = 0; r < state.layout.rooms.length; r++) { const n = boardersInRoom(state, r).length; if (n) threats.push({ icon: 'icon.sensors', text: `Boarders: ${state.layout.rooms[r]!.name} x${n}` }); }
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) threats.push({ icon: 'icon.fire', text: `Fire: ${state.layout.rooms[r]!.name}` });
    for (let s = 0; s < state.breaches.active.length; s++) if (state.breaches.active[s]) threats.push({ icon: 'icon.breach', text: `Breach: ${state.layout.rooms[state.derived.siteRoom[s]!]!.name}` });
    for (let a = 0; a < state.airlocks.open.length; a++) if (state.airlocks.open[a]) threats.push({ icon: 'icon.breach', text: `Airlock open: ${state.layout.rooms[state.derived.airlockRoom[a]!]!.name}` });
    for (let i = 0; i < state.stations.failed.length; i++) if (state.stations.failed[i]) threats.push({ icon: 'icon.power', text: `Power: ${STATION_NAMES[state.derived.stationKind[i]!]}` });
    for (const k of warnedTargets(state)) { if (isEnemySlot(k)) continue; const label = state.debris.kind[k] === ObjectKind.Shot ? 'Shot' : state.debris.kind[k] === ObjectKind.Rock ? 'Rock' : 'Debris'; threats.push({ icon: 'icon.sensors', text: `${label}: ${state.layout.rooms[state.debris.room[k]!]!.name} ${etaSeconds(state, k)}s${state.debris.scanned[k] ? ` F${state.debris.frequency[k]}` : ''}` }); }
    if (state.run.event >= 0 && state.run.eventChoice < 0) threats.push({ icon: 'icon.sensors', text: `Event: ${EVENTS[state.run.event]!.title}` });   // spec Demo-i section 4: the run rows trail the hazards (the notice carries them)
    if (contentOf(state) === NodeType.Shop) threats.push({ icon: 'icon.sensors', text: 'Shop here' });
  }
  const stations: HudStation[] = state ? Array.from(state.derived.stationKind, (kind, i) => ({ kind, name: STATION_NAMES[kind]!, level: state.stations.level[i]!, max: baseMax(state, kind), online: stationOnline(state, i), occupant: state.stations.occupant[i]! >= 0 ? state.stations.occupant[i]! : null, unpowered: unpoweredAt(state, kind, i), icon: ICON_KINDS[kind]!, iconTint: stationTint(state, i), ...thermal(state, i) })) : [];
  const power = state ? { capacity: powerCapacity(state), used: powerUsed(state) } : { capacity: 0, used: 0 };
  return { phase, message, hull: state?.hull ?? 0, simSeconds: state ? Math.floor(state.tick / TICK_HZ) : 0, tick: state?.tick ?? 0, threats, boarders: state ? boarderMarkers(state) : [], power, stations, weapons: state ? { charge: state.weapons.charge, ready: state.weapons.charge >= 1, torpedoLoaded: state.weapons.torpedoLoaded === 1, torpedoStock: state.weapons.torpedoStock } : { charge: 0, ready: false, torpedoLoaded: false, torpedoStock: 0 }, impactTick: state ? Array.from(state.rooms.impactTick) : [], map: mapBlock(state, phase), players, progressLine: phase === 'lobby' && progress ? `Runs ${progress.runs}  Best ${progress.bestScore}${progress.unlocked.length ? `  Unlocked: ${progress.unlocked.join(', ')}` : ''}` : '', summary: state && phase === 'gameover' ? [...headlineSummary(state), ...progressSummary(progress), ...gainsSummary(state)] : null, credits: credits ? [...credits.lines] : null, creditsScroll: credits?.scroll ?? 0, director: state ? { phase: PHASE_NAMES[state.director.phase]!, stress: state.director.stress } : { phase: PHASE_NAMES[0]!, stress: 0 }, run: { column: state ? state.run.column : 0, columns: SECTOR_COLUMNS, sector: state ? state.run.sector : 0, fuel: state ? state.run.fuel : 0, quirk: state ? QUIRK_NAMES[state.run.quirk]! : '' }, lobbyLines: phase === 'lobby' ? lobbyLines(slots.filter((sl) => sl.status !== 'empty').length) : [], lobbyShip: phase === 'lobby' ? shipLine(slots.filter((sl) => sl.status !== 'empty').length) : '', notice: state && phase === 'running' ? runNotice(state) : [], eventCard: state && phase === 'running' ? eventCard(state) : null, calloutFlash: state && phase === 'running' ? [...calloutFlash] : [] };
}
