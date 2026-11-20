// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §4a, §7, §8): mouse steering by the held aim, the aim
// becoming the held heading, moveX ignored on a newtonianHelm class, the gas boost (far only, 2× the step), settling
// without chatter on an aim, a held heading and auto-face, the Valkyrn unchanged, and the scripted crew's aim. Owner
// 2026-11-19 (replaced rule, kind a): the boost is free (no tank, no gas spent); it needs a far turn and Engineering's
// engine factor above 0.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { Seated } from '../src/renderer/src/sim/components';
import { ventOf } from '../src/renderer/src/sim/duel/helmFlight';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { crewAxes, headingDelta, helmTurn, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { classOf, Room } from '../src/renderer/src/sim/tactical/state';
import { flightFor, flyShip } from '../src/renderer/src/sim/tactical/physics';
import { TURN_STEPS_PER_TICK } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const step = (d: DuelState, h: HeldInput = NONE, commands: Parameters<typeof stepDuelTick>[1]['commands'] = []) => stepDuelTick(d, { held: [h, NONE], commands });
const nose = (d: DuelState): number => d.tactical.ships[0].heading + d.tactical.ships[0].headingAcc;
/** A seated crew duel, the crew ship still at (0, 1600) nose north, whose Hunter is parked inactive and still at (dx, dy)
 *  from it, so auto-face has a fixed target. */
function still(dx = 0, dy = -600): DuelState {
  const d = createSeatedDuel(CUTTER, 5);
  Object.assign(d.tactical.ships[0], { x: 0, y: 1600, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(d.tactical.ships[1], { x: dx, y: 1600 + dy, vx: 0, vy: 0, active: false });
  return d;
}
/** Steps with `h` until helmTurn has been 0 for 10 straight ticks; returns the ticks taken (fails past `cap`) and checks the
 *  turn never changes sign once it has started. */
function settle(d: DuelState, h: HeldInput, cap = 400): number {
  let quiet = 0, sign = 0;
  for (let k = 1; k <= cap; k++) {
    const t = helmTurn(d, h);
    if (t !== 0 && sign !== 0) expect(Math.sign(t), `tick ${k}: the turn reversed`).toBe(sign);
    if (t !== 0) sign = Math.sign(t);
    step(d, h);
    quiet = helmTurn(d, h) === 0 ? quiet + 1 : 0;
    if (quiet >= 10) return k;
  }
  throw new Error('never settled');
}

describe('steering by the held aim (spec §4a)', () => {
  it('a held aim turns the crew ship toward it; on release it settles on the last aim, which is the held heading', () => {
    const d = still();
    try {
      for (let k = 0; k < 10; k++) step(d, { ...NONE, aim: 64 });
      expect(d.holdHeading).toBe(64);
      expect(nose(d)).toBeGreaterThan(10);
      settle(d, NONE);
      expect(Math.abs(headingDelta(d.tactical.ships[0].heading, 64))).toBeLessThanOrEqual(2);
    } finally { disposeDuel(d); }
  });
  it('owner 2026-11-19: a held moveX (A/D) turns a newtonianHelm class unboosted and clears its held heading', () => {
    const d = still();
    try {
      step(d, NONE, [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'heading', heading: 0 } }]);
      expect(d.holdHeading).toBe(0);
      expect([helmTurn(d, { ...NONE, moveX: -1 }), helmTurn(d, { ...NONE, moveX: 1 })]).toEqual([-1, 1]);
      for (let k = 0; k < 30; k++) step(d, { ...NONE, moveX: 1 });
      expect(d.tactical.ships[0].heading).not.toBe(0);
      expect(d.holdHeading).toBe(-1);
      const h = d.tactical.ships[0].heading;
      for (let k = 0; k < 10; k++) step(d, NONE);
      expect(d.tactical.ships[0].heading).toBe(h);   // let go, the nose stays where A/D left it
    } finally { disposeDuel(d); }
  });
  it('the Valkyrn is unchanged: its A/D still turn it and its held aim still becomes the held heading', () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const h0 = v.tactical.ships[0].heading;
      for (let k = 0; k < 10; k++) step(v, { ...NONE, moveX: 1 });
      expect(v.tactical.ships[0].heading).not.toBe(h0);
      step(v, { ...NONE, aim: 40 }); expect(v.holdHeading).toBe(40);
    } finally { disposeDuel(v); }
  });
});

