// Spike ii §7 items 1, 3, 4, 5, 6, 7: the view-only rock feedback: chips thrown back along the shot, a break's burst and
// specks, a dust puff, the blast's shockwave, core flash and spray, sparks on damaging rock-rock contacts only, the
// shakes (strong for a blast, falling with distance; light for a break; never past the strongest), the shockwave's
// growth, the moving-rock streaks and the cracks from hp / hpMax.
import { describe, expect, it } from 'vitest';
import { createFx, type FxItem, type ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { BLAST_SHAKE, CHIP_S, pushRockFx, pushRockShakes, rockEffectDraw, SHOCK_S } from '../src/renderer/src/render/tactical/rockFx';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { arena, mover, seeded } from './helpers/rockArena';

const rock = (what: 'split' | 'dust' | 'blast' | 'bump' | 'hit', by: 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' = 'laser', x = 100, y = 0): ViewEvent =>
  ({ kind: 'rock', what, by, rock: 3, x, y, r: what === 'blast' ? 120 : 30, vx: 20, vy: 0, ...(what === 'split' ? { pieces: [3, 4] } : {}) });
const of = (items: FxItem[], kind: FxItem['kind']) => items.filter((i) => i.kind === kind);

describe('rock fx (spec §7)', () => {
  it('a laser hit on a rock: a flare and 5 to 8 chips thrown back along the shot, living 0.4 s', () => {
    const fx = createFx();
    pushRockFx(fx, [{ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 0, x2: 100, y2: 0, rock: 3 }]);
    const chips = of(fx.items, 'chip');
    expect(chips.length).toBeGreaterThanOrEqual(5); expect(chips.length).toBeLessThanOrEqual(8);
    for (const c of chips) { expect(c.vx!).toBeLessThan(0); expect(c.life).toBe(CHIP_S); }
    expect(of(fx.items, 'flare')).toHaveLength(1);
    const again = createFx(); pushRockFx(again, [{ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 0, x2: 100, y2: 0, rock: 3 }]);
    expect(of(again.items, 'chip').length).toBe(chips.length);   // seeded: the same frame gives the same spray
  });
  it('a break: a burst sized by the rock and 10 to 16 specks; dust: a burst and a puff; a hit alone: nothing', () => {
    const fx = createFx();
    pushRockFx(fx, [rock('split')]);
    expect(of(fx.items, 'burst')).toMatchObject([{ size: 30 }]);
    expect(of(fx.items, 'speck').length).toBeGreaterThanOrEqual(10); expect(of(fx.items, 'speck').length).toBeLessThanOrEqual(16);
    const dust = createFx(); pushRockFx(dust, [rock('dust')]);
    expect(of(dust.items, 'burst')).toHaveLength(1);
    expect(of(dust.items, 'speck').length).toBeGreaterThanOrEqual(6);
    const hit = createFx(); pushRockFx(hit, [rock('hit')]);
    expect(hit.items).toEqual([]);
  });
  it('a blast: a shockwave to its radius over 0.35 s, a core flash, 18 to 24 specks; a damaging rock-rock bump: one spark; a ram: none', () => {
    const fx = createFx();
    pushRockFx(fx, [rock('blast', 'torpedo')]);
    expect(of(fx.items, 'shock')).toMatchObject([{ life: SHOCK_S, size: 120 }]);
    expect(of(fx.items, 'core')).toHaveLength(1);
    expect(of(fx.items, 'speck').length).toBeGreaterThanOrEqual(18); expect(of(fx.items, 'speck').length).toBeLessThanOrEqual(24);
    const bump = createFx(); pushRockFx(bump, [rock('bump', 'collision'), rock('bump', 'ram')]);
    expect(bump.items.map((i) => i.kind)).toEqual(['spark']);
  });
  it('the shockwave grows to its radius with an ease-out; chips fly at their velocity', () => {
    const toS = (x: number, y: number) => ({ x, y });
    const shock: FxItem = { kind: 'shock', age: SHOCK_S / 2, life: SHOCK_S, x1: 0, y1: 0, x2: 0, y2: 0, colour: 0, size: 120 };
    expect(rockEffectDraw(shock, toS, 0.5)!.r).toBeCloseTo(120 * 0.5 * 0.75, 9);
    const chip: FxItem = { kind: 'chip', age: 0.1, life: CHIP_S, x1: 10, y1: 0, x2: 10, y2: 0, colour: 0, vx: -100, vy: 0 };
    expect(rockEffectDraw(chip, toS, 1)).toMatchObject({ kind: 'chip', x1: 0, y1: 0 });
    expect(rockEffectDraw({ ...chip, kind: 'beam' }, toS, 1)).toBeNull();
  });
  it('shakes: a blast on screen 8 px falling with distance from the crew; off screen none; a break 2 px, never past a stronger one', () => {
    const crew = { x: 0, y: 0 }, all = () => true, none = () => false;
    const fx = createFx();
    pushRockShakes(fx, [rock('blast', 'torpedo', 300, 0)], crew, all);
    expect(fx.shakePx).toBeCloseTo(BLAST_SHAKE.px * (1 - 300 / BLAST_SHAKE.fade), 9);
    expect(fx.shake).toBe(BLAST_SHAKE.s);
    pushRockShakes(fx, [rock('split')], crew, all);
    expect(fx.shakePx).toBeCloseTo(BLAST_SHAKE.px * (1 - 300 / BLAST_SHAKE.fade), 9);
    const off = createFx(); pushRockShakes(off, [rock('blast', 'torpedo')], crew, none);
    expect(off.shake).toBe(0);
    const light = createFx(); pushRockShakes(light, [rock('split')], crew, all);
    expect([light.shakePx, light.shake]).toEqual([2, 0.12]);
  });
});

describe('streaks and cracks in the map model (spec §7 items 2, 3)', () => {
  const model = (st: ReturnType<typeof arena>) => tacticalModel({ state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera: createCamera(0, 2000, 1),
    viewport: { w: 1280, h: 720 }, console: 'weapons', axes: NO_AXES, ships: [0], paused: false, reserveRight: 0 } as TacticalModelInput);
  it('a rock faster than 20 u/s streaks behind it (length with speed); slower or static rocks do not', () => {
    const st = arena();
    mover(st, 10, 0, 2000, 100, 0, 10); mover(st, 11, 100, 2000, 10, 0, 10); seeded(st, 0);
    const m = model(st), fast = m.asteroids.find((a) => a.index === 10)!, slow = m.asteroids.find((a) => a.index === 11)!;
    expect(fast.streak).toMatchObject({ x: 640 - 25, y: 360 });
    expect(fast.streak!.alpha).toBeCloseTo(80 / 120, 9);
    expect(slow.streak).toBeUndefined();
  });
  it('wear is 1 − hp / hpMax', () => {
    const st = arena();
    mover(st, 10, 0, 2000, 0, 0, 30, 1.5);
    expect(model(st).asteroids.find((a) => a.index === 10)!.wear).toBeCloseTo(0.5, 12);
  });
});
