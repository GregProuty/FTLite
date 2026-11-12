import { Application, Container } from 'pixi.js';
import { worldFit } from './worldFit';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable } from '../sim/components';
import { computeLetterbox } from './letterbox';
import type { GameAssets } from './assets';
import { createRenderMemory } from './memory';
import { createTileLayer } from './tiles';
import { createEffectsLayer } from './effects';
import { createIconLayer } from './roomIcons';
import { createCrewLayer } from './crewSprites';
import { createBoarderLayer } from './boarderLayer';
import { createProjectileLayer } from './projectiles';


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
  const projectiles = createProjectileLayer();   // spec Demo-vii section 2: over the ship (internal pixels), under the HUD
  app.stage.addChild(world, projectiles.container, hud);
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory);
  const effects = createEffectsLayer(assets, memory);
  const icons = createIconLayer();
  const crew = createCrewLayer(assets, memory);
  const boarders = createBoarderLayer();
  world.addChild(tiles.container, effects.below, icons.container, crew.container, boarders.container, effects.above);
  let lastDraw: number | null = null;

  return {
    app, world, hud, assets,
    resize(winW, winH) {
      const lb = computeLetterbox(winW, winH, INTERNAL_W, INTERNAL_H);
      app.renderer.resize(winW, winH);
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
    },
    reset() { memory.reset(); projectiles.reset(); lastDraw = null; },   // session.start (a new run); the app has no runtime snapshot load
    recordPrev(state) {
      for (const eid of state.crew) memory.prev.set(Stable.id[eid]!, { x: Position.x[eid]!, y: Position.y[eid]! });
    },
    draw(state, alpha) {
      const d = state.derived;
      const now = performance.now();
      const dt = lastDraw === null ? 0 : Math.min(0.1, (now - lastDraw) / 1000); lastDraw = now;
      const fit = worldFit(d.width, d.height); world.scale.set(fit.scale);
      const shake = projectiles.draw(state, fit, dt);
      world.position.set(fit.x + shake.x, fit.y + shake.y); projectiles.container.position.set(shake.x, shake.y);
      tiles.update(state, dt);
      icons.update(state);
      effects.draw(state);
      crew.draw(state, alpha);
      boarders.draw(state);
    }
  };
}
