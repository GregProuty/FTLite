// The painted Deep Space (Red) backdrop and its twinkling stars (Art-v spec sections 1 and 2): one cover-fitted sprite over
// the whole internal stage, and one additive soft dot per painted star (plus a cross glint on the brightest tenth), placed
// through the same cover transform. Plain Sprites sharing two generated textures; each frame only their alphas change.
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../shared/resolution';
import starData from '../../../../art/deep-space-red.stars.json';
import type { GameAssets } from './assets';
import { backdropChoice, brightFlags, coverFit, glintAlpha, glintPeriod, parseStarFile, twinkleAlpha, twinkleParams, type StarFile, type TwinkleParams } from './twinkleModel';

/** The committed star list (npm run art:stars), or null if it does not parse. */
export const BACKDROP_STARS: StarFile | null = parseStarFile(starData);

/** The look, tuned on the screenshots (Art-v report): an additive glow over each speck at GLOW_ALPHA x twinkleAlpha. */
export const GLOW_ALPHA = 0.8;
/** Dot radius in source px: DOT_BASE + sqrt(size), then scaled to the stage (spec: about 1 + sqrt(size)). */
export const DOT_BASE = 1.5;
/** The glint's arm length as a multiple of the dot radius, and its peak alpha. */
export const GLINT_REACH = 4, GLINT_ALPHA = 0.7;

const DOT_PX = 32, GLINT_PX = 64;

/** A white soft dot or cross, premultiplied RGBA (so additive blending adds exactly its alpha of the tint). */
function generated(size: number, alpha: (dx: number, dy: number) => number): Texture {
  const data = new Uint8Array(size * size * 4), c = (size - 1) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = Math.round(255 * Math.max(0, Math.min(1, alpha((x - c) / (size / 2), (y - c) / (size / 2)))));
    data.set([a, a, a, a], (y * size + x) * 4);
  }
  const source = new BufferImageSource({ resource: data, width: size, height: size, alphaMode: 'premultiplied-alpha', scaleMode: 'linear' });
  return new Texture({ source });
}
let shared: { dot: Texture; glint: Texture } | null = null;
/** The two generated textures, shared by every view and never destroyed (they are 32 and 64 px). */
function textures(): { dot: Texture; glint: Texture } {
  shared ??= {
    dot: generated(DOT_PX, (dx, dy) => { const r = Math.hypot(dx, dy); return r >= 1 ? 0 : (1 - r) * (1 - r); }),
    glint: generated(GLINT_PX, (dx, dy) => {
      const arm = (along: number, across: number): number => Math.max(0, 1 - Math.abs(along)) ** 2 * Math.max(0, 1 - Math.abs(across) * 16);
      return Math.max(arm(dx, dy), arm(dy, dx));
    })
  };
  return shared;
}

export interface BackdropOption { texture: Texture; stars: StarFile | null }

/** Section 3: the backdrop option for a view, when space.backdrop is loaded; undefined keeps today's starfield. */
export function backdropOption(assets: GameAssets, stars: StarFile | null = BACKDROP_STARS): BackdropOption | undefined {
  const choice = backdropChoice(new Set(assets.missing), stars);
  return choice.backdrop ? { texture: assets.texture('space.backdrop'), stars: choice.twinkle ? stars : null } : undefined;
}

export interface BackdropLayer {
  container: Container;
  /** `t`: the presentation clock (seconds); `feel`: 0 (off) to 1 (full), 0 holds every star lit with no glint. */
  draw(t: number, feel: number): void;
}

/** The backdrop sprite (linear with mipmaps, set before its first upload, as battlemapLayer) and the twinkle dots over it. */
export function createBackdropLayer(opt: BackdropOption, stage: { w: number; h: number } = { w: INTERNAL_W, h: INTERNAL_H }): BackdropLayer {
  const container = new Container(), src = opt.texture.source;
  src.scaleMode = 'linear';
  src.autoGenerateMipmaps = true;
  const fit = coverFit(opt.texture.width, opt.texture.height, stage.w, stage.h);
  const back = new Sprite(opt.texture); back.scale.set(fit.scale); back.position.set(fit.x, fit.y);
  const twinkle = new Container(); twinkle.blendMode = 'add';
  container.addChild(back, twinkle);
  const stars = opt.stars;
  const dots: Sprite[] = [], glints: { k: number; sprite: Sprite; period: number }[] = [], params: TwinkleParams[] = [];
  if (stars) {
    const { dot, glint } = textures(), tint = parseInt(stars.tint.slice(1), 16), bright = brightFlags(stars.stars);
    const s = fit.scale * (opt.texture.width / stars.width);   // the star list's source px to stage px
    stars.stars.forEach(([x, y, size], k) => {
      const r = (DOT_BASE + Math.sqrt(size)) * s, px = fit.x + (x + 0.5) * s, py = fit.y + (y + 0.5) * s;   // + 0.5: a centroid in pixel indices to the pixel centre
      const d = new Sprite(dot); d.anchor.set(0.5); d.width = d.height = 2 * r; d.position.set(px, py); d.tint = tint;
      twinkle.addChild(d); dots.push(d); params.push(twinkleParams(k));
      if (bright[k]) {
        const g = new Sprite(glint); g.anchor.set(0.5); g.width = g.height = 2 * r * GLINT_REACH; g.position.set(px, py); g.tint = tint; g.alpha = 0;
        twinkle.addChild(g); glints.push({ k, sprite: g, period: glintPeriod(k) });
      }
    });
  }
  return {
    container,
    draw(t, feel) {
      for (let k = 0; k < dots.length; k++) dots[k]!.alpha = GLOW_ALPHA * twinkleAlpha(k, t, feel, params[k]);
      for (const g of glints) g.sprite.alpha = GLINT_ALPHA * glintAlpha(g.k, t, feel, g.period);
    }
  };
}
