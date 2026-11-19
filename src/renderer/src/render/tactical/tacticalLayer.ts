// The console map view layer (H-1 spec §7): draws a TacticalDraw, and in the duel a CombatDraw, with Graphics and pooled
// BitmapText. Every display object is made at creation; a frame only clears and redraws Graphics and sets text, so
// nothing is allocated per frame. CRT map spec section 2: the layer is drawn only in console views, so it always draws
// in the amber ramp (crtTheme.ts); friend and foe, damage, the lock and the arcs are told apart by brightness, solid vs
// hollow, solid vs dashed, hatching and two-state blinks on the presentation time `t`. Section 3: `setCrt` attaches the
// bloom and noise filters (none at glow 0).
import { BitmapText, Container, Graphics, Rectangle } from 'pixi.js';
import { FONT_NATIVE, FONT_SIZE, textPx } from '../theme';
import { SHIP_RADIUS } from '../../sim/tactical/tuning';
import type { CrtScale } from '../crt';
import { createCrtFilters, type CrtFilters } from './crtFilter';
import { ALERT_BLINK_HZ, blink, CRT, DAMAGE_BLINK_HZ, DASH, ENEMY_BLINK_HZ, GAP, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from './crtTheme';
import { dashCircle, dashLine, hatchSegments } from './dashModel';
import { asteroidShape, CHEVRON_SIZE, type ArrowTarget, type ContactMarkDraw, type Label, type RingDraw, type ShipDraw, type TacticalDraw } from './tacticalModel';
import { ENEMY_RING, HULLS } from './hullModel';
import type { ArcDraw, CombatDraw, MissileDraw } from './weaponsModel';
import type { Viewport } from './camera';
import { CALLOUT_MAX } from './hitModel';
import { FLOATS_MAX } from './fxModel';
import { CROSS_PX, PIP_PX } from '../duel/leadModel';

export { CREW_SHIP, ENEMY_SHIP, SHIELD_RING } from './shipColours';

export const SPACE = CRT.glass;
const STAR_COUNT = 220;
/** Pool sizes: the labels name 500-unit squares (12 per axis at most), the ring has 12 labels, at most 4 arrows. */
const GRID_LABELS = 12, RING_LABELS = 12, ARROWS = 4;
/** Sci-1: the contact marks (at most the enemy and the derelict); Science's ring turns at this many radians a second;
 *  the designation bracket pulses at this rate. */
const MARKS = 2, LOCK_RING_SPEED = 0.8, DESIGNATE_PULSE_HZ = 1;
/** Feel-ii: the pool of small map words (2 gravity labels, COLLISION, SLINGSHOT, EVADE and up to 6 pings, with room), and
 *  the gun's HEAT word (Valkyrn spec §7.4). */
const NOTES = 13;
/** The enemy's blinking marker ring (moved to hullModel.ts so the pure model and its test need no Pixi). */
export { ENEMY_RING };

/** `stars` is exposed for the parallax test. `draw` takes the duel's combat lists as a second argument (none in the
 *  flight view) and the presentation time in seconds (performance.now() / 1000) for the blinks. `reset` hides every text
 *  and clears every drawing until the next draw (a restart). `reseed` redraws the star field once for a new run seed (a
 *  restart), in the same Graphics; `starSeed` is the seed it shows. `setCrt` applies a CRT strength (a no-op when the
 *  same object is passed again). */
export interface TacticalLayer {
  /** The outer container (scene.ts and flightMode.ts add this); `bloom` is the inner one the CRT filters sit on. */
  container: Container; bloom: Container; stars: Container;
  draw(d: TacticalDraw, c?: CombatDraw | null, t?: number): void;
  reset(): void;
  reseed(seed: number): void;
  starSeed(): number;
  setCrt(scale: CrtScale): void;
}

/** The star field for a run seed: STAR_COUNT stars in one w × h screen, from an xorshift (render-only randomness). */
export function starField(seed: number, w: number, h: number): { x: number; y: number; b: number }[] {
  let r = seed >>> 0 || 1;
  const rnd = (): number => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  return Array.from({ length: STAR_COUNT }, () => { const x = rnd() * w, y = rnd() * h, b = rnd(); return { x, y, b }; });
}
export interface TacticalLayerOptions {
  fontFamily: string; viewport: Viewport; seed?: number;
}
export const PAUSE_TEXT = 'PAUSED   ESC: RESUME';

export function createTacticalLayer(opts: TacticalLayerOptions): TacticalLayer {
  const { w, h } = opts.viewport;
  const container = new Container(), bloom = new Container();
  container.addChild(bloom);
  // The lock label (bar and text) sits in `container` above the filtered `bloom`, so neighbouring strokes never soften it.
  const lockBar = new Graphics();
  const bg = new Graphics(), stars = new Graphics(), grid = new Graphics(), contours = new Graphics(), bodies = new Graphics(), arcs = new Graphics(), ships = new Graphics(), marks = new Graphics(), helm = new Graphics(), combat = new Graphics(), overlay = new Graphics();
  bloom.addChild(bg, stars, grid, contours, bodies, arcs, ships, marks, helm, combat, overlay);
  const drawn = [grid, contours, bodies, arcs, ships, marks, helm, combat, overlay, lockBar];
  const mk = (size: number, tint: number, anchorX = 0, anchorY = 0, parent?: Container): BitmapText => {
    const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.tint = tint; t.roundPixels = true; t.anchor.set(anchorX, anchorY); t.visible = false; (parent ?? bloom).addChild(t); return t;
  };
  const cols = Array.from({ length: GRID_LABELS }, () => mk(FONT_NATIVE, CRT.mid, 0.5, 0));
  const rows = Array.from({ length: GRID_LABELS }, () => mk(FONT_NATIVE, CRT.mid, 0, 0.5));
  const ring = Array.from({ length: RING_LABELS }, () => mk(FONT_NATIVE, CRT.mid, 0.5, 0.5));
  const arrowText = Array.from({ length: ARROWS }, () => mk(FONT_NATIVE, CRT.main, 0.5, 0.5));
  container.addChild(lockBar);
  // Feel-i: the status sentence at the top (FONT_SIZE), the Weapons info line under it (FONT_NATIVE), the FIRING SOLUTION
  // label and the floating damage numbers.
  const lockText = mk(FONT_NATIVE, CRT.glass, 0, 0, container), info = mk(FONT_NATIVE, CRT.mid, 0.5, 0), status = mk(FONT_SIZE, CRT.main, 0.5, 0);
  const solutionText = mk(FONT_NATIVE, CRT.hot, 0.5, 0.5), floatText = Array.from({ length: FLOATS_MAX }, () => mk(FONT_SIZE, CRT.hot, 0.5, 0.5));
  const markQ = Array.from({ length: MARKS }, () => mk(FONT_SIZE, CRT.dim, 0.5, 0.5));
  const markLabel = Array.from({ length: MARKS }, () => mk(FONT_NATIVE, CRT.mid, 0, 0.5));
  const markAlert = Array.from({ length: MARKS }, () => mk(FONT_NATIVE, CRT.hot, 0, 0.5));
  // Duel polish i spec §A, §B: the charge ring's CHARGING / FIRING label and the hit callouts, centred over the enemy.
  const chargeText = mk(FONT_NATIVE, CRT.hot, 0.5, 0.5), calloutText = Array.from({ length: CALLOUT_MAX }, () => mk(FONT_NATIVE, CRT.main, 0.5, 0.5));
  // Feel-ii: the small map words (the gravity labels, the COLLISION tag, SLINGSHOT, EVADE and the ping labels), each tinted.
  const notes = Array.from({ length: NOTES }, () => mk(FONT_NATIVE, CRT.hot, 0, 0));
  const texts = [...cols, ...rows, ...ring, ...arrowText, ...markQ, ...markLabel, ...markAlert, lockText, info, status, solutionText, ...floatText, chargeText, ...calloutText, ...notes];
  // Reused buffers for lists that are consumed at once (dash and hatch segments, polylines fed to dashLine). A list passed
  // to Graphics.poly is kept by reference until the frame renders, so every poly gets a fresh array.
  const pts: number[] = [], seg: number[] = [], line: number[] = [];

  // The star field: render-only randomness, seeded (H-1 spec §7 item 1). One screen of stars is drawn as a 2 × 2 tile, so
  // shifting it by the parallax offset (0..w, 0..h, minus one tile) always covers the screen with no gap.
  bg.rect(0, 0, w, h).fill(SPACE);
  let shownSeed = opts.seed ?? 2026;
  const drawStars = (seed: number): void => {
    stars.clear(); shownSeed = seed;
    for (const { x, y, b } of starField(seed, w, h))
      for (const [tx, ty] of [[0, 0], [w, 0], [0, h], [w, h]] as const)
        stars.rect(Math.floor(x) + tx, Math.floor(y) + ty, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1).fill({ color: CRT.dim, alpha: 0.25 + 0.55 * b });
  };
  drawStars(shownSeed);

  // The CRT filters (spec section 3): made on the first setting with a glow, clipped to the screen (the star tile is 2w × 2h).
  let crtShown: CrtScale | null = null, filters: CrtFilters | null = null;
  bloom.filterArea = new Rectangle(0, 0, w, h);

  const setText = (t: BitmapText, s: string): void => { if (t.text !== s) t.text = s; };
  function fill(pool: BitmapText[], labels: readonly Label[]): void {
    pool.forEach((t, k) => {
      const l = labels[k];
      t.visible = l !== undefined;
      if (l) { setText(t, l.text); t.position.set(Math.round(l.x), Math.round(l.y)); }
    });
  }
  /** Strokes a segment list [x1, y1, x2, y2, ...] as one path. */
  function segments(g: Graphics, s: readonly number[], width: number, color: number, alpha = 1): void {
    if (s.length === 0) return;
    for (let i = 0; i + 3 < s.length; i += 4) g.moveTo(s[i]!, s[i + 1]!).lineTo(s[i + 2]!, s[i + 3]!);
    g.stroke({ width, color, alpha });
  }

  function drawShip(g: Graphics, s: ShipDraw, t: number): void {
    const fx = Math.sin(s.angle), fy = -Math.cos(s.angle), rx = -fy, ry = fx, ring = blink(t, ENEMY_BLINK_HZ) ? CRT.dim : CRT.main;
    if (s.chevron) {
      const k = CHEVRON_SIZE / 2, pt = (f: number, side: number): number[] => [s.x + (fx * f + rx * side) * k, s.y + (fy * f + ry * side) * k];
      const poly = [...pt(1.1, 0), ...pt(-0.9, 0.85), ...pt(-0.45, 0), ...pt(-0.9, -0.85)];
      if (s.crew) g.poly(poly).fill(CRT.hot).stroke({ width: 1, color: CRT.glass });
      else { g.poly(poly).fill(CRT.glass).stroke({ width: 1, color: CRT.main }); segments(g, dashCircle(s.x, s.y, CHEVRON_SIZE * 0.95, DASH, GAP, seg), 1, ring); }
      return;
    }
    const k = SHIP_RADIUS * s.scale, phase = blink(t, DAMAGE_BLINK_HZ), hull = HULLS[s.hull];
    const place = (poly: readonly number[]): number[] => {
      const out: number[] = [];   // a fresh array per poly: Graphics.poly keeps the reference
      for (let i = 0; i < poly.length; i += 2) { const f = poly[i]!, side = poly[i + 1]!; out.push(s.x + (fx * f + rx * side) * k, s.y + (fy * f + ry * side) * k); }
      return out;
    };
    // The outline: the crew solid hot, the enemy hollow (glass inside, a main edge).
    if (s.crew) g.poly(place(hull.outline)).fill(CRT.hot).stroke({ width: 1, color: CRT.glass });
    else g.poly(place(hull.outline)).fill(CRT.glass).stroke({ width: 1, color: CRT.main });
    // The rooms, by the damage table (hull silhouettes spec section 2; level 2 is the CRT map's rule, level 1 adds a tone).
    hull.rooms.forEach((room, r) => {
      const pts = place(room), { fill, stroke, hatch } = roomLook(s.crew, roomLevel(s.rooms[r] ?? 0), phase);   // the shared table (enemy ship window spec §6.3)
      if (fill === null) g.poly(pts).stroke({ width: 1, color: stroke });
      else g.poly(pts).fill(fill).stroke({ width: 1, color: stroke });
      if (hatch !== null) segments(g, hatchSegments(pts, HATCH_SPACING, HATCH_ANGLE, seg), 1, hatch);
    });
    if (!s.crew) segments(g, dashCircle(s.x, s.y, k * ENEMY_RING, DASH, GAP, seg), 1, ring);
    for (let l = 0; l < s.shields; l++) segments(g, dashCircle(s.x, s.y, k * (1.6 + 0.25 * l), DASH, GAP, seg), 1, s.crew ? CRT.mid : CRT.dim, 0.9 - 0.2 * l);
  }

  /** The arc's outline as a polyline: the centre, the arc from `from` to `to` (radians from +x), back to the centre. */
  function arcOutline(a: ArcDraw, from: number, to: number): number[] {
    pts.length = 0; pts.push(a.x, a.y);
    const r = Math.max(1, a.r), n = Math.max(8, Math.ceil(((to - from) * r) / 12));
    for (let k = 0; k <= n; k++) { const ang = from + ((to - from) * k) / n; pts.push(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r); }
    pts.push(a.x, a.y);
    return pts;
  }
  /** A laser arc: the own arc a mid fill with a solid main edge (Feel-i: bright, a main fill and a hot edge); the enemy arc
   *  no fill and a dashed dim edge. */
  function arc(g: Graphics, a: ArcDraw, own: boolean, fillAlpha: number): void {
    const from = a.angle - a.half - Math.PI / 2, to = a.angle + a.half - Math.PI / 2;   // Pixi measures from +x, clockwise on screen
    if (own && a.bright) g.moveTo(a.x, a.y).arc(a.x, a.y, Math.max(1, a.r), from, to).closePath().fill({ color: CRT.main, alpha: 0.2 }).stroke({ width: 2, color: CRT.hot, alpha: 0.95 });
    else if (own) g.moveTo(a.x, a.y).arc(a.x, a.y, Math.max(1, a.r), from, to).closePath().fill({ color: CRT.mid, alpha: fillAlpha }).stroke({ width: 1, color: CRT.main, alpha: 0.8 });
    else segments(g, dashLine(arcOutline(a, from, to), DASH, GAP, seg), 1, CRT.dim);
  }

  /** A torpedo (homing torpedo spec §3): a filled dot, the crew's bright `main`, the Hunter's `hot`. */
  function torpedoDot(g: Graphics, m: MissileDraw): void { g.circle(m.x, m.y, m.r).fill(m.crew ? CRT.main : CRT.hot); }

  function arrowGlyph(g: Graphics, x: number, y: number, angle: number, target: ArrowTarget): void {
    const fx = Math.sin(angle), fy = -Math.cos(angle), rx = -fy, ry = fx, s = target === 'missile' ? 7 : 10;
    g.poly([x + fx * s, y + fy * s, x - fx * s * 0.6 + rx * s * 0.7, y - fy * s * 0.6 + ry * s * 0.7, x - fx * s * 0.6 - rx * s * 0.7, y - fy * s * 0.6 - ry * s * 0.7]);
    if (target === 'ship') g.fill(CRT.hot);
    else if (target === 'enemy') g.fill(CRT.glass).stroke({ width: 2, color: CRT.main });
    else g.fill(target === 'planet' ? CRT.dim : CRT.main);
  }

  /** The bearing ring's circle and ticks (its labels are pooled text). */
  function compass(r: RingDraw): void {
    helm.circle(r.x, r.y, r.r).stroke({ width: 1, color: CRT.dim, alpha: 0.6 });
    for (const k of r.ticks) helm.moveTo(k.x1, k.y1).lineTo(k.x2, k.y2).stroke({ width: 1, color: CRT.dim, alpha: k.major ? 1 : 0.6 });
  }

  /** Four corner brackets of half-size r about (x, y). */
  function bracket(g: Graphics, x: number, y: number, r: number, alpha: number): void {
    const k = r * 0.45;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
      g.moveTo(x + sx * r, y + sy * (r - k)).lineTo(x + sx * r, y + sy * r).lineTo(x + sx * (r - k), y + sy * r).stroke({ width: 2, color: CRT.hot, alpha });
  }
  /** Sci-1 spec §7.1: the contact marks, the salvage ring and Science's ring, then their text. */
  function drawMarks(d: TacticalDraw, t: number): void {
    const list: readonly ContactMarkDraw[] = d.marks ?? [];
    for (const m of list) {
      if (m.unknown) marks.circle(m.x, m.y, 9).stroke({ width: 1, color: CRT.dim });
      if (m.wreck) {   // a broken hull: two offset plates and a spar
        marks.rect(m.x - 7, m.y - 3, 8, 6).stroke({ width: 1, color: CRT.mid });
        marks.rect(m.x + 3, m.y - 7, 5, 4).stroke({ width: 1, color: CRT.mid });
        marks.moveTo(m.x + 1, m.y + 3).lineTo(m.x + 7, m.y + 7).stroke({ width: 1, color: CRT.mid });
      }
      if (m.scan !== null) {
        marks.circle(m.x, m.y, m.r).stroke({ width: 1, color: CRT.faint });
        if (m.scan > 0) marks.moveTo(m.x, m.y - m.r).arc(m.x, m.y, m.r, -Math.PI / 2, -Math.PI / 2 + m.scan * 2 * Math.PI).stroke({ width: 2, color: CRT.main });
      }
      if (m.designated) bracket(marks, m.x, m.y, m.r + 6, blink(t, DESIGNATE_PULSE_HZ) ? 1 : 0.45);
    }
    const s = d.salvage ?? null;
    if (s) {
      marks.circle(s.x, s.y, s.r).stroke({ width: 1, color: CRT.faint });
      marks.moveTo(s.x, s.y - s.r).arc(s.x, s.y, s.r, -Math.PI / 2, -Math.PI / 2 + s.fill * 2 * Math.PI).stroke({ width: 2, color: CRT.hot });
    }
    const lr = d.lockRing ?? null;
    if (lr) for (let k = 0; k < 4; k++) {
      const a = t * LOCK_RING_SPEED + (k * Math.PI) / 2;
      marks.moveTo(lr.x + Math.cos(a) * lr.r, lr.y + Math.sin(a) * lr.r).arc(lr.x, lr.y, lr.r, a, a + Math.PI / 4).stroke({ width: 1, color: CRT.mid });
    }
    fill(markQ, list.filter((m) => m.unknown).map((m) => ({ text: '?', x: m.x, y: m.y })));
    fill(markLabel, list.flatMap((m) => (m.label ? [{ text: m.label, x: m.x + m.r + 6, y: m.y - 6 }] : [])));
    fill(markAlert, list.flatMap((m) => (m.alert ? [{ text: m.alert, x: m.x + m.r + 6, y: m.y + 10 }] : [])));
    const alertTint = blink(t, ALERT_BLINK_HZ) ? CRT.hot : CRT.main;
    for (const a of markAlert) a.tint = alertTint;
  }

  return {
    container, bloom, stars,
    draw(d, c = null, t = 0) {
      stars.position.set(d.stars.x - w, d.stars.y - h);
      filters?.tick(t);
      for (const g of drawn) g.clear();
      for (const l of d.grid.lines) grid.moveTo(l.x1, l.y1).lineTo(l.x2, l.y2).stroke({ width: 1, color: l.major ? CRT.dim : CRT.faint, alpha: l.major ? 0.5 : 1 });
      fill(cols, d.grid.columns); fill(rows, d.grid.rows);

      for (const k of d.contours) contours.circle(k.x, k.y, k.r).stroke({ width: 1, color: CRT.dim, alpha: 0.45 });
      // Feel-ii §1.3: the G 0.5 and G 1 rings, faint and dotted so they read apart from the plain contours.
      const words: { text: string; x: number; y: number; tint: number; alpha?: number }[] = [];
      for (const g of d.gravity ?? []) {
        segments(contours, dashCircle(g.x, g.y, Math.max(1, g.r), 2, 4, seg), 1, CRT.dim, g.g === 1 ? 0.8 : 0.55);
        words.push({ text: g.label.text, x: g.label.x, y: g.label.y, tint: CRT.mid });
      }
      if (d.edge) segments(contours, dashCircle(d.edge.x, d.edge.y, d.edge.r, DASH, GAP, seg), 2, CRT.main, 0.7);
      // Engineering spike §10.4: the sensor range, dotted, and the ghosts: a hollow chevron (a small one for a torpedo),
      // fading with its alpha.
      if (d.sensor) segments(contours, dashCircle(d.sensor.x, d.sensor.y, Math.max(1, d.sensor.r), 2, 6, seg), 1, CRT.mid, 0.6);
      for (const g of d.ghosts ?? []) {
        const fx = Math.sin(g.angle), fy = -Math.cos(g.angle), rx = -fy, ry = fx, n = g.kind === 'missile' ? 4 : 10;
        contours.poly([g.x + fx * n, g.y + fy * n, g.x - fx * n * 0.8 + rx * n * 0.7, g.y - fy * n * 0.8 + ry * n * 0.7, g.x - fx * n * 0.4, g.y - fy * n * 0.4,
          g.x - fx * n * 0.8 - rx * n * 0.7, g.y - fy * n * 0.8 - ry * n * 0.7]).stroke({ width: 1, color: CRT.mid, alpha: g.alpha });
      }

      if (d.planet) {
        const p = d.planet;
        bodies.circle(p.x, p.y, Math.max(1, p.r)).fill(CRT.faint);
        bodies.circle(p.x - p.r * 0.22, p.y - p.r * 0.22, p.r * 0.72).fill({ color: CRT.dim, alpha: 0.55 });
        bodies.circle(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.35).fill({ color: CRT.mid, alpha: 0.35 });
        bodies.circle(p.x, p.y, Math.max(1, p.r)).stroke({ width: 1, color: CRT.mid, alpha: 0.6 });
      }
      for (const a of d.asteroids) {
        if (a.streak) {   // spike ii §7 item 3: a moving rock's fading streak behind it
          const mx = (a.x + a.streak.x) / 2, my = (a.y + a.streak.y) / 2;
          bodies.moveTo(a.x, a.y).lineTo(mx, my).stroke({ width: Math.max(1, Math.min(3, a.r * 0.5)), color: CRT.mid, alpha: a.streak.alpha });
          bodies.moveTo(mx, my).lineTo(a.streak.x, a.streak.y).stroke({ width: 1, color: CRT.dim, alpha: a.streak.alpha * 0.6 });
        }
        if (a.dot) { bodies.rect(Math.round(a.x) - 1, Math.round(a.y) - 1, 2, 2).fill(CRT.mid); continue; }
        const shape = asteroidShape(a.index), pts: number[] = [];
        shape.forEach((m, k) => { const ang = (k / shape.length) * Math.PI * 2; pts.push(a.x + Math.cos(ang) * a.r * m, a.y + Math.sin(ang) * a.r * m); });
        const wear = a.wear ?? 0;   // SPIKE: cracks and a dimmer fill as the rock wears down
        bodies.poly(pts).fill(wear >= 0.5 ? CRT.faint : CRT.dim).stroke({ width: 1, color: wear > 0 ? CRT.main : CRT.mid });
        const cracks = wear > 0 ? Math.min(5, 1 + Math.floor(wear * 4)) : 0;
        for (let k = 0; k < cracks; k++) {
          const ang = k * 2.39996 + shape[k]! * 3, r1 = a.r * 0.15, r2 = a.r * shape[(k + 3) % shape.length]! * 0.95;
          const bend = ang + 0.35 * (k % 2 ? 1 : -1), mid = (r1 + r2) / 2;
          bodies.moveTo(a.x + Math.cos(ang) * r1, a.y + Math.sin(ang) * r1).lineTo(a.x + Math.cos(bend) * mid, a.y + Math.sin(bend) * mid).lineTo(a.x + Math.cos(ang) * r2, a.y + Math.sin(ang) * r2)
            .stroke({ width: 1.5, color: CRT.hot, alpha: 0.9 });
        }
      }

      // Spike ii §6.5: rock brackets: the laser's four hot corners, the torpedo's dashed main ring; a hover mark in mid.
      for (const m of d.rockMarks ?? []) {
        const colour = m.hover ? CRT.mid : m.weapon === 'laser' ? CRT.hot : CRT.main;
        if (m.weapon === 'laser') {
          const k = Math.max(4, m.r * 0.45);
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
            marks.moveTo(m.x + sx * m.r, m.y + sy * (m.r - k)).lineTo(m.x + sx * m.r, m.y + sy * m.r).lineTo(m.x + sx * (m.r - k), m.y + sy * m.r).stroke({ width: 2, color: colour });
        } else segments(marks, dashCircle(m.x, m.y, m.r, DASH, GAP, seg), 2, colour);
      }

      // Weapons update spec §2: the torpedo's range circle, dashed, mid while the target is in range at Weapons, else dim.
      const tr = c?.torpedoRange ?? null;
      if (tr) segments(arcs, dashCircle(tr.x, tr.y, Math.max(1, tr.r), DASH, GAP, seg), 1, tr.lit ? CRT.mid : CRT.dim);
      const wd = c?.weapons ?? null;
      if (wd) {
        if (wd.enemyArc) arc(arcs, wd.enemyArc, false, 0);
        arc(arcs, wd.ownArc, true, wd.inArc ? 0.14 : 0.08);
      }
      if (c?.helmArc) arc(arcs, c.helmArc, true, 0.06);   // Feel-i: the Helm sees the arc it gives Weapons

      for (const s of d.ships) drawShip(ships, s, t);
      for (const p of d.puffs ?? []) {   // playtest2feedback §6: short amber gas puffs
        ships.circle(p.x + p.dx * 4, p.y + p.dy * 4, 3).fill({ color: CRT.hot, alpha: 0.8 });
        ships.circle(p.x + p.dx * 9, p.y + p.dy * 9, 2).fill({ color: CRT.main, alpha: 0.5 });
      }
      drawMarks(d, t);

      let ringLabels: readonly Label[] = wd?.ring?.labels ?? [];
      if (wd?.ring) compass(wd.ring);
      if (d.helm) {
        const hd = d.helm;
        if (hd.path.length > 0) {
          helm.moveTo(hd.origin.x, hd.origin.y);
          for (const p of hd.path) helm.lineTo(p.x, p.y);
          helm.stroke({ width: 2, color: CRT.mid, alpha: 0.9 });
          const end = hd.path[hd.path.length - 1]!;
          helm.circle(end.x, end.y, 3).fill({ color: CRT.mid, alpha: 0.9 });
        }
        line.length = 0; line.push(hd.origin.x, hd.origin.y, hd.velocity.x, hd.velocity.y);
        segments(helm, dashLine(line, DASH, GAP, seg), 2, CRT.main, 0.9);
        helm.moveTo(hd.headingFrom.x, hd.headingFrom.y).lineTo(hd.headingTo.x, hd.headingTo.y).stroke({ width: 1, color: CRT.main, alpha: 0.9 });
        // Thrust: a flame behind the stern (forward) or ahead of the nose (reverse). Turn: a pip on the side it turns to.
        const fx = (hd.headingTo.x - hd.headingFrom.x) / 40, fy = (hd.headingTo.y - hd.headingFrom.y) / 40, rx = -fy, ry = fx;
        const back = Math.hypot(hd.headingFrom.x - hd.origin.x, hd.headingFrom.y - hd.origin.y);
        if (hd.thrust !== 0) {
          const dir = hd.thrust > 0 ? -1 : 1, bx = hd.origin.x + fx * dir * back, by = hd.origin.y + fy * dir * back, len = (hd.thrust > 0 ? 14 : 8) * Math.abs(hd.thrust);
          helm.poly([bx + rx * 5, by + ry * 5, bx - rx * 5, by - ry * 5, bx + fx * dir * len, by + fy * dir * len]).fill({ color: CRT.hot, alpha: 0.9 });
        }
        if (hd.turn !== 0) helm.circle(hd.headingTo.x + rx * hd.turn * 8, hd.headingTo.y + ry * hd.turn * 8, 3).fill({ color: CRT.hot, alpha: 0.9 });
        if (hd.ring) { compass(hd.ring); ringLabels = hd.ring.labels; }
        // Feel-ii §1.2: the predicted contact, its last segment hot, an X at it and the COLLISION tag.
        const co = hd.collision ?? null;
        if (co) {
          helm.moveTo(co.from.x, co.from.y).lineTo(co.x, co.y).stroke({ width: 3, color: CRT.hot });
          helm.moveTo(co.x - 7, co.y - 7).lineTo(co.x + 7, co.y + 7).moveTo(co.x + 7, co.y - 7).lineTo(co.x - 7, co.y + 7).stroke({ width: 3, color: CRT.hot });
          words.push({ text: co.label.text, x: co.label.x, y: co.label.y, tint: CRT.hot });
        }
        // Feel-ii §1.1: the held heading, a chevron on the bearing ring and a dashed line from the nose.
        const ho = hd.hold ?? null;
        if (ho) {
          line.length = 0; line.push(ho.from.x, ho.from.y, ho.to.x, ho.to.y);
          segments(helm, dashLine(line, DASH, GAP, seg), 1, CRT.mid, ho.preview ? 0.6 : 0.9);
          helm.poly([...ho.chevron], false).stroke({ width: 2, color: CRT.mid, alpha: ho.preview ? 0.6 : 1 });
        }
        const st = hd.steer ?? null;   // playtest2feedback §6: the steering marker, dashed amber from the ship to the cursor
        if (st) { line.length = 0; line.push(st.from.x, st.from.y, st.to.x, st.to.y); segments(helm, dashLine(line, DASH, GAP, seg), 1, CRT.hot, 0.9); }
        if (hd.slingshot) words.push({ text: hd.slingshot.text, x: hd.slingshot.x, y: hd.slingshot.y, tint: CRT.hot });
      }
      fill(ring, ringLabels);

      // Combat: torpedo trails (short, fading, faint) and dots, the lock marker, then the event effects on top.
      for (const m of c?.missiles ?? []) {
        m.trail.forEach((p, k) => { if (k > 0) { const q = m.trail[k - 1]!; combat.moveTo(q.x, q.y).lineTo(p.x, p.y).stroke({ width: 2, color: CRT.dim, alpha: 0.6 * (k / m.trail.length) }); } });
        torpedoDot(combat, m);
      }
      // Feel-ii §1.6: the enemy torpedo's predicted path, dashed hot; the Helm's EVADE arrow. §2.7: the pings.
      const tp = c?.torpedoPath ?? [];
      if (tp.length > 1) { line.length = 0; for (const p of tp) line.push(p.x, p.y); segments(combat, dashLine(line, DASH, GAP, seg), 1, CRT.hot, 0.8); }
      const ev = c?.evade ?? null;
      if (ev) {
        const fx = Math.sin(ev.angle), fy = -Math.cos(ev.angle), rx = -fy, ry = fx;
        combat.moveTo(ev.x - fx * 26, ev.y - fy * 26).lineTo(ev.x - fx * 6, ev.y - fy * 6).stroke({ width: 3, color: CRT.hot });
        combat.poly([ev.x + fx * 6, ev.y + fy * 6, ev.x - fx * 8 + rx * 9, ev.y - fy * 8 + ry * 9, ev.x - fx * 8 - rx * 9, ev.y - fy * 8 - ry * 9]).fill(CRT.hot);
        words.push({ text: ev.label.text, x: ev.label.x - textPx(ev.label.text, 1) / 2, y: ev.label.y - 8, tint: CRT.hot });
      }
      for (const pg of c?.pings ?? []) {
        combat.circle(pg.x, pg.y, pg.r).stroke({ width: 2, color: CRT.hot, alpha: pg.alpha }).circle(pg.x, pg.y, pg.inner).stroke({ width: 1, color: CRT.main, alpha: Math.min(1, pg.alpha + 0.3) });
        words.push({ text: pg.label.text, x: pg.label.x - textPx(pg.label.text, 1) / 2, y: pg.label.y - 8, tint: CRT.hot, alpha: Math.min(1, pg.alpha + 0.3) });
      }
      // Valkyrn spec §7.4: the gun's tracers, the crosshair at its reach, the lead pip (a diamond with a thin line to the enemy;
      // hot with brackets on target) and the heat bar under the crosshair, all on the ramp.
      for (const r of c?.rounds ?? []) combat.moveTo(r.x1, r.y1).lineTo(r.x2, r.y2).stroke({ width: 1, color: CRT.main });
      // W-1 (pew pew spec §1): the pew cone's two edges (dim) and the aim line (mid) on the Weapons map; every pew round as a
      // short hot streak, on the ramp as Feel and CRT do.
      const pc = c?.pewCone ?? null;
      if (pc) for (const side of [-1, 1]) {
        const a = pc.angle + side * pc.half;
        combat.moveTo(pc.x, pc.y).lineTo(pc.x + Math.sin(a) * pc.r, pc.y - Math.cos(a) * pc.r).stroke({ width: 1, color: CRT.dim });
      }
      const pa = c?.pewAim ?? null;
      if (pa) combat.moveTo(pa.x1, pa.y1).lineTo(pa.x2, pa.y2).stroke({ width: 1, color: CRT.mid });
      // W-2 (pew pew spec §2): the MANUAL laser's aim line, dashed main, while it is charged.
      const la = c?.laserAim ?? null;
      if (la) { line.length = 0; line.push(la.x1, la.y1, la.x2, la.y2); segments(combat, dashLine(line, DASH, GAP, seg), 1, CRT.main); }
      for (const r of c?.pewRounds ?? []) combat.moveTo(r.x1, r.y1).lineTo(r.x2, r.y2).stroke({ width: 2, color: CRT.hot });
      const gs = c?.gunSight ?? null;
      if (gs) {
        const { x, y } = gs.cross, k = CROSS_PX;
        combat.moveTo(x - k, y).lineTo(x - 3, y).moveTo(x + 3, y).lineTo(x + k, y).moveTo(x, y - k).lineTo(x, y - 3).moveTo(x, y + 3).lineTo(x, y + k).stroke({ width: 1, color: CRT.mid });
        const pp = gs.pip;
        if (pp) {
          combat.moveTo(pp.enemy.x, pp.enemy.y).lineTo(pp.x, pp.y).stroke({ width: 1, color: CRT.mid, alpha: 0.6 });
          combat.poly([pp.x, pp.y - PIP_PX, pp.x + PIP_PX, pp.y, pp.x, pp.y + PIP_PX, pp.x - PIP_PX, pp.y]).stroke({ width: 2, color: pp.on ? CRT.hot : CRT.mid });
          if (pp.on) {
            const r = PIP_PX + 6, q = 4;
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
              combat.moveTo(pp.x + sx * r, pp.y + sy * (r - q)).lineTo(pp.x + sx * r, pp.y + sy * r).lineTo(pp.x + sx * (r - q), pp.y + sy * r).stroke({ width: 2, color: CRT.hot });
          }
        }
        const hb = gs.heat;
        combat.rect(hb.x, hb.y, hb.w, 4).stroke({ width: 1, color: CRT.dim });
        if (hb.fill > 0) combat.rect(hb.x, hb.y, hb.w * hb.fill, 4).fill(hb.locked ? CRT.hot : CRT.main);
        if (hb.label) words.push({ text: hb.label.text, x: hb.label.x - textPx(hb.label.text, 1) / 2, y: hb.label.y, tint: hb.locked ? CRT.hot : CRT.mid });
      }
      notes.forEach((tx, k) => {
        const wd2 = words[k];
        tx.visible = wd2 !== undefined;
        if (wd2) { setText(tx, wd2.text); tx.tint = wd2.tint; tx.alpha = wd2.alpha ?? 1; tx.position.set(Math.round(wd2.x), Math.round(wd2.y)); }
      });
      const lk = c?.lock ?? null;
      if (lk) {
        const r = lk.r, k = r * 0.45;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
          combat.moveTo(lk.x + sx * r, lk.y + sy * (r - k)).lineTo(lk.x + sx * r, lk.y + sy * r).lineTo(lk.x + sx * (r - k), lk.y + sy * r).stroke({ width: 2, color: CRT.hot });
        // The lock label: an inverse bar, glass text on a solid block. The block is `mid`, under the bloom threshold: a `main`
        // block blooms over the thin native-size glyphs at `full` (plan Decision 1).
        lockBar.rect(Math.round(lk.label.x) - 3, Math.round(lk.label.y) + 1, textPx(lk.label.text, 1) + 5, 14).fill(CRT.mid);
      }
      lockText.visible = lk !== null;
      if (lk) { setText(lockText, lk.label.text); lockText.position.set(Math.round(lk.label.x), Math.round(lk.label.y)); }
      info.visible = wd !== null;
      if (wd) { setText(info, wd.info.text); info.tint = wd.inArc ? CRT.main : CRT.mid; info.position.set(Math.round(wd.info.x), Math.round(wd.info.y)); }
      const st = c?.status ?? null;
      status.visible = st !== null;
      if (st) { setText(status, st.label.text); status.tint = st.colour; status.position.set(Math.round(st.label.x), Math.round(st.label.y)); }
      // Feel-i: the FIRING SOLUTION bracket (closing, hot when ready) and the Helm's goal glow on the enemy's edge arrow.
      const so = c?.solution ?? null;
      if (so) {
        const k = so.r * 0.4;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
          combat.moveTo(so.x + sx * so.r, so.y + sy * (so.r - k)).lineTo(so.x + sx * so.r, so.y + sy * so.r).lineTo(so.x + sx * (so.r - k), so.y + sy * so.r).stroke({ width: so.bright ? 3 : 2, color: so.bright ? CRT.hot : CRT.mid, alpha: so.alpha });
      }
      solutionText.visible = so?.label != null;
      if (so?.label) { setText(solutionText, so.label.text); solutionText.position.set(Math.round(so.label.x), Math.round(so.label.y)); }
      const goal = c?.goal ?? null;
      if (goal) overlay.circle(goal.x, goal.y, goal.r).stroke({ width: 2, color: CRT.hot, alpha: goal.alpha });
      const fl = c?.floats ?? [];
      floatText.forEach((tx, k) => {
        const f = fl[k];
        tx.visible = f !== undefined;
        if (f) { setText(tx, f.text); tx.alpha = f.alpha; tx.position.set(Math.round(f.x), Math.round(f.y)); }
      });
      for (const e of c?.effects ?? []) {
        const colour = e.kind === 'beam' || e.kind === 'shard' || e.alpha > 0.5 ? e.colour : CRT.mid;   // bursts and sparks fade from hot to mid
        if (e.kind === 'beam') {
          combat.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: e.width ?? 3, color: e.core ? CRT.main : colour, alpha: e.alpha });
          if (e.core) combat.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: 2, color: CRT.hot, alpha: 1 });   // Feel-i: the white-hot core
        }
        else if (e.kind === 'shard') combat.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: 2, color: colour, alpha: e.alpha });
        else if (e.kind === 'flare') {   // Feel-i: the impact flare, a bright star and a ring at the enemy
          combat.circle(e.x1, e.y1, e.r).stroke({ width: 2, color: colour, alpha: e.alpha });
          for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; combat.moveTo(e.x1, e.y1).lineTo(e.x1 + Math.cos(a) * e.r * 1.4, e.y1 + Math.sin(a) * e.r * 1.4).stroke({ width: 2, color: CRT.hot, alpha: e.alpha }); }
          combat.circle(e.x1, e.y1, 4).fill({ color: CRT.hot, alpha: e.alpha });
        }
        else if (e.kind === 'pop') combat.circle(e.x1, e.y1, e.r).stroke({ width: 3, color: colour, alpha: e.alpha }).circle(e.x1, e.y1, e.r).fill({ color: CRT.main, alpha: e.alpha * 0.15 });
        else if (e.kind === 'boom') {   // Feel-i: the kill's explosion, a flash, then two rings
          if (e.alpha > 0.75) combat.circle(e.x1, e.y1, e.r * 0.8).fill({ color: CRT.hot, alpha: (e.alpha - 0.75) * 4 });
          combat.circle(e.x1, e.y1, e.r).stroke({ width: 4, color: colour, alpha: e.alpha }).circle(e.x1, e.y1, e.r * 0.6).stroke({ width: 2, color: CRT.main, alpha: e.alpha })
            .circle(e.x1, e.y1, e.r * 0.3).fill({ color: colour, alpha: e.alpha * 0.5 });
        }
        else if (e.kind === 'burst') combat.circle(e.x1, e.y1, e.r).stroke({ width: 3, color: colour, alpha: e.alpha }).circle(e.x1, e.y1, e.r * 0.4).fill({ color: colour, alpha: e.alpha * 0.6 });
        else if (e.kind === 'chip') continue;   // drawn after the loop, on top of the beams
        else if (e.kind === 'speck') combat.circle(e.x1, e.y1, e.r).fill({ color: colour, alpha: e.alpha });
        else if (e.kind === 'shock') combat.circle(e.x1, e.y1, Math.max(1, e.r)).stroke({ width: e.width ?? 2, color: colour, alpha: e.alpha });
        else if (e.kind === 'core') combat.circle(e.x1, e.y1, e.r).fill({ color: CRT.hot, alpha: e.alpha });
        else for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; combat.moveTo(e.x1, e.y1).lineTo(e.x1 + Math.cos(a) * e.r, e.y1 + Math.sin(a) * e.r).stroke({ width: 2, color: colour, alpha: e.alpha }); }
      }

      for (const e of c?.effects ?? []) {   // spike ii: the rock chips, a tail and a hot head, over the beams and the rock outlines
        if (e.kind !== 'chip') continue;
        const colour = e.alpha > 0.5 ? e.colour : CRT.mid;
        combat.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: e.r, color: colour, alpha: e.alpha }).circle(e.x1, e.y1, e.r).fill({ color: colour, alpha: e.alpha });
      }

      // Duel polish i spec §A: the Hunter's charge, a faint full track under an arc from 12 o'clock clockwise; at a full
      // charge the whole ring pulses. §B: the callouts float up over it, each in its ramp tone, fading.
      const ch = c?.charge ?? null;
      if (ch) {
        combat.circle(ch.x, ch.y, ch.r).stroke({ width: 1, color: CRT.faint });
        if (ch.full) combat.circle(ch.x, ch.y, ch.r).stroke({ width: 3, color: ch.colour, alpha: ch.alpha });
        else if (ch.fill > 0) combat.moveTo(ch.x, ch.y - ch.r).arc(ch.x, ch.y, ch.r, -Math.PI / 2, -Math.PI / 2 + ch.fill * Math.PI * 2).stroke({ width: 3, color: ch.colour });
      }
      chargeText.visible = ch !== null;
      if (ch) { setText(chargeText, ch.label.text); chargeText.alpha = ch.alpha; chargeText.position.set(Math.round(ch.label.x), Math.round(ch.label.y)); }
      const cs = c?.callouts ?? [];
      calloutText.forEach((tx, k) => {
        const co = cs[k];
        tx.visible = co !== undefined;
        if (co) { setText(tx, co.text); tx.tint = co.colour; tx.alpha = co.alpha; tx.position.set(Math.round(co.x), Math.round(co.y)); }
      });

      d.arrows.forEach((a) => arrowGlyph(overlay, a.x, a.y, a.angle, a.target));
      // Each label sits inward of its arrow, far enough along the arrow's axis to clear the glyph (half its width, plus 14 px).
      fill(arrowText, d.arrows.map((a) => ({ text: a.label, x: a.x - Math.sin(a.angle) * (textPx(a.label, 1) / 2 + 14), y: a.y + Math.cos(a.angle) * 18 })));
    },
    reset() { for (const t of texts) t.visible = false; for (const g of drawn) g.clear(); },
    reseed(seed) { if (seed !== shownSeed) drawStars(seed); },
    starSeed: () => shownSeed,
    setCrt(scale) {
      if (scale === crtShown) return;
      crtShown = scale;
      if (scale.glow <= 0) { bloom.filters = null; return; }
      filters ??= createCrtFilters();
      filters.apply(scale);
      bloom.filters = filters.list;
    }
  };
}