describe('the fixed turn (helm round 2 §3.2, which removes §4a\'s gas boost)', () => {
  it('a far aim turns at the class rate, never 2×', () => {
    const d = still();
    try {
      step(d, { ...NONE, aim: 100 });
      expect(nose(d)).toBeCloseTo(TURN_STEPS_PER_TICK, 9);
      expect(d.helmVent).toEqual({ x: 0, y: 0 });
    } finally { disposeDuel(d); }
  });
  it('the turn settles on an aim, a held heading and the auto-face target without oscillating', () => {
    const a = still(), b = still(), c = still(600, 0);
    try {
      settle(a, { ...NONE, aim: 140 });
      expect(Math.abs(headingDelta(a.tactical.ships[0].heading, 140))).toBeLessThanOrEqual(1);
      step(b, NONE, [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: b.interior.tick, command: { kind: 'heading', heading: 200 } }]);
      settle(b, NONE);
      expect(Math.abs(headingDelta(b.tactical.ships[0].heading, 200))).toBeLessThanOrEqual(2);
      settle(c, { ...NONE, face: true });   // the sim keeps face for the scripted Helm (helm round 2 §4)
      expect(Math.abs(headingDelta(c.tactical.ships[0].heading, 64))).toBeLessThanOrEqual(2);   // the Hunter due east
    } finally { disposeDuel(a); disposeDuel(b); disposeDuel(c); }
  });
});

describe('the app\'s prediction of the axes (spec §6)', () => {
  it('crewAxes flies the held thrust and every held thruster (helm round 2 §3.2: no boost)', () => {
    const d = still();
    try {
      d.thrMille = 500;   // W not held: helm round 2 §2.1, it stays at 500
      expect(crewAxes(d, { ...NONE, rcsX: 1, rcsY: -1, aim: 100 })).toEqual({ turn: 1, thrust: 0.5, rcsX: 1, rcsY: -1 });
      expect(crewAxes(d, { ...NONE, rcsX: -1, rcsY: 1 })).toEqual({ turn: 0, thrust: 0.5, rcsX: -1, rcsY: 1 });
      expect(ventOf(crewAxes(d, { ...NONE, rcsY: 1 }))).toEqual({ x: 0, y: 1 });
    } finally { disposeDuel(d); }
  });  it('crewAxes from the state before a tick flies exactly the tick the step flies (mid-ramp throttle, thrusters)', () => {
    const d = still();
    try {
      Object.assign(d.tactical.ships[0], { vx: 40, vy: -25 });
      d.thrMille = 500;   // mid-ramp: W held moves it this tick
      const h: HeldInput = { ...NONE, throttleHeld: 1, rcsX: 1, rcsY: -1, aim: 100 };
      const axes = crewAxes(d, h);
      const copy = { ...d.tactical.ships[0] };
      flyShip(copy, axes, flightFor(d.tactical, 0), d.tactical.systems[0].rooms[Room.Engines], classOf(d.tactical, 0));
      step(d, h);
      const s = d.tactical.ships[0];
      expect({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: s.headingAcc })
        .toEqual({ x: copy.x, y: copy.y, vx: copy.vx, vy: copy.vy, heading: copy.heading, headingAcc: copy.headingAcc });
    } finally { disposeDuel(d); }
  });
});

describe('the scripted crew (spec §4a, §7)', () => {
  it('turns by aim or face, holds the throttle, and never sends moveX, throttle or thruster input', () => {
    const d = createSeatedDuel(CUTTER, 1), pair = createScriptedPair(1);
    try {
      let aims = 0;
      for (let k = 0; k < 1800; k++) {
        const input = scriptedInput(pair, d), atHelm = Seated.station[d.interior.crew[0]!] === d.nav;
        for (const h of input.held) expect([h.rcsX, h.rcsY]).toEqual([undefined, undefined]);
        if (atHelm) expect(input.held[0]!.moveX).toBe(0);   // seated at the Helm it never turns by moveX
        if (input.held[0]?.aim !== undefined) aims++;
        expect(input.commands.some((e) => e.command.kind === 'throttle')).toBe(false);
        stepDuelTick(d, input);
      }
      expect(aims).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
});
