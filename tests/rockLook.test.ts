// Asteroids look pass (docs/superpowers/specs/2026-11-20-asteroids-look-design.md): rocks are background. A rock keeps
// its starting colours however worn it is (CRT.dim fill, CRT.mid outline), its seams are one faint stroke, darker
// than the fill and never lighter, and nothing about a rock draws in CRT.main or CRT.hot.
import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { buildTemplate } from '../src/renderer/src/sim/tactical/rockCells';
import { rockOutline } from '../src/renderer/src/render/tactical/rockOutline';
import type { AsteroidDraw, TacticalDraw } from '../src/renderer/src/render/tactical/tacticalModel';

const vp = { w: 1280, h: 720 };
const frame = (asteroids: AsteroidDraw[]): TacticalDraw => ({
  grid: { spacing: 250, lines: [], columns: [], rows: [] }, contours: [], edge: null, planet: null, asteroids, ships: [], helm: null, arrows: [],
  overlay: { zoomText: 'ZOOM 1.00', scaleBar: { px: 100, units: 100 }, snapHint: false, paused: false }, stars: { x: 0, y: 0 }
});
interface Stroke { action: string; colour: number; alpha: number }
/** Every fill and stroke the layer drew, in order, with its colour and alpha. */
function strokes(root: Container): Stroke[] {
  const out: Stroke[] = [];
  const walk = (o: Container): void => {
    if (o instanceof Graphics) for (const ins of o.context.instructions) if (ins.action === 'fill' || ins.action === 'stroke') out.push({ action: ins.action, colour: ins.data.style.color, alpha: ins.data.style.alpha });
    for (const k of o.children) walk(k as Container);
  };
  walk(root);
  return out;
}
function drawn(asteroids: AsteroidDraw[]): Stroke[] {
  const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
  layer.draw(frame(asteroids), null, 0);
  return strokes(layer.container);
}
const tpl = buildTemplate(5, 44, 3), outline = rockOutline(tpl, tpl.full);
const rock = (wear: number): AsteroidDraw => ({ index: 5, x: 400, y: 300, r: 40, dot: false, wear, outline, scale: 0.9 });

describe('the rock look: background (look pass spec §2)', () => {
  const empty = drawn([]), whole = drawn([rock(0)]);
  /** What the rock added to an empty frame's drawing. */
  const added = (all: Stroke[]): Stroke[] => { const rest = [...all]; for (const e of empty) { const i = rest.findIndex((s) => s.action === e.action && s.colour === e.colour && s.alpha === e.alpha); if (i >= 0) rest.splice(i, 1); } return rest; };

  it('a whole rock is a CRT.dim fill with a 1 px CRT.mid outline and nothing else', () => {
    expect(added(whole)).toEqual([{ action: 'fill', colour: CRT.dim, alpha: 1 }, { action: 'stroke', colour: CRT.mid, alpha: 1 }]);
  });
  it('a worn rock keeps the same fill and outline at every wear: no brighter outline, no changed fill', () => {
    for (const wear of [0.2, 0.5, 0.8, 1]) {
      const body = added(drawn([rock(wear)])).slice(0, 2);
      expect(body, `wear ${wear}`).toEqual([{ action: 'fill', colour: CRT.dim, alpha: 1 }, { action: 'stroke', colour: CRT.mid, alpha: 1 }]);
    }
  });
  it('the seams are one CRT.faint stroke (darker than the fill) at alpha 0.6 * wear, with no highlight beside it', () => {
    for (const wear of [0.2, 0.5, 0.8, 1]) {
      const seams = added(drawn([rock(wear)])).slice(2);
      expect(seams.length, `wear ${wear}`).toBe(1);
      const c = seams[0]!;
      expect(c.action).toBe('stroke'); expect(c.colour).toBe(CRT.faint);
      expect(c.alpha).toBeCloseTo(0.6 * wear, 9); expect(c.alpha).toBeLessThanOrEqual(0.6);
    }
  });
  it('a plain rock (no cells) adds only the fill and the outline: no seams', () => {
    expect(added(drawn([{ index: 5, x: 400, y: 300, r: 40, dot: false, wear: 0.8 }]))).toEqual([{ action: 'fill', colour: CRT.dim, alpha: 1 }, { action: 'stroke', colour: CRT.mid, alpha: 1 }]);
  });
  it('nothing about a rock draws in CRT.main or CRT.hot', () => {
    for (const wear of [0, 0.2, 0.5, 0.8, 1]) for (const s of added(drawn([rock(wear), { index: 9, x: 600, y: 300, r: 1, dot: true }])))
      expect([CRT.main, CRT.hot]).not.toContain(s.colour);
  });
});
