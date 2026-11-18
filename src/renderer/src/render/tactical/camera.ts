// The console camera (H-1 spec §6, parent §10a). Pure: no Pixi, no DOM. North is up and the world's y grows down the
// screen, as the sim's headings do (index 0 = (0, −1)), so a world point maps to the screen by a scale and a shift.
// The camera is client-only view state: never sent to the sim, never hashed.

export const ZOOM_MIN = 0.12, ZOOM_MAX = 1.2, ZOOM_DEFAULT = 0.5;
/** One wheel notch or one `−`/`=` press multiplies or divides the target zoom by this. */
export const ZOOM_STEP = 1.25;
export const ZOOM_EASE_S = 0.15, SNAP_EASE_S = 0.2;

export type Follow = 'ship' | 'missile' | 'free';
export interface Viewport { w: number; h: number }
export interface Point { x: number; y: number }

export interface Camera {
  centreX: number; centreY: number;
  zoom: number; targetZoom: number;
  follow: Follow;
  /** The zoom ease: the zoom it started from and the seconds since (≥ ZOOM_EASE_S when settled). */
  zoomFrom: number; zoomT: number;
  /** A wheel zoom in free mode keeps this world point under this screen point; null zooms about the screen centre. */
  anchor: { wx: number; wy: number; sx: number; sy: number } | null;
  /** The snap-back ease: where the centre was when C was pressed and the seconds since; null when not snapping. */
  snap: { fromX: number; fromY: number; t: number } | null;
}

export function createCamera(x = 0, y = 0, zoom = ZOOM_DEFAULT): Camera {
  const z = clampZoom(zoom);
  return { centreX: x, centreY: y, zoom: z, targetZoom: z, follow: 'ship', zoomFrom: z, zoomT: ZOOM_EASE_S, anchor: null, snap: null };
}

export function clampZoom(z: number): number { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)); }

export function worldToScreen(cam: Camera, vp: Viewport, x: number, y: number): Point {
  return { x: vp.w / 2 + (x - cam.centreX) * cam.zoom, y: vp.h / 2 + (y - cam.centreY) * cam.zoom };
}

export function screenToWorld(cam: Camera, vp: Viewport, sx: number, sy: number): Point {
  return { x: cam.centreX + (sx - vp.w / 2) / cam.zoom, y: cam.centreY + (sy - vp.h / 2) / cam.zoom };
}

/** The world rectangle the viewport shows. */
export function visibleWorld(cam: Camera, vp: Viewport): { x0: number; y0: number; x1: number; y1: number } {
  const hw = vp.w / 2 / cam.zoom, hh = vp.h / 2 / cam.zoom;
  return { x0: cam.centreX - hw, y0: cam.centreY - hh, x1: cam.centreX + hw, y1: cam.centreY + hh };
}

/**
 * Step the target zoom by `notches` (positive zooms in) and start the 0.15 s ease. `at` is the cursor for a wheel zoom;
 * it anchors only in free mode, because a following camera stays centred on what it follows (plan decision 3).
 */
export function zoomBy(cam: Camera, vp: Viewport, notches: number, at: Point | null = null): void {
  if (notches === 0) return;
  const target = clampZoom(cam.targetZoom * Math.pow(ZOOM_STEP, notches));
  if (target === cam.targetZoom) return;
  cam.zoomFrom = cam.zoom; cam.zoomT = 0; cam.targetZoom = target;
  if (at && cam.follow === 'free') { const w = screenToWorld(cam, vp, at.x, at.y); cam.anchor = { wx: w.x, wy: w.y, sx: at.x, sy: at.y }; }
  else cam.anchor = null;
}

/** Ease the zoom to `z` (clamped) about the screen centre, as a key zoom does (Feel-i's auto-frame on sitting down). */
export function zoomTo(cam: Camera, z: number): void {
  const target = clampZoom(z);
  if (target === cam.targetZoom) return;
  cam.zoomFrom = cam.zoom; cam.zoomT = 0; cam.targetZoom = target; cam.anchor = null;
}

/** Drag by a screen-pixel delta: the world moves with the pointer, and the camera stops following. */
export function pan(cam: Camera, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  cam.follow = 'free'; cam.snap = null; cam.anchor = null;
  cam.centreX -= dx / cam.zoom; cam.centreY -= dy / cam.zoom;
}

/** C: ease back to `to` ('ship' by default) over 0.2 s and follow it again. */
export function snapBack(cam: Camera, to: Follow = 'ship'): void {
  cam.follow = to; cam.anchor = null;
  cam.snap = { fromX: cam.centreX, fromY: cam.centreY, t: 0 };
}

/** Switch what is followed without a pan (a followed missile ended): the same ease as a snap. */
export function followBody(cam: Camera, to: Follow): void {
  if (cam.follow !== to) snapBack(cam, to);
}

const smooth = (k: number): number => k * k * (3 - 2 * k);

/** One frame: ease the zoom (in log space) and the snap, then follow `followed` (the interpolated body) unless free. */
export function updateCamera(cam: Camera, vp: Viewport, dt: number, followed: Point | null): void {
  if (cam.zoom !== cam.targetZoom) {
    cam.zoomT += dt;
    const k = cam.zoomT >= ZOOM_EASE_S ? 1 : smooth(cam.zoomT / ZOOM_EASE_S);
    cam.zoom = k >= 1 ? cam.targetZoom : Math.exp(Math.log(cam.zoomFrom) + (Math.log(cam.targetZoom) - Math.log(cam.zoomFrom)) * k);
    if (cam.anchor) {
      const a = cam.anchor;
      cam.centreX = a.wx - (a.sx - vp.w / 2) / cam.zoom; cam.centreY = a.wy - (a.sy - vp.h / 2) / cam.zoom;
      if (k >= 1) cam.anchor = null;
    }
  }
  if (cam.follow === 'free' || !followed) return;
  if (cam.snap) {
    cam.snap.t += dt;
    const k = cam.snap.t >= SNAP_EASE_S ? 1 : smooth(cam.snap.t / SNAP_EASE_S);
    cam.centreX = cam.snap.fromX + (followed.x - cam.snap.fromX) * k;
    cam.centreY = cam.snap.fromY + (followed.y - cam.snap.fromY) * k;
    if (k >= 1) cam.snap = null;
    return;
  }
  cam.centreX = followed.x; cam.centreY = followed.y;
}
