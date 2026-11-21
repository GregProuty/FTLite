// Hacking spike (spec §1 D10, §2.3, §6 R1-9): a hacked enemy Room reads as level 2 for its ship's gates. Weapons: the
// laser offline, no torpedo, the gun silent and the pew unpowered (its charge held, no rng draws for it). Engines: no
// thrust or turn. Shields: no recharge. With nothing hacked every gate reads as before.
import { describe, expect, it } from 'vitest';
import { classOf, createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { canLaunch, laserOffline, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { pewPowered, pewReady } from '../src/renderer/src/sim/tactical/pew';
import { shipEngineFactor } from '../src/renderer/src/sim/tactical/physics';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';

const HUNTER = 1;

describe('a hacked Weapons room (D10)', () => {
  it('takes the Hunter laser offline, refuses its torpedo and unpowers its pew', () => {
    const t = createTacticalState(5), s = t.systems[HUNTER];
    expect([laserOffline(t, HUNTER), pewPowered(t, HUNTER)]).toEqual([false, true]);
    s.hacked[Room.Weapons] = 100;
    expect(laserOffline(t, HUNTER)).toBe(true);
    expect(canLaunch(t, HUNTER, -1, true)).toBe(false);   // even MANUAL-style (no range test): the torpedo is down
    expect([pewPowered(t, HUNTER), pewReady(t, HUNTER)]).toEqual([false, false]);
  });
  it('holds the pew charge while hacked, and the Hunter fires no pew round and draws nothing for it', () => {
    const t = createTacticalState(5), s = t.systems[HUNTER], def = classOf(t, HUNTER).slots.pew!;
    s.pewCharge = 0; s.hacked[Room.Weapons] = 600;
    for (let k = 0; k < 300; k++) stepDuel(t, UNCREWED_INPUT);
    expect(s.pewCharge).toBe(0);
    expect(s.pewShots).toBe(0);
    expect(t.events.some((e) => e.kind === 'pewFire')).toBe(false);
    expect(def).toBeTruthy();
  });
});

describe('a hacked Engines room (D10)', () => {
  it('drops the Hunter engine factor to the level-2 value, and back when it ends', () => {
    const t = createTacticalState(5), before = shipEngineFactor(t, HUNTER);
    t.systems[HUNTER].hacked[Room.Engines] = 1;
    const hacked = shipEngineFactor(t, HUNTER);
    expect(hacked).toBeLessThan(before);
    expect(hacked).toBe(0);
    t.systems[HUNTER].hacked[Room.Engines] = 0;
    expect(shipEngineFactor(t, HUNTER)).toBe(before);
  });
});

describe('a hacked Shields room (D10)', () => {
  it('holds the Hunter shield recharge', () => {
    const t = createTacticalState(5), s = t.systems[HUNTER];
    s.shields = 0; s.shieldClock = 0; s.hacked[Room.Shields] = 1000;
    for (let k = 0; k < 600; k++) stepDuel(t, UNCREWED_INPUT);
    expect([s.shields, s.shieldClock]).toEqual([0, 0]);
  });
});
