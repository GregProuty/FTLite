// Hacking spike (spec §2.4, §6 R1-4, R1-5, R1-14, R1-15): sciencePower and hack on the wire, their admission against the
// Science seat, the hack bars' clamp, the landing tick, the snapshot round trip mid-hack and same-seed determinism.
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sciencePowerRefusal } from '../src/renderer/src/sim/duel/scienceSlots';
import { sitDown } from '../src/renderer/src/sim/stations';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { Contact, Room } from '../src/renderer/src/sim/tactical/state';
import { HACK_DISABLE_TICKS, HACK_TICKS } from '../src/renderer/src/sim/tactical/tuning';
import { CUTTER } from './helpers/scriptedDuel';
import { enemySeen } from './helpers/sensorSight';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope =>
  ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
/** One tick with the enemy held 500 east of the crew ship (seen at every scanner range from 1 bar). */
const step = (d: DuelState, commands: DuelEnvelope[] = []) => { enemySeen(d.tactical, 500); return stepDuelTick(d, { held: [NONE, NONE], commands }); };
const status = (r: ReturnType<typeof step>) => r.map((x) => x.reason ?? x.status);
/** Player 0 at Science, player 1 standing; Sensors at `sensors` bars. */
function atScience(sensors = 3, seed = 5): DuelState {
  const d = createDuel(CUTTER, seed, 0, 2);
  sitDown(d.interior, 0, d.science);
  d.tactical.systems[0].bars[DuelSystem.Sensors] = sensors;
  return d;
}
/** Ready to hack: 2 bars on HACK and the enemy designated. */
function armed(seed = 5): DuelState {
  const d = atScience(3, seed);
  step(d, [cmd(d, 0, { kind: 'sciencePower', delta: 1 }), cmd(d, 0, { kind: 'sciencePower', delta: 1 }), cmd(d, 0, { kind: 'designate', contact: Contact.Enemy })]);
  return d;
}

describe('sciencePower (§2.4, R1-5)', () => {
  it('is the Science seat\'s, ±1, and moves bars between the scanner and the hack within the Sensors bars', () => {
    const d = atScience(3);
    try {
      expect(status(step(d, [cmd(d, 1, { kind: 'sciencePower', delta: 1 })]))).toEqual(['invalid-seat']);
      expect(status(step(d, [cmd(d, 0, { kind: 'sciencePower', delta: 2 })]))).toEqual(['malformed']);
      expect(status(step(d, [cmd(d, 0, { kind: 'sciencePower', delta: -1 })]))).toEqual(['unavailable']);
      expect(status(step(d, [cmd(d, 0, { kind: 'sciencePower', delta: 1 }, d.interior.tick - 1)]))).toEqual(['stale-tick']);
      expect(status(step(d, [1, 1, 1, 1].map((delta) => cmd(d, 0, { kind: 'sciencePower', delta }))))).toEqual(['applied', 'applied', 'applied', 'unavailable']);
      expect(d.tactical.systems[0].hackPower).toBe(3);
      expect(sciencePowerRefusal(d, 1)).toBe('NO FREE BAR');
      expect(sciencePowerRefusal(d, -1)).toBeNull();
    } finally { disposeDuel(d); }
  });
  it('is clamped to the effective Sensors bars, so a lost bar never comes back to the hack by itself', () => {
    const d = atScience(3);
    try {
      step(d, [1, 1, 1].map((delta) => cmd(d, 0, { kind: 'sciencePower', delta })));
      d.tactical.systems[0].bars[DuelSystem.Sensors] = 1;
      step(d);
      expect(d.tactical.systems[0].hackPower).toBe(1);
      d.tactical.systems[0].bars[DuelSystem.Sensors] = 3;
      step(d);
      expect(d.tactical.systems[0].hackPower).toBe(1);
    } finally { disposeDuel(d); }
  });
});

