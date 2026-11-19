// Spike ii §6.1: the rockLock command: the wire, validation in the duel step (stale, the seat, malformed, noop), its
// order after laserLock and torpLock (a same-tick rockLock wins for its weapon), its effects on the laser and the
// torpedo, and missileLaunch's admission with this tick's effective torpedo rock target.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { shipModule } from '../src/renderer/src/sim/tactical/hash';
import { beginRockTick, rockSlots } from '../src/renderer/src/sim/tactical/rocks';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { seeded } from './helpers/rockArena';
import { createSeatedDuel } from './helpers/duelSeat';
import { enemySeen, holdInSight } from './helpers/sensorSight';

const layout = parseShip(cutter), NONE = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
const why = (rs: ReturnType<typeof step>) => rs.map((r) => r.reason ?? r.status);

describe('rockLock validation (spec §6.1)', () => {
  it('stale first, then the seat, then malformed, then noop for an empty slot; the gunner\'s applies', () => {
    const d = createSeatedDuel(layout, 5, 0, 2, ShipClass.ValkyrnLaser), t = d.tactical, s = t.systems[0], empty = rockSlots(t) - 1;   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      const stale = { ...cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 }), requestedTick: d.interior.tick + 1 };
      const r = step(d, [stale,
        cmd(d, 0, { kind: 'rockLock', weapon: 'laser', rock: 0 }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'gun', rock: 0 } as unknown as DuelCommand),
        cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: rockSlots(t) }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: -2 }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 1.5 }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: empty }),
        cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 })]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed', 'malformed', 'malformed', 'malformed', 'noop', 'applied']);
      expect([s.laserRock, s.laserTargeted, s.torpRock]).toEqual([0, true, -1]);
    } finally { disposeDuel(d); }
  });
});

describe('rockLock effects and order (spec §6.1)', () => {
  it('the laser: −1 clears it and laserTargeted; a laserLock clears the rock first; a same-tick rockLock beats a laserLock', () => {
    const d = createSeatedDuel(layout, 5, 0, 2, ShipClass.ValkyrnLaser), s = d.tactical.systems[0];   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      holdInSight(d.tactical);   // Engineering spike spec §10.4: a laserLock needs the target seen
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 })]);
      expect([s.laserRock, s.laserTargeted]).toEqual([0, true]);
      step(d, [cmd(d, 1, { kind: 'laserLock', room: 2 })]);
      expect([s.laserRock, s.lock, s.laserTargeted]).toEqual([-1, 2, true]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: 0 }), cmd(d, 1, { kind: 'laserLock', room: 0 })]);
      expect([s.laserRock, s.lock, s.laserTargeted]).toEqual([0, 0, true]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'laser', rock: -1 })]);
      expect([s.laserRock, s.laserTargeted]).toEqual([-1, false]);
    } finally { disposeDuel(d); }
  });
  it('the torpedo: rockLock sets torpRock and clears torpLock; a torpLock clears torpRock; the same tick the rock wins', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.systems[0];
    try {
      holdInSight(d.tactical);   // Engineering spike spec §10.4: a torpLock needs the target seen
      step(d, [cmd(d, 1, { kind: 'torpLock', room: 1 })]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 0 })]);
      expect([s.torpRock, s.torpLock]).toEqual([0, -1]);   // the crew is far from rock 0: no launch
      step(d, [cmd(d, 1, { kind: 'torpLock', room: 2 })]);
      expect([s.torpRock, s.torpLock]).toEqual([-1, 2]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 0 }), cmd(d, 1, { kind: 'torpLock', room: 1 })]);
      expect([s.torpRock, s.torpLock]).toEqual([0, -1]);
      step(d, [cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: -1 })]);
      expect(s.torpRock).toBe(-1);
    } finally { disposeDuel(d); }
  });
  it('missileLaunch is admitted with this tick\'s effective torpRock: a same-tick rockLock counts, a same-tick torpLock clears it', () => {
    const near = (d: DuelState): void => { d.tactical.rocks.fill(0); seeded(d.tactical, 0); beginRockTick(d.tactical); const a = d.tactical.map.asteroids[0]!; Object.assign(d.tactical.ships[0], { x: a.x, y: a.y - 200, vx: 0, vy: 0 }); enemySeen(d.tactical); };   // Engineering spike spec §10.4: the torpLock needs the target seen
    const d = createSeatedDuel(layout, 5);
    try {
      near(d);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' })]))).toEqual(['unavailable']);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' }), cmd(d, 1, { kind: 'rockLock', weapon: 'torpedo', rock: 0 })]))).toEqual(['applied', 'applied']);
      expect([d.tactical.systems[0].torpRockFlying, d.tactical.systems[0].torpRock, d.tactical.systems[0].missilesLaunched]).toEqual([0, -1, 1]);   // rock 0 is the only rock, so the torpedo has a clear line for the launch tick
    } finally { disposeDuel(d); }
    const e = createSeatedDuel(layout, 5);
    try {
      near(e); e.tactical.systems[0].torpRock = 0;
      expect(why(step(e, [cmd(e, 1, { kind: 'missileLaunch' }), cmd(e, 1, { kind: 'torpLock', room: 1 })]))).toEqual(['unavailable', 'applied']);
      expect([e.tactical.systems[0].torpRock, e.tactical.systems[0].torpLock, e.tactical.systems[0].missilesLaunched]).toEqual([-1, 1, 0]);
    } finally { disposeDuel(e); }
  });
});

describe('the wire and the module (spec §6.1)', () => {
  it('the ship module owns rockLock right after torpLock, and the duel codec carries it', () => {
    expect(shipModule.commands).toEqual(['laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']);   // W-1 merge: the pew last; W-2: the laser mode first; W-3: the torpedo mode second
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const command of [{ kind: 'rockLock', weapon: 'laser', rock: 0 }, { kind: 'rockLock', weapon: 'torpedo', rock: -1 }, { kind: 'rockLock', weapon: 'laser', rock: 181 }])
      expect(codec.decodeMessage(codec.encodeMessage(envelope(command)))).toEqual(envelope(command));
    for (const command of [{ kind: 'rockLock', weapon: 'gun', rock: 0 }, { kind: 'rockLock', weapon: 'laser', rock: -2 }, { kind: 'rockLock', weapon: 'laser', rock: 1.5 }, { kind: 'rockLock', rock: 0 }, { kind: 'rockLock', weapon: 'laser', rock: 0, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(command))).toThrow();
  });
});
