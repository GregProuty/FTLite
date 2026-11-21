// Hacking spike (code review 6): a small seeded fuzz of the Science commands. Random sciencePower, hack, designate,
// Sensors shipPower, sit / stand and range changes; every 7th tick a snapshot through JSON must validate and restore to
// the same hash, so the value rules stay true of every reachable state if the hack step or the admission are reordered.
// Also the gun's gates read a hack (gun.ts roomLevel).
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { tickGun } from '../src/renderer/src/sim/tactical/gun';
import { createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };

/** A seeded LCG (test code). */
function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

describe('the Science commands under a seeded fuzz (code review 6)', () => {
  for (const seed of [2, 11]) it(`seed ${seed}: 1500 ticks of random Science play keep every snapshot valid and restorable`, () => {
    const d = createDuel(CUTTER, seed, 0, 2), rnd = lcg(seed * 7919);
    let sequence = 0, running = 0, landed = 0;
    try {
      sitDown(d.interior, 0, d.science);
      d.tactical.systems[0].bars[DuelSystem.Sensors] = 3;
      for (let k = 0; k < 1500; k++) {
        const t = d.tactical, a = t.ships[0], b = t.ships[1], commands: DuelEnvelope[] = [];
        const send = (command: DuelCommand, player = 0): void => { commands.push({ runId: 'duel', id: { player, sequence: ++sequence }, requestedTick: d.interior.tick, command }); };
        // Calm windows (450 of every 750 ticks) hold the enemy in range and start a hack so one can land; the rest is chaos.
        const calm = k % 750 < 450, before = t.systems[1].hacked.some((v) => v > 0) ? 1 : 0;
        if (calm) {
          b.x = a.x + 500; b.y = a.y; b.vx = a.vx; b.vy = a.vy;
          if (k % 750 === 0) { send({ kind: 'sciencePower', delta: 1 }); send({ kind: 'sciencePower', delta: 1 }); send({ kind: 'designate', contact: 0 }); send({ kind: 'hack', room: Math.floor(rnd() * 3) }); }
        } else {
          if (rnd() < 0.5) { b.x = a.x + 300 + rnd() * 2200; b.y = a.y; b.vx = a.vx; b.vy = a.vy; }   // in and out of range
          const r = rnd();
          if (r < 0.08) send({ kind: 'sciencePower', delta: rnd() < 0.6 ? 1 : -1 });
          else if (r < 0.14) send({ kind: 'hack', room: Math.floor(rnd() * 4) - 1 });
          else if (r < 0.18) send({ kind: 'designate', contact: Math.floor(rnd() * 3) - 1 });
          else if (r < 0.24) send({ kind: 'shipPower', system: DuelSystem.Sensors, delta: rnd() < 0.6 ? 1 : -1 }, 1);
          else if (r < 0.25) send({ kind: 'stand' });
          else if (r < 0.26) send({ kind: 'sit', station: d.science });
          if (rnd() < 0.3) { send({ kind: 'sciencePower', delta: 1 }); send({ kind: 'hack', room: 1 }); }   // the same-tick pairings
        }
        stepDuelTick(d, { held: [NONE, NONE], commands });
        if (t.hackRoom >= 0) running++;
        if (!before && t.systems[1].hacked.some((v) => v > 0)) landed++;
        if (t.outcome !== 0) break;
        if (k % 7 === 0) {
          const back = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
          try { expect(hashDuel(back)).toBe(hashDuel(d)); } finally { disposeDuel(back); }
        }
      }
      expect(running).toBeGreaterThan(400);   // the fuzz does run hacks ...
      expect(landed).toBeGreaterThan(0);      // ... and lands at least one
    } finally { disposeDuel(d); }
  });
});

describe('the gun reads a hack (gun.ts roomLevel, code review 6)', () => {
  it('a hacked Weapons room keeps a gun from firing and halves its cooling, as damage level 2 does', () => {
    const t = createTacticalState(3, 2, ShipClass.Valkyrn), s = t.systems[0];
    s.gunHeat = 40; s.gunCooldown = 0;
    tickGun(t, 0, { ...IDLE_INPUT, gunHeld: true });
    expect(s.gunShots).toBe(1);
    const cooled = createTacticalState(3, 2, ShipClass.Valkyrn), c = cooled.systems[0];
    c.gunHeat = 40; c.gunCooldown = 0; c.hacked[Room.Weapons] = 10;
    tickGun(cooled, 0, { ...IDLE_INPUT, gunHeld: true });
    expect(c.gunShots).toBe(0);
    const plain = createTacticalState(3, 2, ShipClass.Valkyrn), p = plain.systems[0];
    p.gunHeat = 40; p.gunCooldown = 5;
    tickGun(plain, 0, IDLE_INPUT);
    expect(40 - c.gunHeat).toBe((40 - p.gunHeat) / 2);
  });
});
