// The duel's interior view (H-1 spec §8): the duel ship (the Hound) drawn by today's interior layers (tiles, effects, room icons,
// consoles, crew, boarders), composed as render/renderer.ts composes them, without the sector enemy window, projectiles,
// callouts or HUD, plus the duel's damage overlay. It owns its RenderMemory; a restart destroys it and builds a new one.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../../shared/resolution';
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
import { HEALTH_LOW } from './readoutModel';
import { HEALTH_MAX } from '../../sim/tuning';
import { createTileLayer } from '../tiles';
import { airTints, duelFit, hazardMarkers, interiorOverlay, INTERIOR_BAND, stationBadges, type StationBadge } from './interiorModel';
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
import { CARRY_LIFT_3D } from '../crew3dModel';
import { createHealFx, crewLife, healFxDraw, stepHealFx } from './healFxModel';
import { createRandom, hashString } from '../particles/random';

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
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number, events?: readonly ViewEvent[], presentDt?: number, zoom?: { camera: InteriorCamera; active: number }, hover?: { x: number; y: number } | null): void;
  /** Engineering spike §5: the last draw's placement (the world's scale and offset before the shake), or null before the
   *  first; the scene's click hit-test reads it. */
  placement(): Placement | null;
  destroy(): void;
}

/** The room tint by damage level (amber, red), and darker shades of both for the marker and its label on the light floor. */
const TINT: readonly number[] = [0, AMBER, WARN], MARK: readonly number[] = [0, 0x8a5a00, 0xa8281c];
/** Engineering spike §6: the most fire and breach markers drawn at once (8 rooms and 8 sites on the Hound). */
export const HAZARD_LABELS = 16;

/** `stageScale`: the letterbox's stage scale, read every frame so the fit snaps to whole screen pixels per art pixel (Art-i spec section 4); tests leave it at 1.
 *  `feel`: the feel setting (Art-i spec section 7), read every frame; tests leave it at full.
 *  `crew3d`: the 3D crew art or the old art (Crew3D spec section 4), read every frame; tests leave it on. */
export function createInteriorView(assets: GameAssets, stageScale: () => number = () => 1, feel: () => FeelSetting = () => DEFAULT_FEEL, crew3d: () => boolean = () => true): InteriorView {
  const container = new Container(), world = new Container();
  const missing = new Set(assets.missing);
  const fx = createInteriorFeel({   // Art-i spec sections 5-8; Art-ii: the bought consoles and blasts
    world, band: INTERIOR_BAND, feel, consoleArt: featureReady(missing, 'consoleArt'), backdrop: backdropOption(assets),   // Art-v: the painted backdrop
    blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined,
    painted: (id) => battlemapFor(id, missing) !== null   // the art spike: painted fire, blasts and particles on a painted ship
  });
  // Interior zoom: a zoomed ship is clipped to the band so it never runs under the readout column; the backdrop stays unclipped.
  const clip = new Graphics().rect(INTERIOR_BAND.x, INTERIOR_BAND.y, INTERIOR_BAND.w, INTERIOR_BAND.h).fill(0xffffff);
  container.addChild(fx.starfield, world, clip);   // the starfield under the world, filling INTERIOR_BAND; Art-v: or the painted backdrop over the whole stage
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory), effects = createEffectsLayer(assets, memory), icons = createIconLayer(['navigation', 'medbay']);   // the badges stand in for these two (start-aboard spec §2)
  const props = createPropLayer(assets);   // Art-iii spec section 4: the set dressing, directly over the tiles
  const desks = createConsoleLayer(assets), crew = createCrewLayer(assets, memory, crew3d), boarders = createBoarderLayer(assets, crew3d);
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
  // labels on top so the lights never wash them out.
  const battlemap = createBattlemapLayer(assets);
  world.addChild(battlemap.container, tiles.container, props.container, fx.grade, effects.below, icons.container, desks.container, badges, air, damage, crew.container, boarders.container, effects.above, fx.lights, marks, ...labels, ...hazardLabels, ...crewLabels, healMarks, ...revivedLabels);
  const badgeText = new Container();
  world.addChild(badgeText);
  desks.container.addChild(fx.fixtures); effects.below.addChild(fx.paintedBelow); effects.above.addChild(fx.above, fx.paintedAbove);
  return {
    container, world, memory,
    placement: () => last,
    draw(d, crewPrev, alpha, dt, events = [], presentDt = dt, zoom, hover = null) {
      const st = d.interior, stage = stageScale(), rect = fitRect(st.layout.id, st.derived.width, st.derived.height, missing), fit0 = duelFit(st.derived.width, st.derived.height, stage, rect);
      // The zoom camera places the world on whole screen pixels per art pixel; it follows the active character's drawn (interpolated) position.
      const eid = zoom ? st.crew[zoom.active] : undefined;
      const target = eid === undefined ? null : (() => {
        const x = Position.x[eid]!, y = Position.y[eid]!, was = crewPrev[zoom!.active] ?? { x, y };
        return { x: (was.x + (x - was.x) * alpha) * TILE_PX, y: (was.y + (y - was.y) * alpha) * TILE_PX };
      })();
      const fit = zoom ? placeInterior(zoom.camera, { band: INTERIOR_BAND, rect: { x: rect.x * TILE_PX, y: rect.y * TILE_PX, w: rect.w * TILE_PX, h: rect.h * TILE_PX }, fit: fit0, stage }, target) : fit0;
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
      bs.forEach((b, k) => { const c = BADGE_TINT[b.tint]; (badges.children[k * 2 + 1] as Graphics).tint = c; badgeLabels[k]!.tint = c; });
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
      const over = hover ? shipControlAt(d, last, hover.x, hover.y) : null;
      if (over) { const w = st.derived.width, tx = over.tile % w, ty = Math.floor(over.tile / w); marks.rect(tx * TILE_PX + 1, ty * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2).stroke({ width: 2, color: AMBER, alpha: 0.95 }); }
      // Health (duel-health spec §2): a bar above each character below full, and a downed character's pick-up ring and label.
      const drawn: { x: number; y: number }[] = [];
      for (const c of o.crew) {
        const was = crewPrev[c.pid], x = was ? (was.x + (c.x / TILE_PX - was.x) * alpha) * TILE_PX : c.x, y = was ? (was.y + (c.y / TILE_PX - was.y) * alpha) * TILE_PX : c.y;
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
        t.tint = WARN; t.position.set(Math.round(x), Math.round(y + TILE_PX * 0.5));
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
      const { shake, bob } = fx.draw({ state: st, grade: duelGradeInput(d), hit: duelHit(events) ? { whole: true } : null, sparks: damagedRepairPoints(d), working, artPx: 2 * fit.scale, starPx: 2 * fit0.scale }, presentDt, dt);
      world.position.set(fit.x + shake.x, fit.y + shake.y);   // only the interior world shakes; the readout column stays still
      crew.draw(st, alpha, undefined, bob, working);   // Crew3D spec section 4: the 3D crew pose from the same list
      boarders.draw(st, dt);
    },
    destroy() { memory.reset(); fx.destroy(); container.destroy({ children: true }); }   // the feel first: it frees its shared GraphicsContexts
  };
}
