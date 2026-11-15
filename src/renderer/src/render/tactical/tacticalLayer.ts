// The console map view layer (H-1 spec §7): draws a TacticalDraw, and in the duel a CombatDraw, with Graphics and pooled
// BitmapText. Every display object is made at creation; a frame only clears and redraws Graphics and sets text, so
// nothing is allocated per frame.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, GOOD, TEXT, textPx, WARN } from '../theme';
import { SHIP_RADIUS } from '../../sim/tactical/tuning';
import { asteroidShape, CHEVRON_SIZE, wedgeSegments, type ArrowTarget, type Label, type ShipDraw, type TacticalDraw } from './tacticalModel';
import type { ArcDraw, CombatDraw } from './weaponsModel';
import type { Viewport } from './camera';

export const SPACE = 0x05060a;
export const CREW_SHIP = 0x4fd6e8, ENEMY_SHIP = 0xe8564f, SHIELD_RING = 0x6fc3ff;
const GRID = 0x34445c, CONTOUR = 0x4a6a9a, EDGE = 0xa05050, PLANET = 0x2d4a6b, PLANET_LIT = 0x5b86b0, PLANET_RIM = 0x8fb4d8;
const ROCK = 0x5e554b, ROCK_EDGE = 0x8a7f70, PATH = GOOD, VELOCITY = AMBER, FLAME = 0xff8c1a, MISSILE_PATH = AMBER, LOCK = AMBER;
const ARROW_COLOUR: Readonly<Record<ArrowTarget, number>> = { ship: CREW_SHIP, enemy: ENEMY_SHIP, planet: PLANET_RIM, missile: AMBER };
/** Room segment tint by damage level 0 / 1 / 2: the ship's own colour, amber, red. */
const DAMAGE: readonly (number | null)[] = [null, AMBER, WARN];
const STAR_COUNT = 220;
/** Pool sizes: the labels name 500-unit squares (12 per axis at most), the ring has 12 labels, at most 4 arrows. */
const GRID_LABELS = 12, RING_LABELS = 12, ARROWS = 4;

/** `stars` is exposed for the parallax test. `draw` takes the duel's combat lists as a second argument (none in the
 *  flight view). `reset` hides every text and clears every drawing until the next draw (a restart). `reseed` redraws the
 *  star field once for a new run seed (a restart), in the same Graphics; `starSeed` is the seed it shows. */
export interface TacticalLayer {
  container: Container; stars: Container;
  draw(d: TacticalDraw, c?: CombatDraw | null): void;
  reset(): void;
  reseed(seed: number): void;
  starSeed(): number;
}

/** The star field for a run seed: STAR_COUNT stars in one w × h screen, from an xorshift (render-only randomness). */
export function starField(seed: number, w: number, h: number): { x: number; y: number; b: number }[] {
  let r = seed >>> 0 || 1;
  const rnd = (): number => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  return Array.from({ length: STAR_COUNT }, () => { const x = rnd() * w, y = rnd() * h, b = rnd(); return { x, y, b }; });
}
export interface TacticalLayerOptions { fontFamily: string; viewport: Viewport; seed?: number }

