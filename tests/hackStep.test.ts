// Hacking spike (spec §2.5, §6 R1-1, R1-12, R1-14): the hack hold, its loss, its landing, the 30 s disable, the Shields
// drop, the hostility it causes and the shorter range while Sensors bars sit on HACK.
import { describe, expect, it } from 'vitest';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { enemyHacked, hackBlocked, hackStep, sensorRange, shipSeen } from '../src/renderer/src/sim/tactical/science';
import { Contact, createTacticalState, CREW_SLOT, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HACK_DISABLE_TICKS, HACK_TICKS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';

const HUNTER = 1;
/** A state ready to hack: Sensors 3 with 2 on HACK (scanner 1: range 1800), the enemy designated and 500 away. */
function ready(seed = 3): TacticalState {
  const t = createTacticalState(seed), crew = t.systems[CREW_SLOT], a = t.ships[CREW_SLOT], b = t.ships[HUNTER];
  crew.bars[DuelSystem.Sensors] = 3; crew.hackPower = 2; t.designated = Contact.Enemy;
  b.x = a.x + 500; b.y = a.y;
  return t;
}
const start = (t: TacticalState, room: number): void => { t.hackRoom = room; t.hackTicks = 0; };

describe('the hack hold (§2.5)', () => {
  it('lands after exactly HACK_TICKS (420) held ticks and switches the room off for HACK_DISABLE_TICKS (1800)', () => {
    const t = ready(); start(t, Room.Weapons);
    for (let k = 1; k < HACK_TICKS; k++) { hackStep(t, true); expect(t.hackTicks).toBe(k); }
    expect(t.systems[HUNTER].hacked[Room.Weapons]).toBe(0);
    t.events = []; hackStep(t, true);
    expect([t.hackRoom, t.hackTicks, t.systems[HUNTER].hacked[Room.Weapons]]).toEqual([-1, 0, HACK_DISABLE_TICKS]);
    expect(t.events).toEqual([{ kind: 'hack', what: 'done', room: Room.Weapons }]);
    for (let k = 1; k < HACK_DISABLE_TICKS; k++) hackStep(t, true);
    expect(t.systems[HUNTER].hacked[Room.Weapons]).toBe(1);   // gated for exactly 1800 ticks
    hackStep(t, true);
    expect(t.systems[HUNTER].hacked[Room.Weapons]).toBe(0);
  });
  it('drops every shield layer when a Shields hack lands', () => {
    const t = ready(), s = t.systems[HUNTER]; start(t, Room.Shields);
    s.shields = 2; s.shieldClock = 40;
    for (let k = 0; k < HACK_TICKS; k++) hackStep(t, true);
    expect([s.shields, s.shieldClock, s.hacked[Room.Shields]]).toEqual([0, 0, HACK_DISABLE_TICKS]);
  });
  const lost = (why: string, edit: (t: TacticalState) => void, hacker = true): void => it(`is lost, reset and reported when ${why}`, () => {
    const t = ready(); start(t, Room.Engines);
    for (let k = 0; k < 100; k++) hackStep(t, true);
    edit(t); t.events = []; hackStep(t, hacker);
    expect([t.hackRoom, t.hackTicks]).toEqual([-1, 0]);
    expect(t.events).toEqual([{ kind: 'hack', what: 'lost', room: Room.Engines }]);
    expect(t.systems[HUNTER].hacked).toEqual([0, 0, 0]);
  });
  lost('Science stands up', () => {}, false);
  lost('the hack drops below 2 bars', (t) => { t.systems[CREW_SLOT].hackPower = 1; });
  lost('Engineering takes the Sensors bars away', (t) => { t.systems[CREW_SLOT].bars[DuelSystem.Sensors] = 1; });
  lost('the enemy is no longer designated', (t) => { t.designated = -1; });
  lost('the enemy leaves sensor range', (t) => { t.ships[HUNTER].x = t.ships[CREW_SLOT].x + 1900; });
  it('names why a hack is blocked', () => {
    const t = ready();
    expect(hackBlocked(t, Room.Weapons)).toBeNull();
    t.systems[HUNTER].hacked[Room.Weapons] = 5;
    expect(hackBlocked(t, Room.Weapons)).toBe('ALREADY DOWN');
    t.ships[HUNTER].x += 1500; expect(hackBlocked(t)).toBe('OUT OF RANGE');
    t.designated = Contact.Derelict; expect(hackBlocked(t)).toBe('SELECT THE ENEMY');
    t.systems[CREW_SLOT].hackPower = 1; expect(hackBlocked(t)).toBe('HACK OFFLINE');
  });
});

describe('the shorter range while hacking (R1-12)', () => {
  it('gives the scanner only the Sensors bars not on HACK: 2 Sensors all on HACK is 600', () => {
    const t = createTacticalState(3), crew = t.systems[CREW_SLOT];
    crew.bars[DuelSystem.Sensors] = 2;
    expect(sensorRange(crew)).toBe(2800);
    crew.hackPower = 2;
    expect(sensorRange(crew)).toBe(600);
    const a = t.ships[CREW_SLOT], b = t.ships[HUNTER]; b.x = a.x + 1000; b.y = a.y;
    expect(shipSeen(t, HUNTER)).toBe(false);   // the crew's own AUTO fire, locks and turret read shipSeen too
    crew.hackPower = 0;
    expect(shipSeen(t, HUNTER)).toBe(true);
  });
});

describe('hostility from a hack (R1-1)', () => {
  it('turns the enemy hostile the tick after a hack lands, cause hack', () => {
    const t = ready(); t.ships[HUNTER].vx = t.ships[CREW_SLOT].vx; t.ships[HUNTER].vy = t.ships[CREW_SLOT].vy;
    start(t, Room.Engines);
    let landed = -1;
    for (let k = 0; k < HACK_TICKS + 5 && t.hostileAt < 0; k++) {
      stepDuel(t, { ...IDLE_INPUT, helm: false, weapons: false, hacker: true });
      if (landed < 0 && enemyHacked(t)) { landed = t.tick - 1 - t.startTick; expect(t.hostileAt).toBe(-1); }
    }
    expect(landed).toBe(HACK_TICKS - 1);
    expect(t.hostileAt).toBe(landed + 1);
  });
});
