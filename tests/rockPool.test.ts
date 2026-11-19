// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §3.1–§3.4) on spike ii's pool: 160 reserve
// slots of 8 values (kind, x, y, vx, vy, r, hp, t), every seeded rock a Rail at t = 0, the accessors and their memo, the
// step phase, freeing, the rock targets, the eight rock counters, the three transient masks and the restore rules.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, hashTactical, shipModule, spaceModule, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { railPos, type RailOut } from '../src/renderer/src/sim/tactical/rails';
import { beginRockStep, beginRockTick, endRockStep, freeFrame, freeRock, rockAlive, rockAt, rockBorn, rockCapacity, rockHp, rockHpMax, RockKind, rockMass, rockPhase, rockSlots, rocksMoved, ROCK_RESERVE, ROCK_STRIDE, rockVx, rockVy, rockX, rockY } from '../src/renderer/src/sim/tactical/rocks';

/** The flat index of a space or ship field (the space module's values come first). */
function fieldIndex(st: TacticalState, name: string): number {
  let index = 0;
  for (const f of [...spaceModule.fields(st), ...shipModule.fields(st)]) { if (f.name === name) return index; index += f.count; }
  throw Error(name);
}
/** Slot k's rail position and velocity at tick T, straight from railPos. */
function railAt(st: TacticalState, k: number, T: number): RailOut {
  const v = st.rocks, b = k * ROCK_STRIDE, o = { x: 0, y: 0, vx: 0, vy: 0 };
  railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, T, v[b] === RockKind.Tumble, o);
  return o;
}
const slot = (st: TacticalState, k: number): number[] => Array.from(st.rocks.subarray(k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE));

