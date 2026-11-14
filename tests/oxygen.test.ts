import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { oxygenStep, totalO2, roomBreached, roomVenting, passageFor } from '../src/renderer/src/sim/hazards/oxygen';
import { DoorState } from '../src/renderer/src/sim/grid';
import { O2_K, O2_SNAP_EPS, PASSAGE_SEALED, PASSAGE_CLOSED, PASSAGE_OPEN, SEAL_SKILL } from '../src/renderer/src/sim/tuning';
import { createSimState } from './helpers/simLifetime';
import { makeState, room, teleport, setSkill, quirkState, cutterState, CUTTER, RECRUITS, quiet, run, seconds } from './helpers/sim';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { FIRE_SHRINK_FRAC } from '../src/renderer/src/sim/tuning';
import { solidAt } from '../src/renderer/src/sim/grid';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Skill } from '../src/renderer/src/sim/skills';

function balance(before: number, s: ReturnType<typeof makeState>, c0: typeof s.o2Counters): void {
  const c = s.o2Counters;
  const expected = before + (c.injected - c0.injected) - (c.breathed - c0.breathed) - (c.burned - c0.burned) - (c.vented - c0.vented) - (c.residual - c0.residual);
  expect(Math.abs(totalO2(s) - expected)).toBeLessThan(1e-7);
  for (let r = 0; r < s.rooms.o2.length; r++) {
    expect(s.rooms.o2[r]).toBeGreaterThanOrEqual(0);
    expect(s.rooms.o2[r]).toBeLessThanOrEqual(s.derived.volume[r]! + 1e-9);
  }
}

describe('oxygen', () => {
  it('starter layout keeps the full diffusion rate (stability bound not binding)', () => {
    expect(makeState().derived.kEff).toBe(O2_K);
  });
  it('a full room next to an empty one equalises and conserves mass', () => {
    const s = makeState(0);
    const I = room(s, 'I'), A = room(s, 'A');
    s.doors.state.fill(DoorState.Open);
    s.rooms.o2[A] = 0;
    const before = totalO2(s), c0 = { ...s.o2Counters };
    const zero = new Float64Array(s.rooms.o2.length);
    for (let i = 0; i < 600; i++) oxygenStep(s, zero);
    balance(before, s, c0);
    expect(s.rooms.o2[A]! / s.derived.volume[A]!).toBeCloseTo(s.rooms.o2[I]! / s.derived.volume[I]!, 3);
  });
  it('branching graph: one full room, every neighbour empty, never goes negative', () => {
    const s = makeState(0);
    const I = room(s, 'I');
    s.doors.state.fill(DoorState.Open);
    for (let r = 0; r < s.rooms.o2.length; r++) if (r !== I) s.rooms.o2[r] = 0;
    s.rooms.o2[I] = 0.001; // nearly empty source so outflow demand exceeds mass
    const before = totalO2(s), c0 = { ...s.o2Counters };
    oxygenStep(s, new Float64Array(s.rooms.o2.length));
    expect(s.rooms.o2[I]).toBeGreaterThanOrEqual(0);
    balance(before, s, c0);
  });
  it('crew breathe and fire burns oxygen, and sinks are scaled when a room is nearly empty', () => {
    const s = makeState(2);
    const G = room(s, 'G');
    teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5);
    s.rooms.fire[G] = 4;
    s.rooms.o2[G] = 1e-6;
    const before = totalO2(s), c0 = { ...s.o2Counters };
    oxygenStep(s, new Float64Array(s.rooms.o2.length));
    expect(s.o2Counters.breathed).toBeGreaterThan(0);
    expect(s.o2Counters.burned).toBeGreaterThan(0);
    balance(before, s, c0);
  });
  it('injection is clamped to the room volume and skipped in breached rooms', () => {
    const s = makeState(0);
    const A = room(s, 'A'), B = room(s, 'B');
    const inj = new Float64Array(s.rooms.o2.length);
    inj[A] = 100; inj[B] = 100;
    s.rooms.o2[A] = 5;
    s.breaches.active[1] = 1; // site 1 is in B
    expect(roomBreached(s, B)).toBe(true);
    const c0 = { ...s.o2Counters }, before = totalO2(s);
    oxygenStep(s, inj);
    expect(s.rooms.o2[A]).toBeCloseTo(s.derived.volume[A]!, 9);
    expect(s.o2Counters.injected - c0.injected).toBeLessThanOrEqual(s.derived.volume[A]! - 5 + 1e-9);
    balance(before, s, c0);
  });
  it('tiny residues snap to zero and are tracked', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    s.rooms.o2.fill(0);                    // nothing can leak back in through the doors
    s.rooms.o2[A] = O2_SNAP_EPS / 2;
    oxygenStep(s, new Float64Array(s.rooms.o2.length));
    expect(s.rooms.o2[A]).toBe(0);
    expect(s.o2Counters.residual).toBeGreaterThan(0);
  });
  it('property: mass balance and bounds hold for random states (incl. simultaneous venting)', () => {
    fc.assert(fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 9, maxLength: 9 }),
      fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 8, maxLength: 8 }),
      fc.array(fc.boolean(), { minLength: 9, maxLength: 9 }),
      fc.array(fc.double({ min: 0, max: 16, noNaN: true }), { minLength: 9, maxLength: 9 }),
      fc.array(fc.double({ min: 0, max: 50, noNaN: true }), { minLength: 9, maxLength: 9 }),
      (fracs, doors, breaches, fires, inj) => {
        const s = makeState(4);
        for (let r = 0; r < 9; r++) { s.rooms.o2[r] = fracs[r]! * s.derived.volume[r]!; s.rooms.fire[r] = fires[r]!; }
        for (let e = 0; e < 8; e++) s.doors.state[e] = doors[e]!;
        for (let b = 0; b < 9; b++) s.breaches.active[b] = breaches[b]! ? 1 : 0;
        const injection = Float64Array.from(inj);
        for (let i = 0; i < 20; i++) {
          const before = totalO2(s), c0 = { ...s.o2Counters };
          oxygenStep(s, injection);
          balance(before, s, c0);
        }
      }
    ), { numRuns: 200 });
  });
});

