// Spike ii §4.2, §6.4, §9.3: the torpedo's direct hit shatters its rock whatever its hp (asteroids-iv §5.3), the blast cracks and throws the
// rocks in its radius with a linear fall-off and pushes ships without damage, the list is taken before the direct hit's
// pieces (a reused slot is not hit), and a rock-targeted torpedo launches on the rock's range, homes on the moving rock
// and hits it; −2 flies unguided.
import { describe, expect, it } from 'vitest';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { homingTurn } from '../src/renderer/src/sim/tactical/missiles';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, canLaunch, IDLE_INPUT, torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { escapeSpeed } from '../src/renderer/src/sim/tactical/rails';
import { makeCells, rockAlive, rockAt, rockBorn, rockCellsInto, rockHp, rockMass, rockMaskOf, rockTmpl, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { kickFraction } from '../src/renderer/src/sim/tactical/rockBreak';
import { blastFall, detonateTorpedo } from '../src/renderer/src/sim/tactical/rockBlast';
import { arena, fillPool, mover, rockEvents, shaped, tmplOf, withSwitches } from './helpers/rockArena';

const cells = makeCells();
/** Rock k's westernmost cell: its template index c and world centre (x, y), and the cells' hit radius. */
function westCell(st: ReturnType<typeof arena>, k: number): { c: number; x: number; y: number; hitR: number } {
  const t = templateFor(st.map, rockTmpl(st, k)), sh = shapeOf(t, rockMaskOf(st, k)), a = rockAt(st, k);
  let c = -1;
  for (let i = 0; i < t.n; i++) if (((sh.mask >>> i) & 1) === 1 && (c < 0 || t.x[i]! < t.x[c]!)) c = i;
  rockCellsInto(st, k, cells);
  return { c, x: a.x + t.x[c]! - sh.gx, y: a.y + t.y[c]! - sh.gy, hitR: cells.hitR };
}

describe('the direct hit (spec §4.2 item 1)', () => {
  it('shatters the touched rock whatever its hp: real chunks of it, the struck cell dust', () => {
    const st = arena(), tm = tmplOf(st, 31);
    shaped(st, 100, tm, -54, 2000, 5, 0);
    st.rocks[100 * ROCK_STRIDE + 6] = 99;   // whatever its hp
    const w = westCell(st, 100);
    detonateTorpedo(st, 0, w.x - w.hitR, w.y, 300, 0, 100);   // on the westernmost cell's surface, flying east into it
    expect(rockEvents(st, 'blast')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0, x: w.x - w.hitR, y: w.y, r: 120 }]);
    expect([st.rockBlasts, st.systems[0].rocksBroken]).toEqual([1, 1]);
    const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!;
    expect(split.burst).toBe(true); expect(pieces.length).toBeGreaterThanOrEqual(2);
    let all = 0;
    for (const p of pieces) { const m = rockMaskOf(st, p); expect(rockTmpl(st, p)).toBe(tm); expect(all & m).toBe(0); all |= m; }
    expect((all >>> w.c) & 1).toBe(0);   // the struck cell is the crater
    const a0 = rockAt(st, pieces[0]!);
    expect(Math.hypot(a0.vx - 5, a0.vy)).toBeCloseTo(0.3 * escapeSpeed(Math.hypot(-54, 2000)), 9);   // piece 0 at v_esc · 0.30 plus the rock
  });
});

