import { describe, it, expect } from 'vitest';
import { activateBreach, repairBreach, activeBreachCount, freeSites } from '../src/renderer/src/sim/hazards/breach';
import { roomBreached, totalO2, oxygenStep } from '../src/renderer/src/sim/hazards/oxygen';
import { DoorState } from '../src/renderer/src/sim/grid';
import { makeState, room } from './helpers/sim';

// Pure physics tests: step the oxygen model directly with no injection, so the later injector stub
// and spawner (Task 13) cannot mask venting.
function ventFor(s: ReturnType<typeof makeState>, secondsOfHazard: number): void {
  const zero = new Float64Array(s.rooms.o2.length);
  for (let i = 0; i < secondsOfHazard * 12; i++) oxygenStep(s, zero);
}

describe('breaches', () => {
  it('activating a site vents its room and marks it breached', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    expect(activateBreach(s, 0)).toBe(true);
    expect(activateBreach(s, 0)).toBe(false);
    expect(roomBreached(s, A)).toBe(true);
    expect(activeBreachCount(s)).toBe(1);
    expect(freeSites(s)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const before = totalO2(s);
    ventFor(s, 30);
    expect(s.rooms.o2[A]).toBeLessThan(s.derived.volume[A]! * 0.5);
    expect(s.o2Counters.vented).toBeGreaterThan(0);
    expect(Math.abs(before - totalO2(s) - s.o2Counters.vented - s.o2Counters.residual)).toBeLessThan(1e-6);
  });
  it('a sealed door loses less oxygen to a breached neighbour than a closed one', () => {
    const closed = makeState(0), sealed = makeState(0);
    const I = room(closed, 'I');
    activateBreach(closed, 0); activateBreach(sealed, 0);
    sealed.doors.state[0] = DoorState.Sealed;
    ventFor(closed, 60); ventFor(sealed, 60);
    expect(sealed.rooms.o2[I]).toBeGreaterThan(closed.rooms.o2[I]!);
  });
  it('repair closes the breach and the room can refill', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    activateBreach(s, 0);
    ventFor(s, 60);
    repairBreach(s, 0);
    expect(roomBreached(s, A)).toBe(false);
    expect(s.breaches.repair[0]).toBe(0);
    const low = s.rooms.o2[A]!;
    s.doors.state[0] = DoorState.Open;
    ventFor(s, 30);
    expect(s.rooms.o2[A]).toBeGreaterThan(low);
  });
});
