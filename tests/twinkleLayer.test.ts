import { describe, it, expect } from 'vitest';
import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { BACKDROP_STARS, backdropOption, createBackdropLayer, DOT_BASE, GLOW_ALPHA } from '../src/renderer/src/render/twinkleLayer';
import { createInteriorFeel, type FeelFrame } from '../src/renderer/src/render/interiorFeel';
import type { FeelSetting } from '../src/renderer/src/render/feel';
import { sectorGradeInput } from '../src/renderer/src/render/gradeModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import type { GameAssets } from '../src/renderer/src/render/assets';
import type { StarFile } from '../src/renderer/src/render/twinkleModel';
import { cutterState } from './helpers/sim';

/** Art-v spec sections 1 and 2: the backdrop sprite and its twinkle dots, and their place in the interior feel. */
const painting = (): Texture => new Texture({ source: new TextureSource({ width: 2304, height: 1584 }) });
const STARS: StarFile = { width: 2304, height: 1584, tint: '#b36521', stars: [[0, 80, 1, 112], [1152, 792, 4, 130], ...Array.from({ length: 8 }, (_, k) => [k * 100, 500, 1, 111] as const)] };

describe('the backdrop layer (Art-v spec sections 1 and 2)', () => {
  it('covers the 1280 x 720 stage (80 px cropped top and bottom), linear with mipmaps set before its first upload', () => {
    const tex = painting(), layer = createBackdropLayer({ texture: tex, stars: null });
    const back = layer.container.children[0] as Sprite;
    expect(back.width).toBeCloseTo(1280, 6); expect(back.height).toBeCloseTo(880, 6);
    expect(back.x).toBeCloseTo(0, 9); expect(back.y).toBeCloseTo(-80, 9);
    expect(tex.source.scaleMode).toBe('linear'); expect(tex.source.autoGenerateMipmaps).toBe(true);
    expect((layer.container.children[1] as Container).children).toHaveLength(0);   // no star list: nothing twinkles
  });
  it('one additive dot per on-stage star over its speck through the cover transform, plus a glint on the brightest tenth; stars in the cropped bands get none', () => {
    const layer = createBackdropLayer({ texture: painting(), stars: STARS });
    const twinkle = layer.container.children[1] as Container;
    expect(twinkle.blendMode).toBe('add');
    expect(twinkle.children).toHaveLength(STARS.stars.length - 1 + 1);   // 10 stars, the one at source y 80 is in the cropped top band; ceil(10 x 0.1) = 1 glint
    const s = 1280 / 2304, centre = twinkle.children[0] as Sprite;   // the brightest star is the first on stage: its dot, then its glint
    expect(centre.x).toBeCloseTo((1152 + 0.5) * s, 6); expect(centre.y).toBeCloseTo((792 + 0.5) * s - 80, 6);
    expect(centre.width).toBeCloseTo(2 * (DOT_BASE + 2) * s, 6);
    expect(centre.tint).toBe(0xb36521);
  });
  it('draw changes only alphas: the dots twinkle on the clock, and feel off hides the twinkle (the plain painting)', () => {
    const layer = createBackdropLayer({ texture: painting(), stars: STARS });
    const sprites = (layer.container.children[1] as Container).children as Sprite[];
    const before = sprites.map((d) => [d.x, d.y, d.width]);
    const seen = new Set<number>();
    for (let t = 0; t < 4; t += 0.1) { layer.draw(t, 1); seen.add(Math.round(sprites[0]!.alpha * 1000)); }
    expect(seen.size).toBeGreaterThan(5);
    for (const d of sprites) { expect(d.alpha).toBeGreaterThanOrEqual(0); expect(d.alpha).toBeLessThanOrEqual(1); }
    layer.draw(2.5, 0);
    expect((layer.container.children[1] as Container).visible).toBe(false);
    layer.draw(2.5, 1);
    expect((layer.container.children[1] as Container).visible).toBe(true);
    expect(sprites.every((d) => d.alpha <= GLOW_ALPHA)).toBe(true);
    expect(sprites.map((d) => [d.x, d.y, d.width])).toEqual(before);
  });
  it('a star list for a differently shaped image gives no twinkle; the backdrop still draws', () => {
    const layer = createBackdropLayer({ texture: painting(), stars: { ...STARS, width: 1000, height: 1000 } });
    expect((layer.container.children[1] as Container).children).toHaveLength(0);
  });
  it('backdropOption: present only when space.backdrop is loaded; the committed star list is used', () => {
    const tex = painting();
    const assets = (missing: string[]) => ({ missing, texture: () => tex }) as unknown as GameAssets;
    expect(backdropOption(assets(['space.backdrop']))).toBeUndefined();
    expect(backdropOption(assets([]))).toEqual({ texture: tex, stars: BACKDROP_STARS });
    expect(backdropOption(assets([]), null)).toEqual({ texture: tex, stars: null });
  });
});

describe('the interior feel with the backdrop (Art-v spec section 1)', () => {
  const frame = (s: ReturnType<typeof cutterState>): FeelFrame => ({ state: s, grade: sectorGradeInput(s), hit: null, sparks: [], working: [], artPx: 2 });
  const make = (backdrop: boolean, feel: FeelSetting = 'full') => createInteriorFeel({ world: new Container(), band: WORLD_BAND, feel: () => feel, backdrop: backdrop ? { texture: painting(), stars: STARS } : undefined });
  it('loaded: the backdrop sits first in the starfield and the procedural stars do not draw', () => {
    const f = make(true), s = cutterState();
    f.draw(frame(s), 1 / 60);
    expect(f.starfield.children).toHaveLength(2);
    expect((f.starfield.children[1] as Graphics).context.instructions).toHaveLength(0);
  });
  it('missing: the procedural starfield draws exactly as before', () => {
    const f = make(false), s = cutterState();
    f.draw(frame(s), 1 / 60);
    expect(f.starfield.children).toHaveLength(1);
    expect((f.starfield.children[0] as Graphics).context.instructions.length).toBeGreaterThan(0);
  });
  it('runs on the presentation clock: a pause (dt 0) freezes the twinkle', () => {
    const f = make(true), s = cutterState();
    f.draw(frame(s), 0.3);
    const dots = ((f.starfield.children[0] as Container).children[1] as Container).children as Sprite[];
    const a = dots.map((d) => d.alpha);
    f.draw(frame(s), 0, 0.5);
    expect(dots.map((d) => d.alpha)).toEqual(a);
    f.draw(frame(s), 0.4);
    expect(dots.map((d) => d.alpha)).not.toEqual(a);
  });
});
