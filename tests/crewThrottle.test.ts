// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §5, §7, §8): the crew Helm's held throttle in the duel
// step (the ramp, the cap and floor from the ENGINE share, the clamp on the tick a bar moves, the unattended return), the
// helmPower command and its admission, and the throttle command refused for a newtonianHelm class but not the Valkyrn.
import { describe, expect, it } from 'vitest';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { helmModule } from '../src/renderer/src/sim/duel/modules';
import { disposeDuel, DUEL_CREW_MAX, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const W: HeldInput = { ...NONE, throttleHeld: 1 }, S: HeldInput = { ...NONE, throttleHeld: -1 };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const hold = (d: DuelState, h: HeldInput, ticks: number): number[] => { const out: number[] = []; for (let k = 0; k < ticks; k++) { step(d, [], [h, NONE]); out.push(d.thrMille); } return out; };
const power = (delta: number): DuelCommand => ({ kind: 'helmPower', delta } as DuelCommand);
const statuses = (r: ReturnType<typeof stepDuelTick>) => r.map((x) => (x.status === 'rejected' ? x.reason : x.status));

describe('the held throttle (spec §3, §5, §8)', () => {
  it('with compressor 0 (cap 1000) held W reaches 1000 in 143 ticks; from the round start (cap 750) it stops at 750', () => {
    const d = createSeatedDuel(CUTTER, 5), e = createSeatedDuel(CUTTER, 5);
    try {
      d.compressor = 0;
      const up = hold(d, W, 143);
      expect([up[0], up[141], up[142]]).toEqual([7, 994, 1000]);
      expect(hold(e, W, 200).at(-1)).toBe(750);
    } finally { disposeDuel(d); disposeDuel(e); }
  });
  it('held S reaches −250; let go, it returns to 0 at 34 a tick with no overshoot', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect(hold(d, S, 36).at(-1)).toBe(-250);
      d.compressor = 0; hold(d, W, 200);
      const down = hold(d, NONE, 31);
      expect([down[0], down[28], down[29], down[30]]).toEqual([966, 14, 0, 0]);
      expect(down.every((m) => m >= 0)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('moving a bar off ENGINE clamps thrMille that same tick', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.compressor = 0; hold(d, W, 143);
      expect(d.thrMille).toBe(1000);
      expect(statuses(step(d, [cmd(d, 0, power(-1))], [W, NONE]))).toEqual(['applied']);
      expect([d.compressor, d.thrMille]).toEqual([1, 750]);
    } finally { disposeDuel(d); }
  });
  it('HELM_BARS 3 with compressor 3 is ENGINE 0: the floor and the cap are 0', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 3 });
    try {
      d.compressor = 3;
      expect([hold(d, W, 20).at(-1), hold(d, S, 20).at(-1)]).toEqual([0, 0]);
    } finally { disposeDuel(d); }
  });
  it('only the Helm attendant\'s throttleHeld counts: Weapons holding W changes nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { for (let k = 0; k < 20; k++) step(d, [], [NONE, W]); expect(d.thrMille).toBe(0); } finally { disposeDuel(d); }
  });
});

describe('the unattended crew Helm (spec §3)', () => {
  it('returns to 0; a Helm that stands at 1000 thrusts down the 30-tick return and turns onto its held heading', () => {
    const d = createSeatedDuel(CUTTER, 5), twin = createSeatedDuel(CUTTER, 5);
    try {
      for (const x of [d, twin]) { x.compressor = 0; hold(x, W, 143); }
      for (const x of [d, twin]) expect(statuses(step(x, [cmd(x, 0, { kind: 'heading', heading: 64 })], [W, NONE]))).toEqual(['applied']);
      twin.thrMille = 0;   // the twin stands with its throttle already at 0
      for (const x of [d, twin]) expect(statuses(step(x, [cmd(x, 0, { kind: 'stand' })]))).toEqual(['applied']);
      expect([d.thrMille, twin.thrMille]).toEqual([966, 0]);
      expect([d.tactical.ships[0].vx, d.tactical.ships[0].vy]).not.toEqual([twin.tactical.ships[0].vx, twin.tactical.ships[0].vy]);   // it thrust while standing
      const down = hold(d, NONE, 29);
      expect([down[27], down[28]]).toEqual([14, 0]);
      for (let k = 0; k < 120; k++) step(d);
      const diff = ((64 - d.tactical.ships[0].heading + 384) % 256) - 128;
      expect(Math.abs(diff)).toBeLessThanOrEqual(4);
    } finally { disposeDuel(d); disposeDuel(twin); }
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

describe('helmPower (spec §5, §7)', () => {
  it('the helm module owns it and its unavailable reason', () => {
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle', 'heading', 'helmPower'], ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']]);
  });
  it('starts at 3 + 1; +1 moves a bar to ENGINE and −1 to COMPRESSOR; refused at both ends of the range', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect([d.helmBars - d.compressor, d.compressor]).toEqual([3, 1]);
      expect(statuses(step(d, [cmd(d, 0, power(1))]))).toEqual(['applied']); expect(d.compressor).toBe(0);
      expect(statuses(step(d, [cmd(d, 0, power(1))]))).toEqual(['unavailable']); expect(d.compressor).toBe(0);
      expect(statuses(step(d, [cmd(d, 0, power(-1)), cmd(d, 0, power(-1)), cmd(d, 0, power(-1))]))).toEqual(['applied', 'applied', 'applied']);   // envelope order within a tick
      expect(d.compressor).toBe(3);
      expect(statuses(step(d, [cmd(d, 0, power(-1))]))).toEqual(['unavailable']); expect(d.compressor).toBe(3);
    } finally { disposeDuel(d); }
  });
  it('the top end is min(3, HELM_BARS)', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 2 });
    try {
      expect(statuses(step(d, [cmd(d, 0, power(-1)), cmd(d, 0, power(-1))]))).toEqual(['applied', 'unavailable']);
      expect(d.compressor).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('admits in order: stale-tick, the Helm seat, the class, the delta, then the range', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      expect(statuses(step(d, [cmd(d, 0, power(1), d.interior.tick + 1), cmd(d, 0, power(2)), cmd(d, 1, power(1))]))).toEqual(['stale-tick', 'malformed', 'invalid-seat']);
      expect(d.compressor).toBe(1);
      expect(statuses(step(v, [cmd(v, 0, power(1)), cmd(v, 0, power(2))]))).toEqual(['unavailable', 'unavailable']);   // the Valkyrn has no split
    } finally { disposeDuel(d); disposeDuel(v); }
  });
  it('round-trips the duel codec as delta 1 or −1 only', () => {
    const codec = duelCodec(DUEL_CREW_MAX), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const delta of [1, -1]) expect(codec.decodeMessage(codec.encodeMessage(envelope({ kind: 'helmPower', delta })))).toEqual(envelope({ kind: 'helmPower', delta }));
    for (const bad of [{ kind: 'helmPower' }, { kind: 'helmPower', delta: 2 }, { kind: 'helmPower', delta: 0 }, { kind: 'helmPower', delta: '1' }, { kind: 'helmPower', delta: 1, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});
