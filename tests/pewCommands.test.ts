// W-1 pew pew (spec 2026-11-18-pew-pew-weapons-design §4, §5): pewFire on the wire and through the duel step: the codec
// round-trips it, the step admits it from the Weapons attendant with a valid aim and a third stored, fires at most one
// round a tick, answers NO CHARGE as unavailable, and a pew kill names 'pew' as the terminal cause.
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { sitDown } from '../src/renderer/src/sim/stations';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';
import { createSeatedValkyrn } from './helpers/valkyrnDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: Array.from({ length: d.interior.playerCount }, () => NONE), commands });
const why = (r: ReturnType<typeof step>) => r.map((x) => x.reason ?? x.status);
/** A Cutter duel with player 0 standing and player 1 at Weapons. */
function gunnerAtWeapons(): DuelState { const d = createDuel(CUTTER, 5); sitDown(d.interior, 1, d.weapons); return d; }
const ahead = (d: DuelState) => ({ kind: 'pewFire' as const, aim: d.tactical.ships[0].heading, aimAcc: 0 });

describe('pewFire on the wire (spec §4)', () => {
  it('round-trips through the duel codec; a non-integer or missing field does not pass', () => {
    const codec = duelCodec(2), env = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 1, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    const good = env({ kind: 'pewFire', aim: 12, aimAcc: 200 });
    expect(codec.decodeMessage(codec.encodeMessage(good))).toEqual(good);
    for (const bad of [{ kind: 'pewFire', aim: 1.5, aimAcc: 0 }, { kind: 'pewFire', aim: 3 }, { kind: 'pewFire', aim: 3, aimAcc: 0, extra: 1 }]) expect(() => codec.encodeMessage(env(bad))).toThrow();
  });
});

describe('pewFire through the duel step (spec §1, §4, §5)', () => {
  it('the gunner\'s shot is applied and fires one round', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, ahead(d))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].pewShots).toBe(1);
      expect(d.tactical.pew.filter((r) => r.active)).toHaveLength(1);
    } finally { disposeDuel(d); }
  });
  it('several in one tick fire once: the first applies, the rest are noop', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, ahead(d)), cmd(d, 1, { kind: 'pewFire', aim: 3, aimAcc: 9 }), cmd(d, 1, ahead(d))]))).toEqual(['applied', 'noop', 'noop']);
      expect(d.tactical.systems[0].pewShots).toBe(1);
    } finally { disposeDuel(d); }
  });
  it('rejects a stale tick, a sender away from Weapons, and a malformed aim', () => {
    const d = gunnerAtWeapons();
    try {
      const r = step(d, [cmd(d, 1, ahead(d), d.interior.tick + 1), cmd(d, 0, ahead(d)),
        cmd(d, 1, { kind: 'pewFire', aim: 256, aimAcc: 0 }), cmd(d, 1, { kind: 'pewFire', aim: -1, aimAcc: 0 }), cmd(d, 1, { kind: 'pewFire', aim: 0, aimAcc: 256 }), cmd(d, 1, { kind: 'pewFire', aim: 0, aimAcc: -1 })]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed', 'malformed', 'malformed', 'malformed']);   // sorted by player, then sequence
      expect(d.tactical.systems[0].pewShots).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('an unattended Weapons seat fires nothing (no gunner: not-at-weapons, pewAim stays -1)', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(why(step(d, [cmd(d, 0, ahead(d)), cmd(d, 1, ahead(d))]))).toEqual(['not-at-weapons', 'not-at-weapons']);
      expect(d.tactical.systems[0].pewShots).toBe(0);
      expect(d.tactical.pew.every((r) => !r.active)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('with less than a third stored the shot is unavailable (NO CHARGE) and nothing is queued', () => {
    const d = gunnerAtWeapons();
    try {
      d.tactical.systems[0].pewCharge = 59;
      expect(why(step(d, [cmd(d, 1, ahead(d))]))).toEqual(['unavailable']);
      expect(d.tactical.pew.every((r) => !r.active)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('a class without the pew answers unavailable (the Valkyrn)', () => {
    const d = createSeatedValkyrn(5);
    try { expect(why(step(d, [cmd(d, 0, { kind: 'pewFire', aim: 0, aimAcc: 0 })]))).toEqual(['unavailable']); } finally { disposeDuel(d); }
  });
  it('a pew round that takes the Hunter\'s last hull wins the round with terminal cause pew', () => {
    const d = gunnerAtWeapons(), tel = createTelemetry(d), t = d.tactical, h = t.ships[1];
    try {
      Object.assign(h, { vx: 0, vy: 0 });
      t.systems[1].shields = 0; t.systems[1].hull = 1;
      placeRound(t, { x: h.x - 30, y: h.y, vx: 900, vy: 0, age: 0, owner: 0 }, t.pew);
      const input = { held: [NONE, NONE], commands: [] };
      stepDuelTick(d, input); recordTick(tel, d, input);
      expect(t.outcome).toBe(Outcome.CrewWins);
      expect(tel.terminal[1]).toContain('pew');
    } finally { disposeDuel(d); }
  });
});
