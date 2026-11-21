import type { CardUiState } from '../clientControl/cardController';
import { Application, Container } from 'pixi.js';
import { worldFit, WORLD_BAND } from './worldFit';
import { createBattlemapLayer } from './battlemapLayer';
import { battlemapFor, fitRect } from './battlemapModel';
import { INTERNAL_W, INTERNAL_H, TILE_PX, REFERENCE_STAGE, type StageSize } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable } from '../sim/components';
import { stageFit } from './letterbox';
import type { GameAssets } from './assets';
import { createRenderMemory } from './memory';
import { createTileLayer } from './tiles';
import { createEffectsLayer } from './effects';
import { createIconLayer } from './roomIcons';
import { createCrewLayer } from './crewSprites';
import { DEFAULT_CREW3D, type Crew3dSetting } from './crew3dModel';
import { createBoarderLayer } from './boarderLayer';
import { createMagazineLayer } from './torpedoLayer';
import { createConsoleLayer } from './consoleLayer';
import { createPropLayer } from './propLayer';
import { createProjectileLayer } from './projectiles';
import { createEnemyWindowLayer } from './enemyWindow';
import { enemyWindowModel, stepWindowAnim, freshWindowAnim, windowShown, windowRoomCentre, WINDOW, hitFlashOf } from './enemyWindowModel';
import { EnemyRoom } from '../sim/enemy';
import { createCalloutLayer } from './callouts';
import type { Bubble } from './calloutModel';
import type { PresentationPoint } from '../../../network/state/timeline';
import { createInteriorFeel } from './interiorFeel';
import { backdropOption } from './twinkleLayer';
import { DEFAULT_FEEL, type FeelSetting } from './feel';
import { DEFAULT_CRT, type CrtSetting } from './crt';
import { DEFAULT_SHAKE, type ShakeSetting } from './shake';
import { DEFAULT_MAP_GRID, type MapGridSetting } from './tactical/mapGrid';
import { sectorGradeInput } from './gradeModel';
import { sectorHits } from './impactModel';
import { failedStationPoints, sectorWorking, watchRepair } from './particles/sources';
import { featureReady } from './fallback';


