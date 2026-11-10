import { describe, it, expect } from 'vitest';
import { DoorState } from '../src/renderer/src/sim/grid';
import { DOOR_ANIM_SECONDS, advanceDoor, doorTarget, doorFrame, initialDoorProgress } from '../src/renderer/src/render/doorAnim';

describe('door animation (spec §4 reconciled doors)', () => {
  it('targets 1 for Open and 0 for Closed or Sealed; initial progress follows the state', () => {
    expect(doorTarget(DoorState.Open)).toBe(1); expect(doorTarget(DoorState.Closed)).toBe(0); expect(doorTarget(DoorState.Sealed)).toBe(0);
    expect(initialDoorProgress(DoorState.Open)).toBe(1); expect(initialDoorProgress(DoorState.Closed)).toBe(0); expect(initialDoorProgress(DoorState.Sealed)).toBe(0);
  });
  it('moves towards the target by dt / DOOR_ANIM_SECONDS and clamps', () => {
    expect(DOOR_ANIM_SECONDS).toBe(0.25);
    expect(advanceDoor(0, 1, 0.125, DOOR_ANIM_SECONDS)).toBeCloseTo(0.5);
    expect(advanceDoor(0.9, 1, 0.1, DOOR_ANIM_SECONDS)).toBe(1);
    expect(advanceDoor(0.3, 0, 1, DOOR_ANIM_SECONDS)).toBe(0);
    expect(advanceDoor(1, 1, 0.5, DOOR_ANIM_SECONDS)).toBe(1);
  });
  it('reaches the target in about 15 frames at 60 Hz and is clamped to exactly 1 (fractional remainders never overshoot)', () => {
    let p = 0;
    for (let i = 0; i < 14; i++) p = advanceDoor(p, 1, 1 / 60, DOOR_ANIM_SECONDS);
    expect(p).toBeLessThan(1); expect(p).toBeGreaterThan(0.9);
    p = advanceDoor(p, 1, 1 / 60, DOOR_ANIM_SECONDS); p = advanceDoor(p, 1, 1 / 60, DOOR_ANIM_SECONDS);
    expect(p).toBe(1);
  });
  it('Sealed shows the sealed frame regardless of progress; otherwise frame = round(progress × (n − 1))', () => {
    expect(doorFrame(DoorState.Sealed, 0.7, 4)).toEqual({ kind: 'sealed' });
    expect(doorFrame(DoorState.Closed, 0, 4)).toEqual({ kind: 'open', frame: 0 });
    expect(doorFrame(DoorState.Open, 1, 4)).toEqual({ kind: 'open', frame: 3 });
    expect(doorFrame(DoorState.Open, 0.5, 4)).toEqual({ kind: 'open', frame: 2 });   // round(1.5) = 2
    expect(doorFrame(DoorState.Closed, 0.2, 4)).toEqual({ kind: 'open', frame: 1 });
    expect(doorFrame(DoorState.Open, 1, 1)).toEqual({ kind: 'open', frame: 0 });
  });
  it('every state pair reconciles: skipped states and seal mid-animation resume from progress', () => {
    const states = [DoorState.Closed, DoorState.Open, DoorState.Sealed];
    for (const from of states) for (const to of states) {
      let p = initialDoorProgress(from);
      for (let i = 0; i < 20; i++) p = advanceDoor(p, doorTarget(to), 1 / 60, DOOR_ANIM_SECONDS);
      expect(p).toBe(doorTarget(to));
      expect(doorFrame(to, p, 4)).toEqual(to === DoorState.Sealed ? { kind: 'sealed' } : { kind: 'open', frame: to === DoorState.Open ? 3 : 0 });
    }
    // Open → Sealed mid-animation → Closed: progress keeps closing from where it was, never jumps.
    let p = advanceDoor(0, 1, 0.125, DOOR_ANIM_SECONDS);        // half open
    expect(doorFrame(DoorState.Sealed, p, 4)).toEqual({ kind: 'sealed' });
    p = advanceDoor(p, doorTarget(DoorState.Sealed), 1 / 60, DOOR_ANIM_SECONDS);
    expect(p).toBeCloseTo(0.5 - (1 / 60) / 0.25);
    expect(doorFrame(DoorState.Closed, p, 4).kind).toBe('open');
    // Unsealed while closed shows frame 0 at once.
    expect(doorFrame(DoorState.Closed, 0, 4)).toEqual({ kind: 'open', frame: 0 });
  });
});
