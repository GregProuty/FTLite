import { describe, expect, it } from 'vitest';
import {
  createCamera, followBody, pan, screenToWorld, snapBack, updateCamera, visibleWorld, worldToScreen, zoomBy,
  SNAP_EASE_S, ZOOM_DEFAULT, ZOOM_EASE_S, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP
} from '../src/renderer/src/render/tactical/camera';

const vp = { w: 1280, h: 720 };
/** Run the camera for `s` seconds of 60 fps frames. */
function run(cam: ReturnType<typeof createCamera>, s: number, followed: { x: number; y: number } | null = { x: 0, y: 0 }): void {
  for (let t = 0; t < Math.round(s * 60); t++) updateCamera(cam, vp, 1 / 60, followed);
}

describe('camera transforms (H-1 spec §6)', () => {
  it('maps the centre to the screen centre, north up, at the zoom scale', () => {
    const cam = createCamera(100, -200);
    expect(cam.zoom).toBe(ZOOM_DEFAULT);
    expect(worldToScreen(cam, vp, 100, -200)).toEqual({ x: 640, y: 360 });
    expect(worldToScreen(cam, vp, 100, -400)).toEqual({ x: 640, y: 260 });   // north (−y) is up the screen
    expect(worldToScreen(cam, vp, 300, -200)).toEqual({ x: 740, y: 360 });
  });
  it('screenToWorld inverts worldToScreen', () => {
    const cam = createCamera(-1234.5, 987.25, 0.37);
    for (const [x, y] of [[0, 0], [-2800, 2800], [55.5, -1.25]] as const) {
      const s = worldToScreen(cam, vp, x, y), w = screenToWorld(cam, vp, s.x, s.y);
      expect(w.x).toBeCloseTo(x, 9); expect(w.y).toBeCloseTo(y, 9);
    }
  });
  it('visibleWorld is the viewport in world units', () => {
    const cam = createCamera(0, 0, 0.5);
    expect(visibleWorld(cam, vp)).toEqual({ x0: -1280, y0: -720, x1: 1280, y1: 720 });
  });
});

describe('camera zoom', () => {
  it('steps the target by ×1.25 a notch and eases the zoom there in 0.15 s', () => {
    const cam = createCamera();
    zoomBy(cam, vp, 1);
    expect(cam.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    expect(cam.zoom).toBe(ZOOM_DEFAULT);
    updateCamera(cam, vp, ZOOM_EASE_S / 2, { x: 0, y: 0 });
    expect(cam.zoom).toBeGreaterThan(ZOOM_DEFAULT); expect(cam.zoom).toBeLessThan(cam.targetZoom);
    updateCamera(cam, vp, ZOOM_EASE_S, { x: 0, y: 0 });
    expect(cam.zoom).toBe(cam.targetZoom);
  });
  it('clamps between 0.12 and 1.2', () => {
    const cam = createCamera();
    zoomBy(cam, vp, 40); run(cam, 0.5); expect(cam.zoom).toBe(ZOOM_MAX);
    zoomBy(cam, vp, -40); run(cam, 0.5); expect(cam.zoom).toBe(ZOOM_MIN);
  });
  it('a free camera zooms about the cursor: the world point under it stays put', () => {
    const cam = createCamera(); pan(cam, 1, 0);
    const at = { x: 1000, y: 100 }, before = screenToWorld(cam, vp, at.x, at.y);
    zoomBy(cam, vp, 2, at);
    updateCamera(cam, vp, 0.05, null);
    const mid = screenToWorld(cam, vp, at.x, at.y);
    expect(mid.x).toBeCloseTo(before.x, 6); expect(mid.y).toBeCloseTo(before.y, 6);
    run(cam, 0.3, null);
    const after = screenToWorld(cam, vp, at.x, at.y);
    expect(after.x).toBeCloseTo(before.x, 6); expect(after.y).toBeCloseTo(before.y, 6);
    expect(cam.anchor).toBeNull();
  });
  it('a following camera zooms about the followed body, not the cursor, and keeps following', () => {
    const cam = createCamera(50, 50), at = { x: 1000, y: 100 }, before = screenToWorld(cam, vp, at.x, at.y);
    zoomBy(cam, vp, 1, at);
    expect(cam.anchor).toBeNull(); expect(cam.follow).toBe('ship');
    updateCamera(cam, vp, 0.05, { x: 50, y: 50 });
    expect(cam.zoom).toBeGreaterThan(ZOOM_DEFAULT); expect(cam.zoom).toBeLessThan(cam.targetZoom);   // mid-ease
    expect(worldToScreen(cam, vp, 50, 50)).toEqual({ x: 640, y: 360 });
    const mid = screenToWorld(cam, vp, at.x, at.y);
    expect(Math.hypot(mid.x - before.x, mid.y - before.y)).toBeGreaterThan(20);   // the point under the cursor moved: no cursor anchor
    run(cam, 0.3, { x: 80, y: 20 });   // the body moves on: the camera still follows it
    expect(worldToScreen(cam, vp, 80, 20)).toEqual({ x: 640, y: 360 });
    expect(cam.zoom).toBe(cam.targetZoom);
  });
});

describe('camera follow, pan and snap back', () => {
  it('follows the body each frame', () => {
    const cam = createCamera();
    updateCamera(cam, vp, 1 / 60, { x: 300, y: -40 });
    expect([cam.centreX, cam.centreY]).toEqual([300, -40]);
  });
  it('a drag frees the camera and moves the world with the pointer', () => {
    const cam = createCamera(0, 0, 0.5);
    pan(cam, 100, -50);
    expect(cam.follow).toBe('free');
    expect([cam.centreX, cam.centreY]).toEqual([-200, 100]);
    updateCamera(cam, vp, 1 / 60, { x: 999, y: 999 });
    expect([cam.centreX, cam.centreY]).toEqual([-200, 100]);
  });
  it('C eases back to the ship over 0.2 s and then follows it', () => {
    const cam = createCamera(); pan(cam, 400, 0);
    const ship = { x: 10, y: 10 };
    snapBack(cam);
    expect(cam.follow).toBe('ship');
    updateCamera(cam, vp, SNAP_EASE_S / 2, ship);
    expect(cam.centreX).toBeGreaterThan(-800); expect(cam.centreX).toBeLessThan(10);
    updateCamera(cam, vp, SNAP_EASE_S, ship);
    expect([cam.centreX, cam.centreY]).toEqual([10, 10]);
    expect(cam.snap).toBeNull();
    updateCamera(cam, vp, 1 / 60, { x: 20, y: 30 });
    expect([cam.centreX, cam.centreY]).toEqual([20, 30]);
  });
  it('followBody eases to a new body only when it changes', () => {
    const cam = createCamera();
    followBody(cam, 'ship'); expect(cam.snap).toBeNull();
    followBody(cam, 'missile'); expect(cam.follow).toBe('missile'); expect(cam.snap).not.toBeNull();
  });
});