export function createTacticalLayer(opts: TacticalLayerOptions): TacticalLayer {
  const { w, h } = opts.viewport;
  const container = new Container();
  const bg = new Graphics(), stars = new Graphics(), grid = new Graphics(), contours = new Graphics(), bodies = new Graphics(), arcs = new Graphics(), ships = new Graphics(), helm = new Graphics(), combat = new Graphics(), overlay = new Graphics();
  container.addChild(bg, stars, grid, contours, bodies, arcs, ships, helm, combat, overlay);
  const drawn = [grid, contours, bodies, arcs, ships, helm, combat, overlay];
  const mk = (size: number, tint: number, anchorX = 0, anchorY = 0): BitmapText => {
    const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.tint = tint; t.roundPixels = true; t.anchor.set(anchorX, anchorY); t.visible = false; container.addChild(t); return t;
  };
  const cols = Array.from({ length: GRID_LABELS }, () => mk(FONT_NATIVE, DIM, 0.5, 0));
  const rows = Array.from({ length: GRID_LABELS }, () => mk(FONT_NATIVE, DIM, 0, 0.5));
  const ring = Array.from({ length: RING_LABELS }, () => mk(FONT_NATIVE, DIM, 0.5, 0.5));
  const arrowText = Array.from({ length: ARROWS }, () => mk(FONT_NATIVE, TEXT, 0.5, 0.5));
  const zoomText = mk(FONT_SIZE, DIM), scaleText = mk(FONT_NATIVE, DIM), hint = mk(FONT_SIZE, AMBER, 0.5, 1), banner = mk(FONT_SIZE * 1.5, TEXT, 0.5, 0.5);
  zoomText.position.set(16, h - 64); scaleText.position.set(16, h - 22); hint.position.set(w / 2, h - 12); banner.position.set(w / 2, h / 2 - 80);
  banner.text = 'PAUSED   ESC: RESUME';
  const lockText = mk(FONT_NATIVE, LOCK, 0, 0), info = mk(FONT_SIZE, TEXT, 0.5, 0);
  const texts = [...cols, ...rows, ...ring, ...arrowText, zoomText, scaleText, hint, banner, lockText, info];

  // The star field: render-only randomness, seeded (H-1 spec §7 item 1). One screen of stars is drawn as a 2 × 2 tile, so
  // shifting it by the parallax offset (0..w, 0..h, minus one tile) always covers the screen with no gap.
  bg.rect(0, 0, w, h).fill(SPACE);
  let shownSeed = opts.seed ?? 2026;
  const drawStars = (seed: number): void => {
    stars.clear(); shownSeed = seed;
    for (const { x, y, b } of starField(seed, w, h))
      for (const [tx, ty] of [[0, 0], [w, 0], [0, h], [w, h]] as const)
        stars.rect(Math.floor(x) + tx, Math.floor(y) + ty, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1).fill({ color: 0xffffff, alpha: 0.25 + 0.55 * b });
  };
  drawStars(shownSeed);

  const setText = (t: BitmapText, s: string): void => { if (t.text !== s) t.text = s; };
  function fill(pool: BitmapText[], labels: readonly Label[]): void {
    pool.forEach((t, k) => {
      const l = labels[k];
      t.visible = l !== undefined;
      if (l) { setText(t, l.text); t.position.set(Math.round(l.x), Math.round(l.y)); }
    });
  }

  function drawShip(g: Graphics, s: ShipDraw): void {
    const colour = s.crew ? CREW_SHIP : ENEMY_SHIP, fx = Math.sin(s.angle), fy = -Math.cos(s.angle), rx = -fy, ry = fx;
    if (s.chevron) {
      const k = CHEVRON_SIZE / 2, pt = (f: number, side: number): number[] => [s.x + (fx * f + rx * side) * k, s.y + (fy * f + ry * side) * k];
      g.poly([...pt(1.1, 0), ...pt(-0.9, 0.85), ...pt(-0.45, 0), ...pt(-0.9, -0.85)]).fill(colour).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
      return;
    }
    const k = SHIP_RADIUS * s.scale;
    for (const seg of wedgeSegments()) {
      const pts: number[] = [];
      for (let i = 0; i < seg.poly.length; i += 2) { const f = seg.poly[i]!, side = seg.poly[i + 1]!; pts.push(s.x + (fx * f + rx * side) * k, s.y + (fy * f + ry * side) * k); }
      g.poly(pts).fill(DAMAGE[s.rooms[seg.room] ?? 0] ?? colour).stroke({ width: 1, color: 0x0b1018 });
    }
    for (let l = 0; l < s.shields; l++) g.circle(s.x, s.y, k * (1.6 + 0.25 * l)).stroke({ width: 1, color: SHIELD_RING, alpha: 0.65 - 0.2 * l });
  }

  /** A laser arc: a filled sector of radius r about (x, y), ±half about `angle` (radians clockwise from north). */
  function arc(g: Graphics, a: ArcDraw, colour: number, fillAlpha: number, lineAlpha: number): void {
    const from = a.angle - a.half - Math.PI / 2, to = a.angle + a.half - Math.PI / 2;   // Pixi measures from +x, clockwise on screen
    g.moveTo(a.x, a.y).arc(a.x, a.y, Math.max(1, a.r), from, to).closePath().fill({ color: colour, alpha: fillAlpha }).stroke({ width: 1, color: colour, alpha: lineAlpha });
  }

  function missileGlyph(g: Graphics, x: number, y: number, angle: number, colour: number): void {
    const fx = Math.sin(angle), fy = -Math.cos(angle), rx = -fy, ry = fx, s = 6;
    g.poly([x + fx * s, y + fy * s, x - fx * s + rx * s * 0.55, y - fy * s + ry * s * 0.55, x - fx * s - rx * s * 0.55, y - fy * s - ry * s * 0.55]).fill(colour);
  }

  function arrowGlyph(g: Graphics, x: number, y: number, angle: number, colour: number): void {
    const fx = Math.sin(angle), fy = -Math.cos(angle), rx = -fy, ry = fx, s = 10;
    g.poly([x + fx * s, y + fy * s, x - fx * s * 0.6 + rx * s * 0.7, y - fy * s * 0.6 + ry * s * 0.7, x - fx * s * 0.6 - rx * s * 0.7, y - fy * s * 0.6 - ry * s * 0.7]).fill(colour);
  }

  return {
    container, stars,
    draw(d, c = null) {
      stars.position.set(d.stars.x - w, d.stars.y - h);
      for (const g of drawn) g.clear();
      for (const l of d.grid.lines) grid.moveTo(l.x1, l.y1).lineTo(l.x2, l.y2).stroke({ width: 1, color: GRID, alpha: l.major ? 0.7 : 0.3 });
      fill(cols, d.grid.columns); fill(rows, d.grid.rows);

      for (const c of d.contours) contours.circle(c.x, c.y, c.r).stroke({ width: 1, color: CONTOUR, alpha: 0.45 });
      if (d.edge) contours.circle(d.edge.x, d.edge.y, d.edge.r).stroke({ width: 2, color: EDGE, alpha: 0.7 });

      if (d.planet) {
        const p = d.planet;
        bodies.circle(p.x, p.y, Math.max(1, p.r)).fill(PLANET);
        bodies.circle(p.x - p.r * 0.22, p.y - p.r * 0.22, p.r * 0.72).fill({ color: PLANET_LIT, alpha: 0.55 });
        bodies.circle(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.35).fill({ color: PLANET_RIM, alpha: 0.35 });
        bodies.circle(p.x, p.y, Math.max(1, p.r)).stroke({ width: 1, color: PLANET_RIM, alpha: 0.6 });
      }
      for (const a of d.asteroids) {
        if (a.dot) { bodies.rect(Math.round(a.x) - 1, Math.round(a.y) - 1, 2, 2).fill(ROCK_EDGE); continue; }
        const shape = asteroidShape(a.index), pts: number[] = [];
        shape.forEach((m, k) => { const t = (k / shape.length) * Math.PI * 2; pts.push(a.x + Math.cos(t) * a.r * m, a.y + Math.sin(t) * a.r * m); });
        bodies.poly(pts).fill(ROCK).stroke({ width: 1, color: ROCK_EDGE });
      }

      const wd = c?.weapons ?? null;
      if (wd) {
        if (wd.enemyArc) arc(arcs, wd.enemyArc, ENEMY_SHIP, 0.05, 0.25);
        arc(arcs, wd.ownArc, CREW_SHIP, wd.inArc ? 0.14 : 0.08, 0.5);
      }

      for (const s of d.ships) drawShip(ships, s);

      let ringLabels: readonly Label[] = wd?.ring?.labels ?? [];
      if (wd?.ring) {
        const r = wd.ring;
        helm.circle(r.x, r.y, r.r).stroke({ width: 1, color: DIM, alpha: 0.25 });
        for (const t of r.ticks) helm.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 1, color: DIM, alpha: t.major ? 0.7 : 0.35 });
      }
      if (d.helm) {
        const hd = d.helm;
        if (hd.path.length > 0) {
          helm.moveTo(hd.origin.x, hd.origin.y);
          for (const p of hd.path) helm.lineTo(p.x, p.y);
          helm.stroke({ width: 2, color: PATH, alpha: 0.7 });
          const end = hd.path[hd.path.length - 1]!;
          helm.circle(end.x, end.y, 3).fill({ color: PATH, alpha: 0.9 });
        }
        helm.moveTo(hd.origin.x, hd.origin.y).lineTo(hd.velocity.x, hd.velocity.y).stroke({ width: 2, color: VELOCITY, alpha: 0.8 });
        helm.moveTo(hd.headingFrom.x, hd.headingFrom.y).lineTo(hd.headingTo.x, hd.headingTo.y).stroke({ width: 1, color: TEXT, alpha: 0.7 });
        // Thrust: a flame behind the stern (forward) or ahead of the nose (reverse). Turn: a pip on the side it turns to.
        const fx = (hd.headingTo.x - hd.headingFrom.x) / 40, fy = (hd.headingTo.y - hd.headingFrom.y) / 40, rx = -fy, ry = fx;
        const back = Math.hypot(hd.headingFrom.x - hd.origin.x, hd.headingFrom.y - hd.origin.y);
        if (hd.thrust !== 0) {
          const dir = hd.thrust > 0 ? -1 : 1, bx = hd.origin.x + fx * dir * back, by = hd.origin.y + fy * dir * back, len = hd.thrust > 0 ? 14 : 8;
          helm.poly([bx + rx * 5, by + ry * 5, bx - rx * 5, by - ry * 5, bx + fx * dir * len, by + fy * dir * len]).fill({ color: FLAME, alpha: 0.9 });
        }
        if (hd.turn !== 0) helm.circle(hd.headingTo.x + rx * hd.turn * 8, hd.headingTo.y + ry * hd.turn * 8, 3).fill({ color: AMBER, alpha: 0.9 });
        if (hd.ring) {
          helm.circle(hd.ring.x, hd.ring.y, hd.ring.r).stroke({ width: 1, color: DIM, alpha: 0.25 });
          for (const t of hd.ring.ticks) helm.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 1, color: DIM, alpha: t.major ? 0.7 : 0.35 });
          ringLabels = hd.ring.labels;
        }
      }
      fill(ring, ringLabels);

      // Combat: missile trails and glyphs, the predicted missile path, the lock marker, then the event effects on top.
      for (const m of c?.missiles ?? []) {
        const colour = m.crew ? CREW_SHIP : ENEMY_SHIP;
        m.trail.forEach((p, k) => { if (k > 0) { const q = m.trail[k - 1]!; combat.moveTo(q.x, q.y).lineTo(p.x, p.y).stroke({ width: 2, color: colour, alpha: 0.6 * (k / m.trail.length) }); } });
        missileGlyph(combat, m.x, m.y, m.angle, colour);
      }
      if (wd && wd.missileOrigin && wd.missilePath.length > 0) {
        combat.moveTo(wd.missilePath[0]!.x, wd.missilePath[0]!.y);
        for (const p of wd.missilePath.slice(1)) combat.lineTo(p.x, p.y);
        combat.stroke({ width: 1, color: MISSILE_PATH, alpha: 0.7 });
        const end = wd.missilePath[wd.missilePath.length - 1]!;
        combat.circle(end.x, end.y, 3).stroke({ width: 1, color: MISSILE_PATH });
      }
      const lk = c?.lock ?? null;
      if (lk) {
        const r = lk.r, k = r * 0.45;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
          combat.moveTo(lk.x + sx * r, lk.y + sy * (r - k)).lineTo(lk.x + sx * r, lk.y + sy * r).lineTo(lk.x + sx * (r - k), lk.y + sy * r).stroke({ width: 2, color: LOCK });
      }
      lockText.visible = lk !== null;
      if (lk) { setText(lockText, lk.label.text); lockText.position.set(Math.round(lk.label.x), Math.round(lk.label.y)); }
      info.visible = wd !== null;
      if (wd) { setText(info, wd.info.text); info.tint = wd.inArc ? GOOD : TEXT; info.position.set(Math.round(wd.info.x), Math.round(wd.info.y)); }
      for (const e of c?.effects ?? []) {
        if (e.kind === 'beam') combat.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: 3, color: e.colour, alpha: e.alpha });
        else if (e.kind === 'burst') combat.circle(e.x1, e.y1, e.r).stroke({ width: 3, color: e.colour, alpha: e.alpha }).circle(e.x1, e.y1, e.r * 0.4).fill({ color: e.colour, alpha: e.alpha * 0.6 });
        else for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; combat.moveTo(e.x1, e.y1).lineTo(e.x1 + Math.cos(a) * e.r, e.y1 + Math.sin(a) * e.r).stroke({ width: 2, color: e.colour, alpha: e.alpha }); }
      }

      d.arrows.forEach((a) => arrowGlyph(overlay, a.x, a.y, a.angle, ARROW_COLOUR[a.target]));
      // Each label sits inward of its arrow, far enough along the arrow's axis to clear the glyph (half its width, plus 14 px).
      fill(arrowText, d.arrows.map((a) => ({ text: a.label, x: a.x - Math.sin(a.angle) * (textPx(a.label, 1) / 2 + 14), y: a.y + Math.cos(a.angle) * 18 })));
      const o = d.overlay, bx = 16, by = h - 28;
      overlay.moveTo(bx, by).lineTo(bx + o.scaleBar.px, by).stroke({ width: 2, color: DIM });
      overlay.moveTo(bx, by - 5).lineTo(bx, by + 5).stroke({ width: 2, color: DIM }).moveTo(bx + o.scaleBar.px, by - 5).lineTo(bx + o.scaleBar.px, by + 5).stroke({ width: 2, color: DIM });
      setText(zoomText, o.zoomText); zoomText.visible = true;
      setText(scaleText, `${o.scaleBar.units} u`); scaleText.visible = true; scaleText.position.set(bx + o.scaleBar.px + 8, by - 8);
      setText(hint, 'C: SNAP BACK'); hint.visible = o.snapHint;
      banner.visible = o.paused;
    },
    reset() { for (const t of texts) t.visible = false; for (const g of drawn) g.clear(); },
    reseed(seed) { if (seed !== shownSeed) drawStars(seed); },
    starSeed: () => shownSeed
  };
}
