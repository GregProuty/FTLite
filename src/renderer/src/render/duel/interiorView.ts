// The duel's interior view (H-1 spec §8): the duel ship (the Hound) drawn by today's interior layers (tiles, effects, room icons,
// consoles, crew, boarders), composed as render/renderer.ts composes them, without the sector enemy window, projectiles,
// callouts or HUD, plus the duel's damage overlay. It owns its RenderMemory; a restart destroys it and builds a new one.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../../shared/resolution';
import { Stable } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import type { GameAssets } from '../assets';
import { createBoarderLayer } from '../boarderLayer';
import { createConsoleLayer } from '../consoleLayer';
import { createBattlemapLayer } from '../battlemapLayer';
import { battlemapFor, fitRect } from '../battlemapModel';
import { createPropLayer } from '../propLayer';
import { createCrewLayer } from '../crewSprites';
import { createEffectsLayer } from '../effects';
import { createRenderMemory, type RenderMemory } from '../memory';
import { createIconLayer } from '../roomIcons';
import { AMBER, DIM, FONT_NATIVE, TEXT, WARN } from '../theme';
import { createTileLayer } from '../tiles';
import { duelFit, interiorOverlay, INTERIOR_BAND } from './interiorModel';
import { createInteriorFeel } from '../interiorFeel';
import { DEFAULT_FEEL, type FeelSetting } from '../feel';
import { duelGradeInput } from '../gradeModel';
import { duelHit } from '../impactModel';
import { damagedRepairPoints, duelWorking } from '../particles/sources';
import type { ViewEvent } from '../tactical/fxModel';
import { featureReady } from '../fallback';

export interface InteriorView {
  container: Container;
  /** The ship's world container (scaled and placed by the fit), exposed for tests. */
  world: Container;
  memory: RenderMemory;
  /** `crewPrev`: each player's character position at the previous tick, in tiles, for interpolation. `events`: the view
   *  events drained this frame (the feed the tactical effects read); a hit on the crew ship flashes and shakes the interior.
   *  `presentDt`: the light and feel's seconds this frame (Art-i spec section 7), 0 while the duel is paused so the
   *  particles, the pulse and the ambient life hold; it defaults to `dt`, which the tiles and boarders keep. */
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number, events?: readonly ViewEvent[], presentDt?: number): void;
  destroy(): void;
}

/** The room tint by damage level (amber, red), and darker shades of both for the marker and its label on the light floor. */
const TINT: readonly number[] = [0, AMBER, WARN], MARK: readonly number[] = [0, 0x8a5a00, 0xa8281c];

/** `stageScale`: the letterbox's stage scale, read every frame so the fit snaps to whole screen pixels per art pixel (Art-i spec section 4); tests leave it at 1.
 *  `feel`: the feel setting (Art-i spec section 7), read every frame; tests leave it at full. */
export function createInteriorView(assets: GameAssets, stageScale: () => number = () => 1, feel: () => FeelSetting = () => DEFAULT_FEEL): InteriorView {
  const container = new Container(), world = new Container();
  const missing = new Set(assets.missing);
  const fx = createInteriorFeel({   // Art-i spec sections 5-8; Art-ii: the bought consoles and blasts
    world, band: INTERIOR_BAND, feel, consoleArt: featureReady(missing, 'consoleArt'),
    blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined,
    painted: (id) => battlemapFor(id, missing) !== null   // the art spike: painted fire, blasts and particles on a painted ship
  });
  container.addChild(fx.starfield, world);   // the starfield under the world, filling INTERIOR_BAND
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory), effects = createEffectsLayer(assets, memory), icons = createIconLayer();
  const props = createPropLayer(assets);   // Art-iii spec section 4: the set dressing, directly over the tiles
  const desks = createConsoleLayer(assets), crew = createCrewLayer(assets, memory), boarders = createBoarderLayer(assets);
  const damage = new Graphics(), marks = new Graphics();
  const labels = Array.from({ length: 3 }, () => {
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
  // Back to front as renderer.ts (Art-i spec section 5): the battlemap painting (Art-iv), tiles, the props (Art-iii), grade, effects below, room icons, desks, then the duel's
  // damage tint under the crew, crew, boarders (always empty in the duel), effects above, the lights, and the markers and
  // labels on top so the lights never wash them out.
  const battlemap = createBattlemapLayer(assets);
  world.addChild(battlemap.container, tiles.container, props.container, fx.grade, effects.below, icons.container, desks.container, damage, crew.container, boarders.container, effects.above, fx.lights, marks, ...labels);
  desks.container.addChild(fx.fixtures); effects.below.addChild(fx.paintedBelow); effects.above.addChild(fx.above, fx.paintedAbove);
  return {
    container, world, memory,
    draw(d, crewPrev, alpha, dt, events = [], presentDt = dt) {
      const st = d.interior, fit = duelFit(st.derived.width, st.derived.height, stageScale(), fitRect(st.layout.id, st.derived.width, st.derived.height, missing));
      world.scale.set(fit.scale);
      st.crew.forEach((eid, pid) => { const p = crewPrev[pid]; if (p) memory.prev.set(Stable.id[eid]!, p); });
      battlemap.draw(st); tiles.update(st, dt); props.draw(st); icons.update(st); desks.draw(st); effects.draw(st);
      const o = interiorOverlay(d);
      damage.clear(); marks.clear();
      for (const t of o.tints) for (const p of t.tiles) damage.rect(p.x, p.y, TILE_PX, TILE_PX).fill({ color: TINT[t.level]!, alpha: 0.28 });
      for (const c of o.consoles) marks.rect(c.x + 1, c.y + 1, TILE_PX - 2, TILE_PX - 2).stroke({ width: 2, color: c.free ? AMBER : DIM, alpha: c.free ? 0.95 : 0.4 });
      labels.forEach((t, k) => {
        const m = o.markers[k];
        t.visible = m !== undefined;
        if (!m) return;
        const colour = MARK[m.level]!, r = TILE_PX * 0.42;
        marks.poly([m.x, m.y - r, m.x + r, m.y, m.x, m.y + r, m.x - r, m.y]).stroke({ width: 2, color: colour });
        if (m.progress > 0) marks.moveTo(m.x, m.y).arc(m.x, m.y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + m.progress * Math.PI * 2).closePath().fill({ color: TEXT, alpha: 0.8 });
        if (t.text !== m.label) t.text = m.label;
        t.tint = colour; t.position.set(Math.round(m.x), Math.round(m.y + TILE_PX * 0.5));
      });
      // Light and feel: the duel's hull alert, a hit flashes the whole interior, sparks at damaged repair rooms, repair work.
      const { shake, bob } = fx.draw({ state: st, grade: duelGradeInput(d), hit: duelHit(events) ? { whole: true } : null, sparks: damagedRepairPoints(d), working: duelWorking(d), artPx: 2 * fit.scale }, presentDt, dt);
      world.position.set(fit.x + shake.x, fit.y + shake.y);   // only the interior world shakes; the readout column stays still
      crew.draw(st, alpha, undefined, bob);
      boarders.draw(st, dt);
    },
    destroy() { memory.reset(); fx.destroy(); container.destroy({ children: true }); }   // the feel first: it frees its shared GraphicsContexts
  };
}
