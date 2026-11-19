// Fire venting (owner 2026-11-19, FTL-style): a room joined to space through open doorways vents, and the duel's Life
// Support skips it, so opening doors toward an open airlock drains that whole section and smothers a fire there. Fire
// also burns its room's oxygen at the duel's own rate, so a sealed room with Oxygen unpowered puts itself out.
import { describe, expect, it } from 'vitest';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelInjection, ventedRegion } from '../src/renderer/src/sim/duel/hazards';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { applyPower, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { DoorState } from '../src/renderer/src/sim/grid';
import { DUEL_FIRE_O2_RATE } from '../src/renderer/src/sim/duel/tuning';
import { FIRE_O2_RATE } from '../src/renderer/src/sim/tuning';
import { Position } from '../src/renderer/src/sim/components';

const NONE = { moveX: 0, moveY: 0, interactHeld: false };
const TPS = 60;
/** A Hound duel whose enemy is switched off, so only the fire and the air change. */
function quiet(seed = 5): DuelState { const d = createDuel(DUEL_LAYOUT, seed); d.tactical.ships[1]!.active = false; return d; }
function openAllDoors(d: DuelState): void {
  const dv = d.interior.derived;
  for (let e = 0; e < dv.edgeA.length; e++) if (dv.edgeIsDoor[e]) d.interior.doors.state[e] = DoorState.HeldOpen;
}
/** Step `seconds`; returns the first second at which `room` was not burning, or null. */
function runUntilOut(d: DuelState, room: number, seconds: number, each?: () => void): number | null {
  for (let t = 0; t < seconds * TPS; t++) {
    each?.();
    stepDuelTick(d, { held: [NONE, NONE], commands: [] });
    if (d.interior.rooms.fire[room] === 0) return t / TPS;
  }
  return null;
}
/** The doors on a shortest door path from `room` to an airlock room, and that airlock's index (BFS over door edges). */
function pathToAirlock(d: DuelState, room: number): { doors: number[]; airlock: number; rooms: Set<number> } {
  const dv = d.interior.derived, R = d.interior.rooms.fire.length, prev = new Map<number, { from: number; edge: number }>([[room, { from: -1, edge: -1 }]]);
  const queue = [room];
  while (queue.length) {
    const r = queue.shift()!;
    const lock = Array.from(dv.airlockRoom).indexOf(r);
    if (lock >= 0) {
      const doors: number[] = [], rooms = new Set<number>([r]);
      for (let at = r; prev.get(at)!.from >= 0; at = prev.get(at)!.from) { doors.push(prev.get(at)!.edge); rooms.add(prev.get(at)!.from); }
      return { doors, airlock: lock, rooms };
    }
    for (let e = 0; e < dv.edgeA.length; e++) {
      const a = dv.edgeA[e]!, b = dv.edgeB[e]!, next = a === r ? b : b === r ? a : -1;
      if (next >= 0 && next < R && !prev.has(next)) { prev.set(next, { from: r, edge: e }); queue.push(next); }
    }
  }
  throw Error(`room ${room} reaches no airlock`);
}
/** Stand both crew on a tile of `room`. */
function crewInto(d: DuelState, room: number): void {
  const st = d.interior, w = st.derived.width, tile = st.derived.roomTiles[room]![0]!;
  for (const eid of st.crew) { Position.x[eid] = (tile % w) + 0.5; Position.y[eid] = Math.floor(tile / w) + 0.5; }
}
/** The Hound's rooms with no airlock of their own (the fire is fought there by venting a section). */
function roomsWithoutAirlock(d: DuelState): number[] {
  const dv = d.interior.derived, locks = new Set(Array.from(dv.airlockRoom));
  return Array.from({ length: d.interior.rooms.fire.length }, (_, r) => r).filter((r) => !locks.has(r));
}

describe('ventedRegion', () => {
  it('is empty with every airlock shut and no breach', () => {
    const d = quiet();
    try {
      openAllDoors(d);
      const out = new Uint8Array(d.interior.rooms.o2.length);
      ventedRegion(d.interior, out);
      expect(Array.from(out).every((v) => v === 0)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('holds only the airlock room while its doors are closed', () => {
    const d = quiet();
    try {
      const st = d.interior, lock = st.derived.airlockRoom[0]!;
      st.airlocks.open[0] = 1;
      const out = new Uint8Array(st.rooms.o2.length);
      ventedRegion(st, out);
      expect(Array.from(out).map((v, r) => (v ? r : -1)).filter((r) => r >= 0)).toEqual([lock]);
    } finally { disposeDuel(d); }
  });
  it('spreads through open doors to every joined room', () => {
    const d = quiet();
    try {
      const st = d.interior;
      st.airlocks.open[0] = 1; openAllDoors(d);
      const out = new Uint8Array(st.rooms.o2.length);
      ventedRegion(st, out);
      expect(Array.from(out).every((v) => v === 1)).toBe(true);   // the Hound is one connected ship
    } finally { disposeDuel(d); }
  });
  it('the duel Life Support injects nothing into a vented room and the full ask elsewhere', () => {
    const d = quiet();
    try {
      const st = d.interior, lock = st.derived.airlockRoom[0]!;
      st.airlocks.open[0] = 1;
      duelInjection(d);
      for (let r = 0; r < st.rooms.o2.length; r++) {
        if (r === lock) expect(st.injectionScratch[r]).toBe(0);
        else expect(st.injectionScratch[r]).toBeGreaterThan(0);
      }
      openAllDoors(d);
      duelInjection(d);
      expect(Array.from(st.injectionScratch).every((v) => v === 0)).toBe(true);
    } finally { disposeDuel(d); }
  });
});

describe('fire and oxygen (FTL-style)', () => {
  it('the duel fire burns oxygen faster than the sector fire', () => {
    expect(DUEL_FIRE_O2_RATE).toBeGreaterThan(FIRE_O2_RATE);
  });
  it('opening the doors toward an open airlock puts out a fire in a room with no airlock, with Life Support powered', () => {
    const rooms = roomsWithoutAirlock(quiet());
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      const d = quiet();
      try {
        const st = d.interior, path = pathToAirlock(d, room);
        const safe = Array.from({ length: st.rooms.fire.length }, (_, r) => r).find((r) => !path.rooms.has(r))!;
        crewInto(d, safe);                          // the crew wait outside the vented section, behind closed doors
        igniteRoom(st, room);
        st.airlocks.open[path.airlock] = 1;
        for (const e of path.doors) st.doors.state[e] = DoorState.HeldOpen;
        const out = runUntilOut(d, room, 45);
        expect(out, `room ${room} (doors ${path.doors})`).not.toBeNull();
        expect(st.rooms.o2[safe]! / st.derived.volume[safe]!, `safe room ${safe}`).toBeGreaterThan(0.5);
      } finally { disposeDuel(d); }
    }
  });
  it('an open airlock alone does not drain a room whose doors are closed', () => {
    const d = quiet();
    try {
      const st = d.interior, room = roomsWithoutAirlock(d)[0]!;
      igniteRoom(st, room);
      for (let a = 0; a < st.airlocks.open.length; a++) st.airlocks.open[a] = 1;
      expect(runUntilOut(d, room, 30)).toBeNull();
    } finally { disposeDuel(d); }
  });
  it('a sealed burning room with Oxygen unpowered smothers in about 20-40 s', () => {
    const d = quiet();
    try {
      const room = roomsWithoutAirlock(d)[0]!;
      applyPower(d, DuelSystem.Oxygen, -9);
      igniteRoom(d.interior, room);
      const out = runUntilOut(d, room, 60);
      expect(out).not.toBeNull();
      expect(out!).toBeGreaterThanOrEqual(15);
      expect(out!).toBeLessThanOrEqual(40);
    } finally { disposeDuel(d); }
  });
  it('a sealed burning room keeps burning while Life Support is powered (crew must fight it or vent it)', () => {
    const d = quiet();
    try {
      const room = roomsWithoutAirlock(d)[0]!;
      igniteRoom(d.interior, room);
      expect(runUntilOut(d, room, 60)).toBeNull();
    } finally { disposeDuel(d); }
  });
});
