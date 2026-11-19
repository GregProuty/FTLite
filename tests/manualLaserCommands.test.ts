// Merge with the Engineering spike (SIM 58, kind a, replaced rule): the crew's beam stands on the Weapons officer's bars and
// starts dark (spec §10.3), so these tests give the crew today's laser and torpedo by bars (todaysCrewWeapons).
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4, §5): laserMode and laserFire on the wire and through the
// duel step. The codec round-trips both; the step admits them from the Weapons attendant only. laserMode sets the crew
// laser's mode (noop when unchanged). laserFire fires in MANUAL with a valid aim and a full charge (else unavailable: NO
// CHARGE), at most once a tick, never with the own torpedo flying. In AUTO laserFire is unavailable, and in MANUAL
// laserCharge is. laserMode takes effect before a same-tick laserFire.
import { describe, expect, it } from 'vitest';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';
import { createSeatedValkyrn } from './helpers/valkyrnDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: Array.from({ length: d.interior.playerCount }, () => NONE), commands });
const why = (r: ReturnType<typeof step>) => r.map((x) => x.reason ?? x.status);
/** A Cutter duel with player 0 standing and player 1 at Weapons. */
function gunnerAtWeapons(): DuelState { const d = createDuel(CUTTER, 5); todaysCrewWeapons(d.tactical); sitDown(d.interior, 1, d.weapons); return d; }
const mode = (manual: boolean): DuelCommand => ({ kind: 'laserMode', manual });
const fire = (aim: number, aimAcc = 0): DuelCommand => ({ kind: 'laserFire', aim, aimAcc });

describe('laserMode and laserFire on the wire (spec §4)', () => {
  it('round-trip through the duel codec; a wrong type, a missing or an extra field does not pass', () => {
    const codec = duelCodec(2), env = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 1, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const good of [env({ kind: 'laserMode', manual: true }), env({ kind: 'laserMode', manual: false }), env({ kind: 'laserFire', aim: 12, aimAcc: 200 })]) expect(codec.decodeMessage(codec.encodeMessage(good))).toEqual(good);
    for (const bad of [{ kind: 'laserMode', manual: 1 }, { kind: 'laserMode' }, { kind: 'laserMode', manual: true, extra: 1 }, { kind: 'laserFire', aim: 1.5, aimAcc: 0 }, { kind: 'laserFire', aim: 3 }, { kind: 'laserFire', aim: 3, aimAcc: 0, extra: 1 }])
      expect(() => codec.encodeMessage(env(bad))).toThrow();
  });
});

describe('laserMode through the duel step (spec §2)', () => {
  it('the gunner sets it; the same value again is noop', () => {
    const d = gunnerAtWeapons();
    try {
      expect(d.tactical.systems[0].laserManual).toBe(false);
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].laserManual).toBe(true);
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['noop']);
      expect(why(step(d, [cmd(d, 1, mode(false))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].laserManual).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('rejects a stale tick, a sender away from Weapons and a malformed value; a class without a laser answers unavailable', () => {
    const d = gunnerAtWeapons();
    try {
      const r = step(d, [cmd(d, 1, mode(true), d.interior.tick + 1), cmd(d, 0, mode(true)), cmd(d, 1, { kind: 'laserMode', manual: 1 } as unknown as DuelCommand)]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed']);   // sorted by player, then sequence
      expect(d.tactical.systems[0].laserManual).toBe(false);
    } finally { disposeDuel(d); }
    const v = createSeatedValkyrn(5);
    try {
      expect(why(step(v, [cmd(v, 0, mode(true)), cmd(v, 0, fire(0))]))).toEqual(['unavailable', 'unavailable']);
      expect(v.tactical.systems[0].laserManual).toBe(false);
    } finally { disposeDuel(v); }
  });
});

describe('laserFire through the duel step (spec §2, §4)', () => {
  it('in MANUAL the gunner\'s shot is applied and fires; a second in the tick is noop', () => {
    const d = gunnerAtWeapons();
    try {
      d.tactical.systems[0].laserManual = true;
      expect(why(step(d, [cmd(d, 1, fire(d.tactical.ships[0].heading)), cmd(d, 1, fire(3, 9))]))).toEqual(['applied', 'noop']);
      expect([d.tactical.systems[0].shots, d.tactical.systems[0].laserCharge]).toEqual([1, 0]);
    } finally { disposeDuel(d); }
  });
  it('rejects a stale tick, a sender away from Weapons and a malformed aim', () => {
    const d = gunnerAtWeapons();
    try {
      d.tactical.systems[0].laserManual = true;
      const r = step(d, [cmd(d, 1, fire(0), d.interior.tick + 1), cmd(d, 0, fire(0)), cmd(d, 1, fire(256)), cmd(d, 1, fire(-1)), cmd(d, 1, fire(0, 256)), cmd(d, 1, fire(0, -1))]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed', 'malformed', 'malformed', 'malformed']);
      expect(d.tactical.systems[0].shots).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('in AUTO it is unavailable and fires nothing; in MANUAL laserCharge is unavailable and fires nothing', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, fire(0))]))).toEqual(['unavailable']);
      d.tactical.systems[0].laserManual = true;
      expect(why(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })]))).toEqual(['unavailable']);
      expect(d.tactical.systems[0].shots).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('with its torpedo flying it is missile-in-flight; without a full charge it is unavailable (NO CHARGE)', () => {
    const d = gunnerAtWeapons();
    try {
      d.tactical.systems[0].laserManual = true;
      d.tactical.systems[0].laserCharge = 0;
      expect(why(step(d, [cmd(d, 1, fire(0))]))).toEqual(['unavailable']);
      const s = d.tactical.ships[0];
      placeMissile(d.tactical, 0, { x: s.x + 600, y: s.y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 30 });
      expect(why(step(d, [cmd(d, 1, fire(0))]))).toEqual(['missile-in-flight']);
      expect(d.tactical.systems[0].shots).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('laserMode takes effect before a laserFire in the same tick, whatever their envelope order', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, fire(d.tactical.ships[0].heading)), cmd(d, 1, mode(true))]))).toEqual(['applied', 'applied']);
      expect([d.tactical.systems[0].laserManual, d.tactical.systems[0].shots]).toEqual([true, 1]);
    } finally { disposeDuel(d); }
  });
});
