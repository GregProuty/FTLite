// Spike ii §7 items 1, 3, 4, 5, 6, 7: the view-only rock feedback: chips thrown back along the shot, a break's burst and
// specks, a dust puff, the blast's shockwave, core flash and spray, sparks on damaging rock-rock contacts only, the
// shakes (strong for a blast, falling with distance; light for a break; never past the strongest), the shockwave's
// growth, the moving-rock streaks and the cracks from hp / hpMax.
import { describe, expect, it } from 'vitest';
import { createFx, type FxItem, type ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { BLAST_SHAKE, CHIP_MIN_PX, CHIP_S, CHIP_TAIL_MIN_PX, CORE_FLASH_S, CORE_MIN_PX, FLARE_MIN_PX, holdFrame, HIT_STOP_S, PUFF_COUNT, pushRockFx, pushRockShakes, rockEffectDraw, SHARD_COUNT, SHOCK_S, SPECK_MIN_PX, SPECK_S, TOUCH_SPARK_S } from '../src/renderer/src/render/tactical/rockFx';
import { CRT, CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { arena, mover, seeded } from './helpers/rockArena';

const rock = (what: 'split' | 'dust' | 'blast' | 'bump' | 'hit', by: 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' = 'laser', x = 100, y = 0): ViewEvent =>
  ({ kind: 'rock', what, by, rock: 3, x, y, r: what === 'blast' ? 120 : 30, vx: 20, vy: 0, ...(what === 'split' ? { pieces: [3, 4] } : {}) });
const of = (items: FxItem[], kind: FxItem['kind']) => items.filter((i) => i.kind === kind);

describe('rock fx (spec §7)', () => {
  it('a laser hit on a rock: a flare and 5 to 8 chips sprayed wide of the beam, living 0.6 s', () => {
    const fx = createFx();
    pushRockFx(fx, [{ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 0, x2: 100, y2: 0, rock: 3 }]);
    const chips = of(fx.items, 'chip');
    expect(chips.length).toBeGreaterThanOrEqual(5); expect(chips.length).toBeLessThanOrEqual(8);
    expect(CHIP_S).toBe(0.6);
    for (const c of chips) {
      expect(c.vx!).toBeLessThan(0); expect(c.life).toBe(0.6);
      const off = Math.abs(Math.atan2(c.vy!, c.vx!) - Math.PI) % (2 * Math.PI), d = Math.min(off, 2 * Math.PI - off);   // from the reverse shot line (pi)
      expect(d).toBeGreaterThanOrEqual(0.25 - 1e-9); expect(d).toBeLessThanOrEqual(1.2 + 1e-9);
    }
    expect(of(fx.items, 'flare')).toHaveLength(1);
    const again = createFx(); pushRockFx(again, [{ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 0, x2: 100, y2: 0, rock: 3 }]);
    expect(of(again.items, 'chip').length).toBe(chips.length);   // seeded: the same frame gives the same spray
  });
  it('a burst split: a burst sized by the rock and 16 shards at 150 to 250 u/s fading over 1 to 2 s, and the hit-stop', () => {
    const fx = createFx();
    pushRockFx(fx, [{ ...rock('split', 'torpedo'), burst: true } as ViewEvent]);
    expect(of(fx.items, 'burst')).toMatchObject([{ size: 30 }]);
    const shards = of(fx.items, 'speck');
    expect(shards).toHaveLength(16); expect(SHARD_COUNT).toBe(16);
    for (const s of shards) {
      const sp = Math.hypot(s.vx! - 20, s.vy!);
      expect(sp).toBeGreaterThanOrEqual(150); expect(sp).toBeLessThanOrEqual(250);
      expect(s.life).toBeGreaterThanOrEqual(1); expect(s.life).toBeLessThanOrEqual(2);
    }
    expect(fx.hold).toBe(HIT_STOP_S);
  });
  it('a fan split or a dust: a burst and a puff of 6 shards, no hit-stop; a hit alone: nothing', () => {
    for (const what of ['split', 'dust'] as const) {
      const fx = createFx(); pushRockFx(fx, [rock(what)]);
      expect(of(fx.items, 'burst')).toHaveLength(1);
      expect(of(fx.items, 'speck')).toHaveLength(PUFF_COUNT);
      expect(fx.hold).toBe(0);
    }
    const hit = createFx(); pushRockFx(hit, [rock('hit')]);
    expect(hit.items).toEqual([]);
  });
  it('a touch: a small spark (a slow billiard\'s cue)', () => {
    const fx = createFx();
    pushRockFx(fx, [{ kind: 'rock', what: 'touch', by: 'collision', rock: 1, other: 2, x: 5, y: 6, r: 10, vx: 0, vy: 0, speed: 9 } as ViewEvent]);
    expect(fx.items).toMatchObject([{ kind: 'spark', life: TOUCH_SPARK_S, x1: 5, y1: 6 }]);
  });
  it('hit-stop: holdFrame holds while fx.hold lasts, then lets drawing go on', () => {
    const fx = createFx();
    expect(holdFrame(fx, 1 / 60)).toBe(false);
    fx.hold = HIT_STOP_S;
    let held = 0;
    for (let k = 0; k < 20; k++) if (holdFrame(fx, 1 / 60)) held++;
    expect(held / 60).toBeGreaterThanOrEqual(HIT_STOP_S - 1 / 60); expect(held / 60).toBeLessThanOrEqual(HIT_STOP_S + 1 / 60);
    expect(fx.hold).toBe(0);
  });
  it('a chain of bursts gives at most one 80 ms hold per 330 ms', () => {
    const fx = createFx(), burst = { ...rock('split', 'torpedo'), burst: true } as ViewEvent;
    let held = 0, starts = 0, prev = false;
    for (let k = 0; k < 120; k++) {   // two seconds at 60 Hz, a burst every 5 frames
      if (k % 5 === 0) pushRockFx(fx, [burst]);
      const h = holdFrame(fx, 1 / 60); if (h) held++; if (h && !prev) starts++; prev = h;
    }
    expect(starts).toBeLessThanOrEqual(Math.ceil(2 / 0.33)); expect(starts).toBeGreaterThan(1);
    expect(held / 60).toBeLessThan(2 * (HIT_STOP_S / (HIT_STOP_S + 0.25)) + 0.2);
  });
  it('a soft cap: over 300 items the oldest specks go first, other kinds stay', () => {
    const fx = createFx();
    fx.items.push({ kind: 'shock', age: 0, life: 1, x1: 0, y1: 0, x2: 0, y2: 0, colour: 0 });
    for (let k = 0; k < 400; k++) fx.items.push({ kind: 'speck', age: 0, life: 1, x1: k, y1: 0, x2: k, y2: 0, colour: 0 });
    pushRockFx(fx, []);
    expect(fx.items).toHaveLength(300);
    expect(of(fx.items, 'shock')).toHaveLength(1);
    expect(of(fx.items, 'speck')[0]!.x1).toBe(101);
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
  it('feel fix: at the map zoom 0.25 the rock fx keep a minimum screen size; at a large zoom they follow world size', () => {
    const at = (z: number) => (x: number, y: number) => ({ x: x * z, y: y * z });   // the camera at zoom z about the origin
    const tail = (d: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    const chip: FxItem = { kind: 'chip', age: 0.1, life: CHIP_S, x1: 0, y1: 0, x2: 0, y2: 0, colour: CRT.hot, vx: -100, vy: 0 };
    const speck: FxItem = { kind: 'speck', age: 0.1, life: SPECK_S, x1: 0, y1: 0, x2: 0, y2: 0, colour: CRT.main, vx: 50, vy: 0 };
    const shock: FxItem = { kind: 'shock', age: SHOCK_S * 0.99, life: SHOCK_S, x1: 0, y1: 0, x2: 0, y2: 0, colour: CRT.hot, size: 120 };
    const core: FxItem = { kind: 'core', age: CORE_FLASH_S * 0.99, life: CORE_FLASH_S, x1: 0, y1: 0, x2: 0, y2: 0, colour: CRT.hot, size: 120 * 0.3 };
    const fx = createFx();
    pushRockFx(fx, [{ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 0, x2: 100, y2: 0, rock: 3 }]);
    const flare = { ...of(fx.items, 'flare')[0]!, age: 0 };
    const z = 0.25;
    const c = rockEffectDraw(chip, at(z), z)!;
    expect(c.r).toBeGreaterThanOrEqual(CHIP_MIN_PX); expect(CHIP_MIN_PX).toBeGreaterThanOrEqual(2);
    expect(tail(c)).toBeCloseTo(CHIP_TAIL_MIN_PX, 9); expect(CHIP_TAIL_MIN_PX).toBeGreaterThanOrEqual(6);
    expect(c.x2).toBeGreaterThan(c.x1);   // the tail trails behind the chip's flight (it flies -x)
    expect(rockEffectDraw(speck, at(z), z)!.r).toBeGreaterThanOrEqual(SPECK_MIN_PX); expect(SPECK_MIN_PX).toBeGreaterThanOrEqual(1.5);
    expect(rockEffectDraw(core, at(z), z)!.r).toBeGreaterThanOrEqual(CORE_MIN_PX); expect(CORE_MIN_PX).toBeGreaterThanOrEqual(10);
    expect(rockEffectDraw(shock, at(z), z)!.width).toBeGreaterThanOrEqual(2);
    expect(rockEffectDraw(flare, at(z), z)).toMatchObject({ kind: 'flare' });
    expect(rockEffectDraw(flare, at(z), z)!.r).toBeGreaterThanOrEqual(FLARE_MIN_PX); expect(FLARE_MIN_PX).toBeGreaterThanOrEqual(8);
    for (const it of [chip, speck, shock, core, flare]) expect(CRT_RAMP).toContain(rockEffectDraw(it, at(z), z)!.colour);
    // a large zoom: the world size wins, in proportion to the zoom
    const big = 4, huge = 8;
    expect(rockEffectDraw(chip, at(huge), huge)!.r).toBeCloseTo(2 * rockEffectDraw(chip, at(big), big)!.r, 9);
    expect(tail(rockEffectDraw(chip, at(huge), huge)!)).toBeCloseTo(2 * tail(rockEffectDraw(chip, at(big), big)!), 9);
    expect(rockEffectDraw(speck, at(huge), huge)!.r).toBeCloseTo(2 * rockEffectDraw(speck, at(big), big)!.r, 9);
    expect(rockEffectDraw(core, at(huge), huge)!.r).toBeCloseTo(2 * rockEffectDraw(core, at(big), big)!.r, 9);
    expect(rockEffectDraw(chip, at(big), big)!.r).toBeGreaterThan(CHIP_MIN_PX);
    expect(rockEffectDraw(speck, at(big), big)!.r).toBeGreaterThan(SPECK_MIN_PX);
  });
  it('evicted dust and lost-piece dust (rock -1) start no break shake; evicted dust still gets a puff', () => {
    const crew = { x: 0, y: 0 }, all = () => true;
    const evicted = { ...rock('dust'), evicted: true } as ViewEvent, lost = { ...rock('dust'), rock: -1 } as ViewEvent;
    const fx = createFx(); pushRockShakes(fx, [evicted, lost], crew, all);
    expect(fx.shake).toBe(0);
    const puff = createFx(); pushRockFx(puff, [evicted]);
    expect(of(puff.items, 'speck').length).toBeGreaterThanOrEqual(6);
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
  it('wear is 1 − hp / hpMax', () => {
    const st = arena();
    mover(st, 10, 0, 2000, 0, 0, 30, 1.5);
    expect(model(st).asteroids.find((a) => a.index === 10)!.wear).toBeCloseTo(0.5, 12);
  });
});
