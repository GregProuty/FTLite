// The CRT map's one colour rule (CRT map spec section 2, Testing): a Helm frame and a Weapons frame with every kind of
// drawing on screen (missiles of both sides with trails, effects of every kind, the lock, the four arrows, both ships at
// damage levels 1 and 2, chevrons, the planet, asteroids, contours and the map edge) draw only ramp colours, in both
// blink phases. Also: those frames allocate no display objects (the filters are tested in crtFilter.test.ts, which needs jsdom).
import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics } from 'pixi.js';
import { CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { BEAM_HIT, BEAM_MISS, BURST } from '../src/renderer/src/render/tactical/fxModel';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { ringDraw, type ShipDraw, type TacticalDraw } from '../src/renderer/src/render/tactical/tacticalModel';
import type { CombatDraw } from '../src/renderer/src/render/tactical/weaponsModel';

const vp = { w: 1280, h: 720 };
const ship = (patch: Partial<ShipDraw>): ShipDraw => ({ index: 0, x: 500, y: 360, angle: 0.4, scale: 0.9, chevron: false, crew: true, rooms: [1, 2, 0], shields: 2, ...patch });
const trail = (x: number, y: number) => Array.from({ length: 12 }, (_, k) => ({ x: x - 6 * k, y: y + 3 * k })).reverse();

function fullFrame(console: 'helm' | 'weapons'): { d: TacticalDraw; c: CombatDraw } {
  const ring = ringDraw(500, 360);
  const d: TacticalDraw = {
    grid: { spacing: 250, lines: [{ x1: 100, y1: 0, x2: 100, y2: 720, major: true }, { x1: 0, y1: 200, x2: 1280, y2: 200, major: false }], columns: [{ text: 'H', x: 100, y: 4 }], rows: [{ text: '9', x: 4, y: 200 }] },
    contours: [{ accel: 40, x: 900, y: 500, r: 120 }], edge: { x: 900, y: 500, r: 400 }, planet: { x: 900, y: 500, r: 40 },
    asteroids: [{ index: 3, x: 300, y: 600, r: 14, dot: false }, { index: 4, x: 320, y: 640, r: 1, dot: true }],
    ships: [ship({}), ship({ index: 1, x: 760, y: 260, crew: false, rooms: [2, 1, 0], shields: 1 }), ship({ index: 2, x: 200, y: 200, chevron: true }), ship({ index: 3, x: 220, y: 240, chevron: true, crew: false })],
    helm: console === 'helm' ? { path: [{ x: 520, y: 340 }, { x: 560, y: 300 }, { x: 610, y: 280 }], origin: { x: 500, y: 360 }, velocity: { x: 560, y: 330 }, headingFrom: { x: 510, y: 340 }, headingTo: { x: 530, y: 300 }, thrust: 1, turn: -1, ring } : null,
    arrows: (['ship', 'enemy', 'planet', 'missile'] as const).map((target, k) => ({ target, x: 28, y: 100 + 120 * k, angle: -Math.PI / 2, distance: 900, label: `${target.toUpperCase()} 900` })),
    overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: true, paused: false },
    stars: { x: 10, y: 20 }
  };
  const c: CombatDraw = {
    weapons: console === 'weapons' ? {
      ownArc: { x: 500, y: 360, r: 300, angle: 0.4, half: Math.PI / 3 }, enemyArc: { x: 760, y: 260, r: 300, angle: 3, half: Math.PI / 3 }, ring,
      info: { text: 'ENEMY BRG 055  RNG 294  IN ARC', x: 507, y: 12 }, inArc: true,
      missilePath: [{ x: 560, y: 320 }, { x: 600, y: 300 }, { x: 650, y: 290 }], missileOrigin: { x: 560, y: 320 }
    } : null,
    lock: { x: 770, y: 262, r: 12, room: 1, label: { text: 'LOCK SHIELDS', x: 800, y: 252 } },
    missiles: [{ x: 560, y: 320, angle: 1, crew: true, trail: trail(560, 320) }, { x: 700, y: 330, angle: 4, crew: false, trail: trail(700, 330) }],
    effects: [
      { kind: 'beam', x1: 760, y1: 260, x2: 500, y2: 360, r: 0, colour: BEAM_HIT, alpha: 0.9 }, { kind: 'beam', x1: 500, y1: 360, x2: 760, y2: 200, r: 0, colour: BEAM_MISS, alpha: 0.4 },
      { kind: 'burst', x1: 640, y1: 300, x2: 640, y2: 300, r: 20, colour: BURST, alpha: 0.8 }, { kind: 'burst', x1: 660, y1: 300, x2: 660, y2: 300, r: 30, colour: BURST, alpha: 0.2 },
      { kind: 'spark', x1: 400, y1: 300, x2: 400, y2: 300, r: 10, colour: BURST, alpha: 0.7 }, { kind: 'spark', x1: 420, y1: 300, x2: 420, y2: 300, r: 14, colour: BURST, alpha: 0.3 }
    ]
  };
  return { d, c };
}

/** Every colour drawn: each Graphics' fill and stroke instructions, and each visible BitmapText's tint. */
function colours(root: Container): Set<number> {
  const out = new Set<number>();
  const walk = (o: Container): void => {
    if (o instanceof Graphics) for (const ins of o.context.instructions) if (ins.action === 'fill' || ins.action === 'stroke') out.add(ins.data.style.color);
    if (o instanceof BitmapText && o.visible) out.add(Number(o.tint));
    for (const k of o.children) walk(k as Container);
  };
  walk(root);
  return out;
}
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);

describe('the CRT map draws only the amber ramp (CRT map spec section 2)', () => {
  for (const console of ['helm', 'weapons'] as const) for (const t of [0, 0.3, 0.6, 0.9]) it(`${console} at t = ${t}`, () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), { d, c } = fullFrame(console);
    layer.draw(d, c, t);
    const seen = colours(layer.container);
    expect(seen.size).toBeGreaterThan(4);
    for (const colour of seen) expect(CRT_RAMP, colour.toString(16)).toContain(colour);
  });
});

describe('the CRT layer allocates nothing per frame (spec section 2)', () => {
  it('60 frames of both consoles and both blink phases add no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), helm = fullFrame('helm'), weapons = fullFrame('weapons');
    layer.draw(helm.d, helm.c, 0); layer.draw(weapons.d, weapons.c, 0.3);
    const n0 = count(layer.container);
    for (let k = 0; k < 60; k++) { const f = k % 2 ? helm : weapons; layer.draw(f.d, f.c, k / 7); }
    expect(count(layer.container)).toBe(n0);
  });
});
