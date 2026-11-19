// Spike ii (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md §3.1, §6.1, §8): the pool's reserve, real hp and
// mass, the wake rule, the per-ship rock targets and tally, the six rock counters, and the transient masks.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, hashTactical, shipModule, spaceModule, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { beginRockTick, rockAlive, rockAt, rockBorn, rockCapacity, rockHp, rockHpMax, RockKind, rockMass, rockSlots, ROCK_RESERVE, wakeRock, wakesAt } from '../src/renderer/src/sim/tactical/rocks';
import { ROCK_WAKE_SPEED } from '../src/renderer/src/sim/tactical/rockTuning';

/** The flat index of a space or ship field (the space module's values come first). */
function fieldIndex(st: TacticalState, name: string): number {
  let index = 0;
  for (const f of [...spaceModule.fields(st), ...shipModule.fields(st)]) { if (f.name === name) return index; index += f.count; }
  throw Error(name);
}

describe('the spike ii rock pool (spec §3.1)', () => {
  it('has 96 reserve slots after the seeded rocks, every seeded rock static at full hp ceil(r / 10)', () => {
    const st = createTacticalState(3);
    expect(ROCK_RESERVE).toBe(96);
    expect(rockSlots(st)).toBe(st.map.asteroids.length + 96);
    expect(rockCapacity(st.map)).toBe(rockSlots(st));
    st.map.asteroids.forEach((a, k) => {
      expect(rockAt(st, k)).toEqual({ kind: RockKind.Static, x: a.x, y: a.y, vx: 0, vy: 0, r: a.r, hp: rockHp(a.r) });
      expect(rockHpMax(a.r)).toBe(Math.ceil(a.r / 10));
    });
    for (let k = st.map.asteroids.length; k < rockSlots(st); k++) expect(rockAlive(st, k)).toBe(false);
    expect([rockHp(15), rockHp(55), rockMass(30)]).toEqual([2, 6, 900]);
  });
  it('wakes a static rock only above ROCK_WAKE_SPEED, and never puts it back', () => {
    expect([ROCK_WAKE_SPEED, wakesAt(40), wakesAt(40.0001)]).toEqual([40, false, true]);
    const st = createTacticalState(3);
    wakeRock(st, 0);
    expect(rockAt(st, 0).kind).toBe(RockKind.Moving);
    wakeRock(st, 0);
    expect(rockAt(st, 0).kind).toBe(RockKind.Moving);
    const empty = st.map.asteroids.length;
    wakeRock(st, empty);
    expect(rockAt(st, empty).kind).toBe(RockKind.Gone);
  });
});

describe('the rock targets, the tally and the counters (spec §6.1, §8)', () => {
  it('every ship system has a laser and torpedo rock target and a break tally; the space module closes with six counters', () => {
    const st = createTacticalState(3), s = st.systems[0];
    expect([s.laserRock, s.torpRock, s.torpRockFlying, s.rocksBroken]).toEqual([-1, -1, -1, 0]);
    expect([st.rockHits, st.rockSplits, st.rockDust, st.rockBlasts, st.rockCollisions, st.rockEvictions]).toEqual([0, 0, 0, 0, 0, 0]);
    const ship = shipModule.fields(st).map((f) => f.name);
    for (const f of ['laserRock', 'torpRock', 'torpRockFlying', 'rocksBroken']) expect(ship).toContain(`systems.0.${f}`);
    expect(spaceModule.fields(st).map((f) => f.name).slice(-7)).toEqual(['rocks', 'rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions']);
    const three = createTacticalState(3, 3), off = three.systems[2]!;
    expect([off.laserRock, off.torpRock, off.torpRockFlying, off.rocksBroken]).toEqual([0, 0, 0, 0]);   // an inactive slot holds zeros
    expect(() => validateTacticalValues(three, flattenTactical(three))).not.toThrow();
  });
  it('validation bounds the rock targets to the pool (torpRockFlying also −2) and the counters to whole counts', () => {
    const st = createTacticalState(3), base = Array.from(flattenTactical(st)), cap = rockSlots(st);
    const cases: [string, number][] = [['systems.0.laserRock', cap], ['systems.0.laserRock', -2], ['systems.0.torpRock', cap], ['systems.0.torpRockFlying', -3],
      ['systems.0.torpRockFlying', cap], ['systems.0.rocksBroken', -1], ['rockDust', -1], ['rockEvictions', 0.5]];
    for (const [name, value] of cases) {
      const bad = [...base]; bad[fieldIndex(st, name)] = value;
      expect(() => validateTacticalValues(st, bad), `${name} ${value}`).toThrow(new RegExp(name.replace(/\./g, '\.')));
    }
    const ok = [...base]; ok[fieldIndex(st, 'systems.0.laserRock')] = cap - 1; ok[fieldIndex(st, 'systems.0.torpRockFlying')] = -2;
    expect(() => validateTacticalValues(st, ok)).not.toThrow();
  });
});

describe('the transient masks (spec §3.1, §3.3)', () => {
  it('are not hashed, are fresh in a clone, and are cleared at the start of every tick', () => {
    const st = createTacticalState(3), before = hashTactical(st);
    st.rockBorn[4] = 1; st.rockDone[5] = 1;
    expect(hashTactical(st)).toBe(before);
    expect(spaceModule.notSnapshotted).toHaveProperty('rockBorn');
    expect(spaceModule.notSnapshotted).toHaveProperty('rockDone');
    const c = cloneTactical(st);
    expect(c.rockBorn).not.toBe(st.rockBorn);
    expect([c.rockBorn[4], c.rockDone[5]]).toEqual([0, 0]);
    expect(rockBorn(st, 4)).toBe(true);
    stepDuel(st, IDLE_INPUT);
    expect([st.rockBorn[4], st.rockDone[5]]).toEqual([0, 0]);
    st.rockBorn[4] = 1; beginRockTick(st);
    expect(rockBorn(st, 4)).toBe(false);
  });
});
