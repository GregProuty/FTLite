// Sensors blip spec §3, §4 (the map model): the fog view's blip becomes TacticalDraw.blip in screen pixels, drawn when its
// ring crosses the view or its centre is in it, with the alpha for its age. A centre that is off screen by the edge arrow's
// own test gets a 'blip' arrow labelled BLIP ~<n> (the range to the nearest 100) and no ?; the 'enemy' arrow, the goal
// glow and the FIRING SOLUTION mark never attach to it, and a click on it picks nothing.
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { createFog, stepFog, type FogView } from '../src/renderer/src/render/tactical/fogModel';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { blipMark, pickContact, tacticalModel, type TacticalDraw, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel } from '../src/renderer/src/render/tactical/weaponsModel';
import { sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';

const vp = { w: 1280, h: 720 };
/** The crew ship at (1000, 2000). The default camera is on it at zoom 0.5: the view shows x -280..2280, y 1280..2720. */
function state(): TacticalState { const t = createTacticalState(5); Object.assign(t.ships[0]!, { x: 1000, y: 2000 }); return t; }
const input = (t: TacticalState, over: Partial<TacticalModelInput> = {}): TacticalModelInput => ({
  state: t, prev: [], alpha: 1, camera: createCamera(1000, 2000, 0.5), viewport: vp, console: 'weapons', axes: { turn: 0, thrust: 0 },
  ships: [0], paused: false, reserveRight: 0, contacts: true, ...over });
/** A hand-built fog view with the enemy unseen and a ping at (x, y) of radius r and age `age`. */
const fogOf = (x: number, y: number, r: number, age: number): FogView => ({ range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [], blip: { x, y, r, age } });
const blipArrow = (d: TacticalDraw) => d.arrows.find((a) => a.target === 'blip');
/** The enemy `beyond` units past sensor range, due east of the crew ship. */
function unseen(t: TacticalState, beyond: number): void { Object.assign(t.ships[1]!, { x: 1000 + sensorRange(t.systems[0]!) + beyond, y: 2000, active: true }); }

describe('the blip on the map (sensors blip spec §3)', () => {
  it('centre on screen: the circle at the ping\'s place and size with the alpha for its age, the ?, no arrow and no enemy ship', () => {
    const d = tacticalModel(input(state(), { fog: fogOf(1200, 1900, 300, 0.5) }));
    expect(d.blip).toEqual({ x: 740, y: 310, r: 150, alpha: 1 - 0.6 * 0.5 });
    expect(blipArrow(d)).toBeUndefined();
    expect(blipMark(d)).toEqual(d.blip);
    expect(d.ships.map((s) => s.index)).toEqual([0]);
    expect(d.arrows.some((a) => a.target === 'enemy')).toBe(false);
  });
  it('the alpha runs from 1 at age 0 to 0.4 at age 1', () => {
    expect(tacticalModel(input(state(), { fog: fogOf(1200, 1900, 300, 0) })).blip!.alpha).toBe(1);
    expect(tacticalModel(input(state(), { fog: fogOf(1200, 1900, 300, 1) })).blip!.alpha).toBeCloseTo(0.4, 12);
  });
  it('centre off screen, ring across the view: the circle without the ?, and a blip edge arrow, no enemy arrow', () => {
    const d = tacticalModel(input(state(), { fog: fogOf(2480, 2000, 600, 0) }));
    expect(d.blip).toEqual({ x: 1380, y: 360, r: 300, alpha: 1 });
    expect(blipMark(d)).toBeNull();
    const a = blipArrow(d)!;
    expect(a.x).toBeCloseTo(1280 - 28, 9); expect(a.y).toBeCloseTo(360, 9); expect(a.angle).toBeCloseTo(Math.PI / 2, 9);   // ARROW_MARGIN is 28
    expect([a.distance, a.label, a.alpha]).toEqual([1500, 'BLIP ~1500', 1]);   // 1480 u from the crew ship
    expect(d.arrows.some((x) => x.target === 'enemy')).toBe(false);
  });
  it('the circle wholly off screen: nothing is drawn but the arrow, at the ping\'s alpha', () => {
    const d = tacticalModel(input(state(), { fog: fogOf(6000, 2000, 150, 1) }));
    expect(d.blip).toBeNull(); expect(blipMark(d)).toBeNull();
    expect(blipArrow(d)).toMatchObject({ distance: 5000, label: 'BLIP ~5000' });
    expect(blipArrow(d)!.alpha).toBeCloseTo(0.4, 12);
  });
  it('centre inside the view but under a reserve: the circle and the arrow, never the ? as well', () => {
    const d = tacticalModel(input(state(), { reserveRight: 236, fog: fogOf(2120, 2000, 150, 0) }));
    expect(d.blip).toEqual({ x: 1200, y: 360, r: 75, alpha: 1 });
    expect(blipArrow(d)!.x).toBeCloseTo(1280 - 236 - 28, 9);
    expect(blipArrow(d)!.label).toBe('BLIP ~1100');
    expect(blipMark(d)).toBeNull();
  });
  it('the arrow rounds the range from the crew ship to the ping\'s centre to the nearest 100', () => {
    const label = (x: number, y: number) => blipArrow(tacticalModel(input(state(), { fog: fogOf(x, y, 150, 0) })))!.label;
    expect([label(2760, 2000), label(2749, 2000), label(1000, 2000 - 1651)]).toEqual(['BLIP ~1800', 'BLIP ~1700', 'BLIP ~1700']);
  });
  it('no fog, or a fog with no blip (the enemy seen, destroyed or absent): no circle, no ? and no blip arrow', () => {
    const t = state();
    expect(tacticalModel(input(t)).blip).toBeUndefined();
    const none = tacticalModel(input(t, { fog: { range: 900, seen: { enemy: true, derelict: false, missile: false }, ghosts: [] } }));
    expect(none.blip).toBeNull(); expect(blipMark(none)).toBeNull(); expect(blipArrow(none)).toBeUndefined();
  });
  it('through stepFog: a seen enemy draws its ship and neither circle nor arrow; unseen, the blip and no ship', () => {
    const t = state(), e = t.ships[1]!;
    Object.assign(e, { x: 1600, y: 2000, active: true });   // 600 u away, inside the start range of 900
    t.known[0] = 1;                                         // Sci-1: an identified enemy is drawn as a ship
    const seen = tacticalModel(input(t, { fog: stepFog(createFog(), t, 0, 0), ships: [0, 1] }));
    expect(seen.ships.map((s) => s.index)).toEqual([0, 1]);
    expect(seen.blip).toBeNull(); expect(blipArrow(seen)).toBeUndefined();
    unseen(t, 1000);
    const fog = stepFog(createFog(), t, 0, 0), out = tacticalModel(input(t, { fog, ships: fog.seen.enemy ? [0, 1] : [0] }));   // the scene's own rule for `ships`
    expect(out.ships.map((s) => s.index)).toEqual([0]);
    expect(out.blip).toBeNull();                                      // the ping at (3911, 1897), r 400: wholly off the view
    expect(blipArrow(out)).toMatchObject({ label: 'BLIP ~2900' });    // about 2900 u from the crew ship (the doubled range, owner 2026-11-20: was ~2000)
  });
});

describe('nothing of the enemy\'s attaches to the blip (sensors blip spec §3)', () => {
  const combat = (t: TacticalState, over: Partial<TacticalModelInput>) => {
    const base = input(t, { console: 'helm', ...over }), model = tacticalModel(base);
    const enemyArrow = model.arrows.find((a) => a.target === 'enemy') ?? null;   // the scene's own pick (scene.ts)
    return { model, enemyArrow, c: combatModel({ ...base, missilePrev: [null, null], fx: createFx(), t: 0, enemyArrow, goal: true }) };
  };
  it('with a blip arrow there is no enemy arrow, so no goal glow and no FIRING SOLUTION bracket', () => {
    const t = state(); unseen(t, 1000);
    const r = combat(t, { fog: stepFog(createFog(), t, 0, 0), ships: [0] });
    expect(blipArrow(r.model)).toBeDefined(); expect(r.enemyArrow).toBeNull();
    expect(r.c.goal ?? null).toBeNull(); expect(r.c.solution ?? null).toBeNull();
  });
  it('a seen enemy off screen keeps its own arrow and the goal glow (the contrast)', () => {
    const t = state(); Object.assign(t.ships[1]!, { x: 1800, y: 2000, active: true });   // 800 u away: seen; at zoom 1.2 it is off screen
    const r = combat(t, { fog: stepFog(createFog(), t, 0, 0), ships: [0, 1], camera: createCamera(1000, 2000, 1.2) });
    expect(r.enemyArrow).not.toBeNull(); expect(blipArrow(r.model)).toBeUndefined();
    expect(r.c.goal ?? null).not.toBeNull();
  });
  it('a click on the blip picks nothing, and nor does a click on the unseen enemy\'s true place', () => {
    const t = state(); unseen(t, 1000);
    const fog = stepFog(createFog(), t, 0, 0), b = fog.blip!, e = t.ships[1]!;
    const at = { state: t, prev: [], alpha: 1, camera: createCamera(b.x, b.y, 0.5), viewport: vp, fog };
    expect(pickContact(at, { x: vp.w / 2, y: vp.h / 2 })).toBeNull();
    expect(pickContact({ ...at, camera: createCamera(e.x, e.y, 0.5) }, { x: vp.w / 2, y: vp.h / 2 })).toBeNull();
  });
});
