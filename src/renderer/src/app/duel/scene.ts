// The duel's scene (H-1 spec §3, §4; H-2 spec §3): the console map view (Helm or Weapons) or the interior for the active
// character, the readout column, the effects and shake, the pause banner and the end card, on the renderer's Pixi
// stage with its sector children hidden. It draws from a DuelViewSource: the local runtime (Single player) or the online
// duel source (Multiplayer), so both modes show exactly the same screens.
import { BitmapText, Container } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { Renderer } from '../../render/renderer';
import { createEndScreen, type EndView } from '../../render/duel/endScreen';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';
import { createReadoutPanel } from '../../render/duel/readoutPanel';
import { readoutHelp, readoutRows, type OtherStatus } from '../../render/duel/readoutModel';
import { createFx, pushEvents, recordTrails, resetFx, shakeOffset, stepFx, type ViewEvent } from '../../render/tactical/fxModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';
import { combatModel } from '../../render/tactical/weaponsModel';
import type { Camera } from '../../render/tactical/camera';
import { FONT_SIZE, TEXT } from '../../render/theme';
import type { DuelState } from '../../sim/duel/state';
import type { Axes } from '../../sim/tactical/state';
import type { DuelView } from './runtime';

/** What the scene reads each frame (H-2 spec §3): the duel, its interpolation inputs, the cameras, the view and the readouts. */
export interface DuelViewSource {
  readonly duel: DuelState;
  readonly seed: number;
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera };
  /** Changes when the view's caches must start again (a new round). */
  epoch(): number;
  active(): 0 | 1;
  view(): DuelView;
  otherStatus(): OtherStatus;
  axes(): Axes;
  steer(): number;
  alpha(): number;
  paused(): boolean;
  drainEvents(): ViewEvent[];
}
/** The frame's overlays: the pause banner (null: none), whether the tactical layer dims for it, the end card, and a
 *  one-line notice (the online start's YOU: HELM). */
export interface SceneOverlay { banner: string | null; layerPaused: boolean; end: EndView | null; notice?: string | null }

export function createDuelScene(renderer: Renderer, options: { seed: number; pauseText: string }) {
  const viewport = { w: INTERNAL_W, h: INTERNAL_H }, font = renderer.assets.fontFamily;
  const hidden = renderer.app.stage.children.filter((child) => child.visible);
  for (const child of hidden) child.visible = false;   // world, enemy window, projectiles, callouts, HUD; shown again on dispose
  const root = new Container(), scene = new Container();
  const layer = createTacticalLayer({ fontFamily: font, viewport, seed: options.seed, pauseText: options.pauseText });
  let interior: InteriorView = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel);
  const panel = createReadoutPanel({ fontFamily: font }), end = createEndScreen({ fontFamily: font });
  const banner = new BitmapText({ text: options.pauseText, style: { fontFamily: font, fontSize: FONT_SIZE * 1.5 } });
  banner.tint = TEXT; banner.anchor.set(0.5, 0.5); banner.position.set((INTERNAL_W - READOUT_COLUMN) / 2, 80); banner.visible = false;
  const notice = new BitmapText({ text: '', style: { fontFamily: font, fontSize: FONT_SIZE * 1.5 } });
  notice.tint = TEXT; notice.anchor.set(0.5, 0.5); notice.position.set((INTERNAL_W - READOUT_COLUMN) / 2, 130); notice.visible = false;
  scene.addChild(layer.container, interior.container, panel.container);
  root.addChild(scene, banner, notice, end.container);   // the shake moves the scene; the banners and the end card stay still
  renderer.app.stage.addChild(root);
  const fx = createFx();
  let epoch: number | null = null;
  return {
    /** One frame from `source`; `dt` in seconds. */
    draw(source: DuelViewSource, dt: number, overlay: SceneOverlay): void {
      if (epoch === null) { epoch = source.epoch(); if (source.seed !== options.seed) layer.reseed(source.seed); }   // the online duel learns its seed from the first publication
      if (source.epoch() !== epoch) {   // a new round (a restart before H-2): every view-owned cache starts again
        epoch = source.epoch();
        resetFx(fx); layer.reset(); layer.reseed(source.seed);   // the next round's star field
        interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel); scene.addChildAt(interior.container, 1);
      }
      const d = source.duel, view = source.view(), alpha = source.alpha();
      const events = source.drainEvents();
      pushEvents(fx, events);
      stepFx(fx, source.paused() ? 0 : dt);
      recordTrails(fx, d.tactical, source.missilePrev, alpha);
      layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt, events, source.paused() ? 0 : dt);   // Art-i spec section 7: the light and feel hold while paused
      else {
        const input = {
          state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport, console: view, axes: source.axes(),
          ships: [0, 1], paused: overlay.layerPaused, reserveRight: READOUT_COLUMN, spreadArrows: true, missilePrev: source.missilePrev, steer: source.steer(), fx
        } as const;
        layer.draw(tacticalModel(input), combatModel(input));
      }
      banner.visible = overlay.banner !== null && (view === 'interior' || !overlay.layerPaused);
      if (overlay.banner !== null) banner.text = overlay.banner;
      notice.visible = !!overlay.notice; notice.text = overlay.notice ?? '';
      panel.draw(readoutRows({ duel: d, mode: view, active: source.active(), other: source.otherStatus() }), readoutHelp(view));
      const shake = view === 'interior' ? { x: 0, y: 0 } : shakeOffset(fx);   // Art-i spec section 7: the interior shakes its own world; the console views keep the fx shake
      scene.position.set(shake.x, shake.y);
      end.draw(overlay.end);
    },
    dispose(): void {
      interior.destroy();
      renderer.app.stage.removeChild(root); root.destroy({ children: true });
      for (const child of hidden) child.visible = true;
    }
  };
}
export type DuelScene = ReturnType<typeof createDuelScene>;
