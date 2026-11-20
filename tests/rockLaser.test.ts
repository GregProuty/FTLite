// Spike ii §4.1, §6.2, §6.3: a laser shot on a rock (push J / m, then 2 damage, a rail rock is freed), the rock target's
// on-target rule, the shot line (the planet misses, a rock in the way takes it), the cut along the shot (asteroids-iv §5.2), the burst re-aims,
// firstBlocker skips born slots, AUTO_DIG is off, and the Weapons card's words.
import { describe, expect, it } from 'vitest';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { classOf } from '../src/renderer/src/sim/tactical/state';
import { firstBlocker, rockAt, rockMass, rockMaskOf, RockKind, rockTmpl, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { AUTO_DIG } from '../src/renderer/src/sim/tactical/rockTuning';
import { rockOnTarget } from '../src/renderer/src/sim/tactical/rockWeapons';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { laserCardReason, laserSituation, statusSentence } from '../src/renderer/src/render/duel/situationModel';
import { escapeSpeed } from '../src/renderer/src/sim/tactical/rails';
import { shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { arena, mover, rail, rockEvents, seeded, shaped, tmplOf, withSwitches } from './helpers/rockArena';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';

/** The arena with the crew facing east (heading 64) at (0, −2500), its laser full and targeted (the round's opener). */
function east() { const st = arena(5, ShipClass.ValkyrnLaser); st.ships[0].heading = 64; return st; }   // W-4 spec §14.1: the beam's rule, on the laser fit
const laserEvent = (st: ReturnType<typeof arena>) => st.events.find((e) => e.kind === 'laser') as Extract<(typeof st.events)[number], { kind: 'laser' }> | undefined;

describe('a laser shot on a rock (spec §4.1)', () => {
  it('pushes it Δv = J / m along the shot line, then does 2 damage; the beam ends at the impact point', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 30, 3);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, IDLE_INPUT);   // on target, full and targeted: auto-fire
    const r = rockAt(st, 100), shot = laserEvent(st)!;
    expect(r.vx).toBeCloseTo(4000 / 900, 12);
    expect(r.vy).toBe(0);
    expect(r.hp).toBe(1);
    expect(shot).toMatchObject({ ship: 0, hit: false, rock: 100 });
    expect(shot.x2).toBeCloseTo(170, 9);
    expect(st.systems[0].shots).toBe(1);
  });
  for (const massCube of [true, false]) it(`caps the push at 0.25 · v_esc(ρ) (massCube ${massCube}): a light rock takes min(4000 / m, cap)`, () => withSwitches({ massCube }, () => {
    for (const [r, hp] of [[9, 3], [30, 3]] as const) {
      const st = east();
      mover(st, 100, 200, -2500, 0, 0, r, hp);
      st.systems[0].laserRock = 100;
      applyWeaponsInput(st, 0, IDLE_INPUT);
      expect(rockAt(st, 100).vx, `r ${r}`).toBeCloseTo(Math.min(4000 / rockMass(r), 0.25 * escapeSpeed(Math.hypot(200, 2500))), 9);
    }
  }));
  it('frees a rail rock: Free, its rail velocity plus J / m along the shot, 2 damage', () => {
    const st = east();
    rail(st, 100, 200, -2500, 30, 3);
    const before = rockAt(st, 100);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    const after = rockAt(st, 100);
    expect(after.kind).toBe(RockKind.Free);
    expect([after.x, after.y]).toEqual([before.x, before.y]);   // freed where its rail had it (outside a step: tick 0)
    expect(after.vx).toBeCloseTo(before.vx + 4000 / 900, 12);
    expect(after.vy).toBeCloseTo(before.vy, 12);
    expect(after.hp).toBe(1);
  });
  it('a laser break cuts the rock along the shot: two sides of it; a plain rock is dust; the target clears and the tally counts', () => {
    for (const plain of [false, true]) {
      const st = east(), tm = tmplOf(st, 31);
      if (plain) mover(st, 100, 200, -2500, 0, 0, 30, 2);
      else { shaped(st, 100, tm, 200, -2500); st.rocks[100 * ROCK_STRIDE + 6] = 2; }
      st.systems[0].laserRock = 100;
      applyWeaponsInput(st, 0, IDLE_INPUT);
      if (plain) expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0 }]);
      else {
        const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!;
        expect(split).toMatchObject({ rock: 100, by: 'laser', ship: 0 }); expect(split.burst).toBeUndefined();
        expect(pieces.length).toBeGreaterThanOrEqual(2);
        let all = 0;
        for (const p of pieces) { const m = rockMaskOf(st, p); expect(rockTmpl(st, p)).toBe(tm); expect(all & m).toBe(0); all |= m; }
        const vys = pieces.map((p) => rockAt(st, p).vy);   // the shot runs east: the sides part north and south
        expect(Math.min(...vys)).toBeLessThan(0); expect(Math.max(...vys)).toBeGreaterThan(0);
      }
      expect([st.systems[0].laserRock, st.systems[0].rocksBroken]).toEqual([-1, 1]);
    }
  });
});