describe('sealed doors and the Doors operator', () => {
  it('a level-10 Doors operator halves the sealed leak; Open and Closed are unchanged; unmanned is baseline', () => {
    const s = makeState(1), doors = s.derived.stationOfKind[StationKind.Doors]!, e = s.derived.doorEdges[0]!;
    s.doors.state[e] = DoorState.Sealed;
    expect(passageFor(s, e)).toBe(PASSAGE_SEALED);
    setSkill(s, 0, Skill.Engineering, 10); sitDown(s, 0, doors);
    expect(passageFor(s, e)).toBeCloseTo(PASSAGE_SEALED * (1 - 10 * SEAL_SKILL), 12); expect(1 - 10 * SEAL_SKILL).toBeCloseTo(0.5);
    s.doors.state[e] = DoorState.Closed; expect(passageFor(s, e)).toBe(PASSAGE_CLOSED);
    s.doors.state[e] = DoorState.Open; expect(passageFor(s, e)).toBe(PASSAGE_OPEN);
  });
});

describe('held-open doors in the oxygen step (spec Demo-vii section 1)', () => {
  it('passageFor gives PASSAGE_OPEN for a HeldOpen door', () => {
    const s = makeState(0);
    s.doors.state[0] = DoorState.HeldOpen;
    expect(passageFor(s, 0)).toBe(PASSAGE_OPEN);
  });
  it('a HeldOpen door moves exactly as much oxygen as an Open one, and Leaky Seals does not multiply it', () => {
    const run1 = (st: number, quirk: number): number => {
      const s = quirkState(quirk); const A = room(s, 'A');
      for (const eid of s.crew) teleport(s, s.crew.indexOf(eid), 12.5, 9.5);
      s.rooms.o2[A] = 0; s.doors.state[0] = st;
      oxygenStep(s, new Float64Array(s.rooms.o2.length));
      return s.rooms.o2[A]!;
    };
    expect(run1(DoorState.HeldOpen, 1)).toBe(run1(DoorState.Open, 1));
    expect(run1(DoorState.HeldOpen, 0)).toBe(run1(DoorState.Open, 1));     // quirk 0 is Leaky Seals: closed doors only
  });
});

