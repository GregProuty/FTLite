// Sensors blip spec §3, §4 (the layer): the ping is a dotted circle in CRT.mid at the ping's alpha with a small ? at its
// centre in the same tint and alpha; a 'blip' edge arrow is hollow, stroked in CRT.mid at the ping's alpha, and takes the
// ?'s place. Only ramp colours, and nothing allocated per frame. The layer runs in node without a renderer: the test reads
// each Graphics' instructions and each BitmapText, as tests/crtColours.test.ts does.
import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics } from 'pixi.js';
import { CRT, CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { createTacticalLayer, type TacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import type { ArrowDraw, TacticalDraw } from '../src/renderer/src/render/tactical/tacticalModel';
import { textPx } from '../src/renderer/src/render/theme';

const vp = { w: 1280, h: 720 };
/** A frame with nothing on it but what `over` adds. */
const frame = (over: Partial<TacticalDraw> = {}): TacticalDraw => ({
  grid: { spacing: 500, lines: [], columns: [], rows: [] }, contours: [], edge: null, planet: null, asteroids: [], ships: [], helm: null, arrows: [],
  overlay: { zoomText: 'ZOOM 0.50', scaleBar: { px: 100, units: 200 }, snapHint: false, paused: false }, stars: { x: 0, y: 0 }, ...over });
const BLIP = { x: 400, y: 300, r: 120, alpha: 0.7 };
const CIRCLE = { action: 'stroke', color: CRT.mid, alpha: 0.7, width: 1 };
const ARROW: ArrowDraw = { target: 'blip', x: 1252, y: 360, angle: Math.PI / 2, distance: 1500, label: 'BLIP ~1500', alpha: 0.4 };
const ENEMY: ArrowDraw = { target: 'enemy', x: 1252, y: 360, angle: Math.PI / 2, distance: 1500, label: 'ENEMY 1500' };

interface Ink { action: 'fill' | 'stroke'; color: number; alpha: number; width: number }
/** Every fill and stroke drawn under `root`, with its colour, alpha and (a stroke's) width. */
function ink(root: Container): Ink[] {
  const out: Ink[] = [];
  const walk = (o: Container): void => {
    if (o instanceof Graphics) for (const ins of o.context.instructions) {
      if (ins.action === 'stroke') out.push({ action: 'stroke', color: ins.data.style.color, alpha: ins.data.style.alpha, width: ins.data.style.width });
      else if (ins.action === 'fill') out.push({ action: 'fill', color: ins.data.style.color, alpha: ins.data.style.alpha, width: 0 });
    }
    for (const k of o.children) walk(k as Container);
  };
  walk(root);
  return out;
}
/** The layer's visible texts that read `s`. */
const texts = (layer: TacticalLayer, s: string): BitmapText[] =>
  [...layer.bloom.children, ...layer.container.children].filter((k): k is BitmapText => k instanceof BitmapText && k.visible && k.text === s);
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);

describe('the layer draws the blip (sensors blip spec §3)', () => {
  it('a dotted circle in CRT.mid at the ping\'s alpha, and a small ? at its centre in the same tint and alpha', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    layer.draw(frame(), null, 0);
    expect(ink(layer.container)).not.toContainEqual(CIRCLE);
    expect(texts(layer, '?')).toEqual([]);
    layer.draw(frame({ blip: BLIP }), null, 0);
    expect(ink(layer.container)).toContainEqual(CIRCLE);
    const q = texts(layer, '?');
    expect(q).toHaveLength(1);
    expect([Number(q[0]!.tint), q[0]!.alpha, q[0]!.x, q[0]!.y]).toEqual([CRT.mid, 0.7, Math.round(400 - textPx('?', 1) / 2), 292]);
    layer.draw(frame(), null, 0);   // the next frame without it: both go
    expect(ink(layer.container)).not.toContainEqual(CIRCLE);
    expect(texts(layer, '?')).toEqual([]);
  });
  it('the ? gives way to the edge arrow: with a blip arrow the circle stays and the ? goes', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    layer.draw(frame({ blip: BLIP, arrows: [ARROW] }), null, 0);
    expect(texts(layer, '?')).toEqual([]);
    expect(ink(layer.container)).toContainEqual(CIRCLE);
  });
  it('the blip arrow is hollow, stroked in CRT.mid at the ping\'s alpha, with its label; the enemy arrow keeps its own look', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    layer.draw(frame(), null, 0);
    const fills = ink(layer.container).filter((k) => k.action === 'fill').length;   // the background and the stars
    layer.draw(frame({ arrows: [ARROW] }), null, 0);
    const blip = ink(layer.container);
    expect(blip.filter((k) => k.action === 'fill')).toHaveLength(fills);   // no fill: hollow
    expect(blip).toContainEqual({ action: 'stroke', color: CRT.mid, alpha: 0.4, width: 2 });
    expect(texts(layer, 'BLIP ~1500')).toHaveLength(1);
    layer.draw(frame({ arrows: [ENEMY] }), null, 0);
    const enemy = ink(layer.container);
    expect(enemy.filter((k) => k.action === 'fill')).toHaveLength(fills + 1);
    expect(enemy).toContainEqual({ action: 'stroke', color: CRT.main, alpha: 1, width: 2 });
    expect(enemy).not.toContainEqual({ action: 'stroke', color: CRT.mid, alpha: 0.4, width: 2 });
  });
  it('only ramp colours, and 60 frames with the blip and its arrow add no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), a = frame({ blip: BLIP }), b = frame({ blip: BLIP, arrows: [ARROW] });
    for (const f of [a, b]) {
      layer.draw(f, null, 0.3);
      for (const k of ink(layer.container)) expect(CRT_RAMP, k.color.toString(16)).toContain(k.color);
      for (const t of texts(layer, '?')) expect(CRT_RAMP).toContain(Number(t.tint));
    }
    const n0 = count(layer.container);
    for (let k = 0; k < 60; k++) layer.draw(k % 2 ? a : b, null, k / 7);
    expect(count(layer.container)).toBe(n0);
  });
});
