// Spike ii §4.1, §6.2, §6.3: a laser shot on a rock (push J / m, then 2 damage, a static rock wakes), the rock target's
// on-target rule, the shot line (the planet misses, a rock in the way takes it), the fan break, the burst re-aims,
// firstBlocker skips born slots, AUTO_DIG is off, and the Weapons card's words.
import { describe, expect, it } from 'vitest';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { classOf } from '../src/renderer/src/sim/tactical/state';
import { firstBlocker, rockAt, RockKind } from '../src/renderer/src/sim/tactical/rocks';
import { AUTO_DIG } from '../src/renderer/src/sim/tactical/rockTuning';
import { rockOnTarget } from '../src/renderer/src/sim/tactical/rockWeapons';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { laserCardReason, laserSituation, statusSentence } from '../src/renderer/src/render/duel/situationModel';
import { arena, mover, rockEvents, seeded } from './helpers/rockArena';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';

/** The arena with the crew facing east (heading 64) at (0, −2500), its laser full and targeted (the round's opener). */
function east() { const st = arena(); st.ships[0].heading = 64; return st; }
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
  it('wakes a static rock', () => {
    const st = east();
    seeded(st, 0);
    const a = st.map.asteroids[0]!;
    Object.assign(st.ships[0], { x: a.x - 200, y: a.y });
    st.systems[0].laserRock = 0;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(rockAt(st, 0).kind).toBe(RockKind.Moving);
    expect(rockAt(st, 0).vx).toBeCloseTo(4000 / (a.r * a.r), 12);
    expect(rockAt(st, 0).hp).toBe(Math.ceil(a.r / 10) - 2);
  });
  it('a laser break on r 42 gives 3 pieces, on r 30 and r 20 and r 13 gives 2, on r 12 dust; the target clears and the tally counts', () => {
    for (const [r, n] of [[42, 3], [30, 2], [20, 2], [13, 2], [12, 0]] as const) {
      const st = east();
      mover(st, 100, 200, -2500, 0, 0, r, 2);
      st.systems[0].laserRock = 100;
      applyWeaponsInput(st, 0, IDLE_INPUT);
      if (n > 0) expect(rockEvents(st, 'split')[0]).toMatchObject({ rock: 100, by: 'laser', ship: 0, pieces: expect.any(Array) });
      if (n > 0) expect(rockEvents(st, 'split')[0]!.pieces).toHaveLength(n);
      else expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0 }]);
      expect([st.systems[0].laserRock, st.systems[0].rocksBroken]).toEqual([-1, 1]);
    }
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
    for (let t = 0; t < classOf(st, 0).slots.laser.burstGapTicks; t++) { st.events = []; applyWeaponsInput(st, 0, IDLE_INPUT); }
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
