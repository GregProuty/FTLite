import type { SimState } from '../sim/state';
import { Health, Life, LifeState, Position, Seated } from '../sim/components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../sim/interact';
import { DoorState, conditionRoomAt } from '../sim/grid';
import { TICK_HZ, STATION_MAX, DT, EVADE_BASE, EVADE_SCALE, HEAT_MAX, COOLANT_POOL, TORP_CAP, SKILL_COUNT, ENEMY_HULL, ENEMY_SYS_HP, BOARDER_HEALTH } from '../sim/tuning';
import { skillLevelOf, SKILL_NAMES } from '../sim/skills';
import { CHARACTERS, DEFAULT_CHARACTERS, RECRUIT, characterOf, ASSET_NAMES, COMPLICATION_NAMES, type Character } from '../sim/characters';
import { StationKind, STATION_NAMES } from '../sim/stationKinds';
import { stationOnline, stationOutput } from '../sim/stations';
import { scienceLead, ObjectKind } from '../sim/debris';
import { warnedTargets, ENEMY_SLOT, isEnemySlot, enemySystemOf } from '../sim/debrisTargets';
import { EnemySystem, ENEMY_SYSTEM_NAMES } from '../sim/enemy';
import { powerUsed, powerPool, powerCapacity } from '../sim/power';
import { isOverdriven, coolantUsed } from '../sim/heat';
import type { SlotInfo, SlotStatus } from '../input/deviceManager';
import { PHASE_NAMES } from '../sim/director';
import { durationSeconds, eventSeconds } from '../sim/telemetry';
import { EndReason } from '../sim/crew';
import { boarderMarkers, boardersInRoom } from '../sim/boarders';

