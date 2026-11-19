// Engineering spike spec §4, §5: the interior hazards on the duel: no quirk, closed doors, Life Support by Oxygen bars,
// venting through an airlock, fire by oxygen, fire spread through open and closed doors, an airlock held across ticks.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { applyPower, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { toggleAirlock, toggleDoor } from '../src/renderer/src/sim/duel/hazards';
import { DoorState } from '../src/renderer/src/sim/grid';
import { igniteRoom, fireStep } from '../src/renderer/src/sim/hazards/fire';
import { passageFor, totalO2 } from '../src/renderer/src/sim/hazards/oxygen';
import { quirkDoorDelayMult, quirkPassageMult } from '../src/renderer/src/sim/quirks';
import { FIRE_SPREAD_P, PASSAGE_CLOSED } from '../src/renderer/src/sim/tuning';
import { nextFloat } from '../src/shared/rng';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const room = (id: string) => HOUND.rooms.findIndex((r) => r.id === id);
/** A duel with the enemy switched off, so only the interior changes. */
function quiet(seed = 3): DuelState { const d = createDuel(HOUND, seed); d.tactical.ships[1]!.active = false; return d; }
const run = (d: DuelState, ticks: number) => { for (let k = 0; k < ticks; k++) stepDuelTick(d, { held: [NONE, NONE], commands: [] }); };
const frac = (d: DuelState, r: number) => d.interior.rooms.o2[r]! / d.interior.derived.volume[r]!;
function withDuel(f: (d: DuelState) => void, seed = 3): void { const d = quiet(seed); try { f(d); } finally { disposeDuel(d); } }

describe('engineering spike: the interior hazards (spec §4, §5)', () => {
  it('a fresh duel: doors closed (auto), the quirk hooks neutral, every room full', () => withDuel((d) => {
    for (const e of d.interior.derived.doorEdges) expect(d.interior.doors.state[e]).toBe(DoorState.Closed);
    expect(d.interior.run.quirk).toBe(3);
    expect(quirkPassageMult(d.interior)).toBe(1); expect(quirkDoorDelayMult(d.interior)).toBe(1);
    expect(totalO2(d.interior)).toBeCloseTo(d.interior.derived.volume.reduce((a, v) => a + v, 0), 9);
  }));
  it('Oxygen at 0 bars: the air falls; at 1 bar it stays full', () => {
    withDuel((d) => { const full = totalO2(d.interior); run(d, 600); expect(totalO2(d.interior)).toBeCloseTo(full, 6); });
    withDuel((d) => { const full = totalO2(d.interior); applyPower(d, DuelSystem.Oxygen, -1); run(d, 600); expect(totalO2(d.interior)).toBeLessThan(full - 1e-3); });
  });
  it('an open airlock vents its room below 10 % in about 2 s and puts its fire out', () => withDuel((d) => {
    const L = room('L');
    igniteRoom(d.interior, L);
    toggleAirlock(d, 1);                                   // the Hound's airlock 1 is in L
    let t = 0; while (frac(d, L) >= 0.1 && t < 600) { run(d, 1); t++; }
    expect(t).toBeLessThanOrEqual(300);
    run(d, 360);
    expect(d.interior.rooms.fire[L]).toBe(0);
  }));
  it('an airlock held open stays open across 600 ticks (the Doors fail-safe never fires)', () => withDuel((d) => {
    toggleAirlock(d, 0); run(d, 600); expect(d.interior.airlocks.open[0]).toBe(1);
    const e = d.interior.derived.doorEdges[0]!; toggleDoor(d, e); run(d, 600); expect(d.interior.doors.state[e]).toBe(DoorState.HeldOpen);
  }));
  it('fire spreads through an open door at FIRE_SPREAD_P and through a closed one at 0.05 ×', () => {
    // E's only edge is the E–H door (edge 0), so one draw per fireStep decides the spread.
    const E = room('E'), H = room('H'), edge = 0;
    const drawWith = (d: DuelState, lo: number, hi: number): void => {
      for (let s = 1; s < 5_000_000; s++) { const probe = { s }; const v = nextFloat(probe); if (v >= lo && v < hi) { d.interior.rng.hazards.s = s; return; } }
      throw new Error('no state found');
    };
    withDuel((d) => {
      igniteRoom(d.interior, E); toggleDoor(d, edge);
      expect(passageFor(d.interior, edge)).toBe(1);
      drawWith(d, FIRE_SPREAD_P * PASSAGE_CLOSED, FIRE_SPREAD_P); fireStep(d.interior);
      expect(d.interior.rooms.fire[H]! > 0).toBe(true);
    });
    withDuel((d) => {
      igniteRoom(d.interior, E);
      expect(passageFor(d.interior, edge)).toBe(PASSAGE_CLOSED);
      drawWith(d, FIRE_SPREAD_P * PASSAGE_CLOSED, FIRE_SPREAD_P); fireStep(d.interior);
      expect(d.interior.rooms.fire[H]).toBe(0);
      drawWith(d, 0, FIRE_SPREAD_P * PASSAGE_CLOSED); fireStep(d.interior);
      expect(d.interior.rooms.fire[H]! > 0).toBe(true);
    });
  });
  it('a fire grows only on hazard ticks by oxygen (no DUEL_FIRE_GROW), and starves out below 10 % air', () => withDuel((d) => {
    // The Hound's spawn 0 (13, 7) is inside the O–Q door's DOOR_ZONE, so doorSystem would hold that door Open; move
    // player 0 to Q's middle so both of Q's doors stay closed (Engineering spike spec §5).
    Position.x[d.interior.crew[0]!] = 15.5;
    const Q = room('Q'); igniteRoom(d.interior, Q); run(d, 1);   // tick 0 is a hazard tick
    const f0 = d.interior.rooms.fire[Q]!; run(d, 4);
    expect(d.interior.rooms.fire[Q]).toBe(f0);            // ticks 1..4: no hazard tick, and no per-tick DUEL_FIRE_GROW
    applyPower(d, DuelSystem.Oxygen, -1);                  // no injection, so only the closed doors' leak refills Q
    d.interior.rooms.o2[Q] = 0.02 * d.interior.derived.volume[Q]!;
    run(d, 240);
    expect(d.interior.rooms.fire[Q]).toBe(0);
  }));
});

describe('engineering spike: the scripted crew with closed doors (spec §5)', () => {
  it('an unseated scripted pair on the Cutter reaches Navigation and Weapons within 1200 ticks, through auto doors', () => {
    const d = createDuel(parseShip(cutter), 1), pair = createScriptedPair(1);
    try {
      for (const e of d.interior.derived.doorEdges) expect(d.interior.doors.state[e]).toBe(DoorState.Closed);
      let t = 0;
      const seatOf = (pid: number) => Seated.station[d.interior.crew[pid]!]!;
      while ((seatOf(0) !== d.nav || seatOf(1) !== d.weapons) && t < 1200) { stepDuelTick(d, scriptedInput(pair, d)); t++; }
      expect(seatOf(0)).toBe(d.nav); expect(seatOf(1)).toBe(d.weapons);
    } finally { disposeDuel(d); }
  });
});
