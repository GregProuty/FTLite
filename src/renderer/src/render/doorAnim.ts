import { DoorState } from '../sim/grid';

export const DOOR_ANIM_SECONDS = 0.25;

export function doorTarget(state: number): 0 | 1 { return state === DoorState.Open ? 1 : 0; }
export function initialDoorProgress(state: number): number { return doorTarget(state); }

/** Move progress towards target by dt / animSeconds, clamped to [0, 1]. Pure; called once per rendered frame per door. */
export function advanceDoor(progress: number, target: 0 | 1, dtSeconds: number, animSeconds: number): number {
  const stepSize = dtSeconds / animSeconds;
  if (target > progress) return Math.min(target, progress + stepSize);
  return Math.max(target, progress - stepSize);
}

/** Which texture a door shows: Sealed is the static sealed frame (sealing is instant); otherwise an open-animation frame by progress. */
export function doorFrame(state: number, progress: number, openFrames: number): { kind: 'sealed' } | { kind: 'open'; frame: number } {
  if (state === DoorState.Sealed) return { kind: 'sealed' };
  return { kind: 'open', frame: Math.round(progress * Math.max(0, openFrames - 1)) };
}
