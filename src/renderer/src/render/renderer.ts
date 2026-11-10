import { Application, Container } from 'pixi.js';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable } from '../sim/components';
import { computeLetterbox } from './letterbox';
import type { GameAssets } from './assets';
import { createRenderMemory } from './memory';
import { createTileLayer } from './tiles';
import { createEffectsLayer } from './effects';
import { createCrewLayer, CREW_COLORS } from './crewSprites';

export { CREW_COLORS };

export interface Renderer {
  app: Application; world: Container; hud: Container; assets: GameAssets;
  resize(winW: number, winH: number): void;
  reset(): void;
  recordPrev(state: SimState): void;
  draw(state: SimState, alpha: number): void;
}

export async function createRenderer(assets: GameAssets): Promise<Renderer> {
  const app = new Application();
  await app.init({ width: INTERNAL_W, height: INTERNAL_H, background: 0x05060a, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);
  const world = new Container(); world.isRenderGroup = true;
  const hud = new Container(); hud.isRenderGroup = true;
  app.stage.addChild(world, hud);
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory);
  const effects = createEffectsLayer(assets, memory);
  const crew = createCrewLayer(assets, memory);
  world.addChild(tiles.container, effects.below, crew.container, effects.above);
  let lastDraw: number | null = null;

  return {
    app, world, hud, assets,
    resize(winW, winH) {
      const lb = computeLetterbox(winW, winH, INTERNAL_W, INTERNAL_H);
      app.renderer.resize(winW, winH);
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
    },
    reset() { memory.reset(); lastDraw = null; },
    recordPrev(state) {
      for (const eid of state.crew) memory.prev.set(Stable.id[eid]!, { x: Position.x[eid]!, y: Position.y[eid]! });
    },
    draw(state, alpha) {
      const d = state.derived;
      const now = performance.now();
      const dt = lastDraw === null ? 0 : Math.min(0.1, (now - lastDraw) / 1000); lastDraw = now;
      world.position.set(Math.floor((INTERNAL_W - d.width * TILE_PX) / 2), Math.floor((INTERNAL_H - d.height * TILE_PX) / 2));
      tiles.update(state, dt);
      effects.draw(state);
      crew.draw(state, alpha);
    }
  };
}
