// The duel's scene (H-1 spec §3, §4; H-2 spec §3): the console map view (Helm or Weapons) or the interior for the active
// character, and the effects and shake, on the renderer's Pixi stage with its sector children hidden. The readout, the
// banners, the end card and the map overlay are drawn by React through the UI sink (React UI spec §6). It draws from a
// DuelViewSource: the local runtime (Single player) or the online duel source (Multiplayer), so both modes show exactly
// the same screens.
import { Container } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { Renderer } from '../../render/renderer';
import { crtActive, crtScale } from '../../render/crt';
import type { EndView } from '../../render/duel/endModel';
import { CONSOLE_RESERVE, CONTACT_RESERVE } from '../../render/duel/consoleLayout';
import { consoleModel, consoleStation, type ConsoleStation } from '../../render/duel/consoleModel';
import { contactModel } from '../../render/duel/contactModel';
import { shipHud } from '../../render/duel/shipHudModel';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';
import { readoutHelp, readoutRows, type OtherStatus } from '../../render/duel/readoutModel';
import { createFx, pushEvents, recordTrails, resetFx, shakeOffset, stepFx, type ViewEvent } from '../../render/tactical/fxModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { pickShip, tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';
import { combatModel } from '../../render/tactical/weaponsModel';
import { worldToScreen, type Camera } from '../../render/tactical/camera';
import { screenPan, worldPan } from '../../audio/voices';
import type { AudioOut } from '../audio';
import { createDuelAudio } from './duelAudio';
import type { DuelSink } from '../../ui/sinks';
import { mapOverlayOf, type Banners, type MapOverlayView } from '../../ui/views';
import type { DuelState } from '../../sim/duel/state';
import { CREW_SLOT, Outcome, type Axes } from '../../sim/tactical/state';
import type { InteriorCamera } from '../../render/duel/interiorCamera';
import type { HeldFlags } from './input';
import type { ContactController } from './contactController';
import type { DuelView } from './runtime';

/** What the scene reads each frame (H-2 spec §3): the duel, its interpolation inputs, the cameras, the view and the readouts. */
export interface DuelViewSource {
  readonly duel: DuelState;
  readonly seed: number;
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera };
  /** The interior's zoom and follow (interior zoom spec), following `active()`'s character. */
  readonly interiorCamera: InteriorCamera;
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
  /** False while the view is a frozen copy (the online duel across a lost link): the audio reports no battle and no
   *  hum from it. Absent means always live (Single player). */
  live?(): boolean;
  /** Single player (Tab takes the other character) or the online duel. */
  readonly mode: 'single' | 'online';
  /** The duel is live: not paused and not ended locally; publication phase 'running' online. */
  running(): boolean;
  /** The merged held keys and console holds of the last frame (Artemis spec §6.1). */
  uiHeld(): HeldFlags;
  /** The Helm throttle level the console shows (Artemis spec §6.1): the local base of §5.4. */
  throttle(): number;
}
/** The frame's overlays: the pause banner (null: none), whether the tactical layer dims for it, the end card, and a
 *  one-line notice (the online start's YOU: HELM). */
export interface SceneOverlay { banner: string | null; layerPaused: boolean; end: EndView | null; notice?: string | null }

/** No console on the end card, under any pause banner or dimmed layer, or while the duel is not running (paused for
 *  any reason locally; any publication phase but `running` online) (Artemis spec §6.1). */
export function consoleHidden(d: DuelState, overlay: SceneOverlay, running: boolean): boolean {
  return !running || overlay.banner !== null || overlay.layerPaused || d.tactical.outcome !== Outcome.Running;
}

/** The banners and the map overlay the scene hands the UI (deviation 1: the tactical banner shows only on a map view). */
export function sceneUi(view: DuelView, overlay: SceneOverlay, pauseText: string, overlayView: MapOverlayView | null): { banners: Banners; overlay: MapOverlayView | null } {
  return {
    banners: {
      interior: overlay.banner !== null && (view === 'interior' || !overlay.layerPaused) ? overlay.banner : null,
      tactical: overlay.layerPaused && view !== 'interior' ? pauseText : null,
      notice: overlay.notice || null
    },
    overlay: view === 'interior' ? null : overlayView
  };
}

export interface DuelSceneOptions {
  seed: number; pauseText: string; ui: DuelSink; audio?: AudioOut;
  /** The contact window's controller (enemy ship window spec §6.1, §6.5): map clicks open it, `sync` applies the closing
   *  rules each frame, and every frame carries `contact`. Absent: no window and no `contact` key in the frame. */
  contact?: ContactController;
  /** The last left-button press on the canvas since the previous frame, in internal px (spec §6.2); drained every frame. */
  takeClick?: () => { x: number; y: number } | null;
}

