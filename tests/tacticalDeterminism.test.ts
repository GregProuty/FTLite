import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { launchMissile } from '../src/renderer/src/sim/tactical/missiles';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { type Axes, cloneTactical, createTacticalState, missileOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { flattenTactical, hashTactical, MISSILE_SLOT, ROUND_SLOT } from '../src/renderer/src/sim/tactical/hash';
import { ROCK_RESERVE, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { predictPath } from '../src/renderer/src/sim/tactical/predict';
import { GUN_POOL, PEW_POOL, PLANET_RADIUS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

/** A fixed input script: both ships turn, thrust, coast and reverse on different beats. */
function script(t: number): Axes[] {
  return [
    { turn: t % 240 < 60 ? 1 : t % 240 < 90 ? -1 : 0, thrust: t % 300 < 150 ? 1 : t % 300 < 180 ? -1 : 0 },
    { turn: t % 200 < 40 ? -1 : 0, thrust: t % 180 < 120 ? 1 : 0 }
  ];
}
function run(seed: number, ticks: number): TacticalState {
  const st = createTacticalState(seed);
  for (let t = 0; t < ticks; t++) stepFlight(st, script(t));
  return st;
}

describe('tactical determinism (spec §4)', () => {
  it('the same seed and inputs give the same hash', () => {
    expect(hashTactical(run(11, 1800))).toBe(hashTactical(run(11, 1800)));
  });
  it('a different seed gives a different hash', () => {
    expect(hashTactical(run(11, 600))).not.toBe(hashTactical(run(12, 600)));
  });
  it('a different input gives a different hash', () => {
    const a = createTacticalState(11), b = createTacticalState(11);
    stepFlight(a, [{ turn: 1, thrust: 0 }, { turn: 0, thrust: 0 }]);
    stepFlight(b, [{ turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }]);
    expect(hashTactical(a)).not.toBe(hashTactical(b));
  });
});

describe('predictPath (spec §10b)', () => {
  it('matches the real flight tick for tick while nothing is hit, and leaves the state untouched', () => {
    const st = createTacticalState(11), before = hashTactical(st), axes = { turn: 1, thrust: 1 };
    const path = predictPath(st, 0, axes, 120, 1);
    expect(hashTactical(st)).toBe(before);
    for (let t = 0; t < 120; t++) {
      stepFlight(st, [axes, { turn: 0, thrust: 0 }]);
      expect(path[t]!.x).toBe(st.ships[0].x);
      expect(path[t]!.y).toBe(st.ships[0].y);
    }
  });
  it('samples every n ticks and stops at the planet', () => {
    const st = createTacticalState(11);
    Object.assign(st.ships[0], { x: 0, y: -400, vx: 0, vy: 200, heading: 128, headingAcc: 0 });
    const path = predictPath(st, 0, { turn: 0, thrust: 1 }, 600, 10);
    const last = path[path.length - 1]!;
    expect(path.length).toBeLessThan(60);
    expect(Math.sqrt(last.x * last.x + last.y * last.y)).toBeLessThan(PLANET_RADIUS + SHIP_RADIUS);
  });
});

describe('predictPath stride (Helm H-0a final review)', () => {
  const axes: Axes = { turn: 0, thrust: 0 };
  it('every: 10 over 100 free ticks gives 10 points matching the real ship', () => {
    const st = createTacticalState(11), path = predictPath(st, 0, axes, 100, 10);
    expect(path.length).toBe(10);
    const real = createTacticalState(11);
    for (let k = 0; k < 10; k++) {
      for (let t = 0; t < 10; t++) stepFlight(real, [axes, axes]);
      expect(path[k]).toEqual({ x: real.ships[0].x, y: real.ships[0].y });
    }
  });
  it('every: 0 behaves like every: 1', () => {
    const st = createTacticalState(11);
    expect(predictPath(st, 0, axes, 30, 0)).toEqual(predictPath(st, 0, axes, 30, 1));
    expect(predictPath(st, 0, axes, 30, 1).length).toBe(30);
  });
});

describe('cloneTactical', () => {
  it('copies everything that moves: equal hash, independent state, and identical futures', () => {
    const st = createTacticalState(13);
    for (let t = 0; t < 900; t++) stepDuel(st, IDLE_INPUT);
    const copy = cloneTactical(st);
    expect(hashTactical(copy)).toBe(hashTactical(st));
    for (let t = 0; t < 900; t++) { stepDuel(st, IDLE_INPUT); stepDuel(copy, IDLE_INPUT); }
    expect(hashTactical(copy)).toBe(hashTactical(st));
    const before = hashTactical(st);
    copy.systems[0].rooms[0] = 2; copy.ships[0].graceUntil[0] = 99; copy.hunter.trail[0] = 1; copy.rng.s = 7;
    expect(hashTactical(st)).toBe(before);
  });
  it('copies missiles and events by value, not by reference', () => {
    const st = createTacticalState(13);
    launchMissile(st, 0); launchMissile(st, 1);
    st.events.push({ kind: 'laser', ship: 0, hit: true, stripped: false, room: 2, x1: 0, y1: 0, x2: 1, y2: 1 });
    st.events.push({ kind: 'missileEnd', ship: 1, cause: 'ship', target: 0, room: 1, x: 5, y: 6 });
    const copy = cloneTactical(st);
    expect(copy.missiles).toEqual(st.missiles);
    expect(copy.events).toEqual(st.events);
    for (const k of [0, 1] as const) expect(copy.missiles[k]).not.toBe(st.missiles[k]);
    expect(copy.events).not.toBe(st.events);
    copy.events.forEach((e, k) => expect(e).not.toBe(st.events[k]));
    const [m0x, m1age] = [missileOf(st, 0)!.x, missileOf(st, 1)!.age];
    missileOf(copy, 0)!.x += 100; missileOf(copy, 1)!.age = 400;
    (copy.events[0] as { hit: boolean }).hit = false; copy.events.push({ kind: 'missileEnd', ship: 0, cause: 'edge', target: -1, room: -1, x: 0, y: 0 });
    expect([missileOf(st, 0)!.x, missileOf(st, 1)!.age]).toEqual([m0x, m1age]);
    expect(st.events).toHaveLength(2);
    expect((st.events[0] as { hit: boolean }).hit).toBe(true);
  });
});

describe('flatten key guard', () => {
  // When this fails, add the new field to flattenTactical (hash.ts) and then update the lists below.
  it('Ship, ShipSystems and TacticalState fields are exactly those flattenTactical knows', () => {
    const st = createTacticalState(1);
    expect(Object.keys(st.ships[0]).sort()).toEqual(['active', 'asteroidHits', 'graceUntil', 'heading', 'headingAcc', 'planetHits', 'released', 'shipHits', 'skidBudget', 'skidSign', 'vx', 'vy', 'x', 'y']);
    expect(Object.keys(st.systems[0]).sort()).toEqual(['bars', 'cls', 'fireHeld', 'freq', 'gunCooldown', 'gunHeat', 'gunHits', 'gunHull', 'gunLocked', 'gunMuzzle', 'gunRoomWear', 'gunShots', 'gunTurret', 'gunWear', 'gunsManual', 'hull', 'laserAim', 'laserBurst', 'laserBurstClock', 'laserCharge', 'laserHits', 'laserHold', 'laserManual', 'laserRock', 'laserTargeted', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'pewCharge', 'pewHits', 'pewShots', 'pewTurret', 'rocksBroken', 'rooms', 'shieldClock', 'shields', 'shots', 'target', 'torpLock', 'torpManual', 'torpRock', 'torpRockFlying', 'torpRoom', 'weaponPower']);
    expect(Object.keys(st).sort()).toEqual(['derelict', 'designated', 'events', 'grid', 'hostileAt', 'hunter', 'known', 'map', 'missiles', 'outcome', 'pew', 'rng', 'rockBlasts', 'rockBorn', 'rockCollisions', 'rockDone', 'rockDust', 'rockEvictions', 'rockHits', 'rockSplits', 'rocks', 'rounds', 'scan', 'seed', 'ships', 'startTick', 'systems', 'tick', 'weakFreq']);
    expect(Object.keys(st.hunter).sort()).toEqual(['fireAt', 'lastLaunch', 'mode', 'pewBurst', 'pewClock', 'room', 'timer', 'trail', 'trailHead', 'working']);
    const launched = createTacticalState(1);
    launchMissile(launched, 0);                                          // a missile as the launcher makes it
    expect(Object.keys(missileOf(launched, 0)!).sort()).toEqual(['active', 'age', 'heading', 'headingAcc', 'manual', 'owner', 'vx', 'vy', 'x', 'y']);   // MISSILE_SLOT covers these (W-3: the manual bit)
    // Space: 6 header values; per slot active, 12 body scalars and one per graceUntil body; a pool entry of MISSILE_SLOT
    // per slot; hunter 9 scalars (W-1: the pew burst and clock) + its trail. Ship: per slot 23 scalars (the burst pair, weapons update spec §1; laserTargeted, torpLock and torpRoom, FTL targeting spec §2) and the 3 rooms. Science (Sci-1): 17 values.
    // SPIKE ii: the graceUntil bodies cover the rock pool (asteroids + ROCK_RESERVE); the pool plus 6 counters close the space
    // module; each systems record has 4 more scalars (the rock fields). Valkyrn spec §7.3: the round pool GUN_POOL × ROUND_SLOT
    // after the missiles; per slot 8 more scalars and the 3 gunRoomWear. W-1: the pew pool PEW_POOL × ROUND_SLOT after the gun's,
    // and 3 pew scalars per slot. W-2: the laser mode and the burst aim, 2 more per slot. W-3: the torpedo mode, 1 more per slot,
    // and the manual bit in each missile entry (MISSILE_SLOT). So a systems record is 41 scalars and 6 vector values; Engineering
    // spike spec §2: per slot the 5 bars and the 3 weaponPower values (spec §10.3). W-4 spec §3.1, §13.1 (W-4b): the two
    // turrets and the guns' mode, 3 more per slot (44 scalars).
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + ROCK_RESERVE + 2) + 2 * MISSILE_SLOT + GUN_POOL * ROUND_SLOT + PEW_POOL * ROUND_SLOT + 9 + st.hunter.trail.length + (st.map.asteroids.length + ROCK_RESERVE) * ROCK_STRIDE + 6 + 2 * 58 + 17);
  });
});
