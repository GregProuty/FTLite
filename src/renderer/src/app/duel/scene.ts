// The duel's scene (H-1 spec §3, §4; H-2 spec §3): the console map view (Helm or Weapons) or the interior for the active
// character, and the effects and shake, on the renderer's Pixi stage with its sector children hidden. The readout, the
// banners, the end card and the map overlay are drawn by React through the UI sink (React UI spec §6). It draws from a
// DuelViewSource: the local runtime (Single player) or the online duel source (Multiplayer), so both modes show exactly
// the same screens.
import { Container } from 'pixi.js';
import { enemyHostile } from '../../sim/tactical/science';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { Renderer } from '../../render/renderer';
import { crtActive, crtScale } from '../../render/crt';
import type { EndView } from '../../render/duel/endModel';
import { CONSOLE_RESERVE, CONTACT_RESERVE, SIDE, STATUS_RESERVE, TABS_RIGHT } from '../../render/duel/consoleLayout';
import { consoleModel, consoleStation, type ConsoleStation } from '../../render/duel/consoleModel';
import { contactModel } from '../../render/duel/contactModel';
import { hoverReadout } from '../../render/duel/scienceModel';
import { shipHud } from '../../render/duel/shipHudModel';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';
import { readoutHelp, readoutRows, type OtherStatus } from '../../render/duel/readoutModel';
import { createFx, fxDt, pushEvents, pushKill, recordTrails, resetFx, shakeOffset, stepFx, trackSolution, type ViewEvent } from '../../render/tactical/fxModel';
import { gunnerPresent, laserSituation, linedUp } from '../../render/duel/situationModel';
import { countSit, createSitTracker, frameZoom, sitCard, trackSit, type SitSeat } from '../../render/duel/sitModel';
import { shakeScale } from '../../render/shake';
import { flashesFor, pushHits } from '../../render/tactical/hitModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { pushRockFx, pushRockShakes } from '../../render/tactical/rockFx';
import { interpolatedShip, pickContact, pickRock, tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';
import { combatModel } from '../../render/tactical/weaponsModel';
import { screenToWorld, worldToScreen, zoomTo, type Camera } from '../../render/tactical/camera';
import { screenPan, worldPan } from '../../audio/voices';
import type { AudioOut } from '../audio';
import { createDuelAudio } from './duelAudio';
import { crewLife } from '../../render/duel/healFxModel';
import type { DuelSink } from '../../ui/sinks';
import { mapOverlayOf, type Banners, type MapOverlayView } from '../../ui/views';
import type { DuelState } from '../../sim/duel/state';
import { classOf, Contact, CREW_SLOT, missileOf, Outcome, Room, targetOf, type Axes } from '../../sim/tactical/state';
import type { InteriorCamera } from '../../render/duel/interiorCamera';
import type { AimSample, HeldFlags } from './input';
import type { ContactController } from './contactController';
import type { MapRequests } from './mapRequests';
import { headingOf, pickRadius } from '../../render/tactical/tacticalModel';
import { flightAlert, type RefusedControl } from '../../render/duel/situationModel';
import { pingAllowed, pushPing, stepPings, type Ping, type PingRequest } from '../../render/duel/pingModel';
import type { TorpedoTone } from './duelAudio';
import type { DuelView } from './runtime';

/** What the scene reads each frame (H-2 spec §3): the duel, its interpolation inputs, the cameras, the view and the readouts. */
export interface DuelViewSource {
  readonly duel: DuelState;
  readonly seed: number;
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera; readonly science: Camera };
  /** The interior's zoom and follow (interior zoom spec), following `active()`'s character. */
  readonly interiorCamera: InteriorCamera;
  /** Changes when the view's caches must start again (a new round). */
  epoch(): number;
  active(): 0 | 1;
  view(): DuelView;
  otherStatus(): OtherStatus;
  axes(): Axes;
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
  /** Feel-ii §1.2: the Helm's axes as this screen best knows them, for the COLLISION words on every seat (Single player:
   *  axes(); online away from the Helm: the state's, stateAxes). Absent: axes(). */
  helmAxes?(): Axes;
  /** Feel-ii §2.8: the console controls refused since the last take, each with its reason (the duel mode's checks). */
  takeRefusals?(): Refusal[];
}
/** Feel-ii §2.8: a refused console control and the reason the sim would give. */
export interface Refusal { control: RefusedControl; reason: string }
/** How long a refused control flashes and how long its reason shows (seconds). */
export const REFUSAL_FLASH_S = 0.3, REFUSAL_SHOW_S = 1.5;
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

