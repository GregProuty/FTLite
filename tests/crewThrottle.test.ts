// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §7, §8): the crew Helm's held throttle in the duel step
// (the ramp, the unattended return), the throttle command refused for a newtonianHelm class but not the Valkyrn.
// Owner 2026-11-19 (the merge with the Engineering spike; replaced rule, kind a): §5's ENGINE/COMPRESSOR split and its
// helmPower command are gone. The cap is min(effective Engines bars, 4) × 250 per mille (1 bar = 25 %, the overdrive 5th
// bar adds no cap), reverse needs at least 1 Engines bar, and Engineering's shipPower or Engines Room damage clamps the
// held throttle the same tick.
import { describe, expect, it } from 'vitest';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { helmModule } from '../src/renderer/src/sim/duel/modules';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { disposeDuel, DUEL_CREW_MAX, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const W: HeldInput = { ...NONE, throttleHeld: 1 }, S: HeldInput = { ...NONE, throttleHeld: -1 };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const hold = (d: DuelState, h: HeldInput, ticks: number): number[] => { const out: number[] = []; for (let k = 0; k < ticks; k++) { step(d, [], [h, NONE]); out.push(d.thrMille); } return out; };
const statuses = (r: ReturnType<typeof stepDuelTick>) => r.map((x) => (x.status === 'rejected' ? x.reason : x.status));
/** Owner 2026-11-19: put `n` bars on Engines (the overdrive 5th takes the Shields' two, so the reactor still holds 10). */
const engines = (d: DuelState, n: number): void => {
  const b = d.tactical.systems[0].bars;
  b[DuelSystem.Engines] = n;
  if (n === 5) b[DuelSystem.Shields] = 0;
};

describe('the held throttle (spec §3, §8; owner 2026-11-19: the cap from the Engines bars)', () => {
  it('the cap at 0, 1, 2, 3, 4 and 5 Engines bars is 0, 250, 500, 750, 1000 and 1000 (the overdrive bar adds no cap)', () => {
    const caps = [0, 1, 2, 3, 4, 5].map((n) => {
      const d = createSeatedDuel(CUTTER, 5);
      try { engines(d, n); return hold(d, W, 200).at(-1); } finally { disposeDuel(d); }
    });
    expect(caps).toEqual([0, 250, 500, 750, 1000, 1000]);
  });
  it('reverse needs a bar: the floor is 0 at 0 Engines bars and −500 at 1 to 5 (helm round 2 §2.2)', () => {
    const floors = [0, 1, 2, 3, 4, 5].map((n) => {
      const d = createSeatedDuel(CUTTER, 5);
      try { engines(d, n); return hold(d, S, 40).at(-1); } finally { disposeDuel(d); }
    });
    expect(floors).toEqual([0, -500, -500, -500, -500, -500]);
  });
  it('at 4 bars held W reaches 1000 in 59 ticks (helm round 2 §2.1); from the round start (Engineering\'s 3 bars, cap 750) it stops at 750', () => {
    const d = createSeatedDuel(CUTTER, 5), e = createSeatedDuel(CUTTER, 5);
    try {
      expect(e.tactical.systems[0].bars[DuelSystem.Engines]).toBe(3);
      engines(d, 4);
      const up = hold(d, W, 59);
      expect([up[0], up[57], up[58]]).toEqual([17, 986, 1000]);
      expect(hold(e, W, 200).at(-1)).toBe(750);
    } finally { disposeDuel(d); disposeDuel(e); }
  });
  it('held S reaches −500; let go, it stays (helm round 2 §2.1: no return)', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect(hold(d, S, 36).at(-1)).toBe(-500);
      expect(hold(d, NONE, 31).every((m) => m === -500)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('Engineering taking an Engines bar (shipPower) clamps thrMille that same tick', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      engines(d, 4); hold(d, W, 143);
      expect(d.thrMille).toBe(1000);
      expect(statuses(step(d, [cmd(d, 1, { kind: 'shipPower', system: DuelSystem.Engines, delta: -1 })], [W, NONE]))).toEqual(['applied']);
      expect([d.tactical.systems[0].bars[DuelSystem.Engines], d.thrMille]).toEqual([3, 750]);
    } finally { disposeDuel(d); }
  });
  it('a reverse becomes 0 the tick the last Engines bar goes', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      engines(d, 1); hold(d, S, 40);
      expect(d.thrMille).toBe(-500);   // helm round 2 §2.2
      expect(statuses(step(d, [cmd(d, 1, { kind: 'shipPower', system: DuelSystem.Engines, delta: -1 })], [S, NONE]))).toEqual(['applied']);
      expect(d.thrMille).toBe(0);
      expect(hold(d, S, 20).at(-1)).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('Engines Room damage lowers the cap as it lowers the effective bars (level 1: 5 − 3 slots, cap 500; level 2: off)', () => {
    const d = createSeatedDuel(CUTTER, 5), e = createSeatedDuel(CUTTER, 5);
    try {
      engines(d, 4); d.tactical.systems[0].rooms[Room.Engines] = 1;
      expect(hold(d, W, 200).at(-1)).toBe(500);
      e.tactical.systems[0].rooms[Room.Engines] = 2;
      expect([hold(e, W, 50).at(-1), hold(e, S, 50).at(-1)]).toEqual([0, 0]);
    } finally { disposeDuel(d); disposeDuel(e); }
  });
  it('only the Helm attendant\'s throttleHeld counts: Weapons holding W changes nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { for (let k = 0; k < 20; k++) step(d, [], [NONE, W]); expect(d.thrMille).toBe(0); } finally { disposeDuel(d); }
  });
});

describe('the unattended crew Helm (spec §3; helm round 2 §2.1)', () => {
  it('keeps its throttle: a Helm that stands at 1000 thrusts on at 1000 and turns onto its held heading', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      engines(d, 4); hold(d, W, 143);
      expect(statuses(step(d, [cmd(d, 0, { kind: 'heading', heading: 64 })], [W, NONE]))).toEqual(['applied']);
      expect(statuses(step(d, [cmd(d, 0, { kind: 'stand' })]))).toEqual(['applied']);
      expect(hold(d, NONE, 29).every((m) => m === 1000)).toBe(true);   // helm round 2 §2.1: a set throttle is a lever
      for (let k = 0; k < 120; k++) step(d);
      const diff = ((64 - d.tactical.ships[0].heading + 384) % 256) - 128;
      expect(Math.abs(diff)).toBeLessThanOrEqual(4);
    } finally { disposeDuel(d); }
  });
});