describe('the blast (spec §4.2 items 2 and 3, asteroids-iii §5.3)', () => {
  for (const massCube of [true, false]) it(`falls off linearly (massCube ${massCube}): damage 2 + 4·fall and push min(60000·fall / m, 0.5 v_esc) along the blast-to-rock line; nothing at or beyond the radius`, () => withSwitches({ massCube }, () => {
    const st = arena(), m = rockMass(50), cap = (x: number, y: number): number => 0.5 * escapeSpeed(Math.hypot(x, y));
    mover(st, 100, -60, 2000, 0, 0, 25, 99);   // the touched rock
    mover(st, 101, 0, 2050, 0, 0, 50, 20);     // surface 0: fall 1
    mover(st, 102, 110, 2000, 0, 0, 50, 20);   // surface 60: fall 0.5
    mover(st, 103, 0, 1831, 0, 0, 50, 20);     // surface 119: fall 1/120
    mover(st, 104, -102, 2136, 0, 0, 50, 20);  // surface 120: outside
    mover(st, 105, 250, 2000, 0, 0, 50, 20);   // surface 200: outside
    mover(st, 106, -10, 1880, 0, 0, 10, 20);   // a light rock near the centre: the cap holds it
    detonateTorpedo(st, 0, 0, 2000, -300, 0, 100);
    expect([blastFall(0), blastFall(60), blastFall(120), blastFall(200)]).toEqual([1, 0.5, 0, 0]);
    expect(rockAt(st, 101).hp).toBe(14); expect(rockAt(st, 101).vy).toBeCloseTo(Math.min(60000 / m, cap(0, 2050)), 9);
    expect(rockAt(st, 102).hp).toBe(16); expect(rockAt(st, 102).vx).toBeCloseTo(Math.min(30000 / m, cap(110, 2000)), 9);
    expect(rockAt(st, 103).hp).toBeCloseTo(20 - (2 + 4 / 120), 12);
    expect(rockAt(st, 103).vy).toBeCloseTo(-Math.min(500 / m, cap(0, 1831)), 9);
    expect(rockAt(st, 104)).toMatchObject({ hp: 20, vx: 0, vy: 0 });
    expect(rockAt(st, 105)).toMatchObject({ hp: 20, vx: 0, vy: 0 });
    const p = rockAt(st, 106);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(cap(-10, 1880), 9);   // 60000 · fall / m(10) is far over the cap
    expect(rockEvents(st, 'hit').map((e) => e.rock)).toEqual([101, 102, 103, 106]);
  }));
  it('pushes ships in its radius 120·fall away from the blast and costs them no hull', () => {
    const st = arena();
    mover(st, 100, -60, 2000, 0, 0, 25, 99);
    Object.assign(st.ships[0], { x: 0, y: 2080, vx: 0, vy: 0 });   // surface 60: fall 0.5
    st.ships[1].active = true; Object.assign(st.ships[1], { x: 0, y: 1800, vx: 0, vy: 0 });   // surface 180: outside
    const hulls = [st.systems[0].hull, st.systems[1].hull];
    detonateTorpedo(st, 0, 0, 2000, -300, 0, 100);
    expect([st.ships[0].vx, st.ships[0].vy]).toEqual([0, 60]);
    expect([st.ships[1].vx, st.ships[1].vy]).toEqual([0, 0]);
    expect([st.systems[0].hull, st.systems[1].hull]).toEqual(hulls);
  });
  it('takes its list before the direct hit: a slot the pieces reuse (born) is not hit by the blast', () => {
    const st = arena(), tm = tmplOf(st, 31);
    shaped(st, 100, tm, -54, 2000);
    const w = westCell(st, 100), tx = w.x - w.hitR;
    fillPool(st, 9);
    mover(st, 120, tx - 60, w.y, 0, 0, 8.5, 5);   // in the radius and the smallest: evicted first
    detonateTorpedo(st, 0, tx, w.y, 200, 0, 100);
    const pieces = rockEvents(st, 'split')[0]!.pieces!, p = rockAt(st, 120), k1 = escapeSpeed(Math.hypot(-54, 2000)) * (0.3 + 0.3 * kickFraction(1));
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces[1]).toBe(120);
    expect(rockTmpl(st, 120)).toBe(tm); expect(rockBorn(st, 120)).toBe(true);
    expect(p.hp).toBe(rockHp(p.r));
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(k1, 9);   // its own shatter kick, no blast push
    expect(rockEvents(st, 'hit').some((e) => e.rock === 120)).toBe(false);
    expect(st.rockEvictions).toBe(pieces.length - 1);
  });
});

describe('a torpedo with a rock target (spec §6.4)', () => {
  it('reads the rock\'s range, launches on it, homes on the moving rock and hits it; the end resets torpRockFlying', () => {
    const st = arena(), s = st.systems[0];
    Object.assign(st.ships[0], { x: 0, y: -1500, heading: 128 });
    mover(st, 100, 0, -1250, 40, 0, 30);
    expect(torpedoInRange(st, 0)).toBe(false);   // no rock target, and the Hunter is off
    s.torpRock = 100;
    expect([torpedoInRange(st, 0), canLaunch(st, 0), canLaunch(st, 0, -1)]).toEqual([true, true, false]);
    stepDuel(st, IDLE_INPUT);
    expect([s.torpRock, s.torpRockFlying, s.missilesLaunched]).toEqual([-1, 100, 1]);
    let blast: ReturnType<typeof rockEvents>[number] | undefined;
    for (let t = 0; t < 300 && !blast; t++) {
      stepDuel(st, IDLE_INPUT);
      if (t === 10) expect(s.torpRockFlying).toBe(100);
      blast = rockEvents(st, 'blast')[0];
    }
    expect(blast).toMatchObject({ rock: 100, ship: 0 });
    expect(st.events.find((e) => e.kind === 'missileEnd')).toMatchObject({ cause: 'asteroid' });
    expect(s.torpRockFlying).toBe(-1);
  });
  it('a manual launch with a rock target copies it too', () => {
    const st = arena(), s = st.systems[0];
    mover(st, 100, 0, -2250, 0, 0, 30);
    s.torpRock = 100;
    stepDuel(st, { ...IDLE_INPUT, missileLaunch: true });
    expect([s.torpRock, s.torpRockFlying]).toEqual([-1, 100]);
  });
  it('a launch on a rock that a laser shot in the same call breaks does not retarget the enemy: nothing launches (R1-F3)', () => {
    const st = arena(5, ShipClass.ValkyrnLaser), s = st.systems[0];   // W-4 spec §14.1: the beam's shot, on the laser fit
    st.ships[0].heading = 64;   // east, at (0, −2500): the laser is full and targeted
    st.ships[1].active = true; Object.assign(st.ships[1], { x: 0, y: -2200 });
    mover(st, 100, 200, -2500, 0, 0, 12, 2);   // r 12, hp 2: the laser's 2 damage turns it to dust
    s.laserRock = 100; s.torpRock = 100;
    expect([canLaunch(st, 0), canLaunch(st, 0, -1)]).toEqual([true, true]);   // the enemy is in range too
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, missileLaunch: true });
    expect(rockAlive(st, 100)).toBe(false);
    expect([s.torpRock, s.torpRockFlying, s.missilesLaunched]).toEqual([-1, -1, 0]);
  });
  it('flies unguided at −2 (its rock broke)', () => {
    const st = arena();
    st.ships[1].active = true; Object.assign(st.ships[1], { x: 300, y: -2400 });
    const m = placeMissile(st, 0, { x: 0, y: -2400, vx: 0, vy: -100, heading: 0, headingAcc: 0, age: 30 });
    expect(homingTurn(st, 0, m)).not.toBe(0);   // the enemy to the east: it turns
    st.systems[0].torpRockFlying = -2;
    expect(homingTurn(st, 0, m)).toBe(0);
  });
});
