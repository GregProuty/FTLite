import type { CardUiState } from '../clientControl/cardController';
import { Application, Container } from 'pixi.js';
import { worldFit, WORLD_BAND } from './worldFit';
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
import { createMagazineLayer } from './torpedoLayer';
import { createConsoleLayer } from './consoleLayer';
import { createProjectileLayer } from './projectiles';
import { createEnemyWindowLayer } from './enemyWindow';
import { enemyWindowModel, stepWindowAnim, freshWindowAnim, windowShown, windowRoomCentre, WINDOW, hitFlashOf } from './enemyWindowModel';
import { EnemyRoom } from '../sim/enemy';
import { createCalloutLayer } from './callouts';
import type { Bubble } from './calloutModel';
import type { PresentationPoint } from '../../../network/state/timeline';
import { createInteriorFeel } from './interiorFeel';
import { DEFAULT_FEEL, type FeelSetting } from './feel';
import { sectorGradeInput } from './gradeModel';
import { sectorHits } from './impactModel';
import { failedStationPoints, sectorWorking, watchRepair } from './particles/sources';
import { featureReady } from './fallback';


export interface Renderer {
  app: Application; world: Container; hud: Container; assets: GameAssets;
  resize(winW: number, winH: number): void;
  /** The letterbox stage scale set by the last resize (1 before the first); the duel interior reads it for its fit (Art-i spec section 4). */
  stageScale(): number;
  /** The feel setting (Art-i spec section 7), set at boot from storage (app/feelBoot.ts); the duel interior reads it too. */
  feel(): FeelSetting;
  setFeel(setting: FeelSetting): void;
  reset(): void;
  recordPrev(state: SimState): void;
  /** `paused`: the session is paused (Art-i spec section 7): the light and feel get a presentation dt of 0, so the particles,
   *  the alert pulse and the ambient life hold; the doors, projectiles and enemy window keep the real dt as before. */
  draw(state: SimState, alpha: number, bubbles?: readonly Bubble[], ui?: CardUiState, presentation?: readonly PresentationPoint[], paused?: boolean): void;
}

export async function createRenderer(assets: GameAssets): Promise<Renderer> {
  const app = new Application();
  await app.init({ width: INTERNAL_W, height: INTERNAL_H, background: 0x05060a, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);
  const world = new Container(); world.isRenderGroup = true;
  const hud = new Container(); hud.isRenderGroup = true;
  const projectiles = createProjectileLayer();   // spec Demo-vii section 2: over the ship (internal pixels), under the HUD
  const enemyWindow = createEnemyWindowLayer({ fontFamily: assets.fontFamily, fire: assets.has('fire.loop') ? assets.animation('fire.loop') : null, panel: null });   // the themed panel (spec Demo-x-c section 1)
  const callouts = createCalloutLayer(assets);
  app.stage.addChild(world, enemyWindow.container, projectiles.container, callouts.container, hud);   // spec Demo-viii amendment R2: world, enemy window, projectiles, HUD; the callout bubbles (spec Coop-i section 3) just under the HUD
  let anim = freshWindowAnim();
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory);
  const effects = createEffectsLayer(assets, memory);
  const icons = createIconLayer();
  const crew = createCrewLayer(assets, memory);
  const boarders = createBoarderLayer(assets);
  const consoleDesks = createConsoleLayer(assets);   // spec Demo-xii section 1: a desk at every station, under the crew (Art-ii: the bought consoles)
  const magazine = createMagazineLayer();   // spec Coop-ii section 2: the magazine tile, under the crew
  let feelSetting: FeelSetting = DEFAULT_FEEL;
  const missing = new Set(assets.missing);
  const feel = createInteriorFeel({   // Art-i spec sections 5-8; Art-ii: the bought consoles and blasts
    world, band: WORLD_BAND, feel: () => feelSetting, consoleArt: featureReady(missing, 'consoleArt'),
    blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined
  });
  // Art-i spec section 5: tiles, grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights.
  world.addChild(tiles.container, feel.grade, effects.below, icons.container, consoleDesks.container, magazine.container, crew.container, boarders.container, effects.above, feel.lights);
  consoleDesks.container.addChild(feel.fixtures); effects.above.addChild(feel.above);
  app.stage.addChildAt(feel.starfield, 0);   // the starfield under the world, filling WORLD_BAND (spec section 8)
  let lastDraw: number | null = null, stage = 1, seenImpact: Int32Array | null = null;

  return {
    app, world, hud, assets,
    resize(winW, winH) {
      const lb = computeLetterbox(winW, winH, INTERNAL_W, INTERNAL_H);
      app.renderer.resize(winW, winH);
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
      if (lb.scale !== stage) { stage = lb.scale; projectiles.reset(); }   // the snapped fit moves the ship: shots in flight cached paths to the old room centres (presentation only)
    },
    stageScale: () => stage,
    feel: () => feelSetting,
    setFeel(setting) { feelSetting = setting; },
    reset() { memory.reset(); projectiles.reset(); enemyWindow.reset(); feel.reset(); anim = freshWindowAnim(); lastDraw = null; seenImpact = null; },   // session.start (a new run); the app has no runtime snapshot load
    recordPrev(state) {
      for (const eid of state.crew) memory.prev.set(Stable.id[eid]!, { x: Position.x[eid]!, y: Position.y[eid]! });
    },
    draw(state, alpha, bubbles = [], ui, presentation, paused = false) {
      const d = state.derived;
      const now = performance.now();
      const dt = lastDraw === null ? 0 : Math.min(0.1, (now - lastDraw) / 1000); lastDraw = now;
      const fit = worldFit(d.width, d.height, stage); world.scale.set(fit.scale);
      anim = stepWindowAnim(anim, state);
      const view = enemyWindowModel(state, state.tick + alpha, anim), shown = windowShown(state, view);
      enemyWindow.draw(view, shown, dt, hitFlashOf(state, view));
      projectiles.draw(state, fit, dt, { shotOrigin: shown ? windowRoomCentre(EnemyRoom.Weapons) : null, target: (slot) => { if (!shown || !view.bolt || view.bolt.slot !== slot || !view.bolt.to) return null; return { x: WINDOW.x + view.slideX + view.bolt.to.x, y: WINDOW.y + view.shipDY + view.bolt.to.y }; } });
      tiles.update(state, dt);
      icons.update(state);
      consoleDesks.draw(state);
      magazine.draw(state);
      effects.draw(state, ui);
      // Light and feel (Art-i spec sections 5-8): this frame's hit rooms, the working crew, the failed stations.
      const hits = sectorHits(state.rooms.impactTick, state.tick, seenImpact); seenImpact = hits.seen;
      watchRepair(memory.repair, state);
      const { shake, bob } = feel.draw({ state, grade: sectorGradeInput(state), hit: { rooms: hits.rooms }, sparks: failedStationPoints(state), working: sectorWorking(state, memory.repair), artPx: 2 * fit.scale }, paused ? 0 : dt, dt);
      world.position.set(fit.x + shake.x, fit.y + shake.y); projectiles.container.position.set(shake.x, shake.y);   // the shake moves the world and the projectiles, as before
      crew.draw(state, alpha, presentation, bob);
      boarders.draw(state, dt);
      callouts.draw(state, bubbles, { scale: fit.scale, x: fit.x + shake.x, y: fit.y + shake.y });
    }
  };
}
