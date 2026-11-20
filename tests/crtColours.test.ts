// The CRT map's one colour rule (CRT map spec section 2, Testing): a Helm frame and a Weapons frame with every kind of
// drawing on screen (missiles of both sides with trails, effects of every kind, the lock, the four arrows, both ships at
// damage levels 1 and 2, chevrons, the planet, asteroids, contours and the map edge) draw only ramp colours, in both
// blink phases. Also: those frames allocate no display objects (the filters are tested in crtFilter.test.ts, which needs jsdom).
import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics } from 'pixi.js';
import { CRT, CRT_RAMP, roomLevel, roomLook } from '../src/renderer/src/render/tactical/crtTheme';
import { BEAM_HIT, BEAM_MISS, BURST } from '../src/renderer/src/render/tactical/fxModel';
import { CALLOUT_COLOUR, CHARGE_COLOUR } from '../src/renderer/src/render/tactical/hitModel';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { ringDraw, type ShipDraw, type TacticalDraw } from '../src/renderer/src/render/tactical/tacticalModel';
import { buildTemplate } from '../src/renderer/src/sim/tactical/rockCells';
import { rockOutline } from '../src/renderer/src/render/tactical/rockOutline';
import type { CombatDraw } from '../src/renderer/src/render/tactical/weaponsModel';
import type { GunSightDraw } from '../src/renderer/src/render/duel/leadModel';

const vp = { w: 1280, h: 720 };
const ship = (patch: Partial<ShipDraw>): ShipDraw => ({ index: 0, x: 500, y: 360, angle: 0.4, scale: 0.9, chevron: false, crew: true, hull: 'hound', rooms: [1, 2, 0], shields: 2, ...patch });
const trail = (x: number, y: number) => Array.from({ length: 12 }, (_, k) => ({ x: x - 6 * k, y: y + 3 * k })).reverse();