describe('hack (§2.4)', () => {
  it('is refused off the seat, malformed, offline or undesignated; starts, noops on the running room, and cancels with no event', () => {
    const d = atScience(3);
    try {
      expect(status(step(d, [cmd(d, 1, { kind: 'hack', room: 0 })]))).toEqual(['invalid-seat']);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: 3 })]))).toEqual(['malformed']);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: 0.5 })]))).toEqual(['malformed']);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: 0 })]))).toEqual(['unavailable']);   // no hack bars
      step(d, [cmd(d, 0, { kind: 'sciencePower', delta: 1 }), cmd(d, 0, { kind: 'sciencePower', delta: 1 })]);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: 0 })]))).toEqual(['unavailable']);   // not designated
      expect(status(step(d, [cmd(d, 0, { kind: 'designate', contact: Contact.Enemy }), cmd(d, 0, { kind: 'hack', room: Room.Shields })]))).toEqual(['applied', 'applied']);
      expect([d.tactical.hackRoom, d.tactical.hackTicks]).toEqual([Room.Shields, 1]);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: Room.Shields })]))).toEqual(['noop']);
      expect(d.tactical.hackTicks).toBe(2);   // the running hold is kept
      const r = stepDuelTick(d, { held: [NONE, NONE], commands: [cmd(d, 0, { kind: 'hack', room: -1 })] });
      expect(status(r)).toEqual(['applied']);
      expect(d.tactical.events.some((e) => e.kind === 'hack')).toBe(false);
      expect([d.tactical.hackRoom, d.tactical.hackTicks]).toEqual([-1, 0]);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: -1 })]))).toEqual(['noop']);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: 1 }, d.interior.tick + 1)]))).toEqual(['stale-tick']);
    } finally { disposeDuel(d); }
  });
  it('switching rooms restarts the hold on the new room', () => {
    const d = armed();
    try {
      step(d, [cmd(d, 0, { kind: 'hack', room: Room.Weapons })]);
      for (let k = 0; k < 50; k++) step(d);
      step(d, [cmd(d, 0, { kind: 'hack', room: Room.Engines })]);
      expect([d.tactical.hackRoom, d.tactical.hackTicks]).toEqual([Room.Engines, 1]);
    } finally { disposeDuel(d); }
  });
  it('admitted on tick N lands at the end of tick N + 419; the room stays off 1800 ticks; a hack on it meanwhile is refused', () => {
    const d = armed();
    try {
      const n = d.interior.tick;
      step(d, [cmd(d, 0, { kind: 'hack', room: Room.Engines })]);
      while (d.interior.tick < n + HACK_TICKS - 1) step(d);
      expect(d.tactical.systems[1].hacked[Room.Engines]).toBe(0);
      step(d);   // tick n + 419
      expect(d.tactical.systems[1].hacked[Room.Engines]).toBe(HACK_DISABLE_TICKS);
      expect(status(step(d, [cmd(d, 0, { kind: 'hack', room: Room.Engines })]))).toEqual(['unavailable']);
      for (let k = 1; k < HACK_DISABLE_TICKS - 1; k++) step(d);
      expect(d.tactical.systems[1].hacked[Room.Engines]).toBe(1);
      step(d);
      expect(d.tactical.systems[1].hacked[Room.Engines]).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('is lost when Science stands up', () => {
    const d = armed();
    try {
      step(d, [cmd(d, 0, { kind: 'hack', room: Room.Weapons })]);
      for (let k = 0; k < 30; k++) step(d);
      expect(status(step(d, [cmd(d, 0, { kind: 'stand' })]))).toEqual(['applied']);
      expect([d.tactical.hackRoom, d.tactical.hackTicks]).toEqual([-1, 0]);
      expect(d.tactical.events).toContainEqual({ kind: 'hack', what: 'lost', room: Room.Weapons });
    } finally { disposeDuel(d); }
  });
});

describe('determinism with hacks (R1-15)', () => {
  const play = (d: DuelState, ticks: number): void => {
    for (let k = 0; k < ticks; k++) step(d, k === 2 ? [cmd(d, 0, { kind: 'hack', room: Room.Shields })] : []);
  };
  it('two runs of the same seed and commands hash alike', () => {
    const a = armed(9), b = armed(9);
    try { play(a, 600); play(b, 600); expect(hashDuel(a)).toBe(hashDuel(b)); } finally { disposeDuel(a); disposeDuel(b); }
  });
  it('a snapshot restored mid-hack, and on the tick after landing, runs on exactly as the original', () => {
    for (const at of [200, HACK_TICKS + 3]) {
      const d = armed(9);
      try {
        play(d, at);
        const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
        try {
          expect(hashDuel(r)).toBe(hashDuel(d));
          for (let k = 0; k < 300; k++) { step(d); step(r); expect(hashDuel(r)).toBe(hashDuel(d)); }
        } finally { disposeDuel(r); }
      } finally { disposeDuel(d); }
    }
  });
});

describe('the wire (R1-15)', () => {
  it('encodes both commands and rejects malformed ones', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const c of [{ kind: 'sciencePower', delta: 1 }, { kind: 'sciencePower', delta: -1 }, { kind: 'hack', room: -1 }, { kind: 'hack', room: 2 }])
      expect(codec.decodeMessage(codec.encodeMessage(envelope(c)))).toEqual(envelope(c));
    for (const bad of [{ kind: 'sciencePower' }, { kind: 'sciencePower', delta: 0.5 }, { kind: 'hack', room: '1' }, { kind: 'hack', room: 1, extra: 1 }, { kind: 'hack', room: Infinity }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});

describe('the hack across rounds (R1-15)', () => {
  it('is refused duel-decided on the end card, and a rematch starts the next round with all four hack fields at rest', () => {
    const d = armed();
    try {
      step(d, [cmd(d, 0, { kind: 'hack', room: Room.Weapons })]);
      for (let k = 0; k < HACK_TICKS + 5; k++) step(d);
      d.tactical.hackRoom = Room.Shields; d.tactical.hackTicks = 9;
      d.tactical.systems[1].hull = 0;
      step(d);   // the crew wins this tick
      expect(d.tactical.outcome).not.toBe(0);
      const r = stepDuelTick(d, { held: [NONE, NONE], commands: [cmd(d, 0, { kind: 'hack', room: 0 }), cmd(d, 0, { kind: 'sciencePower', delta: -1 })] });
      expect(status(r)).toEqual(['duel-decided', 'duel-decided']);
      stepDuelTick(d, { held: [NONE, NONE], commands: [cmd(d, 0, { kind: 'rematch' })] });
      stepDuelTick(d, { held: [NONE, NONE], commands: [] });
      const t = d.tactical;
      expect([t.systems[0].hackPower, [...t.systems[1].hacked], t.hackRoom, t.hackTicks]).toEqual([0, [0, 0, 0], -1, 0]);
    } finally { disposeDuel(d); }
  });
});