describe('the throttle command (spec §3)', () => {
  it('is refused unavailable for the crew Helm, after the stale and seat checks; it still works for the Valkyrn', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const r = step(d, [cmd(d, 0, { kind: 'throttle', level: 2 }, d.interior.tick + 1), cmd(d, 0, { kind: 'throttle', level: 2 }), cmd(d, 0, { kind: 'throttle', level: 9 }), cmd(d, 1, { kind: 'throttle', level: 2 })]);
      expect(statuses(r)).toEqual(['stale-tick', 'unavailable', 'unavailable', 'invalid-seat']);   // sorted by player, then sequence
      expect(d.throttle).toBe(0);
      expect(statuses(step(v, [cmd(v, 0, { kind: 'throttle', level: 2 })]))).toEqual(['applied']);
      expect(v.throttle).toBe(2);
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('no helmPower (owner 2026-11-19, replacing spec §5)', () => {
  it('the helm module owns throttle, heading and throttleCut (helm round 2 §2.3)', () => {
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle', 'heading', 'throttleCut'], ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']]);
  });
  it('the duel codec refuses a helmPower command', () => {
    const codec = duelCodec(DUEL_CREW_MAX), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const bad of [{ kind: 'helmPower', delta: 1 }, { kind: 'helmPower', delta: -1 }]) expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
  it('the sim rejects a helmPower that reaches it as not-in-duel', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { expect(statuses(step(d, [cmd(d, 0, { kind: 'helmPower', delta: 1 } as unknown as DuelCommand)]))).toEqual(['not-in-duel']); } finally { disposeDuel(d); }
  });
});
