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
import { crewAxes, headingDelta, helmBoost, helmTurn, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { classOf, Room } from '../src/renderer/src/sim/tactical/state';
import { flightFor, flyShip } from '../src/renderer/src/sim/tactical/physics';
import { RCS_TURN_BOOST, TURN_STEPS_PER_TICK } from '../src/renderer/src/sim/tactical/tuning';
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
  it('a held moveX does not turn a newtonianHelm class, nor clear its held heading', () => {
    const d = still();
    try {
      step(d, NONE, [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'heading', heading: 0 } }]);
      for (let k = 0; k < 30; k++) step(d, { ...NONE, moveX: 1 });
      expect([d.tactical.ships[0].heading, d.holdHeading]).toEqual([0, 0]);
      expect(helmTurn(d, { ...NONE, moveX: -1 })).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('the Valkyrn is unchanged: its A/D still turn it and its held aim still becomes the held heading', () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const h0 = v.tactical.ships[0].heading;
      for (let k = 0; k < 10; k++) step(v, { ...NONE, moveX: 1 });
      expect(v.tactical.ships[0].heading).not.toBe(h0);
      step(v, { ...NONE, aim: 40 }); expect(v.holdHeading).toBe(40);
      expect(helmBoost(v, { ...NONE, aim: 200 })).toBe(1);   // no boost on a class that is not newtonianHelm
    } finally { disposeDuel(v); }
  });
});

describe('the gas boost (spec §4a; owner 2026-11-19: free)', () => {
  it('a far turn runs at 2× for free', () => {
    const d = still();
    try {
      expect(helmBoost(d, { ...NONE, aim: 100 })).toBe(RCS_TURN_BOOST);
      step(d, { ...NONE, aim: 100 });
      expect(nose(d)).toBeCloseTo(RCS_TURN_BOOST * TURN_STEPS_PER_TICK, 9);
      expect([d.helmVent.boosted, d.helmVent.turn]).toEqual([true, 1]);   // clockwise (final review M2)
      expect(Object.keys(d)).not.toContain('rcsGas');
      const e = still();
      try { step(e, { ...NONE, aim: 156 }); expect([e.helmVent.boosted, e.helmVent.turn]).toEqual([true, -1]); } finally { disposeDuel(e); }   // anticlockwise
    } finally { disposeDuel(d); }
  });
  it('is boosted every far tick for as long as the turn lasts: there is no tank to run dry', () => {
    const d = still();
    try {
      let far = 0, boosted = 0;
      for (let k = 0; k < 2000; k++) {
        const aim = Math.floor(k / 60) % 2 === 0 ? 128 : 0, h = { ...NONE, aim, rcsX: 1 };   // a half turn each second, and a thruster held throughout
        const want = helmBoost(d, h);
        step(d, h);
        expect(d.helmVent.boosted, `tick ${k}`).toBe(want === RCS_TURN_BOOST);
        expect(d.helmVent.x, `tick ${k}`).toBe(1);   // the held thruster always vents
        if (Math.abs(headingDelta(d.tactical.ships[0].heading, aim)) > 8) far++;
        if (d.helmVent.boosted) boosted++;
      }
      expect(boosted).toBeGreaterThan(600);
      expect(boosted).toBeGreaterThanOrEqual(far);
    } finally { disposeDuel(d); }
  });
  it('inside the band, with no turn, or with no engine factor (the Engines failed or unpowered) it runs at 1×', () => {
    const d = still();
    try {
      d.holdHeading = -1;
      const h = d.tactical.ships[0].heading;
      expect(helmBoost(d, { ...NONE, aim: (h + 4) % 256 })).toBe(1);   // |d| = 4 is inside the band
      expect(helmBoost(d, { ...NONE, aim: (h + 5) % 256 })).toBe(RCS_TURN_BOOST);
      expect(helmBoost(d, NONE)).toBe(1);                              // no aim, no held heading: no turn
      expect(helmBoost(d, { ...NONE, aim: (h + 100) % 256 })).toBe(RCS_TURN_BOOST);
      d.tactical.systems[0].bars[DuelSystem.Engines] = 0;   // Engineering: no Engines bar, engine factor 0
      expect(helmBoost(d, { ...NONE, aim: (h + 100) % 256 })).toBe(1);
      d.tactical.systems[0].bars[DuelSystem.Engines] = 5; d.tactical.systems[0].bars[DuelSystem.Shields] = 0;   // the overdrive bar: factor 1.25
      expect(helmBoost(d, { ...NONE, aim: (h + 100) % 256 })).toBe(RCS_TURN_BOOST);
      expect(helmBoost(d, { ...NONE, aim: (h + 4) % 256 })).toBe(1);   // the same far band at any factor
      d.tactical.systems[0].bars[DuelSystem.Engines] = 3; d.tactical.systems[0].rooms[Room.Engines] = 2;
      expect(helmBoost(d, { ...NONE, aim: (h + 100) % 256 })).toBe(1);
    } finally { disposeDuel(d); }
  });
  it('a boosted turn settles on an aim, a held heading and the auto-face target without oscillating', () => {
    const a = still(), b = still(), c = still(600, 0);
    try {
      settle(a, { ...NONE, aim: 140 });
      expect(Math.abs(headingDelta(a.tactical.ships[0].heading, 140))).toBeLessThanOrEqual(1);
      step(b, NONE, [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: b.interior.tick, command: { kind: 'heading', heading: 200 } }]);
      settle(b, NONE);
      expect(Math.abs(headingDelta(b.tactical.ships[0].heading, 200))).toBeLessThanOrEqual(2);
      settle(c, { ...NONE, face: true });
      expect(Math.abs(headingDelta(c.tactical.ships[0].heading, 64))).toBeLessThanOrEqual(2);   // the Hunter due east
    } finally { disposeDuel(a); disposeDuel(b); disposeDuel(c); }
  });
});

describe('the app\'s prediction of the axes (spec §6)', () => {
  it('crewAxes flies the held thrust, every held thruster (free cold gas, owner 2026-11-19), and the boost', () => {
    const d = still();
    try {
      d.thrMille = 500;   // W not held: the next tick's ramp returns it by THR_RETURN (34), so it flies 466
      expect(crewAxes(d, { ...NONE, rcsX: 1, rcsY: -1, aim: 100 })).toEqual({ turn: 1, turnBoost: RCS_TURN_BOOST, thrust: 0.466, rcsX: 1, rcsY: -1 });
      expect(crewAxes(d, { ...NONE, rcsX: -1, rcsY: 1 })).toEqual({ turn: 0, turnBoost: 1, thrust: 0.466, rcsX: -1, rcsY: 1 });
      expect(ventOf(crewAxes(d, { ...NONE, rcsY: 1 }))).toEqual({ x: 0, y: 1, boosted: false, turn: 0 });
    } finally { disposeDuel(d); }
  });  it('crewAxes from the state before a tick flies exactly the tick the step flies (mid-ramp throttle, thrusters, boost)', () => {
    const d = still();
    try {
      Object.assign(d.tactical.ships[0], { vx: 40, vy: -25 });
      d.thrMille = 500;   // mid-ramp: W held moves it this tick
      const h: HeldInput = { ...NONE, throttleHeld: 1, rcsX: 1, rcsY: -1, aim: 100 };
      const axes = crewAxes(d, h);
      expect(axes.turnBoost).toBe(RCS_TURN_BOOST);
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
