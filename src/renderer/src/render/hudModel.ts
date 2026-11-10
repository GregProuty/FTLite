import type { SimState } from '../sim/state';
import { Health, Life, LifeState, Position } from '../sim/components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../sim/interact';
import { DoorState, conditionRoomAt } from '../sim/grid';
import { TICK_HZ } from '../sim/tuning';
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
}
export interface HudThreat { icon: 'icon.fire' | 'icon.breach'; text: string }
export interface HudModel {
  phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number;
  threats: HudThreat[]; players: HudPlayer[]; credits: string[] | null; creditsScroll: number;
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

const EMPTY = { health: 0, life: 0, bleed: 0, lowOxygen: false, lifeText: '', interactPrompt: '', interactIcon: null, confirmPrompt: '', confirmIcon: null, progress: 0 } as const;

function player(state: SimState, pid: number): Omit<HudPlayer, 'pid' | 'status' | 'deviceKind'> {
  const eid = state.crew[pid]!;
  const base = { health: Health.cur[eid]!, life: Life.state[eid]!, bleed: Life.bleed[eid]! };
  const r = conditionRoomAt(state, Position.x[eid]!, Position.y[eid]!);
  const lowOxygen = r >= 0 && state.rooms.o2[r]! / state.derived.volume[r]! < HUD_LOW_O2_FRAC;
  if (Life.state[eid] === LifeState.Downed) return { ...EMPTY, ...base, lowOxygen, lifeText: `DOWNED ${Math.ceil(Life.bleed[eid]!)}s`, progress: Life.reviveProgress[eid]! };
  if (Life.state[eid] === LifeState.Dead) return { ...EMPTY, ...base, lowOxygen, lifeText: 'DEAD' };
  let interactPrompt = '', interactIcon: string | null = null, progress = 0;
  const t = interactTarget(state, pid);
  if (t.kind === TargetKind.Revive) { interactPrompt = `Revive P${t.index + 1}`; progress = Life.reviveProgress[state.crew[t.index]!]!; }
  else if (t.kind === TargetKind.Fire) { interactPrompt = 'Repair fire'; interactIcon = 'icon.repair'; progress = state.rooms.fireRepair[t.index]!; }
  else if (t.kind === TargetKind.Breach) { interactPrompt = 'Repair breach'; interactIcon = 'icon.repair'; progress = state.breaches.repair[t.index]!; }
  let confirmPrompt = '', confirmIcon: string | null = null;
  const c = confirmTarget(state, pid);
  if (c.kind === ConfirmKind.Door) { confirmPrompt = state.doors.state[c.index] === DoorState.Sealed ? 'Unseal door' : 'Seal door'; confirmIcon = 'icon.door'; }
  return { ...base, lowOxygen, lifeText: '', interactPrompt, interactIcon, confirmPrompt, confirmIcon, progress };
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
  }
  return { phase, message, hull: state?.hull ?? 0, simSeconds: state ? Math.floor(state.tick / TICK_HZ) : 0, threats, players, credits: credits ? [...credits.lines] : null, creditsScroll: credits?.scroll ?? 0 };
}
