// The duel's interior view (H-1 spec §8): the duel ship (the Hound) drawn by today's interior layers (tiles, effects, room icons,
// consoles, crew, boarders), composed as render/renderer.ts composes them, without the sector enemy window, projectiles,
// callouts or HUD, plus the duel's damage overlay. It owns its RenderMemory; a restart destroys it and builds a new one.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { REFERENCE_STAGE, TILE_PX, type StageSize } from '../../../../shared/resolution';
import { Position, Stable } from '../../sim/components';
import { DUEL_CREW_MAX, type DuelState } from '../../sim/duel/state';
import type { GameAssets } from '../assets';
import { createBoarderLayer } from '../boarderLayer';
import { createConsoleLayer } from '../consoleLayer';
import { createBattlemapLayer } from '../battlemapLayer';
import { battlemapFor, fitRect } from '../battlemapModel';
import { createPropLayer } from '../propLayer';
import { createCrewLayer } from '../crewSprites';
import { createEffectsLayer } from '../effects';
import { createRenderMemory, type RenderMemory } from '../memory';
import { createIconLayer, drawIcon } from '../roomIcons';
import { INK } from '../painted/ink';
import { AMBER, DIM, FONT_NATIVE, GOOD, TEXT, WARN } from '../theme';
import { ALERT_BLINK_HZ, blink } from '../tactical/crtTheme';
import { HEALTH_LOW } from './readoutModel';
import { HEALTH_MAX } from '../../sim/tuning';
import { createTileLayer } from '../tiles';
import { airTints, duelFit, hazardMarkers, interiorBand, interiorOverlay, stationBadges, type StationBadge } from './interiorModel';
import type { Band } from '../worldFit';
import { placeInterior, type InteriorCamera, type Placement } from './interiorCamera';
import { shipControlAt } from './shipControls';
import { createInteriorFeel } from '../interiorFeel';
import { backdropOption } from '../twinkleLayer';
import { DEFAULT_FEEL, type FeelSetting } from '../feel';
import { duelGradeInput } from '../gradeModel';
import { duelHit } from '../impactModel';
import { damagedRepairPoints, duelWorking } from '../particles/sources';
import type { ViewEvent } from '../tactical/fxModel';
import { featureReady } from '../fallback';
import { crewDrawAt, crewPresentation, type CrewOverride } from './crewOverride';
import { CARRY_LIFT_3D } from '../crew3dModel';
import { createHealFx, crewLife, healFxDraw, stepHealFx } from './healFxModel';
import { createRandom, hashString } from '../particles/random';
import { bubbleAlpha, hexPoints, shieldCells, type ShieldFx } from '../shieldFx';
import { interiorFrame, shotDraw, type InteriorFrame, type ShotState } from './enemyShots';
import { CREW_SLOT } from '../../sim/tactical/state';

/** UI round Part 3 §3: the shield fx, the enemy shots in flight, and the crew ship's shield layers up now. */
export interface InteriorLook { shield: ShieldFx; shots: ShotState; up: number }
const SHIELD_COLOUR = 0x6fc3ff, SHOT_CORE = 0xff5a3c, SHOT_BRIGHT = 0xffd0c0;

export interface InteriorView {
  container: Container;
  /** The ship's world container (scaled and placed by the fit), exposed for tests. */
  world: Container;
  memory: RenderMemory;
  /** `crewPrev`: each player's character position at the previous tick, in tiles, for interpolation. `events`: the view
   *  events drained this frame (the feed the tactical effects read); a hit on the crew ship flashes and shakes the interior.
   *  `presentDt`: the light and feel's seconds this frame (Art-i spec section 7), 0 while the duel is paused so the
   *  particles, the pulse and the ambient life hold; it defaults to `dt`, which the tiles and boarders keep.
   *  `zoom`: the interior's zoom camera and the character it follows (interior zoom spec); absent, the plain fit. */
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number, events?: readonly ViewEvent[], presentDt?: number, zoom?: { camera: InteriorCamera; active: number }, hover?: { x: number; y: number } | null, override?: CrewOverride | null,
    look?: InteriorLook): void;
  /** UI round Part 3 §3: the frame (shield ellipse, nose, rooms) the interior draws its shield and shots with, for `d`'s layout. */
  frame(d: DuelState): InteriorFrame;
  /** Engineering spike §5: the last draw's placement (the world's scale and offset before the shake), or null before the
   *  first; the scene's click hit-test reads it. */
  placement(): Placement | null;
  /** UI round 2b: the interior band of the last draw (the current stage's), which the placement was fitted in. */
  band(): Band;
  destroy(): void;
}

