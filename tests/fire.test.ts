import { describe, it, expect } from 'vitest';
import { fireStep, igniteRoom, extinguishRoom, burningRoomCount } from '../src/renderer/src/sim/hazards/fire';
import { DoorState } from '../src/renderer/src/sim/grid';
import { FIRE_CAP, FIRE_START, FIRE_GROW_FRAC, FIRE_SHRINK_FRAC } from '../src/renderer/src/sim/tuning';
import { makeState, room, run, seconds } from './helpers/sim';

describe('fire', () => {
  it('ignites at FIRE_START and grows to the cap in a full room', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    expect(igniteRoom(s, A)).toBe(true);
    expect(igniteRoom(s, A)).toBe(false);
    expect(s.rooms.fire[A]).toBe(FIRE_START);
    for (let i = 0; i < 2000; i++) fireStep(s);
    expect(s.rooms.fire[A]).toBe(FIRE_CAP);
    expect(burningRoomCount(s)).toBeGreaterThanOrEqual(1);   // spread through the closed door is possible and seeded, so do not assert exactly 1
  });
  it('shrinks below the shrink threshold and holds between the two thresholds', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    igniteRoom(s, A); s.rooms.fire[A] = 8;
    s.rooms.o2[A] = s.derived.volume[A]! * (FIRE_GROW_FRAC + FIRE_SHRINK_FRAC) / 2;
    fireStep(s);
    expect(s.rooms.fire[A]).toBe(8);
    s.rooms.o2[A] = s.derived.volume[A]! * FIRE_SHRINK_FRAC * 0.5;
    for (let i = 0; i < 2000; i++) fireStep(s);
    expect(s.rooms.fire[A]).toBe(0);
    expect(s.rooms.fireRepair[A]).toBe(0);
  });
  it('spreads through open doors far more often than sealed ones', () => {
    let openSpread = 0, sealedSpread = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const o = makeState(0, seed), se = makeState(0, seed);
      const A = room(o, 'A'), I = room(o, 'I');
      igniteRoom(o, A); igniteRoom(se, A);
      o.doors.state[0] = DoorState.Open; se.doors.state[0] = DoorState.Sealed;
      for (let i = 0; i < 1200; i++) { fireStep(o); fireStep(se); } // 100 s
      if (o.rooms.fire[I]! > 0) openSpread++;
      if (se.rooms.fire[I]! > 0) sealedSpread++;
    }
    expect(openSpread).toBeGreaterThan(sealedSpread);
    expect(openSpread).toBeGreaterThanOrEqual(15);
  });
  it('consumes oxygen through the oxygen step and the step loop runs it', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    igniteRoom(s, A);
    run(s, seconds(10));
    expect(s.o2Counters.burned).toBeGreaterThan(0);
    expect(s.rooms.fire[A]).toBeGreaterThan(FIRE_START);
  });
  it('extinguish resets fire and repair progress', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    igniteRoom(s, A); s.rooms.fireRepair[A] = 0.5;
    extinguishRoom(s, A);
    expect(s.rooms.fire[A]).toBe(0); expect(s.rooms.fireRepair[A]).toBe(0);
  });
});
