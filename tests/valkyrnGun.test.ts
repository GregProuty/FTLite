// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §7.1, §7.3, §10 Gun): the minigun fires a round every 6 ticks
// while its trigger is held at an attended Weapons station, starboard muzzle first, at 700 u/s along the nose plus the
// ship's velocity; 50 heat a round, 4 a tick of cooling, a lockout at 1000 that cools 8 a tick and unlocks at 0;
// Weapons damage halves the coolings and level 2 stops fire; a new round takes the lowest free pool entry, else
// replaces the oldest; the gun state and the pool are hashed, snapshotted and bounded by the validator.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';
import { flattenTactical, TACTICAL_MODULES, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { GUN_COOL, GUN_COOL_LOCKED, GUN_POOL } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile } from './helpers/hostile';
import { createSeatedValkyrn, VALKYRN_TEST } from './helpers/valkyrnDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const TRIGGER: ShipInput = { ...IDLE_INPUT, gunHeld: true };
const HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false, gunHeld: true };
type GunFire = Extract<DuelEvent, { kind: 'gunFire' }>;
/** The crew ship of class `cls` at (−600, −300) facing east at rest, the enemy parked far off, no asteroids. */
function gunState(cls: number = ShipClass.Valkyrn): TacticalState {
  const st = makeHostile(createTacticalState(5, 2, cls));
  st.map = { ...st.map, asteroids: [] };
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 });
  return st;
}
/** One weapons tick of the crew (commands, then the clocks); returns its gunFire events. */
function tick(st: TacticalState, input: ShipInput = TRIGGER): GunFire[] {
  st.events = [];
  applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input);
  st.tick++;
  return st.events.filter((e): e is GunFire => e.kind === 'gunFire');
}
/** The ticks (from 0) on which the crew fired over n ticks. */
function fireTicks(st: TacticalState, n: number, input: ShipInput = TRIGGER): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) if (tick(st, input).length > 0) out.push(k);
  return out;
}

describe('firing (spec §7.1)', () => {
  it('a round every 6 ticks while held, starboard muzzle first, at 700 u/s along the nose plus the ship\'s velocity', () => {
    const st = gunState();
    st.ships[0].vx = 30;
    const events: GunFire[] = [];
    for (let k = 0; k < 30; k++) events.push(...tick(st));
    expect(events.map((e) => [e.ship, e.muzzle])).toEqual([[0, 0], [0, 1], [0, 0], [0, 1], [0, 0]]);
    expect(st.systems[0]).toMatchObject({ gunShots: 5, gunMuzzle: 1, gunCooldown: 1 });
    expect(st.rounds[0]).toMatchObject({ active: true, owner: 0, age: 0, x: -579, y: -288, vx: 730, vy: 0 });   // starboard: south of an east-facing nose
    expect(st.rounds[1]).toMatchObject({ active: true, owner: 0, x: -579, y: -312, vx: 730 });
    expect(st.rounds.filter((r) => r.active)).toHaveLength(5);
    expect(st.events.some((e) => e.kind === 'laser')).toBe(false);
  });
  it('needs the trigger held at an attended Weapons station, a gun, and Weapons below level 2', () => {
    expect(fireTicks(gunState(), 12, IDLE_INPUT)).toEqual([]);
    expect(fireTicks(gunState(), 12, { ...TRIGGER, weapons: false })).toEqual([]);
    expect(fireTicks(gunState(ShipClass.ValkyrnLaser), 12)).toEqual([]);
    const off = gunState(); off.systems[0].rooms[Room.Weapons] = 2;
    expect(fireTicks(off, 12)).toEqual([]);
    const one = gunState(); one.systems[0].rooms[Room.Weapons] = 1;
    expect(fireTicks(one, 12)).toEqual([0, 6]);
  });
  it('the heat: 50 a round, 4 a tick of cooling, so 26 net a round while firing', () => {
    const st = gunState();
    tick(st); expect(st.systems[0].gunHeat).toBe(50);
    for (let k = 0; k < 5; k++) tick(st, IDLE_INPUT);
    expect(st.systems[0].gunHeat).toBe(30);
    tick(st); expect(st.systems[0].gunHeat).toBe(76);
  });
  it('locks at 1000 on the 38th round from cold (tick 222), cools 8 a tick and fires again 125 ticks later', () => {
    const st = gunState(), fired: number[] = [];
    let locked = 0;
    for (let k = 0; k < 360; k++) { if (tick(st).length > 0) fired.push(k); if (st.systems[0].gunLocked) locked++; }
    expect(fired.slice(0, 3)).toEqual([0, 6, 12]);
    expect(fired.filter((k) => k <= 222)).toHaveLength(38);
    expect([fired[37], fired[38]]).toEqual([222, 347]);
    expect(locked).toBe(125);
  });
  it('Weapons damage halves both coolings (integer halves 2 and 4); at level 2 it does not fire', () => {
    expect([GUN_COOL / 2, GUN_COOL_LOCKED / 2]).toEqual([2, 4]);
    const st = gunState(); st.systems[0].rooms[Room.Weapons] = 1;
    tick(st); for (let k = 0; k < 5; k++) tick(st, IDLE_INPUT);
    expect(st.systems[0].gunHeat).toBe(40);
    Object.assign(st.systems[0], { gunHeat: GUN.heatMax, gunLocked: true });
    for (let k = 0; k < 10; k++) tick(st, IDLE_INPUT);
    expect([st.systems[0].gunHeat, st.systems[0].gunLocked]).toEqual([960, true]);
    const two = gunState(); two.systems[0].gunHeat = 100; two.systems[0].rooms[Room.Weapons] = 2;
    expect(fireTicks(two, 10)).toEqual([]);
    expect(two.systems[0].gunHeat).toBe(80);   // Decision 7: level 2 cools at the halved rate too
  });
  it('a new round takes the lowest free entry; with none free it replaces the oldest, the lowest index on a tie', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), r = { x: 1, y: 2, vx: 3, vy: 4, age: 0, owner: 0 };
    expect(st.rounds).toHaveLength(GUN_POOL);
    Object.assign(st.rounds[0]!, { ...r, age: 5, active: true });
    expect(placeRound(st, r)).toBe(st.rounds[1]);
    st.rounds.forEach((e, k) => Object.assign(e, { ...r, active: true, age: [3, 9, 1, 9][k % 4]! }));
    expect(placeRound(st, { ...r, x: 99 })).toBe(st.rounds[1]);
    expect(st.rounds[1]).toMatchObject({ x: 99, age: 0, active: true });
  });
  it('through the duel step: the seated pilot\'s held trigger fires; standing, it does not', () => {
    const d = createSeatedValkyrn(5);
    try {
      stepDuelTick(d, { held: [HELD], commands: [] });
      expect(d.tactical.events.filter((e) => e.kind === 'gunFire')).toEqual([{ kind: 'gunFire', ship: 0, muzzle: 0 }]);
      stepDuelTick(d, { held: [HELD], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'stand' } }] });
      for (let k = 0; k < 12; k++) stepDuelTick(d, { held: [HELD], commands: [] });
      expect(d.tactical.systems[0].gunShots).toBe(1);
    } finally { disposeDuel(d); }
  });
});

