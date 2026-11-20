// Helm round 2 (spec 2026-11-19-helm-round2-design §2, §7, §8): the crew Helm's throttle that stays where it is left, reverse
// at 50 % on the Hound (40 % on every other class), and the tap's cut: throttleCut's admission, the cut, its latch, and the
// app's crewAxes flying what crewHelm flies with the latch set.
import { describe, expect, it } from 'vitest';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { crewThrust, rampTicks, throttleFloor } from '../src/renderer/src/sim/duel/helmFlight';
import { helmModule } from '../src/renderer/src/sim/duel/modules';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { disposeDuel, DUEL_CREW_MAX, type DuelState } from '../src/renderer/src/sim/duel/state';
import { crewAxes, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import * as duelTuning from '../src/renderer/src/sim/duel/tuning';
import { THR_MAX, THR_MIN, THR_RAMP } from '../src/renderer/src/sim/duel/tuning';
import { CUTTER_CLASS, HUNTER_CLASS, ShipClass, type ShipClassDef } from '../src/renderer/src/sim/tactical/defs';
import { flightFor, flyShip } from '../src/renderer/src/sim/tactical/physics';
import { classOf, createTacticalState, Outcome, Room, type Ship } from '../src/renderer/src/sim/tactical/state';
import { DT, HOUND_REVERSE_FRACTION, REVERSE_FRACTION, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const W: HeldInput = { ...NONE, throttleHeld: 1 }, S: HeldInput = { ...NONE, throttleHeld: -1 };
const CUT: DuelCommand = { kind: 'throttleCut' };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const hold = (d: DuelState, h: HeldInput, ticks: number): number[] => { const out: number[] = []; for (let k = 0; k < ticks; k++) { step(d, [], [h, NONE]); out.push(d.thrMille); } return out; };
const statuses = (r: ReturnType<typeof stepDuelTick>) => r.map((x) => (x.status === 'rejected' ? x.reason : x.status));
/** Owner 2026-11-19: `n` bars on Engines (the overdrive 5th takes the Shields' two, so the reactor still holds 10). */
const engines = (d: DuelState, n: number): void => { const b = d.tactical.systems[0].bars; b[DuelSystem.Engines] = n; if (n === 5) b[DuelSystem.Shields] = 0; };

describe('the throttle stays where it is left (spec §2.1)', () => {
  it('the numbers: −500..1000 and 17 a tick; THR_RETURN is gone', () => {
    expect([THR_MIN, THR_MAX, THR_RAMP]).toEqual([-500, 1000, 17]);
    expect(Object.keys(duelTuning)).not.toContain('THR_RETURN');
  });
  it('the ramp reaches 1000 in 59 ticks and −500 in 30', () => {
    expect([rampTicks(0, 1, -500, 1000, 58), rampTicks(0, 1, -500, 1000, 59), rampTicks(0, -1, -500, 1000, 29), rampTicks(0, -1, -500, 1000, 30)]).toEqual([986, 1000, -493, -500]);
    const d = createSeatedDuel(CUTTER, 5);
    try {
      engines(d, 4);
      const up = hold(d, W, 59);
      expect([up[0], up[57], up[58]]).toEqual([17, 986, 1000]);
      const down = hold(d, S, 89);
      expect([down[57], down[58], down[87], down[88]]).toEqual([14, -3, -496, -500]);   // down through 0 into reverse, then the floor
    } finally { disposeDuel(d); }
  });
  it('released, it holds its value for 600 ticks, forward or reverse', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      engines(d, 4); hold(d, W, 30);
      expect(d.thrMille).toBe(510);
      expect(hold(d, NONE, 600).every((m) => m === 510)).toBe(true);
      hold(d, S, 40);
      expect(d.thrMille).toBe(-170);
      expect(hold(d, NONE, 600).every((m) => m === -170)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('the clamp lowers it the tick an Engines bar is lost, and the bar coming back does not raise it', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      engines(d, 4); hold(d, W, 59);
      expect(d.thrMille).toBe(1000);
      d.tactical.systems[0].rooms[Room.Engines] = 1;   // the Engines Room hit: 2 effective bars, cap 500
      step(d);
      expect(d.thrMille).toBe(500);
      d.tactical.systems[0].rooms[Room.Engines] = 0;   // repaired; clampToCapacity left 2 bars, so put 4 back: cap 1000 again
      engines(d, 4);
      expect(hold(d, NONE, 60).every((m) => m === 500)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('an unattended Helm keeps it: the ship stands at 510 and keeps thrusting', () => {
    const d = createSeatedDuel(CUTTER, 5), twin = createSeatedDuel(CUTTER, 5);
    try {
      for (const x of [d, twin]) { engines(x, 4); hold(x, W, 30); }
      twin.thrMille = 0;
      for (const x of [d, twin]) expect(statuses(step(x, [cmd(x, 0, { kind: 'stand' })]))).toEqual(['applied']);
      expect([d.thrMille, twin.thrMille]).toEqual([510, 0]);
      expect(hold(d, NONE, 120).every((m) => m === 510)).toBe(true);
      for (let k = 0; k < 120; k++) step(twin);
      const a = d.tactical.ships[0], b = twin.tactical.ships[0];
      expect(Math.hypot(a.vx - b.vx, a.vy - b.vy)).toBeGreaterThan(10);   // it thrust the whole time it stood
    } finally { disposeDuel(d); disposeDuel(twin); }
  });
  it('a new round starts at 0 with no latch', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { thrMille: 600, thrCut: true });
      d.tactical.outcome = Outcome.CrewWins; d.decidedTick = d.interior.tick;
      step(d, [cmd(d, 0, { kind: 'rematch' })]);
      expect([d.round, d.thrMille, d.thrCut]).toEqual([1, 0, false]);
    } finally { disposeDuel(d); }
  });
});

describe('reverse is 50 % on the Hound (spec §2.2)', () => {
  const NO_FIELD: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: 0 };
  /** One tick's push along +y (the reverse of a nose-north ship) in u/s², for `cls` at thrust axis `thrust`. */
  const push = (cls: ShipClassDef, thrust: number): number => {
    const s: Ship = { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0 };
    flyShip(s, { turn: 0, thrust }, NO_FIELD, 0, cls);
    return s.vy / DT;
  };
  it('full reverse pushes 60 u/s² on the Hound and 48 on the Hunter\'s class', () => {
    expect([CUTTER_CLASS.reverseFraction, HUNTER_CLASS.reverseFraction, HOUND_REVERSE_FRACTION, REVERSE_FRACTION]).toEqual([0.5, 0.4, 0.5, 0.4]);
    expect(push(CUTTER_CLASS, crewThrust(THR_MIN))).toBeCloseTo(60, 9);
    expect(push(HUNTER_CLASS, -1)).toBeCloseTo(48, 9);
    expect(push(CUTTER_CLASS, crewThrust(-250))).toBeCloseTo(30, 9);
  });
  it('crewThrust is −1..1: a five-hundredth per mille in reverse, a thousandth forward', () => {
    expect([-500, -250, 0, 250, 1000].map(crewThrust)).toEqual([-1, -0.5, 0, 0.25, 1]);
  });
  it('reverse still needs an Engines bar: the floor is THR_MIN from 1 bar, else 0', () => {
    expect([0, 1, 5].map(throttleFloor)).toEqual([0, -500, -500]);
  });
});

describe('the tap\'s cut: throttleCut (spec §2.3)', () => {
  it('is admitted against the seats after the seat phase: stale-tick, invalid-seat, unavailable on the Valkyrn, noop at 0', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      expect(statuses(step(d, [cmd(d, 0, CUT, d.interior.tick + 1), cmd(d, 0, CUT), cmd(d, 1, CUT)]))).toEqual(['stale-tick', 'noop', 'invalid-seat']);
      expect(statuses(step(v, [cmd(v, 0, CUT)]))).toEqual(['unavailable']);
      d.thrMille = 300;
      expect(statuses(step(d, [cmd(d, 0, { kind: 'stand' }), cmd(d, 0, CUT)]))).toEqual(['applied', 'invalid-seat']);   // the stand empties the Helm before the cut is judged
      expect(d.thrMille).toBe(300);
    } finally { disposeDuel(d); disposeDuel(v); }
  });
  it('zeroes the throttle; with the key already up the latch clears that tick, and W ramps on the next', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 400;
      expect(statuses(step(d, [cmd(d, 0, CUT)]))).toEqual(['applied']);
      expect([d.thrMille, d.thrCut]).toEqual([0, false]);   // the cut's own tick counts
      step(d, [], [W, NONE]);
      expect(d.thrMille).toBe(THR_RAMP);
      expect(statuses(step(d, [cmd(d, 0, CUT), cmd(d, 0, CUT)]))).toEqual(['applied', 'noop']);   // the second in a tick finds 0
    } finally { disposeDuel(d); }
  });
  it('with S still held (a late held frame) it stays at 0 while S stays held, and moves again one tick after throttleHeld 0', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 400;
      step(d, [cmd(d, 0, CUT)], [S, NONE]);
      expect([d.thrMille, d.thrCut]).toEqual([0, true]);
      expect(hold(d, S, 10)).toEqual(Array(10).fill(0));   // §7: the authority's throttle stays at 0 through a late S
      expect(d.thrCut).toBe(true);
      hold(d, NONE, 1);
      expect([d.thrMille, d.thrCut]).toEqual([0, false]);
      hold(d, S, 1);
      expect(d.thrMille).toBe(-THR_RAMP);
    } finally { disposeDuel(d); }
  });
  it('the latch clears when the Helm is left', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 400;
      step(d, [cmd(d, 0, CUT)], [W, NONE]);
      expect(d.thrCut).toBe(true);
      step(d, [cmd(d, 0, { kind: 'stand' })], [W, NONE]);
      expect([d.thrCut, d.thrMille]).toEqual([false, 0]);
    } finally { disposeDuel(d); }
  });
  it('the helm module owns throttleCut; the codec carries it with no fields', () => {
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle', 'heading', 'throttleCut'], ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']]);
    const codec = duelCodec(DUEL_CREW_MAX), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    expect(codec.decodeMessage(codec.encodeMessage(envelope(CUT)))).toEqual(envelope(CUT));
    expect(() => codec.encodeMessage(envelope({ kind: 'throttleCut', to: 0 }))).toThrow();
  });
});

describe('crewAxes flies what crewHelm flies with the latch set (spec §7)', () => {
  it('with the latch set and S held, the predicted axes are the stepped tick\'s', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d.tactical.ships[0], { vx: 40, vy: -25 });
      Object.assign(d, { thrMille: 0, thrCut: true });
      const axes = crewAxes(d, S);
      expect(axes.thrust).toBe(0);
      const copy = { ...d.tactical.ships[0] };
      flyShip(copy, axes, flightFor(d.tactical, 0), d.tactical.systems[0].rooms[Room.Engines], classOf(d.tactical, 0));
      step(d, [], [S, NONE]);
      const s = d.tactical.ships[0];
      expect([s.x, s.y, s.vx, s.vy]).toEqual([copy.x, copy.y, copy.vx, copy.vy]);
      expect(crewAxes(d, S, 0, false).thrust).toBe(crewThrust(-THR_RAMP));   // Decision 6: a latch the caller predicts
    } finally { disposeDuel(d); }
  });
});