describe('the asteroids-iii rock pool (spec §3.1)', () => {
  it('has 160 reserve slots of 8 values; every seeded rock is a Rail (centre its position, offset 0) at t = 0 with full hp', () => {
    const st = createTacticalState(3);
    expect([ROCK_RESERVE, ROCK_STRIDE]).toEqual([160, 8]);
    expect(rockSlots(st)).toBe(st.map.asteroids.length + 160);
    expect(rockCapacity(st.map)).toBe(rockSlots(st));
    st.map.asteroids.forEach((a, k) => {
      const v = slot(st, k);
      expect(v).toEqual([RockKind.Rail, a.x, a.y, 0, 0, a.r, rockHp(a.r), 0]);   // Task 5 turns cluster rocks into centre + offset
      const at = rockAt(st, k);   // tick 0: where the map put it (centre + offset, so to the last few bits for a cluster rock)
      expect([at.r, at.hp]).toEqual([a.r, rockHp(a.r)]); expect(at.x).toBeCloseTo(a.x, 9); expect(at.y).toBeCloseTo(a.y, 9);
      expect(rockHpMax(a.r)).toBe(Math.ceil(a.r / 10));
    });
    for (let k = st.map.asteroids.length; k < rockSlots(st); k++) expect(rockAlive(st, k)).toBe(false);
    expect([rockHp(15), rockHp(55), rockMass(30)]).toEqual([2, 6, 900]);
  });
  it('reads a Rail through railPos at the phase tick, and its slot never changes while it turns', () => {
    const st = createTacticalState(3), before = slot(st, 0);
    for (let t = 0; t < 120; t++) stepDuel(st, IDLE_INPUT);
    expect(slot(st, 0)).toEqual(before);
    const p = railAt(st, 0, st.tick);
    expect([rockX(st, 0), rockY(st, 0), rockVx(st, 0), rockVy(st, 0)]).toEqual([p.x, p.y, p.vx, p.vy]);
    expect(rockX(st, 0)).not.toBe(before[1]);   // it moved along its rail
    beginRockStep(st);
    const q = railAt(st, 0, st.tick + 1);
    expect([rockPhase(st), rockX(st, 0), rockY(st, 0)]).toEqual([st.tick + 1, q.x, q.y]);   // §3.3: inside a step, tick + 1
    endRockStep(st);
    expect(rockPhase(st)).toBe(st.tick);
  });
  it('keys the memo by every input: a changed anchor or tick is recomputed; a clone and an in-place restore read the same', () => {
    const st = createTacticalState(3);
    for (let t = 0; t < 30; t++) stepDuel(st, IDLE_INPUT);
    const x0 = rockX(st, 0), anchor = st.rocks[1]!;
    st.rocks[1] = anchor + 5;
    expect(rockX(st, 0)).toBe(railAt(st, 0, st.tick).x);
    expect(rockX(st, 0)).not.toBe(x0);
    st.rocks[1] = anchor;
    expect(rockX(st, 0)).toBe(x0);
    st.tick++;
    expect(rockX(st, 0)).toBe(railAt(st, 0, st.tick).x);
    st.tick--;
    const c = cloneTactical(st);
    expect([rockX(c, 0), rockY(c, 0), rockVx(c, 0), rockVy(c, 0)]).toEqual([rockX(st, 0), rockY(st, 0), rockVx(st, 0), rockVy(st, 0)]);
    const fresh = createTacticalState(3);
    rockX(fresh, 0);                                    // a memo entry at tick 0 ...
    unflattenTactical(fresh, flattenTactical(st));      // ... then an in-place restore to tick 30
    expect([rockX(fresh, 0), rockY(fresh, 0)]).toEqual([rockX(st, 0), rockY(st, 0)]);
  });
  it('freeRock writes the free frame\'s rail position and velocity, t = the phase tick, and marks it touched; Free or Gone is left alone', () => {
    const st = createTacticalState(3);
    for (let t = 0; t < 10; t++) stepDuel(st, IDLE_INPUT);
    const p = railAt(st, 0, st.tick), a = st.map.asteroids[0]!;
    freeRock(st, 0);
    expect(slot(st, 0)).toEqual([RockKind.Free, p.x, p.y, p.vx, p.vy, a.r, rockHp(a.r), st.tick]);
    expect(st.rockTouched[0]).toBe(1);
    const again = slot(st, 0);
    freeRock(st, 0);
    expect(slot(st, 0)).toEqual(again);
    const empty = st.map.asteroids.length;
    freeRock(st, empty);
    expect(rockAlive(st, empty)).toBe(false);
  });
  it('inside a step a rail is freed at tick T before the motion pass and at T + 1 after it, its clock T + 1 either way', () => {
    const st = createTacticalState(3), T = st.tick;
    beginRockStep(st);
    expect(freeFrame(st)).toBe(T);
    const p0 = railAt(st, 0, T);
    freeRock(st, 0);
    expect(slot(st, 0).slice(1, 5)).toEqual([p0.x, p0.y, p0.vx, p0.vy]);
    expect(slot(st, 0)[7]).toBe(T + 1);
    rocksMoved(st);
    expect(freeFrame(st)).toBe(T + 1);
    const p1 = railAt(st, 1, T + 1);
    freeRock(st, 1);
    expect(slot(st, 1).slice(1, 5)).toEqual([p1.x, p1.y, p1.vx, p1.vy]);
    endRockStep(st);
    expect(freeFrame(st)).toBe(T);
  });
});