/** The room tint by damage level (amber, red), and darker shades of both for the marker and its label on the light floor. */
const TINT: readonly number[] = [0, AMBER, WARN], MARK: readonly number[] = [0, 0x8a5a00, 0xa8281c];
/** Engineering spike §6: the most fire and breach markers drawn at once (8 rooms and 8 sites on the Hound). */
export const HAZARD_LABELS = 16;

/** `stageScale`: the letterbox's stage scale, read every frame so the fit snaps to whole screen pixels per art pixel (Art-i spec section 4); tests leave it at 1.
 *  `feel`: the feel setting (Art-i spec section 7), read every frame; tests leave it at full.
 *  `crew3d`: the 3D crew art or the old art (Crew3D spec section 4), read every frame; tests leave it on.
 *  `stageSize`: the stage's size in internal px (UI round 2b: it follows the window), read every frame for the band; tests leave it at the reference. */
/** Where a crew label (DOWNED, AWAY) sits for a character drawn at (x, y) px: under it, in the DOWNED red. */
export function crewLabelAt(x: number, y: number): { x: number; y: number; tint: number } {
  return { x: Math.round(x), y: Math.round(y + TILE_PX * 0.5), tint: WARN };
}

export function createInteriorView(assets: GameAssets, stageScale: () => number = () => 1, feel: () => FeelSetting = () => DEFAULT_FEEL, crew3d: () => boolean = () => true, stageSize: () => StageSize = () => REFERENCE_STAGE): InteriorView {
  const container = new Container(), world = new Container();
  let band = interiorBand(stageSize());
  const missing = new Set(assets.missing);
  const fx = createInteriorFeel({   // Art-i spec sections 5-8; Art-ii: the bought consoles and blasts
    world, band, feel, consoleArt: featureReady(missing, 'consoleArt'), backdrop: backdropOption(assets),   // Art-v: the painted backdrop
    blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined,
    painted: (id) => battlemapFor(id, missing) !== null   // the art spike: painted fire, blasts and particles on a painted ship
  });
  // Interior zoom: a zoomed ship is clipped to the band (the full stage width); the backdrop stays unclipped.
  const clip = new Graphics().rect(band.x, band.y, band.w, band.h).fill(0xffffff);
  container.addChild(fx.starfield, world, clip);   // the starfield under the world, filling the band; Art-v: or the painted backdrop over the whole stage
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory), effects = createEffectsLayer(assets, memory), icons = createIconLayer(['navigation', 'medbay']);   // the badges stand in for these two (start-aboard spec §2)
  const props = createPropLayer(assets);   // Art-iii spec section 4: the set dressing, directly over the tiles
  const desks = createConsoleLayer(assets), crew = createCrewLayer(assets, memory, crew3d), boarders = createBoarderLayer(assets, crew3d);
  const shieldG = new Graphics();   // UI round Part 3 §3: the bubble, the hex shimmer and the enemy shots
  const air = new Graphics(), damage = new Graphics(), marks = new Graphics();   // Engineering spike §6: the air tint under the damage tint
  let last: Placement | null = null;
  const bar3d = featureReady(missing, 'crew3d');   // Crew3D spec section 4: the health bar clears the taller figure
  const hazardLabels = Array.from({ length: HAZARD_LABELS }, () => {
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
  const crewLabels = Array.from({ length: DUEL_CREW_MAX }, () => {   // duel-health spec §2: DOWNED under a downed character; one per player of the largest crew (Sci-2 spec §7)
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
  // Station badges (start-aboard spec §2): a plate and glyph per working console over the desks and under the crew, and a
  // label on top with the other labels. The glyphs are drawn white once and tinted each frame.
  const badges = new Container(), badgeLabels: BitmapText[] = [];
  let badgesFor: string | null = null, badgeScale = 0;
  let clock = 0;
  const BADGE = 32, BADGE_GLYPH = 22, LABEL_ADVANCE = 6, BADGE_TINT: Record<StationBadge['tint'], number> = { normal: TEXT, offline: WARN, faint: DIM };
  // Duel polish i spec §D: the healing motes and revive rings in one Graphics redrawn each frame, and a pooled REVIVED label
  // per character, over the crew and the other labels. The motes' x jitter is a view-side random (never the sim's).
  const heal = createHealFx(), healRandom = createRandom(hashString('duel-heal-motes')), healMarks = new Graphics();
  const revivedLabels = Array.from({ length: DUEL_CREW_MAX }, () => {   // one per player of the largest crew (Sci-2 spec §7)
    const t = new BitmapText({ text: 'REVIVED', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 1); t.roundPixels = true; t.visible = false; t.tint = GOOD; return t;
  });
  const labels = Array.from({ length: 3 }, () => {
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
  // Back to front as renderer.ts (Art-i spec section 5): the battlemap painting (Art-iv), tiles, the props (Art-iii), grade, effects below, room icons, desks, then the duel's
  // damage tint under the crew, crew, boarders (always empty in the duel), effects above, the lights, and the markers and
  // labels on top so the lights never wash them out; the crew labels draw last, above the console badge names.
  const battlemap = createBattlemapLayer(assets);
  world.addChild(battlemap.container, tiles.container, props.container, fx.grade, effects.below, icons.container, desks.container, badges, air, damage, crew.container, boarders.container, effects.above, fx.lights, shieldG, marks, ...labels, ...hazardLabels, healMarks, ...revivedLabels);
  const badgeText = new Container();
  world.addChild(badgeText, ...crewLabels);   // UI round 2a: the crew labels (DOWNED, AWAY) above the console badge names
  desks.container.addChild(fx.fixtures); effects.below.addChild(fx.paintedBelow); effects.above.addChild(fx.above, fx.paintedAbove);
  return {
    container, world, memory,
    placement: () => last,
    band: () => band,
    frame: (d) => interiorFrame(d, fitRect(d.interior.layout.id, d.interior.derived.width, d.interior.derived.height, missing)),
    draw(d, crewPrev, alpha, dt, events = [], presentDt = dt, zoom, hover = null, override = null, look) {
      clock += presentDt;   // UI round §2.4a: the badge blink's presentation clock; frozen while paused
      const size = stageSize();
      if (size.w !== band.w || size.h - band.y !== band.h) { band = interiorBand(size); clip.clear().rect(band.x, band.y, band.w, band.h).fill(0xffffff); }   // UI round 2b: the stage followed the window
      const st = d.interior, stage = stageScale(), rect = fitRect(st.layout.id, st.derived.width, st.derived.height, missing), fit0 = duelFit(st.derived.width, st.derived.height, stage, rect, band);
      // The zoom camera places the world on whole screen pixels per art pixel; it follows the active character's drawn (interpolated) position.
      const eid = zoom ? st.crew[zoom.active] : undefined;
      const target = eid === undefined ? null : (() => {
        const x = Position.x[eid]!, y = Position.y[eid]!, was = crewPrev[zoom!.active] ?? { x, y };
        return { x: (was.x + (x - was.x) * alpha) * TILE_PX, y: (was.y + (y - was.y) * alpha) * TILE_PX };
      })();
      const fit = zoom ? placeInterior(zoom.camera, { band, rect: { x: rect.x * TILE_PX, y: rect.y * TILE_PX, w: rect.w * TILE_PX, h: rect.h * TILE_PX }, fit: fit0, stage }, target) : fit0;
      world.scale.set(fit.scale);
      last = { scale: fit.scale, x: fit.x, y: fit.y };   // before the shake: the click hit-test's placement
      const zoomed = !!zoom && zoom.camera.level !== 0;
      if (world.mask !== (zoomed ? clip : null)) world.mask = zoomed ? clip : null;   // level 0 draws exactly as before
      clip.visible = zoomed;
      st.crew.forEach((eid, pid) => { const p = crewPrev[pid]; if (p) memory.prev.set(Stable.id[eid]!, p); });
      battlemap.draw(st); tiles.update(st, dt); props.draw(st); icons.update(st); desks.draw(st); effects.draw(st);
      const bs = stationBadges(d), k2 = zoomed ? 1 : 2;   // labels at twice native over the whole-ship fit, native once zoomed in
      if (badgesFor !== st.derived.layoutHash || badgeScale !== k2) {   // built once per layout: a plate and a white glyph per badge, and its label
        for (const c of badges.removeChildren()) c.destroy();
        for (const c of badgeText.removeChildren()) c.destroy();
        badgeLabels.length = 0;
        for (const b of bs) {
          const plate = new Graphics().roundRect(b.x - BADGE / 2, b.y - BADGE / 2, BADGE, BADGE, 6).fill({ color: INK, alpha: 0.7 });
          const glyph = new Graphics(); drawIcon(glyph, b.kind, b.x, b.y, BADGE_GLYPH, 0xffffff);
          badges.addChild(plate, glyph);
          const t = new BitmapText({ text: b.label, style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE * k2 } });
          t.anchor.set(0.5, 0); t.roundPixels = true; t.position.set(Math.round(b.x), Math.round(b.y + BADGE / 2 + 1));
          const lw = b.label.length * LABEL_ADVANCE * k2;   // m5x7's advance at its native size: no text measuring (no canvas in node tests)
          const back = new Graphics().rect(Math.round(b.x - lw / 2) - 2 * k2, Math.round(b.y + BADGE / 2 + 1) + 1.5 * k2, lw + 4 * k2, 11 * k2).fill({ color: INK, alpha: 0.7 });
          badgeText.addChild(back, t); badgeLabels.push(t);
        }
        badgesFor = st.derived.layoutHash; badgeScale = k2;
      }
      bs.forEach((b, k) => { const c = b.empty && blink(clock, ALERT_BLINK_HZ) ? WARN : BADGE_TINT[b.tint]; (badges.children[k * 2 + 1] as Graphics).tint = c; badgeLabels[k]!.tint = c; });
      const o = interiorOverlay(d);
      damage.clear(); marks.clear(); air.clear();
      for (const t of airTints(d)) for (const p of t.tiles) air.rect(p.x, p.y, TILE_PX, TILE_PX).fill({ color: t.color, alpha: t.alpha });
      for (const t of o.tints) for (const p of t.tiles) damage.rect(p.x, p.y, TILE_PX, TILE_PX).fill({ color: TINT[t.level]!, alpha: 0.28 });
      for (const c of o.consoles) marks.rect(c.x + 1, c.y + 1, TILE_PX - 2, TILE_PX - 2).stroke({ width: 2, color: c.free ? AMBER : DIM, alpha: c.free ? 0.95 : 0.4 });
      labels.forEach((t, k) => {
        const m = o.markers[k];
        t.visible = m !== undefined;
        if (!m) return;
        const colour = m.fire ? MARK[2]! : MARK[m.level]!, r = TILE_PX * 0.42;   // a fire's marker in the damage red at any level
        marks.poly([m.x, m.y - r, m.x + r, m.y, m.x, m.y + r, m.x - r, m.y]).stroke({ width: 2, color: colour });
        if (m.progress > 0) marks.moveTo(m.x, m.y).arc(m.x, m.y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + m.progress * Math.PI * 2).closePath().fill({ color: TEXT, alpha: 0.8 });
        if (t.text !== m.label) t.text = m.label;
        t.tint = colour; t.position.set(Math.round(m.x), Math.round(m.y + TILE_PX * 0.5));
      });
      // Engineering spike §4, §6: fires outside the repair rooms and breaches, worked by holding E at the marker.
      const hz = hazardMarkers(d);
      hazardLabels.forEach((t, k) => {
        const m = hz[k];
        t.visible = m !== undefined;
        if (!m) return;
        const colour = MARK[2]!, r = TILE_PX * 0.42;
        marks.poly([m.x, m.y - r, m.x + r, m.y, m.x, m.y + r, m.x - r, m.y]).stroke({ width: 2, color: colour });
        if (m.progress > 0) marks.moveTo(m.x, m.y).arc(m.x, m.y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + m.progress * Math.PI * 2).closePath().fill({ color: TEXT, alpha: 0.8 });
        if (t.text !== m.label) t.text = m.label;
        t.tint = colour; t.position.set(Math.round(m.x), Math.round(m.y + TILE_PX * 0.5));
      });
      // Spec §5, §6: the door or airlock under the pointer, outlined (anyone can click it).
      const over = hover ? shipControlAt(d, last, hover.x, hover.y, band) : null;
      if (over) { const w = st.derived.width, tx = over.tile % w, ty = Math.floor(over.tile / w); marks.rect(tx * TILE_PX + 1, ty * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2).stroke({ width: 2, color: AMBER, alpha: 0.95 }); }
      // Health (duel-health spec §2): a bar above each character below full, and a downed character's pick-up ring and label.
      const drawn: { x: number; y: number }[] = [];
      for (const c of o.crew) {
        const at = crewDrawAt(c.pid, c.x / TILE_PX, c.y / TILE_PX, crewPrev, alpha, override), x = at.x * TILE_PX, y = at.y * TILE_PX;
        drawn[c.pid] = { x, y };
        if (c.bar) {
          const w = TILE_PX * 0.8, bx = x - w / 2, by = y - (bar3d && crew3d() ? CARRY_LIFT_3D - 2 : TILE_PX * 0.75);   // Crew3D: over the standing figure's head, not across its chest
          marks.rect(bx - 1, by - 1, w + 2, 5).fill({ color: 0x000000, alpha: 0.6 });
          marks.rect(bx, by, w * c.fill, 3).fill({ color: Math.ceil(c.fill * HEALTH_MAX) < HEALTH_LOW ? WARN : GOOD })   // the HEALTH row's rounding;
        }
        if (c.revive > 0) marks.moveTo(x, y).arc(x, y, TILE_PX * 0.45, -Math.PI / 2, -Math.PI / 2 + c.revive * Math.PI * 2).closePath().fill({ color: GOOD, alpha: 0.45 });
        const t = crewLabels[c.pid];
        if (!t) continue;
        t.visible = c.label !== '';
        if (!t.visible) continue;
        if (t.text !== c.label) t.text = c.label;
        const at2 = crewLabelAt(x, y);
        t.tint = at2.tint; t.position.set(at2.x, at2.y);   // UI round 2a: AWAY reads in the DOWNED red (amber vanished on the light floor)
      }
      // UI round Part 3 §3: the shield bubble and its hex shimmer, then the enemy shots, in the ship's own px frame.
      shieldG.clear();
      if (look) {
        const f = interiorFrame(d, rect), e = f.ellipse, ba = bubbleAlpha(look.shield, CREW_SLOT, look.up);
        if (ba > 0) shieldG.ellipse(e.cx, e.cy, e.rx, e.ry).stroke({ width: 2, color: SHIELD_COLOUR, alpha: ba });
        for (const c of shieldCells(look.shield, CREW_SLOT, e, TILE_PX * 0.4, f.nose, f.star)) {
          const pts = hexPoints(c.x, c.y, TILE_PX * 0.4);
          shieldG.poly(pts).fill({ color: SHIELD_COLOUR, alpha: c.alpha * 0.55 }).poly(pts).stroke({ width: 1, color: SHIELD_COLOUR, alpha: c.alpha });
        }
        for (const s of look.shots.shots) {
          const p = shotDraw(s), cx = Math.cos(p.heading), cy = Math.sin(p.heading);
          if (!s.landed) {
            if (s.kind === 'laser') shieldG.moveTo(p.x - cx * 24, p.y - cy * 24).lineTo(p.x, p.y).stroke({ width: 3, color: SHOT_CORE }).moveTo(p.x - cx * 24, p.y - cy * 24).lineTo(p.x, p.y).stroke({ width: 1, color: SHOT_BRIGHT });
            else if (s.kind === 'pew') shieldG.moveTo(p.x - cx * 10, p.y - cy * 10).lineTo(p.x, p.y).stroke({ width: 2, color: SHOT_CORE, alpha: 0.7 }).circle(p.x, p.y, 3).fill({ color: SHOT_BRIGHT });
            else {
              p.trail.forEach((t, i) => shieldG.circle(t.x, t.y, 4 - i * 0.6).fill({ color: SHOT_CORE, alpha: 0.5 - i * 0.1 }));
              shieldG.circle(p.x, p.y, 2.5).fill({ color: SHOT_BRIGHT }).circle(p.x, p.y, 2.5).stroke({ width: 1, color: SHOT_CORE });
            }
          }
          if (p.burst > 0) shieldG.circle(p.x, p.y, 6 + 16 * p.burst).stroke({ width: 2, color: s.stopped ? SHIELD_COLOUR : SHOT_CORE, alpha: 1 - p.burst });
        }
      }
      // Duel polish i spec §D: healing motes and the revive, on the presentation clock (held while paused).
      const life = crewLife(d);
      stepHealFx(heal, { tick: d.tactical.tick, round: d.round, downed: life.downed, healing: life.healing, pos: drawn }, presentDt, healRandom);
      const hv = healFxDraw(heal);
      healMarks.clear();
      for (const m of hv.motes) healMarks.rect(Math.round(m.x) - 3, Math.round(m.y) - 1, 7, 3).rect(Math.round(m.x) - 1, Math.round(m.y) - 3, 3, 7).fill({ color: GOOD, alpha: m.alpha });
      for (const r of hv.rings) healMarks.circle(r.x, r.y, r.r).stroke({ width: 2, color: GOOD, alpha: r.alpha });
      revivedLabels.forEach((t, pid) => {
        const l = hv.labels.find((q) => q.pid === pid);
        t.visible = l !== undefined;
        if (l) { t.alpha = l.alpha; t.position.set(Math.round(l.x), Math.round(l.y)); }
      });
      // Light and feel: the duel's hull alert, a hit flashes the whole interior, sparks at damaged repair rooms, repair work.
      const working = duelWorking(d);
      const { shake, bob } = fx.draw({ state: st, grade: duelGradeInput(d), hit: duelHit(events) ? { whole: true } : null, sparks: damagedRepairPoints(d), working, artPx: 2 * fit.scale, starPx: 2 * fit0.scale, band, stage: size }, presentDt, dt);
      world.position.set(fit.x + shake.x, fit.y + shake.y);   // only the interior world shakes; the UI over it stays still
      // Crew3D spec section 4: the 3D crew pose from the same list, on the presentation clock: `presentDt` is 0 while the
      // duel is paused or decided, and then they hold their pose and frame. Net-4a §3.6: online, the other players' crew
      // are drawn from the confirmed publications (crewPresentation).
      crew.draw(st, alpha, crewPresentation(override), bob, working, { dt: presentDt, paused: presentDt === 0 && dt > 0 });
      boarders.draw(st, dt, presentDt);
    },
    destroy() { memory.reset(); fx.destroy(); container.destroy({ children: true }); }   // the feel first: it frees its shared GraphicsContexts
  };
}