describe('the gun state in the hash, the snapshot and the validator (spec §7.3)', () => {
  /** The offset of a tactical field in flattenTactical's values. */
  const offsetOf = (s: TacticalState, name: string): number => {
    let at = 0;
    for (const m of TACTICAL_MODULES) for (const f of m.fields(s)) { if (f.name === name) return at; at += f.count; }
    throw new Error(`no tactical field ${name}`);
  };
  it('every ship starts with the gun state at zero and a free round pool', () => {
    for (const cls of [ShipClass.Cutter, ShipClass.Valkyrn]) {
      const st = createTacticalState(5, 2, cls);
      for (const s of st.systems) expect(s).toMatchObject({ gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0 });
      expect(st.rounds.every((r) => !r.active && r.x === 0 && r.y === 0 && r.vx === 0 && r.vy === 0 && r.age === 0 && r.owner === 0)).toBe(true);
    }
  });
  it('the validator bounds the gun fields and the round pool', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), shape = createTacticalState(5);
    placeRound(st, { x: 10, y: 20, vx: 700, vy: 0, age: 12, owner: 0 });
    Object.assign(st.systems[0], { gunHeat: 1000, gunLocked: true, gunCooldown: 6, gunMuzzle: 1, gunShots: 40, gunHits: 9 });
    Object.assign(st.systems[1], { gunWear: GUN.hitsPerLayer - 1, gunHull: GUN.hitsPerHull - 1, gunRoomWear: [GUN.hitsPerLevel - 1, GUN.hitsPerLevel - 1, GUN.hitsPerLevel - 1] });
    const values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const bad = (name: string, k: number, v: number, why: RegExp): void => {
      const x = [...values]; x[offsetOf(st, name) + k] = v;
      expect(() => validateTacticalValues(shape, x), `${name}[${k}] = ${v}`).toThrow(why);
    };
    bad('systems.0.gunHeat', 0, 1001, /out of range/);
    bad('systems.0.gunLocked', 0, 2, /out of range/);
    bad('systems.0.gunCooldown', 0, 7, /out of range/);
    bad('systems.0.gunMuzzle', 0, 2, /out of range/);
    bad('systems.1.gunWear', 0, GUN.hitsPerLayer, /out of range/);
    bad('systems.1.gunHull', 0, GUN.hitsPerHull, /out of range/);
    bad('systems.1.gunRoomWear', 2, GUN.hitsPerLevel, /out of range/);
    bad('systems.0.gunShots', 0, -1, /out of range/);
    bad('rounds.0.flight', 4, 53, /age out of range/);
    bad('rounds.0.owner', 0, 2, /owner is not an active ship slot/);
    bad('rounds.1.flight', 0, 5, /a free entry holds values/);
    bad('rounds.0.active', 0, 2, /not 0 or 1/);
  });
  it('a Valkyrn duel with a hot gun and rounds in flight saves, loads and hashes the same; the gun fields move the hash', () => {
    const d = createSeatedValkyrn(5);
    try {
      for (let k = 0; k < 13; k++) stepDuelTick(d, { held: [HELD], commands: [] });
      expect(d.tactical.systems[0].gunShots).toBe(3);
      expect(d.tactical.rounds.some((r) => r.active)).toBe(true);
      const r = loadDuelSnapshot(VALKYRN_TEST, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try {
        expect(hashDuel(r)).toBe(hashDuel(d));
        expect(r.tactical.systems[0]).toMatchObject({ gunHeat: d.tactical.systems[0].gunHeat, gunShots: 3, gunMuzzle: 1 });
        r.tactical.systems[1].gunRoomWear[2] = 1;
        expect(hashDuel(r)).not.toBe(hashDuel(d));
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
});
