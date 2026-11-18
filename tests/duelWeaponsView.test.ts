import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { flyMissile, launchMissile } from '../src/renderer/src/sim/tactical/missiles';
import { createTacticalState, type DuelEvent, missileOf, removeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { LASER_RANGE, MISSILE_LIFE_TICKS, MISSILE_RADIUS, PLANET_RADIUS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { createCamera, worldToScreen, type Camera } from '../src/renderer/src/render/tactical/camera';
import { BEAM_HIT, BEAM_MISS, createFx, hitsCrew, pushEvents, recordTrails, resetFx, shakeOffset, SHAKE_S, stepFx, TRAIL_POINTS, type ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { createTacticalLayer, starField } from '../src/renderer/src/render/tactical/tacticalLayer';
import { ARROW_GAP_SIDE, ARROW_MARGIN, spreadArrows, tacticalModel, type ArrowDraw, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { ARC_HALF, bearingDeg, combatModel, TORPEDO_DOT_PX, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { roomCentre } from '../src/renderer/src/render/tactical/hullModel';

const vp = { w: 1280, h: 720 };
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons', fx = createFx()): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx };
}

describe('the torpedo dot (homing torpedo spec §3)', () => {
  it('every torpedo in flight draws as a dot of radius at least 4 screen px at any zoom, both the crew and the Hunter', () => {
    const st = createTacticalState(11);
    launchMissile(st, 0); launchMissile(st, 1);
    for (const z of [0.05, 0.2, 0.5, 1, 2, 4]) {
      const cam = createCamera(st.ships[0].x, st.ships[0].y, z), c = combatModel(input(st, cam, 'helm'));
      expect(c.missiles.map((m) => m.crew)).toEqual([true, false]);
      for (const m of c.missiles) { expect(m.r).toBeGreaterThanOrEqual(TORPEDO_DOT_PX); expect(m.r).toBe(Math.max(4, MISSILE_RADIUS * cam.zoom)); }
    }
  });
  it('nothing draws the old shape or the predicted path: no heading on the draw, no path on the Weapons layer, no predictor module', () => {
    const st = createTacticalState(11);
    launchMissile(st, 0);
    const c = combatModel(input(st, createCamera(st.ships[0].x, st.ships[0].y), 'weapons'));
    expect(Object.keys(c.missiles[0]!).sort()).toEqual(['crew', 'r', 'trail', 'x', 'y']);
    expect('missilePath' in c.weapons! || 'missileOrigin' in c.weapons!).toBe(false);
    expect(existsSync(new URL('../src/renderer/src/render/tactical/missilePath.ts', import.meta.url))).toBe(false);
  });
});

describe('the combat model (H-1 spec §7)', () => {
  it('Weapons: both laser arcs (±60°, range 450), the bearing ring, the enemy bearing and range', () => {
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y);
    const c = combatModel(input(st, cam, 'weapons'));
    const w = c.weapons!;
    expect(w.ownArc).toMatchObject({ x: 640, y: 360, r: LASER_RANGE * 0.5 });
    expect(w.ownArc.half).toBeCloseTo(Math.PI / 3, 12); expect(ARC_HALF).toBeCloseTo(Math.PI / 3, 12);
    expect(w.enemyArc!.r).toBe(LASER_RANGE * 0.5);
    expect(w.ring).not.toBeNull();
    const [a, b] = st.ships, range = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    expect(w.info.text).toBe(`ENEMY BRG ${String(bearingDeg(b.x - a.x, b.y - a.y)).padStart(3, '0')}  RNG ${range}  NO SHOT`);
  });
  it('the info text centres between a left and a right reserve (the Artemis console)', () => {
    const st = createTacticalState(11);
    const w = combatModel({ ...input(st, createCamera(0, 0), 'weapons'), reserveLeft: 228, reserveRight: 156 }).weapons!;
    expect(w.info.x).toBe(676);
  });
  it('the duel views spread crowded off-screen arrows apart so their labels never overlap', () => {
    const st = createTacticalState(11), cam = createCamera(2600, 0);
    Object.assign(st.ships[0], { x: 2600, y: 0 }); Object.assign(st.ships[1], { x: 0, y: 40 });   // the enemy just south of the planet, both far west
    const arrows = tacticalModel({ ...input(st, cam, 'helm'), spreadArrows: true }).arrows;
    const enemy = arrows.find((a) => a.target === 'enemy')!, planet = arrows.find((a) => a.target === 'planet')!;
    expect(enemy.x).toBe(planet.x);   // both on the left edge
    expect(Math.abs(enemy.y - planet.y)).toBeGreaterThanOrEqual(ARROW_GAP_SIDE);
  });
  for (const n of [2, 3, 4]) {
    it(`spreadArrows keeps ${n} clustered arrows at least a gap apart and on the edge`, () => {
      const mk = (ys: number[]): ArrowDraw[] => ys.map((y, i) => ({ target: 'ship', x: ARROW_MARGIN, y, angle: 0, distance: i, label: `a${i}` }));
      for (const base of [370, 40, 670]) {   // mid edge, near the top end, past the bottom end (shifted back)
        const arrows = mk(Array.from({ length: n }, (_, i) => base + i));
        spreadArrows(arrows, vp, 236);
        const ys = arrows.map((a) => a.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(ARROW_GAP_SIDE);
        for (const y of ys) { expect(y).toBeGreaterThanOrEqual(ARROW_MARGIN); expect(y).toBeLessThanOrEqual(vp.h - ARROW_MARGIN); }
      }
    });
  }
  it('without the option (the flight view) every arrow keeps its H-1a position exactly', () => {
    const st = createTacticalState(11), cam = createCamera(2600, 0);
    Object.assign(st.ships[0], { x: 2600, y: 0 }); Object.assign(st.ships[1], { x: 0, y: 40 });
    const plain = tacticalModel(input(st, cam, 'helm')).arrows, spread = tacticalModel({ ...input(st, cam, 'helm'), spreadArrows: true }).arrows;
    const enemy = plain.find((a) => a.target === 'enemy')!, planet = plain.find((a) => a.target === 'planet')!;
    expect(Math.abs(enemy.y - planet.y)).toBeLessThan(ARROW_GAP_SIDE);   // crowded, and left where the ray meets the edge
    expect(planet).not.toEqual(spread.find((a) => a.target === 'planet'));
    const flight = tacticalModel({ ...input(st, cam, 'helm'), ships: [0] }).arrows;   // the flight view's input: ship 0 only, no option
    expect(flight.find((a) => a.target === 'planet')).toEqual(planet);
  });
  it('bearings are clockwise from north', () => {
    expect([bearingDeg(0, -1), bearingDeg(1, 0), bearingDeg(0, 1), bearingDeg(-1, 0), bearingDeg(-1, -1)]).toEqual([0, 90, 180, 270, 315]);
  });
  it('the lock marker sits on the enemy locked room on both consoles; the Helm has no Weapons layer', () => {
    const st = createTacticalState(11), e = st.ships[1], cam = createCamera(e.x, e.y, 1);
    Object.assign(e, { heading: 64, headingAcc: 0 });   // nose east
    for (const console of ['helm', 'weapons'] as const) {
      st.systems[0].lock = 0;
      let c = combatModel(input(st, cam, console));
      const nose = roomCentre('scout', 0);
      expect(c.lock!.x).toBeCloseTo(640 + nose.f * SHIP_RADIUS, 9); expect(c.lock!.y).toBeCloseTo(360, 9);
      expect(c.lock!.label.text).toBe('LOCK WEAPONS');
      st.systems[0].lock = 2;
      c = combatModel(input(st, cam, console));
      expect(c.lock!.x).toBeLessThan(640); expect(c.lock!.label.text).toBe('LOCK ENGINES');
      expect(c.weapons === null).toBe(console === 'helm');
    }
  });
  it('the lock follows the minimum drawn scale at zoom 0.5, and the true zoom on a chevron (zoom 0.2)', () => {
    const st = createTacticalState(11), e = st.ships[1];
    Object.assign(e, { heading: 64, headingAcc: 0 });   // nose east
    st.systems[0].lock = 0;
    const at = (z: number) => combatModel(input(st, createCamera(e.x, e.y, z), 'weapons')).lock!;
    expect(at(0.5).x).toBeCloseTo(640 + roomCentre('scout', 0).f * 16, 9);   // 16 px per ship unit
    expect(at(0.2).x).toBeCloseTo(640, 9);                                      // the chevron's centre
    expect(at(0.2).label.x).toBeCloseTo(640 + 14 + 6, 9);                      // max(14, 20 × 0.2 × 1.6) + 6
  });
  it('torpedo mode: the torpedo dot and its trail', () => {
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y), fx = createFx();
    launchMissile(st, 0);
    for (let k = 0; k < 40; k++) { const p = { ...missileOf(st, 0)! }; flyMissile(st, 0); recordTrails(fx, st, [{ x: p.x, y: p.y, h: p.heading + p.headingAcc }, null], 1); }
    const c = combatModel(input(st, cam, 'weapons', fx));
    expect(c.missiles).toHaveLength(1);
    expect(c.missiles[0]!.trail).toHaveLength(TRAIL_POINTS);
    expect(c.missiles[0]!).toMatchObject(worldToScreen(cam, vp, missileOf(st, 0)!.x, missileOf(st, 0)!.y));
  });
  it('the dot sits at the interpolated position, not the tick position (alpha < 1)', () => {
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y), fx = createFx();
    launchMissile(st, 0);
    const p0 = { ...missileOf(st, 0)! };
    for (let k = 0; k < 10; k++) flyMissile(st, 0);
    const before = { ...missileOf(st, 0)! };
    const missilePrev: (PrevBody | null)[] = [{ x: p0.x, y: p0.y, h: p0.heading + p0.headingAcc }, null];
    const c = combatModel({ ...input(st, cam, 'weapons', fx), alpha: 0.4, missilePrev });
    const raw = worldToScreen(cam, vp, before.x, before.y);
    expect(Math.hypot(c.missiles[0]!.x - raw.x, c.missiles[0]!.y - raw.y)).toBeGreaterThan(1);   // the dot is not at the tick position
    expect(missileOf(st, 0)).toEqual(before);
  });
});

describe('the view effects (H-1 spec §7 item 8, §8 shake)', () => {
  const laser = (ship: number, hit: boolean): DuelEvent => ({ kind: 'laser', ship, hit, stripped: hit, room: -1, x1: 0, y1: 0, x2: 100, y2: 0 });
  it('a beam per laser shot (white hit, grey miss), a burst per missile end, a spark per contact', () => {
    const fx = createFx();
    const events: ViewEvent[] = [laser(0, true), laser(0, false), { kind: 'missileEnd', ship: 1, cause: 'planet', target: -1, room: -1, x: 5, y: 5 }, { kind: 'contact', ship: 0, body: 'planet', x: 1, y: 2 }];
    pushEvents(fx, events);
    expect(fx.items.map((i) => [i.kind, i.life])).toEqual([['beam', 0.15], ['beam', 0.15], ['burst', 0.3], ['spark', 0.3]]);
    expect([fx.items[0]!.colour, fx.items[1]!.colour]).toEqual([BEAM_HIT, BEAM_MISS]);
    expect(fx.shake).toBe(0);
    stepFx(fx, 0.2);
    expect(fx.items.map((i) => i.kind)).toEqual(['burst', 'spark']);
    stepFx(fx, 0.2);
    expect(fx.items).toEqual([]);
  });
  it('a hit on the crew ship shakes for 0.2 s; the crew hitting the enemy does not', () => {
    expect(hitsCrew(laser(1, true))).toBe(true); expect(hitsCrew(laser(1, false))).toBe(false); expect(hitsCrew(laser(0, true))).toBe(false);
    expect(hitsCrew({ kind: 'missileEnd', ship: 1, cause: 'ship', target: 0, room: 1, x: 0, y: 0 })).toBe(true);
    expect(hitsCrew({ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: 1, x: 0, y: 0 })).toBe(false);
    const fx = createFx();
    pushEvents(fx, [laser(1, true)]);
    expect(fx.shake).toBe(SHAKE_S);
    stepFx(fx, 0.05);
    expect(Math.hypot(shakeOffset(fx).x, shakeOffset(fx).y)).toBeGreaterThan(0);
    stepFx(fx, 0.2);
    expect(shakeOffset(fx)).toEqual({ x: 0, y: 0 });
    pushEvents(fx, [laser(1, true)]); resetFx(fx);
    expect([fx.items.length, fx.shake]).toEqual([0, 0]);
  });
  it('trails keep the last 30 drawn positions and clear when the missile ends', () => {
    const st = createTacticalState(11), fx = createFx();
    launchMissile(st, 0);
    for (let k = 0; k < 45; k++) { flyMissile(st, 0); recordTrails(fx, st, [null, null], 1); }
    expect(fx.trails[0]).toHaveLength(TRAIL_POINTS);
    expect(fx.trails[0][TRAIL_POINTS - 1]).toEqual({ x: missileOf(st, 0)!.x, y: missileOf(st, 0)!.y });
    recordTrails(fx, st, [null, null], 1);
    expect(fx.trails[0]).toHaveLength(TRAIL_POINTS);   // no move, no new point
    removeMissile(st, 0); recordTrails(fx, st, [null, null], 1);
    expect(fx.trails[0]).toEqual([]);
  });
});

describe('the tactical layer with the combat lists (H-1 spec §10)', () => {
  it('a warm-up of 2 frames, then 60 duel frames at both consoles with missiles, beams and bursts add no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y), fx = createFx();
    const frame = (k: number): void => {
      const prev = prevOf(st);
      if (k === 5) { launchMissile(st, 0); launchMissile(st, 1); }
      stepDuel(st, { ...IDLE_INPUT, laserCharge: k % 30 === 0 ? false : k % 30 === 1 ? true : null });
      pushEvents(fx, st.events);
      if (k % 17 === 0) pushEvents(fx, [{ kind: 'laser', ship: 1, hit: true, stripped: true, room: -1, x1: st.ships[1].x, y1: st.ships[1].y, x2: st.ships[0].x, y2: st.ships[0].y }, { kind: 'contact', ship: 0, body: 'asteroid', x: st.ships[0].x, y: st.ships[0].y }]);
      stepFx(fx, 1 / 60); recordTrails(fx, st, [null, null], 1);
      const console = k % 2 === 0 ? 'weapons' : 'helm', base = { ...input(st, cam, console, fx), prev };
      layer.draw(tacticalModel(base), combatModel(base));
    };
    frame(0); frame(1);
    const n0 = count(layer.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(layer.container)).toBe(n0);
  });
  it('reseed redraws the star field once for the next duel seed, adding no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp, seed: 7 });
    expect(layer.starSeed()).toBe(7);
    const n0 = count(layer.container), stars = layer.stars as unknown as { context: { instructions: unknown[] } }, k0 = stars.context.instructions.length;
    layer.reseed(8);
    expect(layer.starSeed()).toBe(8);
    expect(count(layer.container)).toBe(n0);
    expect(stars.context.instructions.length).toBe(k0);   // the same number of stars, redrawn in the same Graphics
    expect(starField(8, 1280, 720)).not.toEqual(starField(7, 1280, 720));
    expect(starField(7, 1280, 720)).toEqual(starField(7, 1280, 720));
  });
  it('reset hides every text until the next draw', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y), base = { ...input(st, cam, 'weapons'), paused: true };
    layer.draw(tacticalModel(base), combatModel(base));
    const visibleTexts = (): number => [...layer.bloom.children, ...layer.container.children].filter((k) => k.constructor.name === 'BitmapText' && k.visible).length;
    expect(visibleTexts()).toBeGreaterThan(4);
    layer.reset();
    expect(visibleTexts()).toBe(0);
  });
});