describe('the rock targets, the tally and the counters (spec §6.1, §8; asteroids-iii §5.4, §5.5)', () => {
  it('every ship system has a laser and torpedo rock target and a break tally; the space module closes with nine counters', () => {
    const st = createTacticalState(3), s = st.systems[0];
    expect([s.laserRock, s.torpRock, s.torpRockFlying, s.rocksBroken]).toEqual([-1, -1, -1, 0]);
    expect([st.rockHits, st.rockSplits, st.rockDust, st.rockBlasts, st.rockCollisions, st.rockEvictions, st.rockTouches, st.rockSlotDust, st.rockCapHits]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const ship = shipModule.fields(st).map((f) => f.name);
    for (const f of ['laserRock', 'torpRock', 'torpRockFlying', 'rocksBroken']) expect(ship).toContain(`systems.0.${f}`);
    expect(spaceModule.fields(st).map((f) => f.name).slice(-10)).toEqual(['rocks', 'rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions', 'rockTouches', 'rockSlotDust', 'rockCapHits']);
    const three = createTacticalState(3, 3), off = three.systems[2]!;
    expect([off.laserRock, off.torpRock, off.torpRockFlying, off.rocksBroken]).toEqual([0, 0, 0, 0]);
    expect(() => validateTacticalValues(three, flattenTactical(three))).not.toThrow();
  });
  it('validation bounds the rock targets to the pool (torpRockFlying also −2) and the counters to whole counts', () => {
    const st = createTacticalState(3), base = Array.from(flattenTactical(st)), cap = rockSlots(st);
    const cases: [string, number][] = [['systems.0.laserRock', cap], ['systems.0.laserRock', -2], ['systems.0.torpRock', cap], ['systems.0.torpRockFlying', -3],
      ['systems.0.torpRockFlying', cap], ['systems.0.rocksBroken', -1], ['rockDust', -1], ['rockEvictions', 0.5], ['rockTouches', -1], ['rockSlotDust', 0.5], ['rockCapHits', -1]];
    for (const [name, value] of cases) {
      const bad = [...base]; bad[fieldIndex(st, name)] = value;
      expect(() => validateTacticalValues(st, bad), `${name} ${value}`).toThrow(new RegExp(name.replace(/\./g, '\\.')));
    }
    const ok = [...base]; ok[fieldIndex(st, 'systems.0.laserRock')] = cap - 1; ok[fieldIndex(st, 'systems.0.torpRockFlying')] = -2;
    expect(() => validateTacticalValues(st, ok)).not.toThrow();
  });
  it('restore validation of each slot (spec §3.1, §13.1): kind 0..3, a gone slot all zeros, t a whole tick in 0..tick, r in [8, 60], hp > 0, a rail with |centre| ≥ 150 and |offset| ≤ 200', () => {
    const st = createTacticalState(3), base = Array.from(flattenTactical(st)), rocks = fieldIndex(st, 'rocks'), tick = fieldIndex(st, 'tick'), gone = st.map.asteroids.length;
    const bad = (k: number, j: number, value: number, why: RegExp, tickValue = 0): void => {
      const v = [...base]; v[tick] = tickValue; v[rocks + k * ROCK_STRIDE + j] = value;
      expect(() => validateTacticalValues(st, v), `slot ${k} value ${j} = ${value}`).toThrow(why);
    };
    bad(0, 0, 4, /kind/); bad(gone, 1, 5, /gone slot/); bad(0, 7, 1, /whole tick/); bad(0, 7, 0.5, /whole tick/, 10);
    bad(0, 5, 7.9, /r out of range/); bad(0, 5, 60.1, /r out of range/); bad(0, 6, 0, /hp/); bad(0, 3, 201, /RAIL_OFFSET_MAX/);
    const near = [...base]; near[rocks + 1] = 100; near[rocks + 2] = 0;
    expect(() => validateTacticalValues(st, near)).toThrow(/ROCK_RAIL_MIN/);
    const ok = [...base]; ok[tick] = 10; ok[rocks] = RockKind.Free; ok[rocks + 4] = 3; ok[rocks + 7] = 10;
    expect(() => validateTacticalValues(st, ok)).not.toThrow();
    const tumble = [...base]; tumble[rocks] = RockKind.Tumble; tumble[rocks + 3] = 120; tumble[rocks + 4] = -90;   // |offset| 150
    expect(() => validateTacticalValues(st, tumble)).not.toThrow();
  });
});

describe('the transient masks (spec §3.1, §3.3, §3.4)', () => {
  it('are not hashed, are fresh in a clone, and are cleared at the start and the end of every tick', () => {
    const st = createTacticalState(3), before = hashTactical(st);
    st.rockBorn[4] = 1; st.rockDone[5] = 1; st.rockTouched[6] = 1;
    expect(hashTactical(st)).toBe(before);
    for (const m of ['rockBorn', 'rockDone', 'rockTouched']) expect(spaceModule.notSnapshotted).toHaveProperty(m);
    const c = cloneTactical(st);
    expect(c.rockTouched).not.toBe(st.rockTouched);
    expect([c.rockBorn[4], c.rockDone[5], c.rockTouched[6]]).toEqual([0, 0, 0]);
    expect(rockBorn(st, 4)).toBe(true);
    stepDuel(st, IDLE_INPUT);
    expect([st.rockBorn[4], st.rockDone[5], st.rockTouched[6]]).toEqual([0, 0, 0]);
    st.rockBorn[4] = 1; st.rockTouched[6] = 1; beginRockTick(st);
    expect([rockBorn(st, 4), st.rockTouched[6]]).toEqual([false, 0]);
  });
});
