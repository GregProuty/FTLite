// W-4 spec §5.1: an autocannon round meeting a rock pushes it 500 / m along the round (waking a static rock), wears it
// 1/4 hp with a rock `hit` event by 'gun' and the owner, and breaks it in the fan pattern at 0 hp; the ties stay
// stepRounds' (ship, then rocks, then the planet); pew pew rounds and the Valkyrn's rounds still stop with no effect; a
// MAN round at a rock ends the hold; the view sparks on a gun hit and plays no sound for it.
import { describe, expect, it } from 'vitest';
import { placeRound, stepRounds } from '../src/renderer/src/sim/tactical/gun';
import { stepPew } from '../src/renderer/src/sim/tactical/pew';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { rockAt, rockMass, RockKind, ROCK_STRIDE, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { AUTOCANNON_ROCK_PUSH } from '../src/renderer/src/sim/tactical/rockTuning';
import { hostilityStep } from '../src/renderer/src/sim/tactical/science';
import { pushRockFx } from '../src/renderer/src/render/tactical/rockFx';
import { rockSounds } from '../src/renderer/src/audio/rockSounds';
import { arena, mover, rockEvents, seeded } from './helpers/rockArena';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';

const R = (st: ReturnType<typeof arena>, x: number, y: number) => placeRound(st, { x, y, vx: 700, vy: 0, age: 0, owner: 0 });

describe('autocannon rounds and rocks (W-4 spec §5.1)', () => {
  it('a round meeting a rock pushes it 500/m along the round, wears 0.25 hp, pushes one hit event by gun with the owner and counts rockHits', () => {
    const st = arena(5, ShipClass.Cutter);
    mover(st, 100, 200, -2500, 0, 0, 15, 2);
    const r = R(st, 180, -2500);   // 180 -> 191.7 this tick: it enters the rock's edge at 185
    stepRounds(st);
    expect(r.active).toBe(false);
    const a = rockAt(st, 100);
    expect(a.hp).toBe(1.75);
    expect(a.vx).toBeCloseTo(AUTOCANNON_ROCK_PUSH / rockMass(15), 12);
    expect(a.vy).toBeCloseTo(0, 12);
    const hits = rockEvents(st, 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ by: 'gun', rock: 100, ship: 0 });
    expect(st.rockHits).toBe(1);
  });
  it('a static rock wakes on the push', () => {
    // A Static rock is found only through the broad-phase grid, built from the map's asteroids at their seeded places
    // (rocks.ts rocksNear), so the test puts seeded asteroid 0 back in its own slot (rockArena seeded).
    const st = arena(5, ShipClass.Cutter);
    seeded(st, 0);
    const a = st.map.asteroids[0]!;
    R(st, a.x - a.r - 5, a.y); stepRounds(st);
    expect(st.rocks[0 * ROCK_STRIDE]).toBe(RockKind.Moving);
    expect(rockAt(st, 0).vx).toBeGreaterThan(0);
  });
  it('an r 15 rock (2 hp) breaks on the 8th round, in the fan pattern, and the owner\'s rocksBroken rises by 1', () => {
    const st = arena(5, ShipClass.Cutter);
    mover(st, 100, 200, -2500, 0, 0, 15, 2);
    for (let n = 1; n <= 8; n++) {
      st.events = [];
      const a = rockAt(st, 100);
      R(st, a.x - a.r - 5, a.y); stepRounds(st);
      if (n < 8) { expect(rockAt(st, 100).hp, `round ${n}`).toBe(2 - n * 0.25); expect(rockEvents(st, 'split')).toHaveLength(0); }
    }
    expect(rockEvents(st, 'split').length + rockEvents(st, 'dust').length).toBe(1);
    expect(st.systems[0]!.rocksBroken).toBe(1);
  });
  it('a piece born this tick is not hit by a later round in the same tick', () => {
    const st = arena(5, ShipClass.Cutter);
    mover(st, 100, 200, -2500, 0, 0, 20, 2); st.rockBorn[100] = 1;
    const r = R(st, 170, -2500); stepRounds(st);
    expect(r.active).toBe(true);
    expect(rockAt(st, 100).hp).toBe(2);
  });
  it('the exact ties: a ship wins over a rock (no wear); a rock wins over the planet (worn)', () => {
    // Exact ties by identical circles: the same centre and radius give segmentEntry the same inputs, so the same t.
    const st = arena(5, ShipClass.Cutter);
    st.ships[1]!.active = true;
    Object.assign(st.ships[1], { x: 300, y: -2500, vx: 0, vy: 0 });
    mover(st, 100, 300, -2500, 0, 0, 20, 2);   // the Hunter's circle (SHIP_RADIUS 20) exactly
    R(st, 300 - 20 - 5, -2500); stepRounds(st);
    expect(rockAt(st, 100).hp).toBe(2);
    expect(st.systems[0]!.gunHits).toBe(1);
    const p = arena(5, ShipClass.Cutter), planet = p.map.planet;
    writeRock(p, 100, RockKind.Moving, planet.x, planet.y, 0, 0, planet.r, 2);   // the planet's circle exactly
    placeRound(p, { x: planet.x - planet.r - 5, y: planet.y, vx: 700, vy: 0, age: 0, owner: 0 });
    stepRounds(p);
    expect(rockAt(p, 100).hp).toBe(1.75);
  });
  it('pew pew rounds still stop on a rock with no wear, push or event', () => {
    const st = arena(5, ShipClass.Cutter);
    mover(st, 100, 200, -2500, 0, 0, 20, 2);
    const before = Array.from(st.rocks.subarray(100 * ROCK_STRIDE, 101 * ROCK_STRIDE));
    const r = placeRound(st, { x: 170, y: -2500, vx: 900, vy: 0, age: 0, owner: 0 }, st.pew);
    stepPew(st);
    expect(r.active).toBe(false);
    expect(Array.from(st.rocks.subarray(100 * ROCK_STRIDE, 101 * ROCK_STRIDE))).toEqual(before);
    expect(rockEvents(st)).toEqual([]);
  });
  it('the Valkyrn\'s rounds are still absorbed (GUN.rock is null)', () => {
    const st = arena(5, ShipClass.Valkyrn);
    mover(st, 100, 200, -2500, 0, 0, 20, 2);
    R(st, 170, -2500); stepRounds(st);
    expect(rockAt(st, 100).hp).toBe(2);
    expect(st.rockHits).toBe(0);
  });
  it('a round at a rock during the hold ends it with cause gun', () => {
    const st = arena(5, ShipClass.Cutter);
    st.ships[1]!.active = true; st.hostileAt = -1; st.systems[0]!.gunShots = 1;
    hostilityStep(st, 1);
    expect(st.events.find((e) => e.kind === 'hostile')).toMatchObject({ cause: 'gun' });
  });
  it('the view: a spark on a gun hit; no rock sound for it', () => {
    const fx = createFx();   // render/tactical/fxModel.ts, as tests/rockFx.test.ts builds it
    const hit = { kind: 'rock', what: 'hit', by: 'gun', rock: 3, x: 10, y: 20, r: 15, vx: 0, vy: 0, ship: 0 } as const;
    pushRockFx(fx, [hit]);
    expect(fx.items.map((i) => i.kind)).toEqual(['spark']);
    expect(rockSounds(null, [hit], () => 0, 0).sounds).toEqual([]);
  });
});