export function createDuelScene(renderer: Renderer, options: DuelSceneOptions) {
  const viewport = { w: INTERNAL_W, h: INTERNAL_H }, font = renderer.assets.fontFamily;
  const hidden = renderer.app.stage.children.filter((child) => child.visible);
  for (const child of hidden) child.visible = false;   // world, enemy window, projectiles, callouts, HUD; shown again on dispose
  const root = new Container(), scene = new Container();
  const layer = createTacticalLayer({ fontFamily: font, viewport, seed: options.seed });
  let interior: InteriorView = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel);
  scene.addChild(layer.container, interior.container);
  root.addChild(scene);
  renderer.app.stage.addChild(root);
  const fx = createFx();
  const sound = options.audio ? createDuelAudio(options.audio) : null;   // Audio-i spec section 4b: both modes, so Single player is no longer silent
  let epoch: number | null = null;
  return {
    /** One frame from `source`; `dt` in seconds. Returns the station of the console drawn, or null when none (Artemis
     *  spec §6.2: the mode clears the console's holds when it changes). */
    draw(source: DuelViewSource, dt: number, overlay: SceneOverlay): ConsoleStation | null {
      if (epoch === null) { epoch = source.epoch(); if (source.seed !== options.seed) layer.reseed(source.seed); }   // the online duel learns its seed from the first publication
      if (source.epoch() !== epoch) {   // a new round (a restart before H-2): every view-owned cache starts again
        epoch = source.epoch();
        resetFx(fx); layer.reset(); layer.reseed(source.seed); sound?.reset();   // the next round's star field; a fresh audio baseline
        interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel); scene.addChildAt(interior.container, 1);
      }
      const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;
      // Everything the console changes follows whether it is drawn (Artemis spec §6.1): a paused or decided console view
      // falls back to the right-hand readout with its rows and help.
      const hidden = consoleHidden(d, overlay, source.running()), onConsole = !hidden && view !== 'interior';
      // Enemy ship window spec §6.5 steps 1 to 3: the station from the seat, this frame's map click, then the closing rules.
      const station = hidden ? null : consoleStation(d, source.active());
      const aimable = view !== 'interior' && (station === 'helm' || station === 'weapons');
      const click = options.takeClick?.() ?? null;   // drained every frame, so a click never waits for a later frame
      if (contact && click && aimable)
        contact.click(pickShip({ state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport }, click));
      const shown = contact
        ? contact.sync({ shown: aimable, station, target: d.tactical.systems[CREW_SLOT]!.target, active: (slot) => d.tactical.ships[slot]?.active === true, epoch: source.epoch() })
        : false;
      const t = performance.now() / 1000;   // the presentation clock: the map's blinks and the window's, frame for frame
      const events = source.drainEvents();
      pushEvents(fx, events);
      if (sound) {   // Audio-i spec section 4: the same events the effects use; pan from the screen on a map view, crew-relative inside
        const cam = view === 'interior' ? null : source.cameras[view], crew = d.tactical.ships[CREW_SLOT]!;
        sound.frame({ duel: d, events, axes: source.axes(), paused: source.paused(), live: source.live?.() ?? true,
          pan: (x, y) => (cam ? screenPan(worldToScreen(cam, viewport, x, y).x, viewport.w) : worldPan(x - crew.x)) });
      }
      stepFx(fx, source.paused() ? 0 : dt);
      recordTrails(fx, d.tactical, source.missilePrev, alpha);
      layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
      let overlayView: MapOverlayView | null = null;
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt, events, source.paused() ? 0 : dt, { camera: source.interiorCamera, active: source.active() });   // Art-i spec section 7: the light and feel hold while paused
      else {
        // Step 4: the map keeps its arrows and info line clear of the window while it is shown.
        const input = {
          state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport, console: view, axes: source.axes(),
          ships: [0, 1], paused: overlay.layerPaused, ...(onConsole ? { reserveLeft: CONSOLE_RESERVE.left, reserveRight: shown ? CONTACT_RESERVE : CONSOLE_RESERVE.right } : { reserveRight: READOUT_COLUMN }), spreadArrows: true, missilePrev: source.missilePrev, steer: source.steer(), fx
        } as const;
        const model = tacticalModel(input);
        layer.setCrt(crtScale(renderer.crt()));   // CRT map spec sections 3-4: the filter strength follows the setting
        layer.draw(model, combatModel(input), t);   // the blinks run on the presentation clock, paused or not
        overlayView = mapOverlayOf(model.overlay);
      }
      const consoleView = consoleModel({ duel: d, me: source.active(), mode: source.mode, hidden, held: source.uiHeld(), overlay: overlayView, throttle: source.throttle() });
      // Step 5: the contact view, only while shown.
      const open = contact?.state() ?? null;
      const contactView = shown && open && (station === 'helm' || station === 'weapons')
        ? contactModel({ state: d.tactical, ship: open.ship, aim: open.aim, station, t, weapons: consoleView?.weapons ?? null })
        : null;
      options.ui.frame({
        readout: { rows: readoutRows({ duel: d, mode: view, active: source.active(), other: source.otherStatus(), console: onConsole }), help: onConsole ? [] : readoutHelp(view) },
        end: overlay.end,
        console: consoleView,
        crt: crtActive(view),
        ...sceneUi(view, overlay, options.pauseText, overlayView),
        hud: consoleView?.station === 'ship' ? shipHud(d) : null,   // duel polish i spec §E: the SHIP view only
        ...(contact ? { contact: contactView } : {})
      });
      const shake = view === 'interior' ? { x: 0, y: 0 } : shakeOffset(fx);   // Art-i spec section 7: the interior shakes its own world; the console views keep the fx shake
      scene.position.set(shake.x, shake.y);
      return consoleView?.station ?? null;
    },
    dispose(): void {
      options.ui.clear();
      interior.destroy();
      renderer.app.stage.removeChild(root); root.destroy({ children: true });
      for (const child of hidden) child.visible = true;
    }
  };
}
export type DuelScene = ReturnType<typeof createDuelScene>;