/** Feel-ii §2.5: the torpedo lock tone's frame data: the torpedo has a target and is ready (canLaunch's checks bar the
 *  range: none flying, one in the magazine, Weapons on), the enemy's distance and the torpedo's range. */
export function torpedoTone(d: DuelState): TorpedoTone {
  const t = d.tactical, sys = t.systems[CREW_SLOT]!, me = t.ships[CREW_SLOT]!, e = t.ships[targetOf(t, CREW_SLOT)];
  const locked = t.outcome === Outcome.Running && sys.torpLock >= 0 && !missileOf(t, CREW_SLOT) && sys.magazine > 0 && sys.rooms[Room.Weapons] < 2 && e?.active === true;
  return { locked, distance: e ? Math.hypot(e.x - me.x, e.y - me.y) : Infinity, range: classOf(t, CREW_SLOT).slots.missile.range, target: sys.torpLock };
}

export interface DuelSceneOptions {
  seed: number; pauseText: string; ui: DuelSink; audio?: AudioOut;
  /** The contact window's controller (enemy ship window spec §6.1, §6.5): map clicks open it, `sync` applies the closing
   *  rules each frame, and every frame carries `contact`. Absent: no window and no `contact` key in the frame. */
  contact?: ContactController;
  /** The last left-button press on the canvas since the previous frame, in internal px (spec §6.2); drained every frame. */
  takeClick?: () => { x: number; y: number } | null;
  /** The pointer's last position in internal px, or null (Sci-1 spec §7.3: Science's hover readout). */
  pointer?: () => { x: number; y: number } | null;
  /** Feel-ii §1.1: the right button since the last frame (the Helm's heading aim); drained every frame. */
  takeAim?: () => AimSample | null;
  /** Feel-ii §1.1: where the Helm's heading requests go (the duel mode drains them). */
  requests?: MapRequests;
  /** Feel-ii §2.7: a ping asked for since the last frame (a middle click, or G at the pointer), in internal px. */
  takePingAt?: () => { x: number; y: number } | null;
  /** Online: send this screen's ping on the cosmetic channel (it comes back through takePings). Absent: Single player,
   *  where the scene shows it at once. */
  sendPing?: (p: PingRequest) => void;
  /** Online: the pings that arrived since the last frame, every seat's own included. */
  takePings?: () => (PingRequest & { player: number })[];
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
  // Feel-i (console feel spec §1, §3): the seat the local character sat at and when (presentation seconds), whether it has
  // acted since (the card goes, the goal glow stops), whether this sit shows the card, and the round's outcome last frame.
  let seat: SitSeat | null = null, sitAt = 0, sitThrottle = 0, acted = false, carded = false, goalUsed = false, lastOutcome: number = Outcome.Running;
  const sits = createSitTracker();   // each character's seat last frame: a Tab is not a sit
  // Feel-ii: the pings on show (§2.7) and this screen's last own ping (ms, Single player's one-a-second), the latest refusal (§2.8).
  const pings: Ping[] = [];
  let lastPing: number | null = null, refused: (Refusal & { at: number }) | null = null;
  return {
    /** One frame from `source`; `dt` in seconds. Returns the station of the console drawn, or null when none (Artemis
     *  spec §6.2: the mode clears the console's holds when it changes). */
    draw(source: DuelViewSource, dt: number, overlay: SceneOverlay): ConsoleStation | null {
      if (epoch === null) { epoch = source.epoch(); lastOutcome = source.duel.tactical.outcome; if (source.seed !== options.seed) layer.reseed(source.seed); }   // the online duel learns its seed from the first publication; a round already decided on attach is no kill to show
      if (source.epoch() !== epoch) {   // a new round (a restart before H-2): every view-owned cache starts again
        epoch = source.epoch();
        resetFx(fx); layer.reset(); layer.reseed(source.seed); sound?.reset();   // the next round's star field; a fresh audio baseline
        lastOutcome = Outcome.Running; pings.length = 0; refused = null;
        interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel); scene.addChildAt(interior.container, 1);
      }
      const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;
      // Everything the console changes follows whether it is drawn (Artemis spec §6.1): a paused or decided console view
      // falls back to the right-hand readout with its rows and help.
      const hidden = consoleHidden(d, overlay, source.running()), onConsole = !hidden && view !== 'interior';
      // Enemy ship window spec §6.5 steps 1 to 3: the station from the seat, this frame's map click, then the closing rules.
      const station = hidden ? null : consoleStation(d, source.active());
      const onMap = view !== 'interior' && (station === 'helm' || station === 'weapons' || station === 'science');   // Sci-1 spec §7.2: the window on all three
      const click = options.takeClick?.() ?? null;   // drained every frame, so a click never waits for a later frame
      if (contact && click && onMap) {
        // Spike ii §6.5: a ship contact under the pointer wins; else, with a weapon picked up, a rock under it takes the drop.
        const at = { state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport }, ship = pickContact(at, click);
        const rock = ship === null && contact.aimWeapon() !== null ? pickRock(at, click) : null;
        if (rock !== null) contact.pickRock(rock); else contact.click(ship);
      }
      // Feel-ii §1.1: the Helm's right button aims the held heading. A press or a release on the map asks for the bearing from
      // the own ship's drawn marker to the pointer (on the ship itself: clear); while it is held, a preview marker follows.
      const aim = options.takeAim?.() ?? null, running = d.tactical.outcome === Outcome.Running;
      let preview: number | null = null;
      if (aim && onMap && station === 'helm' && view === 'helm' && running) {
        const cam = source.cameras.helm, b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), s = worldToScreen(cam, viewport, b.x, b.y);
        const dx = aim.x - s.x, dy = aim.y - s.y, onShip = Math.hypot(dx, dy) <= pickRadius(cam.zoom), h = onShip ? -1 : headingOf(dx, dy);
        if (aim.held && !onShip) preview = h;
        if (aim.press || aim.release) options.requests?.heading(h);
      }
      // Feel-ii §2.7: a ping (a middle click, or G at the pointer) on a console map: on the enemy when it is under the
      // pointer, else the map point. Single player shows it at once (one a second); online it goes out and comes back.
      const pingAt = options.takePingAt?.() ?? null, nowS = performance.now() / 1000;
      let pinged = 0;
      if (pingAt && onMap && running) {
        const cam = source.cameras[view], picked = pickContact({ state: d.tactical, prev: source.prev, alpha, camera: cam, viewport }, pingAt) === Contact.Enemy;
        const at = picked ? interpolatedShip(d.tactical, source.prev, alpha, targetOf(d.tactical, CREW_SLOT)) : screenToWorld(cam, viewport, pingAt.x, pingAt.y);
        const req: PingRequest = { x: at.x, y: at.y, target: picked };
        if (options.sendPing) options.sendPing(req);
        else if (pingAllowed(lastPing, nowS * 1000)) { lastPing = nowS * 1000; pushPing(pings, { ...req, player: source.active() }); pinged++; }
      }
      for (const p of options.takePings?.() ?? []) { pushPing(pings, p); pinged++; }
      // Feel-ii §2.8: a refused control flashes for REFUSAL_FLASH_S and names its reason for REFUSAL_SHOW_S.
      for (const r of source.takeRefusals?.() ?? []) refused = { ...r, at: nowS };
      const refusedView = refused && nowS - refused.at < REFUSAL_SHOW_S ? { control: refused.control, reason: refused.reason, flash: nowS - refused.at < REFUSAL_FLASH_S } : null;
      const alert = flightAlert(d.tactical, source.helmAxes?.() ?? source.axes());   // Feel-ii §1.2, §1.6: the same words on every seat
      const shown = contact
        ? contact.sync({ shown: onMap, station, target: d.tactical.systems[CREW_SLOT]!.target, active: (slot) => d.tactical.ships[slot]?.active === true, epoch: source.epoch(), enemyKnown: d.tactical.known[Contact.Enemy], designated: d.tactical.designated })
        : false;
      const t = performance.now() / 1000;   // the presentation clock: the map's blinks and the window's, frame for frame
      const events = source.drainEvents();
      pushEvents(fx, events); pushHits(fx, events, d.tactical);   // duel polish i spec §B: the callouts and the struck-room flashes
      pushRockFx(fx, events);   // spike ii §7: chips, breaks, blasts, sparks
      if (view !== 'interior') {   // spike ii §7 item 6: a blast or a break on this screen shakes it
        const cam = source.cameras[view], crewAt = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT);
        pushRockShakes(fx, events, crewAt, (x, y) => { const p = worldToScreen(cam, viewport, x, y); return p.x >= 0 && p.x <= viewport.w && p.y >= 0 && p.y <= viewport.h; });
      }
      // Feel-i §3: the kill, seen as the round's outcome turning with the enemy's hull gone (both modes read the same state).
      const enemySlot = targetOf(d.tactical, CREW_SLOT);
      if (lastOutcome === Outcome.Running && d.tactical.outcome !== Outcome.Running && (d.tactical.systems[enemySlot]?.hull ?? 1) <= 0) {
        const e = interpolatedShip(d.tactical, source.prev, alpha, enemySlot);
        pushKill(fx, e.x, e.y, e.h);
      }
      lastOutcome = d.tactical.outcome;
      // Feel-i §1: sitting down. A new sit at the Helm or Weapons frames both ships, may show the card, and lights the goal.
      // Only a character's own sit counts (Feel-i review): a Tab to a seated character keeps its zoom and shows no card.
      const sitOf = (pid: 0 | 1): SitSeat | null => { const s = consoleStation(d, pid); return s === 'helm' || s === 'weapons' ? s : null; };
      const me = source.active(), sitSeat = sitOf(me), sat = trackSit(sits, me, [sitOf(0), sitOf(1)]);
      if (sat && sitSeat) {
        seat = sitSeat; sitAt = t; sitThrottle = source.throttle(); acted = false; goalUsed = false; carded = countSit(sitSeat);
        const own = d.tactical.ships[CREW_SLOT], e = d.tactical.ships[enemySlot];
        if (e?.active) zoomTo(source.cameras[sitSeat], frameZoom(e.x - own.x, e.y - own.y, viewport, CONSOLE_RESERVE.left, CONSOLE_RESERVE.right));
      } else if (sitSeat !== seat) { seat = sitSeat; carded = false; }   // a Tab, a stand or Science: no new sit
      const held = source.uiHeld(), aimed = contact?.aimWeapon() ?? null;
      if (seat === 'helm' && (held.left || held.right || held.fire)) goalUsed = true;
      if (seat === 'weapons' && aimed === 'laser') goalUsed = true;
      if (seat !== null && (held.left || held.right || held.fire || held.up || held.down || aimed !== null || source.throttle() !== sitThrottle)) acted = true;
      if (sound) {   // Audio-i spec section 4: the same events the effects use; pan from the screen on a map view, crew-relative inside
        const cam = view === 'interior' ? null : source.cameras[view], crew = d.tactical.ships[CREW_SLOT]!;
        sound.frame({ duel: d, events, axes: source.axes(), paused: source.paused(), live: source.live?.() ?? true, me: source.active(), crew: crewLife(d), dt, hostile: enemyHostile(d.tactical),   // duel polish i spec §C
          torpedo: torpedoTone(d), pings: pinged,   // Feel-ii §2.5, §2.7
          pan: (x, y) => (cam ? screenPan(worldToScreen(cam, viewport, x, y).x, viewport.w) : worldPan(x - crew.x)) });
      }
      // Paused, or a frozen online copy (a lost link): the callouts, flashes, heal motes and the charge pulse hold (polish i review).
      const frozen = source.paused() || source.live?.() === false;
      stepFx(fx, frozen ? 0 : fxDt(fx, dt));   // Feel-i: the kill's slow motion is render time only
      stepPings(pings, frozen ? 0 : dt);
      trackSolution(fx, linedUp(laserSituation(d.tactical, fx.sinceShot, gunnerPresent(d))), frozen ? 0 : dt);
      recordTrails(fx, d.tactical, source.missilePrev, alpha);
      layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
      let overlayView: MapOverlayView | null = null;
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt, events, frozen ? 0 : dt, { camera: source.interiorCamera, active: source.active() });   // Art-i spec section 7: the light and feel hold while paused
      else {
        // Spike ii §6.5: with a weapon picked up, the rock under the pointer (no ship contact there) wears a hover bracket.
        const point = aimed !== null ? options.pointer?.() ?? null : null, pickAt = { state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport };
        const hoverRock = point && pickContact(pickAt, point) === null ? pickRock(pickAt, point) : null;
        // Step 4: the map keeps its arrows and info line clear of the window while it is shown.
        const input = {
          state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport, console: view, axes: source.axes(),
          ships: fx.kill ? [0] : [0, 1], paused: overlay.layerPaused, contacts: true, ...(onConsole ? { reserveLeft: CONSOLE_RESERVE.left, reserveRight: shown ? CONTACT_RESERVE : CONSOLE_RESERVE.right, reserveTop: STATUS_RESERVE, infoBand: { left: TABS_RIGHT, right: SIDE.x } } : { reserveRight: READOUT_COLUMN }), spreadArrows: true, missilePrev: source.missilePrev, fx, t, gunner: gunnerPresent(d),
          holdHeading: preview ?? d.holdHeading, holdPreview: preview !== null, gravity: view === 'helm', alert, pings,   // Feel-ii
          rockHover: hoverRock !== null && aimed !== null ? { rock: hoverRock, weapon: aimed } : null
        } as const;
        const model = tacticalModel(input);
        layer.setCrt(crtScale(renderer.crt()));   // CRT map spec sections 3-4: the filter strength follows the setting
        layer.draw(model, combatModel({ ...input, t: frozen ? 0 : t, enemyArrow: model.arrows.find((a) => a.target === 'enemy') ?? null, goal: onConsole && seat === 'helm' && !goalUsed }), t);   // the blinks run on the presentation clock, paused or not
        overlayView = mapOverlayOf(model.overlay);
      }
      // Sci-1 spec §7.3: Science's hover readout, from the crew ship's drawn position to the cursor.
      const hover = station === 'science' && view !== 'interior'
        ? hoverReadout(source.cameras[view], viewport, interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), options.pointer?.() ?? null)
        : null;
      const consoleView = consoleModel({ duel: d, me: source.active(), mode: source.mode, hidden, held: source.uiHeld(), overlay: overlayView, throttle: source.throttle(), hover,
        sinceShot: fx.sinceShot, goal: seat === 'weapons' && !goalUsed, t, refused: refusedView });
      // Step 5: the contact view, only while shown.
      const open = contact?.state() ?? null;
      const contactView = shown && station !== null && station !== 'ship'   // Science's window shows with nothing selected
        ? contactModel({ state: d.tactical, contact: open?.contact ?? null, aim: open?.aim ?? false, weapon: contact?.aimWeapon() ?? 'laser', station, t, weapons: consoleView?.weapons ?? null, flashes: open?.contact === 0 ? flashesFor(fx.struck, targetOf(d.tactical, CREW_SLOT)) : [] })
        : null;
      options.ui.frame({
        readout: { rows: readoutRows({ duel: d, mode: view, active: source.active(), other: source.otherStatus(), console: onConsole }), help: onConsole ? [] : readoutHelp(view) },
        end: overlay.end,
        console: consoleView,
        crt: crtActive(view),
        ...sceneUi(view, overlay, options.pauseText, overlayView),
        hud: view === 'interior' ? shipHud(d) : null,   // duel polish i spec §E: the SHIP view, paused and on the end card too (review)
        ...(contact ? { contact: contactView } : {}),
        ...(contactView?.aimWeapon ? { pointer: options.pointer?.() ?? null } : {}),   // FTL targeting spec §1: seeds the targeting line
        sitCard: onConsole && seat !== null && carded ? sitCard(seat, t - sitAt, acted, (d.tactical.ships[enemySlot]?.y ?? 0) > d.tactical.ships[CREW_SLOT].y, !!overlay.notice) : null   // Feel-i §1; Feel-ii §3.9: under the online notice
      });
      // Art-i spec section 7: the interior shakes its own world; the console views keep the fx shake (Feel-i: scaled by Settings).
      const shake = view === 'interior' ? { x: 0, y: 0 } : shakeOffset(fx, shakeScale(renderer.shake?.() ?? 'full'));
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