function fullFrame(console: 'helm' | 'weapons', inRange = true): { d: TacticalDraw; c: CombatDraw } {
  const ring = ringDraw(500, 360);
  const d: TacticalDraw = {
    grid: { spacing: 250, lines: [{ x1: 100, y1: 0, x2: 100, y2: 720, major: true }, { x1: 0, y1: 200, x2: 1280, y2: 200, major: false }], columns: [{ text: 'H', x: 100, y: 4 }], rows: [{ text: '9', x: 4, y: 200 }] },
    contours: [{ accel: 40, x: 900, y: 500, r: 120 }], edge: { x: 900, y: 500, r: 400 }, planet: { x: 900, y: 500, r: 40 },
    asteroids: [{ index: 3, x: 300, y: 600, r: 14, dot: false }, { index: 4, x: 320, y: 640, r: 1, dot: true }, { index: 5, x: 360, y: 600, r: 18, dot: false, wear: 0.8 }, { index: 6, x: 400, y: 600, r: 12, dot: false }, { index: 7, x: 440, y: 600, r: 30, dot: false, wear: 0.6, outline: rockOutline(buildTemplate(7, 44, 3), buildTemplate(7, 44, 3).full), scale: 0.7 }],   // SPIKE: a worn rock's cracks
    ships: [ship({}), ship({ index: 1, x: 760, y: 260, crew: false, hull: 'scout', rooms: [2, 1, 0], shields: 1 }), ship({ index: 2, x: 200, y: 200, chevron: true }), ship({ index: 3, x: 220, y: 240, chevron: true, crew: false, hull: 'scout' }), ship({ index: 4, x: 420, y: 520, rooms: [0, 1, 2], hull: 'valkyrn' }), ship({ index: 5, x: 640, y: 560, crew: false, hull: 'scout', rooms: [0, 1, 2], shields: 0 })],
    helm: console === 'helm' ? { path: [{ x: 520, y: 340 }, { x: 560, y: 300 }, { x: 610, y: 280 }], origin: { x: 500, y: 360 }, velocity: { x: 560, y: 330 }, headingFrom: { x: 510, y: 340 }, headingTo: { x: 530, y: 300 }, thrust: 1, turn: -1, ring,
      // Feel-ii: the collision X and tag, the held heading's chevron and line, SLINGSHOT
      collision: { x: 610, y: 280, from: { x: 560, y: 300 }, seconds: 1.2, label: { text: 'COLLISION 1.2s', x: 620, y: 258 } },
      hold: { chevron: [600, 360, 618, 355, 600, 350], from: { x: 520, y: 360 }, to: { x: 618, y: 355 }, preview: false }, slingshot: { text: 'SLINGSHOT', x: 570, y: 306 } } : null,
    gravity: console === 'helm' ? [{ x: 900, y: 500, r: 90, g: 1, label: { text: 'G 1', x: 904, y: 396 } }, { x: 900, y: 500, r: 140, g: 0.5, label: { text: 'G 0.5', x: 904, y: 346 } }] : undefined,
    arrows: (['ship', 'enemy', 'planet', 'missile'] as const).map((target, k) => ({ target, x: 28, y: 100 + 120 * k, angle: -Math.PI / 2, distance: 900, label: `${target.toUpperCase()} 900` })),
    overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: true, paused: false },
    stars: { x: 10, y: 20 },
    rockMarks: [{ x: 300, y: 600, r: 20, weapon: 'laser', hover: false }, { x: 360, y: 600, r: 24, weapon: 'torpedo', hover: false }, { x: 300, y: 640, r: 12, weapon: 'laser', hover: true }, { x: 340, y: 640, r: 12, weapon: 'torpedo', hover: true }],
  };
  const c: CombatDraw = {
    weapons: console === 'weapons' ? {
      ownArc: { x: 500, y: 360, r: 300, angle: 0.4, half: Math.PI / 3 }, enemyArc: { x: 760, y: 260, r: 300, angle: 3, half: Math.PI / 3 }, ring,
      info: { text: `BRG 055  RNG 294  IN ARC  TORP ${inRange ? 'IN' : 'OUT'}`, x: 507, y: 12 }, inArc: true, torpedoInRange: inRange
    } : null,
    // Weapons update spec §2: the torpedo's range circle, lit at Weapons while in range, dim otherwise and at the Helm.
    torpedoRange: { x: 500, y: 360, r: 324, lit: console === 'weapons' && inRange },
    lock: { x: 770, y: 262, r: 12, room: 1, label: { text: 'LOCK SHIELDS', x: 800, y: 252 } },
    missiles: [{ x: 560, y: 320, r: 4, crew: true, trail: trail(560, 320) }, { x: 700, y: 330, r: 4, crew: false, trail: trail(700, 330) }],
    effects: [
      { kind: 'beam', x1: 760, y1: 260, x2: 500, y2: 360, r: 0, colour: BEAM_HIT, alpha: 0.9 }, { kind: 'beam', x1: 500, y1: 360, x2: 760, y2: 200, r: 0, colour: BEAM_MISS, alpha: 0.4 },
      { kind: 'burst', x1: 640, y1: 300, x2: 640, y2: 300, r: 20, colour: BURST, alpha: 0.8 }, { kind: 'burst', x1: 660, y1: 300, x2: 660, y2: 300, r: 30, colour: BURST, alpha: 0.2 },
      { kind: 'spark', x1: 400, y1: 300, x2: 400, y2: 300, r: 10, colour: BURST, alpha: 0.7 }, { kind: 'spark', x1: 420, y1: 300, x2: 420, y2: 300, r: 14, colour: BURST, alpha: 0.3 },
      { kind: 'chip', x1: 450, y1: 300, x2: 444, y2: 302, r: 0, colour: CRT.hot, alpha: 0.8 }, { kind: 'speck', x1: 460, y1: 300, x2: 460, y2: 300, r: 1.5, colour: CRT.main, alpha: 0.4 },
      { kind: 'speck', x1: 470, y1: 300, x2: 470, y2: 300, r: 1.5, colour: CRT.mid, alpha: 0.9 }, { kind: 'shock', x1: 500, y1: 300, x2: 500, y2: 300, r: 60, colour: CRT.hot, alpha: 0.5, width: 2.5 },
      { kind: 'core', x1: 520, y1: 300, x2: 520, y2: 300, r: 12, colour: CRT.hot, alpha: 0.9 }, { kind: 'burst', x1: 540, y1: 300, x2: 540, y2: 300, r: 36, colour: BURST, alpha: 0.6 }
    ],
    // Duel polish i spec §A, §B: the charge ring (part-charged at the Helm, full at Weapons) and a callout of every kind.
    charge: { x: 760, y: 260, r: 30, fill: console === 'helm' ? 0.4 : 1, full: console === 'weapons', alpha: 0.7, colour: CHARGE_COLOUR, label: { text: console === 'helm' ? 'CHARGING' : 'FIRING', x: 760, y: 218 } },
    callouts: Object.values(CALLOUT_COLOUR).map((colour, k) => ({ text: `CALLOUT ${k}`, x: 760, y: 200 - 14 * k, colour, alpha: 0.8 })),
    // Feel-ii: the enemy torpedo's path, the Helm's EVADE arrow, the pings
    torpedoPath: [{ x: 700, y: 330 }, { x: 650, y: 340 }, { x: 600, y: 350 }],
    evade: console === 'helm' ? { x: 570, y: 360, angle: Math.PI / 2, label: { text: 'EVADE', x: 600, y: 360 } } : null,
    pings: [{ x: 300, y: 300, r: 20, inner: 8, alpha: 0.7, label: { text: 'HERE', x: 300, y: 270 } }, { x: 760, y: 260, r: 30, inner: 8, alpha: 0.3, label: { text: 'TARGET', x: 760, y: 230 } }]
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
  for (const console of ['helm', 'weapons'] as const) for (const inRange of [true, false]) for (const t of [0, 0.3, 0.6, 0.9]) it(`${console}${inRange ? '' : ' (torpedo out of range)'} at t = ${t}`, () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), { d, c } = fullFrame(console, inRange);
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

describe('roomLook (enemy ship window spec §6.3: the map\'s room damage table, shared with the contact window)', () => {
  it('reproduces the hull silhouettes table for both ships, every level and both blink phases', () => {
    const N = null;
    const table = [
      [true, 0, 0, N, CRT.glass, N], [true, 0, 1, N, CRT.glass, N],
      [true, 1, 0, CRT.mid, CRT.glass, CRT.glass], [true, 1, 1, CRT.mid, CRT.glass, CRT.glass],
      [true, 2, 0, CRT.glass, CRT.hot, N], [true, 2, 1, CRT.hot, CRT.glass, N],
      [false, 0, 0, N, CRT.mid, N], [false, 0, 1, N, CRT.mid, N],
      [false, 1, 0, CRT.dim, CRT.main, CRT.main], [false, 1, 1, CRT.dim, CRT.main, CRT.main],
      [false, 2, 0, CRT.hot, CRT.glass, N], [false, 2, 1, CRT.glass, CRT.main, CRT.main]
    ] as const;
    for (const [crew, level, phase, fill, stroke, hatch] of table)
      expect(roomLook(crew, level, phase), `crew ${crew} level ${level} phase ${phase}`).toEqual({ fill, stroke, hatch });
  });
  it('roomLevel maps a room damage value to the table row: 0, 1, else 2', () => {
    expect([0, 1, 2, 3].map(roomLevel)).toEqual([0, 1, 2, 2]);
  });
});

describe('the Valkyrn marks draw only the ramp (Valkyrn spec §10)', () => {
  const sight = (on: boolean, locked: boolean): GunSightDraw => ({ cross: { x: 640, y: 200 }, pip: { x: 660, y: 210, on, enemy: { x: 700, y: 230 } },
    heat: { x: 620, y: 214, w: 40, fill: 0.6, locked, label: { text: locked ? 'OVERHEAT' : 'HEAT', x: 640, y: 222 } } });
  for (const [on, locked] of [[true, false], [false, true]] as const) it(`gun sight on ${on}, locked ${locked}, tracers, the Valkyrn hull`, () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), { d, c } = fullFrame('helm');
    layer.draw(d, { ...c, gunSight: sight(on, locked), rounds: [{ x1: 600, y1: 300, x2: 610, y2: 295 }] }, 0);
    for (const colour of colours(layer.container)) expect(CRT_RAMP, colour.toString(16)).toContain(colour);
  });
});
