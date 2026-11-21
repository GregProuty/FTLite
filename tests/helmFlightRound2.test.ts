// Helm round 2 (spec 2026-11-19-helm-round2-design §3.1, §3.2, §3.4, §8): the Hound flies with drag and a stabilise that
// also acts under thrust, the turn is a fixed rate with no gas boost, and at 1 Engines bar the throttle at its cap still
// climbs away from the planet at 300 u. The Hunter keeps DEFAULT_FLIGHT.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import * as duelStep from '../src/renderer/src/sim/duel/step';
import { crewAxes, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import * as duelTuning from '../src/renderer/src/sim/duel/tuning';
import { flightFor, flyShip } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import * as tacticalTuning from '../src/renderer/src/sim/tactical/tuning';
import { CREW_DRAG, CREW_FLIGHT, CREW_STABILISE, DEFAULT_FLIGHT, DRAG, DT, STABILISE, TURN_STEPS_PER_TICK, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const ship = (over: Partial<Ship>): Ship => ({ ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, ...over });
const OPEN: FlightTuning = { ...CREW_FLIGHT, gravity: false, edge: false };   // the crew flight with no field
const KEEP = 1 - CREW_DRAG * DT;

describe('drag and stabilise come back for the Hound (spec §3.1)', () => {
  it('CREW_FLIGHT is the drag branch with the Hound\'s own constants and stabilises under thrust; DEFAULT_FLIGHT does not', () => {
    expect(CREW_FLIGHT).toEqual({ gravity: true, edge: true, drag: 0.15, stabilise: 80, stabiliseUnderThrust: true });
    expect([CREW_DRAG, CREW_STABILISE]).toEqual([DRAG, STABILISE]);   // the values every ship flew before the spike
    expect(DEFAULT_FLIGHT.stabiliseUnderThrust).toBeUndefined();
    const st = createTacticalState(5);
    expect([flightFor(st, 0), flightFor(st, 1)]).toEqual([CREW_FLIGHT, DEFAULT_FLIGHT]);   // the Hunter keeps DEFAULT_FLIGHT
  });
  it('the Hound slows under drag with no thrust', () => {
    const s = ship({ vy: -200 });
    for (let k = 0; k < 60; k++) flyShip(s, { turn: 0, thrust: 0 }, OPEN);
    expect(s.vy).toBeCloseTo(-200 * Math.pow(KEEP, 60), 9);
  });
  it('with the throttle set and the nose turned 90°, the slide captured when the turn ends comes off at 80 u/s²', () => {
    const run = (tuning: FlightTuning): number[] => {
      const s = ship({ vy: -200 });   // flying north, nose north
      while (s.heading < 64) flyShip(s, { turn: 1, thrust: 0.4 }, tuning);   // A held with the throttle at 40 %
      const side: number[] = [];
      for (let k = 0; k < 200; k++) { flyShip(s, { turn: 0, thrust: 0.4 }, tuning); side.push(s.vy); }   // nose east: vy is across the nose
      return side;
    };
    const hound = run(OPEN), other = run({ ...DEFAULT_FLIGHT, gravity: false, edge: false });
    // Tick 0 captures the slide; from then on each tick takes STABILISE · dt off it, then drag.
    for (let k = 1; k < 5; k++) expect(hound[k]!).toBeCloseTo(Math.sign(hound[k - 1]!) * (Math.abs(hound[k - 1]!) - CREW_STABILISE * DT) * KEEP, 9);
    expect(Math.abs(hound[199]!)).toBeLessThan(1e-6);   // the slide is gone
    expect(Math.abs(other[199]!)).toBeGreaterThan(50);   // DEFAULT_FLIGHT stabilises only with every axis 0: under thrust it slides on
  });
});

describe('a fixed turn rate (spec §3.2)', () => {
  it('a far left-button steer turns the Hound at 150°/s: TURN_STEPS_PER_TICK a tick at the start\'s engine factor of 1', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d.tactical.ships[0], { vx: 0, vy: 0, heading: 0, headingAcc: 0 });
      for (let k = 0; k < 30; k++) stepDuelTick(d, { held: [{ ...NONE, aim: 100 }, NONE], commands: [] });
      const s = d.tactical.ships[0];
      expect(s.heading + s.headingAcc).toBeCloseTo(30 * TURN_STEPS_PER_TICK, 9);
      expect((TURN_STEPS_PER_TICK * 60 * 360) / 256).toBeCloseTo(150, 9);
      expect(crewAxes(d, { ...NONE, aim: 200 })).not.toHaveProperty('turnBoost');
      expect(d.helmVent).toEqual({ x: 0, y: 0 });
    } finally { disposeDuel(d); }
  });
  it('the boost is gone from the sim', () => {
    expect(Object.keys(duelStep)).not.toContain('helmBoost');
    for (const gone of ['RCS_TURN_BOOST', 'BOOST_FAR']) expect(Object.keys(tacticalTuning), gone).not.toContain(gone);
    expect(Object.keys(duelTuning)).not.toContain('BOOST_FACE_SIN');
  });
});

describe('low power (spec §3.4)', () => {
  it('a Hound at rest 450 u from the planet\'s centre, nose outward, at 1 Engines bar with the throttle at its cap, is farther out after 5 s', () => {   // the slingshot (SIM 66): ships feel twice the pull, so 1 bar (30 u/s²) climbs out only beyond about 410 u; was 300 u
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const p = d.tactical.map.planet;
      Object.assign(d.tactical.ships[0], { x: p.x, y: p.y - 450, vx: 0, vy: 0, heading: 0, headingAcc: 0 });   // north of the centre, nose north: outward
      d.tactical.systems[0].bars[DuelSystem.Engines] = 1;
      d.thrMille = 250;   // the cap at 1 bar (25 %): 30 u/s²
      for (let k = 0; k < 300; k++) stepDuelTick(d, { held: [{ ...NONE, throttleHeld: 1 }, NONE], commands: [] });
      const s = d.tactical.ships[0];
      expect(d.thrMille).toBe(250);
      expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThan(450);
    } finally { disposeDuel(d); }
  });
});