export type DeviceKind = 'kb0' | 'kb1' | 'pad' | null;
export type HudAction = 'interact' | 'confirm' | 'cancel';
export interface HudCharacter { name: string; asset: string; complication: string }
export interface HudPlayer {
  pid: number; status: SlotStatus; deviceKind: DeviceKind;
  health: number; life: number; bleed: number; lowOxygen: boolean;
  lifeText: string; skills: number[]; character: HudCharacter;
  interactPrompt: string; interactIcon: string | null;
  confirmPrompt: string; confirmIcon: string | null;
  progress: number;
  seated: number | null; console: ConsolePanel | null; cancelPrompt: string;
}
function thermal(state: SimState, i: number): { heat: number; coolant: number; overdriven: boolean } {
  return i < 0 ? { heat: 0, coolant: 0, overdriven: false } : { heat: state.stations.heat[i]! / HEAT_MAX, coolant: state.stations.coolant[i]!, overdriven: isOverdriven(state, i) };
}
export interface EngineeringPanel { rows: { kind: number; name: string; level: number; max: number; failed: boolean; heat: number; coolant: number; overdriven: boolean }[]; cursor: number; pool: number; coolantFree: number }
export type DoorsPanel = { doorIndex: number; rooms: [string, string] } | { doorIndex: -1 };
export type TargetKindName = 'debris' | 'shot' | 'enemy';
export interface DebrisTarget { stableId: number; kind: TargetKindName; room: string; eta: number; frequency: number | null; hull: number | null; system: number | null; status: { hp: number; repairIn: number | null } | null; shieldsUp: boolean | null }
export interface WeaponsPanel { kind: 'weapons'; charge: number; selector: number; torpedo: { stock: number; cap: number; loaded: boolean; load: number }; targets: DebrisTarget[]; cursor: number; first: number }
export interface SciencePanel { kind: 'science'; leadSeconds: number; targets: (DebrisTarget & { scan: number })[]; cursor: number; first: number; scanning: boolean }
export interface NavigationPanel { kind: 'navigation'; evadeChance: number }
export type ConsolePanel = EngineeringPanel | DoorsPanel | WeaponsPanel | SciencePanel | NavigationPanel;
export interface HudStation { kind: number; name: string; level: number; max: number; online: boolean; occupant: number | null; heat: number; coolant: number; overdriven: boolean }
export interface HudThreat { icon: 'icon.fire' | 'icon.breach' | 'icon.power' | 'icon.sensors' | 'icon.weapons'; text: string }
export interface HudModel {
  phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number; tick: number;
  threats: HudThreat[]; boarders: { stableId: number; x: number; y: number; health: number }[]; power: { capacity: number; used: number }; stations: HudStation[]; weapons: { charge: number; ready: boolean; torpedoLoaded: boolean; torpedoStock: number }; impactTick: number[];
  players: HudPlayer[]; summary: string[] | null; credits: string[] | null; creditsScroll: number;
  director: { phase: string; stress: number };
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

const EMPTY: Omit<HudPlayer, 'pid' | 'status' | 'deviceKind'> = { health: 0, life: 0, bleed: 0, lowOxygen: false, lifeText: '', interactPrompt: '', interactIcon: null, confirmPrompt: '', confirmIcon: null, progress: 0, seated: null, console: null, cancelPrompt: '', skills: [0, 0, 0, 0, 0, 0], character: describe(CHARACTERS[RECRUIT]!) };

function player(state: SimState, pid: number): Omit<HudPlayer, 'pid' | 'status' | 'deviceKind'> {
  const eid = state.crew[pid]!;
  const skills = Array.from({ length: SKILL_COUNT }, (_, k) => skillLevelOf(state, pid, k));
  const base = { health: Health.cur[eid]!, life: Life.state[eid]!, bleed: Life.bleed[eid]!, skills, character: describe(characterOf(state, pid)) };
  const r = conditionRoomAt(state, Position.x[eid]!, Position.y[eid]!);
  const lowOxygen = r >= 0 && state.rooms.o2[r]! / state.derived.volume[r]! < HUD_LOW_O2_FRAC;
  if (Life.state[eid] === LifeState.Downed) return { ...EMPTY, ...base, lowOxygen, lifeText: `DOWNED ${Math.ceil(Life.bleed[eid]!)}s`, progress: Life.reviveProgress[eid]! };
  if (Life.state[eid] === LifeState.Dead) return { ...EMPTY, ...base, lowOxygen, lifeText: 'DEAD' };
  const seatedAt = Seated.station[eid]!;
  if (seatedAt >= 0) {
    const kind = state.derived.stationKind[seatedAt]!;
    return { ...base, lowOxygen, lifeText: '', interactPrompt: '', interactIcon: null, confirmPrompt: '', confirmIcon: null, cancelPrompt: 'Stand', progress: 0, seated: kind, console: consolePanel(state, seatedAt, kind) };
  }
  let interactPrompt = '', interactIcon: string | null = null, progress = 0;
  const t = interactTarget(state, pid);
  if (t.kind === TargetKind.Fight) { interactPrompt = 'Fight boarder'; progress = state.boarders.health[t.index]! / BOARDER_HEALTH; }
  else if (t.kind === TargetKind.Revive) { interactPrompt = `Revive P${t.index + 1}`; progress = Life.reviveProgress[state.crew[t.index]!]!; }
  else if (t.kind === TargetKind.Fire) { interactPrompt = 'Repair fire'; interactIcon = 'icon.repair'; progress = state.rooms.fireRepair[t.index]!; }
  else if (t.kind === TargetKind.Breach) { interactPrompt = 'Repair breach'; interactIcon = 'icon.repair'; progress = state.breaches.repair[t.index]!; }
  else if (t.kind === TargetKind.Power) { interactPrompt = 'Repair power'; interactIcon = 'icon.power'; progress = state.stations.repair[t.index]!; }
  let confirmPrompt = '', confirmIcon: string | null = null;
  const c = confirmTarget(state, pid);
  if (c.kind === ConfirmKind.Door) { confirmPrompt = state.doors.state[c.index] === DoorState.Sealed ? 'Unseal door' : 'Seal door'; confirmIcon = 'icon.door'; }
  else if (c.kind === ConfirmKind.Console) { confirmPrompt = `Sit: ${STATION_NAMES[state.derived.stationKind[c.index]!]}`; }
  return { ...base, lowOxygen, lifeText: '', interactPrompt, interactIcon, confirmPrompt, confirmIcon, progress, cancelPrompt: '', seated: null, console: null };
}

function etaSeconds(state: SimState, slot: number): number { return Math.ceil((state.debris.impactTick[slot]! - state.tick) * DT); }

export const WEAPONS_ROWS = 6, SCIENCE_ROWS = 7;
/** First visible row: the window starts at 0 until the cursor passes the last row, then scrolls so the cursor is the last visible row (spec Combat-i section 7). */
export function targetWindow(cursor: number, length: number, rows: number): number {
  return Math.max(0, Math.min(Math.max(cursor, 0) - rows + 1, Math.max(0, length - rows)));
}
function target(state: SimState, k: number): DebrisTarget {
  if (isEnemySlot(k)) {
    const e = state.enemy, shieldsUp = e.sysHp[EnemySystem.Shields]! > 0;
    const base = { stableId: e.stableId, kind: 'enemy' as const, room: 'Enemy ship', eta: Math.ceil((e.departTick - state.tick) * DT), frequency: null as number | null, hull: null as number | null, system: null as number | null, status: null as DebrisTarget['status'], shieldsUp };
    if (k === ENEMY_SLOT) return { ...base, hull: e.hull / ENEMY_HULL, frequency: e.scanned ? e.shieldFreq : null };
    const sys = enemySystemOf(k), hp = e.sysHp[sys]!;
    return { ...base, system: sys, status: { hp, repairIn: hp > 0 ? null : Math.ceil((e.sysRepairTick[sys]! - state.tick) / TICK_HZ) } };
  }
  const db = state.debris;
  return { stableId: db.stableId[k]!, kind: db.kind[k] === ObjectKind.Shot ? 'shot' : 'debris', room: state.layout.rooms[db.room[k]!]!.name, eta: etaSeconds(state, k), frequency: db.scanned[k] ? db.frequency[k]! : null, hull: null, system: null, status: null, shieldsUp: null };
}
/** Exact target-row strings for the Weapons and Science panels (spec Combat-i section 7). */
export function targetRowText(t: DebrisTarget, scan = 0): string {
  if (t.kind === 'enemy') {                                              // spec Combat-ii section 7
    if (t.system !== null && t.status) return t.status.hp > 0 ? `Enemy ${ENEMY_SYSTEM_NAMES[t.system]} ${Math.round(t.status.hp / ENEMY_SYS_HP * 100)}%` : `Enemy ${ENEMY_SYSTEM_NAMES[t.system]} DOWN ${t.status.repairIn}s`;
    const marker = t.shieldsUp === false ? 'S-' : t.frequency !== null ? `S${t.frequency}` : 'S?';
    return `Enemy ${Math.round((t.hull ?? 0) * 100)}% ${t.eta}s ${marker}${t.frequency === null && scan > 0 ? ` ${Math.floor(scan * 100)}%` : ''}`;
  }
  return `${t.kind === 'shot' ? 'Shot ' : ''}${t.room} ${t.eta}s F${t.frequency ?? '?'}${t.frequency === null && scan > 0 ? ` ${Math.floor(scan * 100)}%` : ''}`;
}

function consolePanel(state: SimState, i: number, kind: number): ConsolePanel | null {
  const d = state.derived;
  if (kind === StationKind.Engineering) {
    const rows = STATION_NAMES.map((name, k) => { const si = d.stationOfKind[k]!; return { kind: k, name, level: si >= 0 ? state.stations.level[si]! : 0, max: STATION_MAX[k]!, failed: si >= 0 && state.stations.failed[si] === 1, ...thermal(state, si) }; });
    return { rows, cursor: state.stations.cursor[i]!, pool: powerPool(state), coolantFree: COOLANT_POOL - coolantUsed(state) };
  }
  if (kind === StationKind.Doors) {
    const c = state.stations.cursor[i]!;
    if (c < 0) return { doorIndex: -1 };
    const e = d.doorEdges[c]!;
    return { doorIndex: c, rooms: [state.layout.rooms[d.edgeA[e]!]!.name, state.layout.rooms[d.edgeB[e]!]!.name] };
  }
  if (kind === StationKind.Weapons) {
    const slots = warnedTargets(state), c = state.stations.cursor[i]!, w = state.weapons, cursor = slots.indexOf(c);
    return { kind: 'weapons', charge: w.charge, selector: w.selector, torpedo: { stock: w.torpedoStock, cap: TORP_CAP, loaded: w.torpedoLoaded === 1, load: w.torpedoLoad }, targets: slots.map((k) => target(state, k)), cursor, first: targetWindow(cursor, slots.length, WEAPONS_ROWS) };
  }
  if (kind === StationKind.Science) {
    const slots = warnedTargets(state), c = state.stations.cursor[i]!, cursor = slots.indexOf(c);
    return { kind: 'science', leadSeconds: scienceLead(state), targets: slots.map((k) => ({ ...target(state, k), scan: k === ENEMY_SLOT ? state.enemy.scan : isEnemySlot(k) ? 0 : state.debris.scan[k]! })), cursor, first: targetWindow(cursor, slots.length, SCIENCE_ROWS), scanning: state.science.scanning === 1 };
  }
  if (kind === StationKind.Navigation) return { kind: 'navigation', evadeChance: EVADE_BASE + EVADE_SCALE * stationOutput(state, i) };
  return null;
}

function clock(seconds: number): string { const whole = Math.floor(seconds); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`; }

/** The four headline lines of the game-over summary (spec 4-ii section 7). */
function headlineSummary(state: SimState): string[] {
  const t = state.telemetry, names = state.crew.map((_, pid) => characterOf(state, pid).name);
  const event = (tick: number, pid: number) => (tick < 0 ? 'none' : `${names[pid]} ${clock(eventSeconds(tick))}`);
  const never: string[] = [];
  for (let k = 0; k < STATION_NAMES.length; k++) if (state.derived.stationOfKind[k]! >= 0 && t.mannedTicks[k] === 0) never.push(STATION_NAMES[k]!);
  return [
    `Survived ${clock(state.tick / TICK_HZ)}  ${state.endReason === EndReason.Hull ? 'HULL LOST' : 'CREW LOST'}`,
    `First down: ${event(t.firstDownTick, t.firstDownPid)}   First death: ${event(t.firstDeathTick, t.firstDeathPid)}`,
    never.length ? `Never manned: ${never.join(', ')}` : 'Every station manned',
    `Longest idle: ${names.map((n, pid) => `${n} ${Math.round(durationSeconds(t.longestIdle[pid]!))} s`).join(', ')}`
  ];
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

export function buildHudModel(state: SimState | null, slots: SlotInfo[], phase: HudModel['phase'], message: string, credits: { lines: readonly string[]; scroll: number } | null = null): HudModel {
  const players: HudPlayer[] = slots.map((slot, pid) => {
    const head = { pid, status: slot.status, deviceKind: slot.status === 'active' ? deviceKindOf(slot.key) : null };
    if (!state || pid >= state.playerCount) return { ...head, ...EMPTY, skills: [0, 0, 0, 0, 0, 0], character: describe(CHARACTERS[DEFAULT_CHARACTERS[pid] ?? RECRUIT]!) };
    return { ...head, ...player(state, pid) };
  });
  const threats: HudThreat[] = [];
  if (state) {
    if (state.enemy.present) threats.push({ icon: 'icon.weapons', text: `Enemy ship: hull ${Math.round(state.enemy.hull / ENEMY_HULL * 100)}%${ENEMY_SYSTEM_NAMES.map((name, sys) => (state.enemy.sysHp[sys] === 0 ? ` ${name} DOWN` : '')).join('')}` });
    for (let r = 0; r < state.layout.rooms.length; r++) { const n = boardersInRoom(state, r).length; if (n) threats.push({ icon: 'icon.sensors', text: `Boarders: ${state.layout.rooms[r]!.name} x${n}` }); }
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) threats.push({ icon: 'icon.fire', text: `Fire: ${state.layout.rooms[r]!.name}` });
    for (let s = 0; s < state.breaches.active.length; s++) if (state.breaches.active[s]) threats.push({ icon: 'icon.breach', text: `Breach: ${state.layout.rooms[state.derived.siteRoom[s]!]!.name}` });
    for (let i = 0; i < state.stations.failed.length; i++) if (state.stations.failed[i]) threats.push({ icon: 'icon.power', text: `Power: ${STATION_NAMES[state.derived.stationKind[i]!]}` });
    for (const k of warnedTargets(state)) { if (isEnemySlot(k)) continue; const label = state.debris.kind[k] === ObjectKind.Shot ? 'Shot' : 'Debris'; threats.push({ icon: 'icon.sensors', text: `${label}: ${state.layout.rooms[state.debris.room[k]!]!.name} ${etaSeconds(state, k)}s${state.debris.scanned[k] ? ` F${state.debris.frequency[k]}` : ''}` }); }
  }
  const stations: HudStation[] = state ? Array.from(state.derived.stationKind, (kind, i) => ({ kind, name: STATION_NAMES[kind]!, level: state.stations.level[i]!, max: STATION_MAX[kind]!, online: stationOnline(state, i), occupant: state.stations.occupant[i]! >= 0 ? state.stations.occupant[i]! : null, ...thermal(state, i) })) : [];
  const power = state ? { capacity: powerCapacity(state), used: powerUsed(state) } : { capacity: 0, used: 0 };
  return { phase, message, hull: state?.hull ?? 0, simSeconds: state ? Math.floor(state.tick / TICK_HZ) : 0, tick: state?.tick ?? 0, threats, boarders: state ? boarderMarkers(state) : [], power, stations, weapons: state ? { charge: state.weapons.charge, ready: state.weapons.charge >= 1, torpedoLoaded: state.weapons.torpedoLoaded === 1, torpedoStock: state.weapons.torpedoStock } : { charge: 0, ready: false, torpedoLoaded: false, torpedoStock: 0 }, impactTick: state ? Array.from(state.rooms.impactTick) : [], players, summary: state && phase === 'gameover' ? [...headlineSummary(state), ...gainsSummary(state)] : null, credits: credits ? [...credits.lines] : null, creditsScroll: credits?.scroll ?? 0, director: state ? { phase: PHASE_NAMES[state.director.phase]!, stress: state.director.stress } : { phase: PHASE_NAMES[0]!, stress: 0 } };
}
