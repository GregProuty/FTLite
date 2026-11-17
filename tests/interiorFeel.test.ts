import { describe, it, expect } from 'vitest';
import { AnimatedSprite, Container, Graphics, Texture, type Sprite } from 'pixi.js';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createInteriorFeel, type FeelFrame } from '../src/renderer/src/render/interiorFeel';
import type { FeelSetting } from '../src/renderer/src/render/feel';
import { lampPoints, sectorGradeInput } from '../src/renderer/src/render/gradeModel';
import { consoles } from '../src/renderer/src/render/consoleModel';
import { DEBRIS_COUNT } from '../src/renderer/src/render/particles/sources';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { FLASH_ALPHA, HITSTOP_SECONDS } from '../src/renderer/src/render/impactModel';
import { HULL_MAX } from '../src/renderer/src/sim/tuning';
import { cutterState } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const make = (feel: FeelSetting = 'full') => { const world = new Container(); return { world, f: createInteriorFeel({ world, band: WORLD_BAND, feel: () => feel }) }; };
const frame = (s: ReturnType<typeof cutterState>, over: Partial<FeelFrame> = {}): FeelFrame => ({ state: s, grade: sectorGradeInput(s), hit: null, sparks: [], working: [], artPx: 2, ...over });
const flashOf = (above: Container): Graphics => above.children[1] as Graphics;