describe('a laser cut passes through the impact point', () => {
  it('a shot that strikes off-centre divides the rock by the line through its impact point: no piece lies on both sides', () => {
    const st = east(), tm = tmplOf(st, 31), t = templateFor(st.map, tm), sh = shapeOf(t, t.full);
    shaped(st, 100, tm, 200, -2470); st.rocks[100 * ROCK_STRIDE + 6] = 2;   // its centre 30 south of the ship's line; the beam runs at the rock and strikes its near surface
    const world = Array.from({ length: t.n }, (_, c) => ({ x: 200 + t.x[c]! - sh.gx, y: -2470 + t.y[c]! - sh.gy }));   // before the break: pieces keep their cells in place
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    const shot = laserEvent(st)!, split = rockEvents(st, 'split')[0]!;
    expect(split).toBeDefined();
    const len = Math.hypot(shot.x2 - shot.x1, shot.y2 - shot.y1), ux = (shot.x2 - shot.x1) / len, uy = (shot.y2 - shot.y1) / len;
    const sides = split.pieces!.map((p) => {
      const m = rockMaskOf(st, p); let pos = 0, neg = 0;
      for (let c = 0; c < t.n; c++) if ((m >>> c) & 1) { const cr = ux * (world[c]!.y - shot.y2) - uy * (world[c]!.x - shot.x2); if (cr > 1e-6) pos++; if (cr < -1e-6) neg++; }   // cross(u, cell - impact), u the beam's direction
      return { pos, neg };
    });
    for (const q of sides) expect(q.pos === 0 || q.neg === 0).toBe(true);
    expect(sides.some((q) => q.pos > 0)).toBe(true); expect(sides.some((q) => q.neg > 0)).toBe(true);
  });
});

describe('born pieces and line of sight (spec §6.2)', () => {
  it('lineOfSight passes through a piece born this tick, as firstBlocker does, and is blocked once it is not born', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 30);
    st.rockBorn[100] = 1;
    expect(lineOfSight(st, 0, -2500, 400, -2500)).toBe(true);
    expect(firstBlocker(st, 0, -2500, 400, -2500)).toBeNull();
    st.rockBorn[100] = 0;
    expect(lineOfSight(st, 0, -2500, 400, -2500)).toBe(false);
  });
});

