import type { SimState } from '../sim/state';
import { Health, Life, LifeState, Position, Seated } from '../sim/components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../sim/interact';
import { DoorState, conditionRoomAt } from '../sim/grid';
import { TICK_HZ, STATION_MAX, DT, EVADE_BASE, EVADE_SCALE } from '../sim/tuning';
import { StationKind, STATION_NAMES } from '../sim/stationKinds';
import { stationOnline, stationOutput } from '../sim/stations';
import { scienceLead } from '../sim/debris';
import { warnedTargets } from '../sim/debrisTargets';
import { powerUsed } from '../sim/power';
import type { SlotInfo, SlotStatus } from '../input/deviceManager';

export type DeviceKind = 'kb0' | 'kb1' | 'pad' | null;
export type HudAction = 'interact' | 'confirm' | 'cancel';
export interface HudPlayer {
  pid: number; status: SlotStatus; deviceKind: DeviceKind;
  health: number; life: number; bleed: number; lowOxygen: boolean;
  lifeText: string;
  interactPrompt: string; interactIcon: string | null;
  confirmPrompt: string; confirmIcon: string | null;
  progress: number;
  seated: number | null; console: ConsolePanel | null; cancelPrompt: string;
}
export interface EngineeringPanel { rows: { kind: number; name: string; level: number; max: number; failed: boolean }[]; cursor: number; pool: number }
export type DoorsPanel = { doorIndex: number; rooms: [string, string] } | { doorIndex: -1 };
export interface WeaponsPanel { kind: 'weapons'; charge: number; targets: { stableId: number; room: string; eta: number }[]; cursor: number }
export interface SciencePanel { kind: 'science'; leadSeconds: number; warnedCount: number }
export interface NavigationPanel { kind: 'navigation'; evadeChance: number }
export type ConsolePanel = EngineeringPanel | DoorsPanel | WeaponsPanel | SciencePanel | NavigationPanel;
export interface HudStation { kind: number; name: string; level: number; max: number; online: boolean; occupant: number | null }
export interface HudThreat { icon: 'icon.fire' | 'icon.breach' | 'icon.power' | 'icon.sensors'; text: string }
export interface HudModel {
  phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number; tick: number;
  threats: HudThreat[]; power: { capacity: number; used: number }; stations: HudStation[]; weapons: { charge: number; ready: boolean }; impactTick: number[];
  players: HudPlayer[]; credits: string[] | null; creditsScroll: number;
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

const EMPTY = { health: 0, life: 0, bleed: 0, lowOxygen: false, lifeText: '', interactPrompt: '', interactIcon: null, confirmPrompt: '', confirmIcon: null, progress: 0, seated: null, console: null, cancelPrompt: '' } as const;

function player(state: SimState, pid: number): Omit<HudPlayer, 'pid' | 'status' | 'deviceKind'> {
  const eid = state.crew[pid]!;
  const base = { health: Health.cur[eid]!, life: Life.state[eid]!, bleed: Life.bleed[eid]! };
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
  if (t.kind === TargetKind.Revive) { interactPrompt = `Revive P${t.index + 1}`; progress = Life.reviveProgress[state.crew[t.index]!]!; }
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

function consolePanel(state: SimState, i: number, kind: number): ConsolePanel | null {
  const d = state.derived;
  if (kind === StationKind.Engineering) {
    const rows = STATION_NAMES.map((name, k) => { const si = d.stationOfKind[k]!; return { kind: k, name, level: si >= 0 ? state.stations.level[si]! : 0, max: STATION_MAX[k]!, failed: si >= 0 && state.stations.failed[si] === 1 }; });
    return { rows, cursor: state.stations.cursor[i]!, pool: state.power.capacity - powerUsed(state) };
  }
  if (kind === StationKind.Doors) {
    const c = state.stations.cursor[i]!;
    if (c < 0) return { doorIndex: -1 };
    const e = d.doorEdges[c]!;
    return { doorIndex: c, rooms: [state.layout.rooms[d.edgeA[e]!]!.name, state.layout.rooms[d.edgeB[e]!]!.name] };
  }
  if (kind === StationKind.Weapons) {
    const slots = warnedTargets(state), c = state.stations.cursor[i]!;
    const targets = slots.map((k) => ({ stableId: state.debris.stableId[k]!, room: state.layout.rooms[state.debris.room[k]!]!.name, eta: etaSeconds(state, k) }));
    return { kind: 'weapons', charge: state.weapons.charge, targets, cursor: slots.indexOf(c) };
  }
  if (kind === StationKind.Science) return { kind: 'science', leadSeconds: scienceLead(state), warnedCount: warnedTargets(state).length };
  if (kind === StationKind.Navigation) return { kind: 'navigation', evadeChance: EVADE_BASE + EVADE_SCALE * stationOutput(state, i) };
  return null;
}

export function buildHudModel(state: SimState | null, slots: SlotInfo[], phase: HudModel['phase'], message: string, credits: { lines: readonly string[]; scroll: number } | null = null): HudModel {
  const players: HudPlayer[] = slots.map((slot, pid) => {
    const head = { pid, status: slot.status, deviceKind: slot.status === 'active' ? deviceKindOf(slot.key) : null };
    if (!state || pid >= state.playerCount) return { ...head, ...EMPTY };
    return { ...head, ...player(state, pid) };
  });
  const threats: HudThreat[] = [];
  if (state) {
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) threats.push({ icon: 'icon.fire', text: `Fire: ${state.layout.rooms[r]!.name}` });
    for (let s = 0; s < state.breaches.active.length; s++) if (state.breaches.active[s]) threats.push({ icon: 'icon.breach', text: `Breach: ${state.layout.rooms[state.derived.siteRoom[s]!]!.name}` });
    for (let i = 0; i < state.stations.failed.length; i++) if (state.stations.failed[i]) threats.push({ icon: 'icon.power', text: `Power: ${STATION_NAMES[state.derived.stationKind[i]!]}` });
    for (const k of warnedTargets(state)) threats.push({ icon: 'icon.sensors', text: `Debris: ${state.layout.rooms[state.debris.room[k]!]!.name} ${etaSeconds(state, k)}s` });
  }
  const stations: HudStation[] = state ? Array.from(state.derived.stationKind, (kind, i) => ({ kind, name: STATION_NAMES[kind]!, level: state.stations.level[i]!, max: STATION_MAX[kind]!, online: stationOnline(state, i), occupant: state.stations.occupant[i]! >= 0 ? state.stations.occupant[i]! : null })) : [];
  const power = state ? { capacity: state.power.capacity, used: powerUsed(state) } : { capacity: 0, used: 0 };
  return { phase, message, hull: state?.hull ?? 0, simSeconds: state ? Math.floor(state.tick / TICK_HZ) : 0, tick: state?.tick ?? 0, threats, power, stations, weapons: state ? { charge: state.weapons.charge, ready: state.weapons.charge >= 1 } : { charge: 0, ready: false }, impactTick: state ? Array.from(state.rooms.impactTick) : [], players, credits: credits ? [...credits.lines] : null, creditsScroll: credits?.scroll ?? 0 };
}