describe('the interior light and feel layers (Art-i spec sections 5-8)', () => {
  it('uses the basic blend modes: the grade multiplies, its vacuum tint is normal, the lights and additive particles add', () => {
    const { f } = make();
    expect(f.grade.blendMode).toBe('multiply');
    expect((f.grade.children[2] as Graphics).blendMode).toBe('normal');
    expect(f.lights.blendMode).toBe('add');
    expect((f.lights.children[1] as Container).blendMode).toBe('add');
  });
  it('preallocates the 600 particle sprites, and 120 calm frames add no display objects', () => {
    const { f } = make(), s = cutterState(), all = new Container();
    all.addChild(f.starfield, f.grade, f.fixtures, f.above, f.lights);
    f.draw(frame(s), 1 / 60);
    const n0 = count(all);
    expect(n0).toBeGreaterThan(600);
    for (let k = 0; k < 120; k++) { s.tick++; f.draw(frame(s), 1 / 60); }
    expect(count(all)).toBe(n0);
  });
  it('alert shows the pulse; vacuum tints a room', () => {
    const { f } = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    expect((f.grade.children[1] as Graphics).visible).toBe(false);
    s.hull = HULL_MAX / 2; s.rooms.o2[0] = 0;
    f.draw(frame(s), 0.8);
    expect((f.grade.children[1] as Graphics).visible).toBe(true);
    expect((f.grade.children[1] as Graphics).alpha).toBeGreaterThan(0.3);
    expect((f.grade.children[2] as Graphics).context.instructions.length).toBeGreaterThan(0);
  });
  it('a hit: the white flash for 2 sim ticks, a 60 ms hitstop on the presentation clock, a 6 art pixel shake', () => {
    const { world, f } = make(), s = cutterState();
    const anim = new AnimatedSprite({ textures: [Texture.WHITE, Texture.WHITE], autoUpdate: false }); anim.play(); world.addChild(anim);   // autoUpdate off: node has no requestAnimationFrame
    f.draw(frame(s), 1 / 60);
    const t0 = f.time();
    s.tick = 10;
    const out = f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(f.time()).toBe(t0);                                          // the hitstop holds the clock
    expect(anim.playing).toBe(false);                                   // and sprite animation
    expect(Math.abs(out.shake.x) + Math.abs(out.shake.y)).toBe(12);     // cos(0) x 6 art px x 2 world units
    expect(flashOf(f.above).visible).toBe(true); expect(flashOf(f.above).alpha).toBeCloseTo(FLASH_ALPHA);
    s.tick = 11; f.draw(frame(s), 1 / 60);
    expect(flashOf(f.above).visible).toBe(true);
    s.tick = 12; f.draw(frame(s), 1 / 60);
    expect(flashOf(f.above).visible).toBe(false);                       // 2 ticks, even though the hitstop ran 60 ms
    for (let k = 0; k < 3; k++) f.draw(frame(s), 1 / 60);
    expect(f.time()).toBeCloseTo(t0 + 6 / 60 - HITSTOP_SECONDS);
    expect(anim.playing).toBe(true);
    let last = { x: 1, y: 1 };
    for (let k = 0; k < 30; k++) last = f.draw(frame(s), 1 / 60).shake;
    expect(last).toEqual({ x: 0, y: 0 });
  });
  it('the duel hit flashes the whole interior at half strength; feel off gives no flash, shake or hitstop', () => {
    const duel = make(), s = cutterState();
    duel.f.draw(frame(s), 1 / 60);
    duel.f.draw(frame(s, { hit: { whole: true } }), 1 / 60);
    expect(flashOf(duel.f.above).alpha).toBeCloseTo(FLASH_ALPHA / 2);
    const off = make('off'), t = cutterState();
    off.f.draw(frame(t), 1 / 60);
    const before = off.f.time(), out = off.f.draw(frame(t, { hit: { rooms: [0] } }), 1 / 60);
    expect(out.shake).toEqual({ x: 0, y: 0 }); expect(flashOf(off.f.above).visible).toBe(false);
    expect(off.f.time()).toBeCloseTo(before + 1 / 60);
  });
  it('working crew bob; fire and failed stations emit particles', () => {
    const { f } = make(), s = cutterState();
    s.rooms.fire[1] = 8; s.stations.failed[0] = 1;
    let out = f.draw(frame(s, { working: [{ pid: 1, kind: 'power', x: 40, y: 40 }], sparks: [{ key: 'station:0', x: 40, y: 40 }] }), 1 / 60);
    for (let k = 0; k < 30; k++) out = f.draw(frame(s, { working: [{ pid: 1, kind: 'power', x: 40, y: 40 }], sparks: [{ key: 'station:0', x: 40, y: 40 }] }), 1 / 60);
    expect(out.bob[1] === 0 || out.bob[1] === -2).toBe(true); expect(out.bob[0]).toBeUndefined();
    const visible = (c: Container): number => c.children.filter((k) => k.visible).length;
    expect(visible(f.lights.children[1] as Container)).toBeGreaterThan(0);   // additive embers and sparks
    expect(visible(f.above.children[0] as Container)).toBeGreaterThan(0);    // normal smoke
  });
  it('a hit that opens a breach throws its debris although the hitstop holds that frame', () => {
    const { f } = make(), s = cutterState(), site = 0, room = s.derived.siteRoom[site]!;
    f.draw(frame(s), 1 / 60);
    s.tick = 10; s.breaches.active[site] = 1;
    f.draw(frame(s, { hit: { rooms: [room] } }), 1 / 60);                       // the hitstop starts here: this frame's pdt is 0
    for (let k = 0; k < 4; k++) f.draw(frame(s), 1 / 60);                    // the clock runs again on the fourth frame
    const shown = (f.above.children[0] as Container).children.filter((k) => k.visible).length;
    expect(shown).toBeGreaterThanOrEqual(DEBRIS_COUNT);
  });
  it('a zero presentation dt (the game paused) freezes the particles and the alert pulse', () => {
    const { f } = make(), s = cutterState();
    s.rooms.fire[1] = 8; s.hull = HULL_MAX / 2;
    for (let k = 0; k < 40; k++) f.draw(frame(s), 1 / 60);
    const look = (): string => JSON.stringify({
      t: f.time(), alert: (f.grade.children[1] as Graphics).alpha,
      dots: [f.above.children[0], f.lights.children[1]].flatMap((c) => (c as Container).children.filter((k) => k.visible).map((k) => [k.x, k.y, (k as Sprite).tint]))
    });
    const before = look();
    expect(JSON.parse(before).dots.length).toBeGreaterThan(0);
    for (let k = 0; k < 30; k++) f.draw(frame(s), 0);
    expect(look()).toBe(before);
    f.draw(frame(s), 1 / 60);
    expect(look()).not.toBe(before);                                           // and it runs on when the game resumes
  });
  it('a layout change rebuilds the glows without leftovers; destroy frees the shared contexts', () => {
    const { f } = make(), s = cutterState(), other = createSimState(parseShip(skiff), 2, 1);
    const glows = f.lights.children[0] as Container, expected = consoles(s).length + lampPoints(s.derived.roomTiles, s.derived.width).length;
    f.draw(frame(s), 1 / 60); f.draw(frame(other), 1 / 60); f.draw(frame(s), 1 / 60);
    expect(glows.children).toHaveLength(expected);
    const shared = [(f.grade.children[0] as Graphics).context, ...glows.children.map((g) => (g as Graphics).context)];
    expect(shared.some((c) => c.destroyed)).toBe(false);
    f.destroy();
    expect(shared.every((c) => c.destroyed)).toBe(true);
    expect([f.grade.children.length, glows.children.length]).toEqual([0, 0]);
  });
});