describe('the laser with a rock target (spec §6.2)', () => {
  it('is on target with the centre in arc and the surface within range', () => {
    const st = east();
    mover(st, 100, 480, -2500, 0, 0, 30);
    expect(rockOnTarget(st, 0, 100)).toBe(true);    // surface 450
    mover(st, 100, 481, -2500, 0, 0, 30);
    expect(rockOnTarget(st, 0, 100)).toBe(false);   // surface 451
    mover(st, 100, 0, -2200, 0, 0, 30);
    expect(rockOnTarget(st, 0, 100)).toBe(false);   // south: out of the ±60° arc
    expect(rockOnTarget(st, 0, 101)).toBe(false);   // an empty slot
  });
  it('off target a press follows the miss path: the nose ray, here meeting nothing', () => {
    const st = east();
    mover(st, 100, 0, -2200, 0, 0, 30, 3);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, laserCharge: true });
    const shot = laserEvent(st)!;
    expect(shot.rock).toBeUndefined();
    expect([shot.x2, shot.y2]).toEqual([450, -2500]);
    expect(rockAt(st, 100).hp).toBe(3);
  });
  it('the line decides: another rock in the way takes the hit; the planet first is a miss', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 20, 10); mover(st, 101, 400, -2500, 0, 0, 30, 3);
    st.systems[0].laserRock = 101;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(laserEvent(st)!.rock).toBe(100);
    expect([rockAt(st, 100).hp, rockAt(st, 101).hp]).toEqual([8, 3]);
    const p = east();
    Object.assign(p.ships[0], { x: -200, y: 0 });
    mover(p, 101, 200, 0, 0, 0, 30, 3);
    p.systems[0].laserRock = 101;
    applyWeaponsInput(p, 0, IDLE_INPUT);
    const miss = laserEvent(p)!;
    expect(miss.rock).toBeUndefined();
    expect(miss.x2).toBeCloseTo(-70, 9);
    expect(rockAt(p, 101).hp).toBe(3);
  });
  it('a burst\'s later shot re-aims; once the rock broke it follows the enemy rules', () => {
    const st = east();
    mover(st, 100, 200, -2500, 0, 0, 20, 2);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(st.systems[0].laserRock).toBe(-1);
    for (let t = 0; t < classOf(st, 0).slots.laser!.burstGapTicks; t++) { st.events = []; applyWeaponsInput(st, 0, IDLE_INPUT); }
    const second = laserEvent(st);
    expect(second).toBeDefined();
    expect(second!.rock).toBeUndefined();
    expect(st.systems[0].shots).toBe(2);
  });
  it('firstBlocker skips a slot born this tick', () => {
    const st = createTacticalState(5), a = rockAt(st, 0);
    st.rockBorn[0] = 1;
    expect(firstBlocker(st, a.x - 200, a.y, a.x + 200, a.y)?.rock ?? -2).not.toBe(0);
  });
});

describe('AUTO_DIG and the card (spec §6.2, §6.3)', () => {
  it('AUTO_DIG is false: a rock between the laser and its in-arc target does not make it fire', () => {
    const st = east();
    st.ships[1].active = true;
    Object.assign(st.ships[1], { x: 400, y: -2500, vx: 0, vy: 0 });
    mover(st, 100, 200, -2500, 0, 0, 20);
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(AUTO_DIG).toBe(false);
    expect(st.systems[0].shots).toBe(0);
  });
  it('the card and the status sentence read the rock: OUT OF RANGE, OUT OF ARC, FIRING', () => {
    const st = east();
    st.systems[0].laserRock = 100;
    mover(st, 100, 530, -2500, 0, 0, 30);
    expect(laserSituation(st)).toEqual({ kind: 'range', range: 500, reach: 450, rock: true });
    expect(laserCardReason(laserSituation(st))).toBe('OUT OF RANGE 500/450');
    expect(statusSentence(laserSituation(st))).toBe('ROCK OUT OF RANGE: CLOSE TO 450');
    mover(st, 100, 0, -2200, 0, 0, 30);
    expect(laserCardReason(laserSituation(st))).toBe('OUT OF ARC: HELM TURN RIGHT');
    expect(statusSentence(laserSituation(st))).toBe('ROCK OUT OF ARC: TURN RIGHT');
    mover(st, 100, 200, -2500, 0, 0, 30);
    expect(laserCardReason(laserSituation(st))).toBe('FIRING');
  });
});
