import type { SimState } from '../sim/state';
import { Health, Life, LifeState } from '../sim/components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../sim/interact';
import { DoorState } from '../sim/grid';
import { TICK_HZ } from '../sim/tuning';
import type { SlotInfo, SlotStatus } from '../input/deviceManager';
import { INTERNAL_W } from '../../../shared/resolution';
export interface HudPlayer { pid: number; status: SlotStatus; health: number; life: number; bleed: number; prompt: string; progress: number }
export interface HudModel { phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number; threats: string[]; players: HudPlayer[] }

function prompt(state: SimState, pid: number): { text: string; progress: number } {
  const eid = state.crew[pid]!;
  if (Life.state[eid] === LifeState.Downed) return { text: `DOWNED ${Math.ceil(Life.bleed[eid]!)}s`, progress: Life.reviveProgress[eid]! };
  if (Life.state[eid] === LifeState.Dead) return { text: 'DEAD', progress: 0 };
  const parts: string[] = [];
  let progress = 0;
  const t = interactTarget(state, pid);
  if (t.kind === TargetKind.Revive) { parts.push(`Revive P${t.index + 1}`); progress = Life.reviveProgress[state.crew[t.index]!]!; }
  else if (t.kind === TargetKind.Fire) { parts.push('Repair fire'); progress = state.rooms.fireRepair[t.index]!; }
  else if (t.kind === TargetKind.Breach) { parts.push('Repair breach'); progress = state.breaches.repair[t.index]!; }
  const c = confirmTarget(state, pid);
  if (c.kind === ConfirmKind.Door) parts.push(state.doors.state[c.index] === DoorState.Sealed ? 'Unseal door' : 'Seal door');
  return { text: parts.join(' | '), progress };
}

export function buildHudModel(state: SimState | null, slots: SlotInfo[], phase: HudModel['phase'], message: string): HudModel {
  const players: HudPlayer[] = slots.map((slot, pid) => {
    if (!state || pid >= state.playerCount) return { pid, status: slot.status, health: 0, life: 0, bleed: 0, prompt: '', progress: 0 };
    const eid = state.crew[pid]!, p = prompt(state, pid);
    return { pid, status: slot.status, health: Health.cur[eid]!, life: Life.state[eid]!, bleed: Life.bleed[eid]!, prompt: p.text, progress: p.progress };
  });
  const threats: string[] = [];
  if (state) {
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) threats.push(`Fire: ${state.layout.rooms[r]!.name}`);
    for (let s = 0; s < state.breaches.active.length; s++) if (state.breaches.active[s]) threats.push(`Breach: ${state.layout.rooms[state.derived.siteRoom[s]!]!.name}`);
  }
  return { phase, message, hull: state?.hull ?? 0, simSeconds: state ? Math.floor(state.tick / TICK_HZ) : 0, threats, players };
}