export interface Renderer {
  app: Application; world: Container; assets: GameAssets;
  resize(winW: number, winH: number): void;
  /** The smooth stage scale set by the last resize (1 before the first; UI round §2.1); the duel interior reads it for its fit (Art-i spec section 4). */
  stageScale(): number;
  /** UI round §2.1: the stage size in internal px set by the last resize (the 1280x720 reference before the first). */
  stage(): StageSize;
  /** The feel setting (Art-i spec section 7), set at boot from storage (app/feelBoot.ts); the duel interior reads it too. */
  feel(): FeelSetting;
  setFeel(setting: FeelSetting): void;
  /** The CRT strength setting (CRT map spec section 4), set at boot from storage (app/crtBoot.ts); the console views read it each frame. */
  crt(): CrtSetting;
  setCrt(setting: CrtSetting): void;
  /** Crew3D spec section 4: the 3D crew art or the old art (app/crew3dBoot.ts; F8 in dev builds); absent reads 'on'. */
  crew3d?(): Crew3dSetting;
  setCrew3d?(setting: Crew3dSetting): void;
  /** Feel-i: the console maps' screen shake setting (Settings), read by the duel scene each frame; absent reads 'full'. */
  shake?(): ShakeSetting;
  setShake?(setting: ShakeSetting): void;
  /** The console map's grid setting (Settings), read by the map views each frame; absent reads the default. */
  mapGrid?(): MapGridSetting;
  setMapGrid?(setting: MapGridSetting): void;
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
  const projectiles = createProjectileLayer();   // spec Demo-vii section 2: over the ship (internal pixels), under the HUD
  const enemyWindow = createEnemyWindowLayer({ fontFamily: assets.fontFamily, fire: assets.has('fire.loop') ? assets.animation('fire.loop') : null, panel: null });   // the themed panel (spec Demo-x-c section 1)
  let crew3dSetting: Crew3dSetting = DEFAULT_CREW3D;
  const crew3dOn = (): boolean => crew3dSetting === 'on';
  const callouts = createCalloutLayer(assets, crew3dOn);
  app.stage.addChild(world, enemyWindow.container, projectiles.container, callouts.container);   // spec Demo-viii amendment R2: world, enemy window, projectiles, HUD; the callout bubbles (spec Coop-i section 3) just under the HUD
  let anim = freshWindowAnim();
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory);
  const effects = createEffectsLayer(assets, memory);
  const icons = createIconLayer();
  const crew = createCrewLayer(assets, memory, crew3dOn);
  const boarders = createBoarderLayer(assets, crew3dOn);
  const consoleDesks = createConsoleLayer(assets);   // spec Demo-xii section 1: a desk at every station, under the crew (Art-ii: the bought consoles)
  const magazine = createMagazineLayer();   // spec Coop-ii section 2: the magazine tile, under the crew
  const props = createPropLayer(assets);    // Art-iii spec section 4: the set dressing, directly over the tiles
  let feelSetting: FeelSetting = DEFAULT_FEEL, crtSetting: CrtSetting = DEFAULT_CRT, shakeSetting: ShakeSetting = DEFAULT_SHAKE, mapGridSetting: MapGridSetting = DEFAULT_MAP_GRID;
  const missing = new Set(assets.missing);
  const feel = createInteriorFeel({   // Art-i spec sections 5-8; Art-ii: the bought consoles and blasts
    world, band: WORLD_BAND, feel: () => feelSetting, consoleArt: featureReady(missing, 'consoleArt'), backdrop: backdropOption(assets),   // Art-v: the painted backdrop
    blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined,
    painted: (id) => battlemapFor(id, missing) !== null   // the art spike: painted fire, blasts and particles on a painted ship
  });
  // Art-i spec section 5: (Art-iv: battlemap,) tiles, (Art-iii: props,) grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights.
  const battlemap = createBattlemapLayer(assets);
  world.addChild(battlemap.container, tiles.container, props.container, feel.grade, effects.below, icons.container, consoleDesks.container, magazine.container, crew.container, boarders.container, effects.above, feel.lights);
  consoleDesks.container.addChild(feel.fixtures); effects.below.addChild(feel.paintedBelow); effects.above.addChild(feel.above, feel.paintedAbove);
  app.stage.addChildAt(feel.starfield, 0);   // the starfield under the world, filling WORLD_BAND (spec section 8); Art-v: or the painted backdrop over the whole stage
  let lastDraw: number | null = null, stage = 1, seenImpact: Int32Array | null = null;
  let size: StageSize = REFERENCE_STAGE;

  return {
    app, world, assets,
    resize(winW, winH) {
      const f = stageFit(winW, winH);   // UI round §2.1: the stage follows the window at a smooth scale
      app.renderer.resize(winW, winH);
      app.stage.scale.set(f.scale); app.stage.position.set(f.offsetX, f.offsetY);
      // The snapped world fit follows the stage scale, so a change moves the ship: shots in flight cached paths to the old
      // room centres (presentation only). Not gated on the size alone: a same-size stage at a new scale re-snaps too.
      if (f.w !== size.w || f.h !== size.h || f.scale !== stage) { stage = f.scale; size = { w: f.w, h: f.h }; projectiles.reset(); }
    },
    stageScale: () => stage,
    stage: () => size,
    feel: () => feelSetting,
    setFeel(setting) { feelSetting = setting; },
    crt: () => crtSetting,
    setCrt(setting) { crtSetting = setting; },
    crew3d: () => crew3dSetting,
    setCrew3d(setting) { crew3dSetting = setting; },
    shake: () => shakeSetting,
    setShake(setting) { shakeSetting = setting; },
    mapGrid: () => mapGridSetting,
    setMapGrid(setting) { mapGridSetting = setting; },
    reset() { memory.reset(); projectiles.reset(); enemyWindow.reset(); feel.reset(); anim = freshWindowAnim(); lastDraw = null; seenImpact = null; },   // session.start (a new run); the app has no runtime snapshot load
    recordPrev(state) {
      for (const eid of state.crew) memory.prev.set(Stable.id[eid]!, { x: Position.x[eid]!, y: Position.y[eid]! });
    },
    draw(state, alpha, bubbles = [], ui, presentation, paused = false) {
      const d = state.derived;
      const now = performance.now();
      const dt = lastDraw === null ? 0 : Math.min(0.1, (now - lastDraw) / 1000); lastDraw = now;
      const fit = worldFit(d.width, d.height, stage, fitRect(state.layout.id, d.width, d.height, missing)); world.scale.set(fit.scale);
      anim = stepWindowAnim(anim, state);
      const view = enemyWindowModel(state, state.tick + alpha, anim), shown = windowShown(state, view);
      enemyWindow.draw(view, shown, dt, hitFlashOf(state, view));
      projectiles.draw(state, fit, dt, { shotOrigin: shown ? windowRoomCentre(EnemyRoom.Weapons) : null, target: (slot) => { if (!shown || !view.bolt || view.bolt.slot !== slot || !view.bolt.to) return null; return { x: WINDOW.x + view.slideX + view.bolt.to.x, y: WINDOW.y + view.shipDY + view.bolt.to.y }; } });
      battlemap.draw(state);
      tiles.update(state, dt);
      props.draw(state);
      icons.update(state);
      consoleDesks.draw(state);
      magazine.draw(state);
      effects.draw(state, ui);
      // Light and feel (Art-i spec sections 5-8): this frame's hit rooms, the working crew, the failed stations.
      const hits = sectorHits(state.rooms.impactTick, state.tick, seenImpact); seenImpact = hits.seen;
      watchRepair(memory.repair, state);
      const working = sectorWorking(state, memory.repair);
      const { shake, bob } = feel.draw({ state, grade: sectorGradeInput(state), hit: { rooms: hits.rooms }, sparks: failedStationPoints(state), working, artPx: 2 * fit.scale }, paused ? 0 : dt, dt);
      world.position.set(fit.x + shake.x, fit.y + shake.y); projectiles.container.position.set(shake.x, shake.y);   // the shake moves the world and the projectiles, as before
      crew.draw(state, alpha, presentation, bob, working, { dt: paused ? 0 : dt, paused });   // the 3D crew hold their pose and frame while paused
      boarders.draw(state, dt, paused ? 0 : dt);
      callouts.draw(state, bubbles, { scale: fit.scale, x: fit.x + shake.x, y: fit.y + shake.y });
    }
  };
}
