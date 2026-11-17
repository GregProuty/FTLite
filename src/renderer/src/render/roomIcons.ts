import { Container, Graphics } from 'pixi.js';
import type { SimState } from '../sim/state';
import { roomIcons, ICON_KINDS, type IconKind, type IconTint } from './roomIconModel';

export { ICON_KINDS, roomIcons };
export type { IconKind };

export const ICON_SIZE = 20, ICON_ALPHA = 0.85;
const SW = 2;

/** Draws an original glyph centred at (cx, cy) in a size x size box, strokes 2 px (spec Demo-iii section 4). */
export function drawIcon(g: Graphics, kind: IconKind, cx: number, cy: number, size: number, color: number): void {
  const s = size, st = { width: SW, color };
  switch (kind) {
    case 'navigation': {
      g.circle(cx, cy, 0.35 * s).stroke(st);
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.moveTo(cx + Math.cos(a) * 0.35 * s, cy + Math.sin(a) * 0.35 * s).lineTo(cx + Math.cos(a) * 0.5 * s, cy + Math.sin(a) * 0.5 * s).stroke(st); }
      break;
    }
    case 'weapons': {
      const l = cx - 0.4 * s, r = cx + 0.2 * s, h = 0.15 * s;
      g.poly([l, cy - h, r, cy - h, cx + 0.4 * s, cy, r, cy + h, l, cy + h], true).stroke(st);
      g.moveTo(l, cy - h).lineTo(l - 0.1 * s, cy - 0.3 * s).stroke(st);
      g.moveTo(l, cy + h).lineTo(l - 0.1 * s, cy + 0.3 * s).stroke(st);
      break;
    }
    case 'science': {
      const w = 0.45 * s, h = 0.25 * s;
      g.moveTo(cx - w, cy).quadraticCurveTo(cx, cy - 2 * h, cx + w, cy).quadraticCurveTo(cx, cy + 2 * h, cx - w, cy).stroke(st);
      g.circle(cx, cy, 0.12 * s).fill(color);
      break;
    }
    case 'engineering': {
      for (const dy of [-0.2, 0.2]) g.poly([cx - 0.3 * s, cy + (dy - 0.18) * s, cx + 0.1 * s, cy + dy * s, cx - 0.3 * s, cy + (dy + 0.18) * s], false).stroke(st);
      break;
    }
    case 'lifeSupport': {   // an "O2" drawn from strokes so the glyph stays one Graphics
      g.ellipse(cx - 0.25 * s, cy, 0.17 * s, 0.3 * s).stroke(st);
      g.moveTo(cx + 0.1 * s, cy - 0.2 * s).lineTo(cx + 0.25 * s, cy - 0.3 * s).lineTo(cx + 0.4 * s, cy - 0.2 * s).lineTo(cx + 0.1 * s, cy + 0.3 * s).lineTo(cx + 0.4 * s, cy + 0.3 * s).stroke(st);
      break;
    }
    case 'medbay': {
      g.rect(cx - 0.4 * s, cy - 0.125 * s, 0.8 * s, 0.25 * s).fill(color);
      g.rect(cx - 0.125 * s, cy - 0.4 * s, 0.25 * s, 0.8 * s).fill(color);
      break;
    }
    case 'doors': {
      const w = 0.2 * s, gap = 0.15 * s, h = 0.8 * s;
      g.rect(cx - gap / 2 - w, cy - h / 2, w, h).fill(color);
      g.rect(cx + gap / 2, cy - h / 2, w, h).fill(color);
      break;
    }
    case 'reactor': {
      g.poly([cx + 0.1 * s, cy - 0.5 * s, cx - 0.25 * s, cy + 0.05 * s, cx, cy + 0.05 * s, cx - 0.1 * s, cy + 0.5 * s, cx + 0.25 * s, cy - 0.1 * s, cx, cy - 0.1 * s], true).fill(color);
      break;
    }
  }
}

export { tintColor } from './roomIconModel';
/** The same tints for glyphs drawn on the light flat floors (spec visual cleanup section 4): dark normally, washed out when unpowered, strong red when failed. */
export const FLOOR_GLYPH = { normal: 0x5f6575, unpowered: 0xb4b9c3, failed: 0xd9483b } as const;
export function floorTintColor(t: IconTint): number { return FLOOR_GLYPH[t]; }

export interface IconLayer { container: Container; build(state: SimState): void; update(state: SimState): void }

/** The room glyphs: drawn once per layout in white, re-tinted every frame (no per-frame redraw). `skip`: kinds not drawn
 *  (the duel interior's badges stand in for Navigation and the Medbay, start-aboard spec §2). */
export function createIconLayer(skip: readonly IconKind[] = []): IconLayer {
  const container = new Container();
  let gfx: Graphics[] = [], builtFor: string | null = null;
  const shown = (state: SimState) => roomIcons(state).filter((ic) => !skip.includes(ic.kind));
  function build(state: SimState): void {
    for (const c of container.removeChildren()) c.destroy();
    gfx = shown(state).map((ic) => { const g = new Graphics(); drawIcon(g, ic.kind, ic.x, ic.y, ICON_SIZE, 0xffffff); g.alpha = ICON_ALPHA; container.addChild(g); return g; });
    builtFor = state.derived.layoutHash;
  }
  return {
    container, build,
    update(state) {
      if (builtFor !== state.derived.layoutHash) build(state);
      shown(state).forEach((ic, k) => { gfx[k]!.tint = floorTintColor(ic.tint); });
    }
  };
}
