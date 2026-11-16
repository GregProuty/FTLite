// The duel's interior view (H-1 spec §8): the Cutter drawn by today's interior layers (tiles, effects, room icons,
// consoles, crew, boarders), composed as render/renderer.ts composes them, without the sector enemy window, projectiles,
// callouts or HUD, plus the duel's damage overlay. It owns its RenderMemory; a restart destroys it and builds a new one.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../../shared/resolution';
import { Stable } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import type { GameAssets } from '../assets';
import { createBoarderLayer } from '../boarderLayer';
import { createConsoleLayer } from '../consoleLayer';
import { createCrewLayer } from '../crewSprites';
import { createEffectsLayer } from '../effects';
import { createRenderMemory, type RenderMemory } from '../memory';
import { createIconLayer } from '../roomIcons';
import { AMBER, DIM, FONT_NATIVE, TEXT, WARN } from '../theme';
import { createTileLayer } from '../tiles';
import { duelFit, interiorOverlay } from './interiorModel';

export interface InteriorView {
  container: Container;
  /** The ship's world container (scaled and placed by the fit), exposed for tests. */
  world: Container;
  memory: RenderMemory;
  /** `crewPrev`: each player's character position at the previous tick, in tiles, for interpolation. */
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number): void;
  destroy(): void;
}

/** The room tint by damage level (amber, red), and darker shades of both for the marker and its label on the light floor. */
const TINT: readonly number[] = [0, AMBER, WARN], MARK: readonly number[] = [0, 0x8a5a00, 0xa8281c];

/** `stageScale`: the letterbox's stage scale, read every frame so the fit snaps to whole screen pixels per art pixel (Art-i spec section 4); tests leave it at 1. */
export function createInteriorView(assets: GameAssets, stageScale: () => number = () => 1): InteriorView {
  const container = new Container(), world = new Container();
  container.addChild(world);
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory), effects = createEffectsLayer(assets, memory), icons = createIconLayer();
  const desks = createConsoleLayer(), crew = createCrewLayer(assets, memory), boarders = createBoarderLayer(assets);
  const damage = new Graphics(), marks = new Graphics();
  const labels = Array.from({ length: 3 }, () => {
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
  // Back to front as renderer.ts: tiles, effects below, room icons, desks, then the duel's damage tint under the crew,
  // crew, boarders (always empty in the duel), effects above, and the markers and labels on top.
  world.addChild(tiles.container, effects.below, icons.container, desks.container, damage, crew.container, boarders.container, effects.above, marks, ...labels);
  return {
    container, world, memory,
    draw(d, crewPrev, alpha, dt) {
      const st = d.interior, fit = duelFit(st.derived.width, st.derived.height, stageScale());
      world.scale.set(fit.scale); world.position.set(fit.x, fit.y);
      st.crew.forEach((eid, pid) => { const p = crewPrev[pid]; if (p) memory.prev.set(Stable.id[eid]!, p); });
      tiles.update(st, dt); icons.update(st); desks.draw(st); effects.draw(st);
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
      crew.draw(st, alpha);
      boarders.draw(st, dt);
    },
    destroy() { memory.reset(); container.destroy({ children: true }); }
  };
}