describe('venting through open airlocks (spec Demo-vii section 1, amendment 7)', () => {
  const ENGINES_AIRLOCK = 2;
  const calm = (seed = 1) => {
    const s = cutterState(seed); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
    return s;
  };
  it('an open Engines airlock with its doors closed drains Engines below FIRE_SHRINK_FRAC within 30 s and a fire there goes out', () => {
    const s = calm(), E = room(s, 'E');
    igniteRoom(s, E);
    s.airlocks.open[ENGINES_AIRLOCK] = 1;
    let below = -1;
    for (let t = 0; t < seconds(30) && below < 0; t++) { run(s, 1); if (s.rooms.o2[E]! / s.derived.volume[E]! < FIRE_SHRINK_FRAC) below = t; }
    expect(below).toBeGreaterThanOrEqual(0);
    run(s, seconds(60));
    expect(s.rooms.fire[E]).toBe(0);
  });
  it('the fire goes out under Leaky Seals too, and in Oxygen routed through a held-open door to the Engines airlock (amendment 12)', () => {
    for (const [burn, quirk, hold] of [['E', 0, -1], ['O', 1, 0]] as const) {
      const s = createSimState(CUTTER, 2, 1, RECRUITS, { quirk }); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
      const B = room(s, burn); igniteRoom(s, B); s.airlocks.open[ENGINES_AIRLOCK] = 1;
      if (hold >= 0) s.doors.state[hold] = DoorState.HeldOpen;   // edge 0 is Oxygen <-> Engines
      run(s, seconds(30));
      expect(s.rooms.fire[B], burn).toBe(0);
    }
  });
  it('conserves oxygen: injected - breathed - burned - vented - residual accounts for every change', () => {
    const s = calm(2), E = room(s, 'E');
    igniteRoom(s, E); s.airlocks.open[ENGINES_AIRLOCK] = 1; s.airlocks.open[0] = 1;
    const before = totalO2(s), c0 = { ...s.o2Counters };
    run(s, seconds(20));
    expect(s.o2Counters.vented - c0.vented).toBeGreaterThan(0);
    balance(before, s, c0);
  });
  it('a closed airlock vents nothing over 600 ticks', () => {
    const s = calm();
    const v0 = s.o2Counters.vented;
    run(s, 600);
    expect(s.o2Counters.vented).toBe(v0);
  });
  it('life support injects nothing into a room with an open airlock', () => {
    const s = calm(), E = room(s, 'E');
    s.airlocks.open[ENGINES_AIRLOCK] = 1; s.rooms.o2[E] = 0;
    const only = new Float64Array(s.rooms.o2.length); only[E] = 1;
    const before = s.o2Counters.injected;
    oxygenStep(s, only);
    expect(s.o2Counters.injected).toBe(before);
    expect(roomVenting(s, E)).toBe(true);
    s.airlocks.open[ENGINES_AIRLOCK] = 0;
    oxygenStep(s, only);
    expect(s.o2Counters.injected).toBeGreaterThan(before);
  });
  it('the airlock tile is solid, open or closed', () => {
    const s = calm(), w = s.derived.width, t = s.derived.airlockTile[ENGINES_AIRLOCK]!;
    expect(solidAt(s, t % w, Math.floor(t / w))).toBe(true);
    s.airlocks.open[ENGINES_AIRLOCK] = 1;
    expect(solidAt(s, t % w, Math.floor(t / w))).toBe(true);
  });
});
