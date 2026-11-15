import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { createCamera, pan, updateCamera, zoomBy } from '../src/renderer/src/render/tactical/camera';
import { createFeelPanel } from '../src/renderer/src/render/tactical/feelPanel';
import { createFeelTracker, feelReadout, feelRows, recordFeel } from '../src/renderer/src/render/tactical/feelModel';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { followTarget, tacticalModel, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';

const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const vp = { w: 1280, h: 720 };

describe('tactical layer allocation (H-1 spec §10)', () => {
  it('a warm-up of 2 frames, then 60 frames of flying, zooming, panning and pausing add no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const panel = createFeelPanel({ fontFamily: 'm5x7', x: 1020, y: 8 });
    const st = createTacticalState(9), cam = createCamera(st.ships[0].x, st.ships[0].y), feel = createFeelTracker();
    let prev: PrevBody[] = st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
    const frame = (k: number): void => {
      prev = st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
      const axes = { turn: k % 20 < 10 ? 1 : -1, thrust: k % 3 === 0 ? 0 : 1 };
      stepSoloFlight(st, axes); recordFeel(feel, st.ships[0], st.map.planet);
      if (k === 10) zoomBy(cam, vp, -12);       // out to the widest: every grid label, every asteroid
      if (k === 25) zoomBy(cam, vp, 12);        // in to the closest: 250-unit lines, the bearing ring
      if (k === 40) pan(cam, 3000, 0);           // free: the ship and planet arrows, the snap hint
      updateCamera(cam, vp, 1 / 60, followTarget(st, prev, 0.5, cam.follow));
      layer.draw(tacticalModel({ state: st, prev, alpha: 0.5, camera: cam, viewport: vp, console: 'helm', axes, ships: [0], paused: k > 50, reserveRight: 266 }));
      panel.draw(feelRows(feelReadout(feel, st.ships[0], st.map.planet)));
    };
    frame(0); frame(1);
    const n0 = count(layer.container), p0 = count(panel.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(layer.container)).toBe(n0);
    expect(count(panel.container)).toBe(p0);
  });
  it('the star tile follows the parallax offset: shifted by one tile so the 2 x 2 field always covers the screen', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const st = createTacticalState(9), cam = createCamera(0, 0);
    const draw = (): void => layer.draw(tacticalModel({ state: st, prev: [], alpha: 1, camera: cam, viewport: vp, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0 }));
    draw();
    expect([layer.stars.x, layer.stars.y]).toEqual([-1280, -720]);
    pan(cam, -100, 50); draw();                     // centre +200, −100 units at zoom 0.5: stars −4 px (wrapped) and +2 px
    expect(layer.stars.x).toBeCloseTo(-4, 9); expect(layer.stars.y).toBeCloseTo(2 - 720, 9);
    expect(layer.stars.x).toBeLessThanOrEqual(0); expect(layer.stars.x + 2 * 1280).toBeGreaterThanOrEqual(1280);
  });
});
