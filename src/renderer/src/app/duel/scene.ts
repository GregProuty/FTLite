// The duel's scene (H-1 spec §3, §4; H-2 spec §3): the console map view (Helm or Weapons) or the interior for the active
// character, and the effects and shake, on the renderer's Pixi stage with its sector children hidden. The readout, the
// banners, the end card and the map overlay are drawn by React through the UI sink (React UI spec §6). It draws from a
// DuelViewSource: the local runtime (Single player) or the online duel source (Multiplayer), so both modes show exactly
// the same screens.
import { Container } from 'pixi.js';
import { enemyHostile, pointSeen, shipSeen } from '../../sim/tactical/science';
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { Renderer } from '../../render/renderer';
import { crtActive, crtScale } from '../../render/crt';
import type { EndView } from '../../render/duel/endModel';
import { CONSOLE_RESERVE, CONTACT, CONTACT_RESERVE, OWN_SHIP, OWN_SHIP_BOX, SIDE, STATUS_RESERVE, TABS_RIGHT } from '../../render/duel/consoleLayout';
import { consoleModel, consoleStation, type ConsoleStation } from '../../render/duel/consoleModel';
import { contactModel } from '../../render/duel/contactModel';
import { fireWatch, ownShipModel, type FireWatch } from '../../render/duel/ownShipModel';
import { hoverReadout } from '../../render/duel/scienceModel';
import { shipHud } from '../../render/duel/shipHudModel';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';
import { shipCommandOf, shipControlAt, type ShipCommand } from '../../render/duel/shipControls';
import type { Placement } from '../../render/duel/interiorCamera';
import { readoutHelp, readoutRows } from '../../render/duel/readoutModel';
import { createFx, fxDt, hitsCrew, interpolatedMissile, pushEvents, pushGunHits, pushKill, pushPewHits, recordTrails, resetFx, SHAKE_PX, SHAKE_S, shakeOffset, startShake, stepFx, trackSolution, type FxState, type ViewEvent } from '../../render/tactical/fxModel';
import { gunnerPresent, laserSituation, linedUp } from '../../render/duel/situationModel';
import { countSit, createSitTracker, frameZoom, sitCard, trackSit, type SitSeat } from '../../render/duel/sitModel';
import { shakeScale } from '../../render/shake';
import { DEFAULT_MAP_GRID } from '../../render/tactical/mapGrid';
import { flashesFor, pushHits } from '../../render/tactical/hitModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { createRockTrack, resetRockTrack, updateRockTrack } from '../../render/tactical/rockTrack';
import { pushRockFx, pushRockShakes } from '../../render/tactical/rockFx';
import { hullFor } from '../../render/tactical/hullModel';
import { interpolatedShip, pickContact, tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';
import { combatModel } from '../../render/tactical/weaponsModel';
import { screenToWorld, worldToScreen, zoomTo, type Camera } from '../../render/tactical/camera';
import { screenPan, worldPan } from '../../audio/voices';
import type { AudioOut } from '../audio';
import { createDuelAudio } from './duelAudio';
import { crewLife } from '../../render/duel/healFxModel';
import type { DuelSink } from '../../ui/sinks';
import { mapOverlayOf, type Banners, type MapOverlayView } from '../../ui/views';
import type { DuelState } from '../../sim/duel/state';
import type { HelmVent } from '../../sim/duel/helmFlight';
import { crewHelmSeat } from './controls';
import { classOf, Contact, CREW_SLOT, missileOf, Outcome, targetOf, type Axes, type TacticalState } from '../../sim/tactical/state';
import type { InteriorCamera } from '../../render/duel/interiorCamera';
import type { AimSample, HeldFlags } from './input';
import type { ContactController } from './contactController';
import type { MapRequests } from './mapRequests';
import { fineHeadingOf, headingOf, pickRadius } from '../../render/tactical/tacticalModel';
import { flightPointer, helmSteer, onHelmMap, onWeaponsMap, torpedoSteer } from './flightPointer';
import { flightAlert, type RefusedControl } from '../../render/duel/situationModel';
import { pingAllowed, pushPing, stepPings, type Ping, type PingRequest } from '../../render/duel/pingModel';
import type { TorpedoTone } from './duelAudio';
import { viewCamera, type DuelView } from './runtime';
import { createFog, stepFog, type FogView } from '../../render/tactical/fogModel';
import { weaponBars, WeaponSlot } from '../../sim/tactical/bars';
import { hasTurret } from '../../sim/tactical/defs';

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
  active(): number;
  view(): DuelView;
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
  /** Playtest2feedback §3, §6: the crew Helm's thrMille to show (online, the local prediction). Absent: the duel's. */
  thrMille?(): number;
  /** Playtest2feedback §6, Decision 11: the crew ship's vent this frame (online: this seat's own prediction). Absent: the duel's helmVent. */
  helmVent?(): HelmVent;
  /** Feel-ii §1.2: the Helm's axes as this screen best knows them, for the COLLISION words on every seat (Single player:
   *  axes(); online away from the Helm: the state's, stateAxes). Absent: axes(). */
  helmAxes?(): Axes;
  /** Feel-ii §2.8: the console controls refused since the last take, each with its reason (the duel mode's checks). */
  takeRefusals?(): Refusal[];
  /** W-4 spec §10: the Hound's selected weapon (0..2) to frame; absent: 0. */
  weaponSel?(): number;
  /** W-4 spec §10, §11: gun slot's turret offset to draw (0 pew pew, 1 the autocannon): online the own seat's prediction, else the sim's. Absent: the sim's. */
  turret?(slot: 0 | 1): number;
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
 *  range: none flying, one in the magazine, the torpedo on at least one bar), the enemy's distance and the torpedo's range. Engineering spike
 *  §10.4: an unseen enemy is never locked, so no beep tracks its distance. W-3: none in MANUAL. */
export function torpedoTone(d: DuelState): TorpedoTone {
  const t = d.tactical, sys = t.systems[CREW_SLOT]!, me = t.ships[CREW_SLOT]!, e = t.ships[targetOf(t, CREW_SLOT)];
  const locked = t.outcome === Outcome.Running && !sys.torpManual && sys.torpLock >= 0 && !missileOf(t, CREW_SLOT) && sys.magazine > 0 && weaponBars(sys, WeaponSlot.Torpedo) >= 1 && e?.active === true && shipSeen(t, targetOf(t, CREW_SLOT));   // W-3: a lock never launches in MANUAL
  return { locked, distance: e ? Math.hypot(e.x - me.x, e.y - me.y) : Infinity, range: classOf(t, CREW_SLOT).slots.missile.range, target: sys.torpLock };
}

/** Engineering spike §10.4: a sound at a point outside sensor range (an unseen enemy's laser or launch chirp, an unseen
 *  torpedo's blast) plays centred, so its pan reveals no bearing. */
export function fogPan(t: TacticalState, pan: (x: number, y: number) => number): (x: number, y: number) => number {
  return (x, y) => (pointSeen(t, x, y) ? pan(x, y) : 0);
}

/** Engineering spike §10.4 (final review): the events the map effects may draw. An unseen ship's contact spark goes (it
 *  sits at the ship's real place); another ship's laser fired from an unseen point loses its beam (and a rock's chips back
 *  along it); another ship's torpedo ending at an unseen point loses its burst. Merge decision 1d (W-1's pew pew): another
 *  ship's pew round fired from an unseen point loses its muzzle flash, and its hit at an unseen point its spark (a hit on
 *  the crew ship is always at a seen point). The crew's own weapons and ship keep all (the MANUAL beam and torpedo are the
 *  crew's laser and missileEnd events). */
export function fogEvents(t: TacticalState, events: readonly ViewEvent[]): ViewEvent[] {
  return events.filter((e) => {
    if (e.kind === 'contact') return e.ship === CREW_SLOT || shipSeen(t, e.ship);
    if (e.kind === 'laser') return e.ship === CREW_SLOT || pointSeen(t, e.x1, e.y1);
    if (e.kind === 'missileEnd') return e.ship === CREW_SLOT || pointSeen(t, e.x, e.y);
    if (e.kind === 'pewFire') return e.ship === CREW_SLOT || pointSeen(t, e.x, e.y);
    if (e.kind === 'pewHit') return e.owner === CREW_SLOT || e.ship === CREW_SLOT || pointSeen(t, e.x, e.y);
    return true;
  });
}

/** One frame's map effects from its events, under the fog (fogEvents): the beams, bursts and sparks, the callouts and
 *  struck rooms, the gun's hits and the rock effects. A hit on the crew ship whose event the fog dropped (an unseen
 *  enemy's beam) still shakes the screen: the crew feels the hit without seeing where it came from. */
export function pushMapEffects(fx: FxState, events: readonly ViewEvent[], t: TacticalState): void {
  const shown = fogEvents(t, events);
  pushEvents(fx, shown); pushHits(fx, shown, t); pushGunHits(fx, shown); pushPewHits(fx, shown);   // duel polish i spec §B: the callouts and the struck-room flashes; Valkyrn spec §7.4: the gun's sparks, pops and -1; W-1: the pew's
  pushRockFx(fx, shown);   // spike ii §7 with the look pass: chips, dim break puffs, blasts
  if (shown.length < events.length && events.some((e) => hitsCrew(e) && !shown.includes(e))) startShake(fx, SHAKE_PX, SHAKE_S);
}

/** Sensors blip spec §3: whether the sit-down card's test point is below the crew ship (the card then sits at the top of
 *  the map). While the enemy is unseen the point is the ping's centre, so the card's place tells no more than the blip
 *  does; with no blip it is the enemy ship, as before. */
export function sitCardBelow(t: TacticalState, fog: FogView): boolean {
  return (fog.blip ? fog.blip.y : t.ships[targetOf(t, CREW_SLOT)]?.y ?? 0) > t.ships[CREW_SLOT].y;
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
  /** Playtest2feedback §4a: whether the left button is held on the canvas (the crew Helm steers while it is). */
  leftHeld?: () => boolean;
  /** Feel-ii §1.1: where the Helm's heading requests go (the duel mode drains them). */
  requests?: MapRequests;
  /** Feel-ii §2.7: a ping asked for since the last frame (a middle click, or G at the pointer), in internal px. */
  takePingAt?: () => { x: number; y: number } | null;
  /** Online: send this screen's ping on the cosmetic channel (it comes back through takePings). Absent: Single player,
   *  where the scene shows it at once. */
  sendPing?: (p: PingRequest) => void;
  /** Online: the pings that arrived since the last frame, every seat's own included. */
  takePings?: () => (PingRequest & { player: number })[];
  /** Engineering spike §5: where a ship-view click on a door or an airlock goes (the duel keyboard's console slot, so
   *  Single player queues it and the online duel sends it). Absent: interior clicks do nothing. */
  shipCommand?: (command: ShipCommand) => void;
}

export function createDuelScene(renderer: Renderer, options: DuelSceneOptions) {
  const viewport = { w: INTERNAL_W, h: INTERNAL_H }, font = renderer.assets.fontFamily;
  const hidden = renderer.app.stage.children.filter((child) => child.visible);
  for (const child of hidden) child.visible = false;   // world, enemy window, projectiles, callouts, HUD; shown again on dispose
  const root = new Container(), scene = new Container();
  const layer = createTacticalLayer({ fontFamily: font, viewport, seed: options.seed });
  const crew3dOn = (): boolean => (renderer.crew3d?.() ?? 'on') === 'on';   // Crew3D spec section 4: F8 in dev builds
  let interior: InteriorView = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel, crew3dOn);
  scene.addChild(layer.container, interior.container);
  root.addChild(scene);
  renderer.app.stage.addChild(root);
  const fx = createFx();
  const stageHook = globalThis as unknown as { __FTLITE_STAGE__?: boolean; __spikeAsteroidsFx?: unknown };
  if (stageHook.__FTLITE_STAGE__ === true) stageHook.__spikeAsteroidsFx = fx;   // asteroids-iii: the frame-time check reads the live fx count (a read-only staging hook, behind duelMode's __FTLITE_STAGE__ flag like __spikeAsteroids)
  const rockTrack = createRockTrack();   // asteroids-iii §7.1: smooth motion
  const sound = options.audio ? createDuelAudio(options.audio) : null;   // Audio-i spec section 4b: both modes, so Single player is no longer silent
  let epoch: number | null = null;
  // Feel-i (console feel spec §1, §3): the seat the local character sat at and when (presentation seconds), whether it has
  // acted since (the card goes, the goal glow stops), whether this sit shows the card, and the round's outcome last frame.
  let seat: SitSeat | null = null, sitAt = 0, sitThrottle = 0, acted = false, carded = false, goalUsed = false, lastOutcome: number = Outcome.Running;
  const sits = createSitTracker();   // each character's seat last frame: a Tab is not a sit
  // Feel-ii: the pings on show (§2.7) and this screen's last own ping (ms, Single player's one-a-second), the latest refusal (§2.8).
  const pings: Ping[] = [];
  let lastPing: number | null = null, refused: (Refusal & { at: number }) | null = null;
  let helmPick = false;   // owner 2026-11-19: the crew Helm's left press landed on a ship contact; no steer until it is let go
  let lastAimed: string | null = null;   // the weapon picked up on the last drawn frame (Valkyrn spec §5.1: right button)
  let manualPrev = false;   // W-4c Decision 14: whether the crew's MANUAL torpedo flew on the last drawn frame
  const fog = createFog();   // Engineering spike §10.4: this screen's ghosts
  // Own ship window spec §4: the fire watch (every drawn frame, whatever the view) and the border flash's end (presentation seconds).
  let fires: FireWatch | null = null, flashUntil = 0;
  return {
    /** One frame from `source`; `dt` in seconds. Returns the station of the console drawn, or null when none (Artemis
     *  spec §6.2: the mode clears the console's holds when it changes). */
    draw(source: DuelViewSource, dt: number, overlay: SceneOverlay): ConsoleStation | null {
      if (epoch === null) { epoch = source.epoch(); lastOutcome = source.duel.tactical.outcome; if (source.seed !== options.seed) layer.reseed(source.seed); }   // the online duel learns its seed from the first publication; a round already decided on attach is no kill to show
      if (source.epoch() !== epoch) {   // a new round (a restart before H-2): every view-owned cache starts again
        epoch = source.epoch();
        resetFx(fx); resetRockTrack(rockTrack); layer.reset(); layer.reseed(source.seed); sound?.reset();   // the next round's star field; a fresh audio baseline
        lastOutcome = Outcome.Running; pings.length = 0; refused = null;
        fires = null; flashUntil = 0;
        options.requests?.resetReticle();   // W-2, W-4 spec §10: a new round's reticle aim starts empty (the MANUAL laser aims along the nose, the Hound's reticle waits for the pointer)
        interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel, crew3dOn); scene.addChildAt(interior.container, 1);
      }
      const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;
      /** Playtest2feedback §3: the crew Helm's lever is thrMille; the Valkyrn's is its level (Feel-i's sit card reads either). */
      const shownThrottle = (): number => (classOf(d.tactical, CREW_SLOT).newtonianHelm ? source.thrMille?.() ?? d.thrMille : source.throttle());
      const fogView = stepFog(fog, d.tactical, performance.now() / 1000, source.epoch());   // Engineering spike §10.4
      const camKey = view === 'interior' ? null : viewCamera(view), cam = camKey ? source.cameras[camKey] : null;   // Valkyrn spec §5: Flight flies the Helm's camera
      // Everything the console changes follows whether it is drawn (Artemis spec §6.1): a paused or decided console view
      // falls back to the right-hand readout with its rows and help.
      const hidden = consoleHidden(d, overlay, source.running()), onConsole = !hidden && view !== 'interior';
      // Enemy ship window spec §6.5 steps 1 to 3: the station from the seat, this frame's map click, then the closing rules.
      const station = hidden ? null : consoleStation(d, source.active());
      const onMap = view !== 'interior' && (station === 'helm' || station === 'weapons' || station === 'science' || station === 'flight');   // Sci-1 spec §7.2: the window on all three
      const click = options.takeClick?.() ?? null;   // drained every frame, so a click never waits for a later frame
      const crewSeat = crewHelmSeat(d, source.active()), crewHelmMap = station === 'helm' && view === 'helm' && crewSeat;   // playtest2feedback §4a
      // Engineering spike §5: on the ship view a left click on a door or an airlock toggles it, for anyone, from anywhere.
      if (click && view === 'interior' && options.shipCommand) {
        const at = interior.placement(), c = at ? shipControlAt(d, at, click.x, click.y) : null;
        if (c) options.shipCommand(shipCommandOf(c));
      }
      // W-1 (pew pew spec §1): at the Weapons seat a left click on the open map fires the pew at the map point (the bearing from
      // the own ship's drawn marker, a fine heading), unless a weapon card is picked up (then the click is the window's, as
      // before). At Weapons the contact window opens by T and the weapon cards; Helm and Science keep the map click. A click
      // over a console block (tab strip, status table, side column, the Weapons block with its PEW row and cards) or the open
      // window is not the map's and falls through to today's contact.click path: the canvas hears every press (the Stage root
      // has pointer-events none; only Buttons, the card hit boxes, the throttle box and the window take their own).
      const pewClick = click !== null && onMap && station === 'weapons' && view === 'weapons' && d.tactical.outcome === Outcome.Running && !overlay.layerPaused
        && (contact?.aimWeapon() ?? null) === null && classOf(d.tactical, CREW_SLOT).slots.pew !== null
        && onWeaponsMap(click, contact?.state() != null, readoutRows({ duel: d, mode: view, active: source.active(), console: onConsole }).length);
      if (pewClick && click) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), w = screenToWorld(cam!, viewport, click.x, click.y);
        if (Math.hypot(w.x - b.x, w.y - b.y) > 0) options.requests?.pew(fineHeadingOf(w.x - b.x, w.y - b.y));
      } else if (contact && click && crewHelmMap && onHelmMap(click, contact.state() != null)) {
        // Owner 2026-11-19: on the crew Helm a left press on a ship contact opens (or switches, or closes) its window, as on the
        // other Helm, and steers nothing until the button is let go; a press anywhere else only steers (playtest2feedback §4a).
        const ship = pickContact({ state: d.tactical, prev: source.prev, alpha, camera: cam!, viewport, fog: fogView }, click);
        if (ship !== null) { contact.click(ship); helmPick = true; }
      } else if (contact && click && onMap && station !== 'flight' && !crewHelmMap   // Valkyrn spec §5.1: on the Flight seat the left button is the gun
        // W-1 review F4: at Weapons the window's own click is only a picked-up card's, or a click inside the shown window; any other
        // click (over a console block, empty map the pew declined) is dropped, so a block never opens or closes the window.
        && !(station === 'weapons' && view === 'weapons' && (contact.aimWeapon() ?? null) === null && !(contact.state() != null && click.x >= CONTACT.x && click.x < CONTACT.x + CONTACT.w && click.y >= CONTACT.y && click.y < CONTACT.y + CONTACT.h))) {
        // UI round spec §1.4: a ship contact under the pointer, or none; rocks are not picked from the map.
        const at = { state: d.tactical, prev: source.prev, alpha, camera: cam!, viewport, fog: fogView };
        contact.click(pickContact(at, click));
      }
      // W-4 spec §8, §9: at the Hound's Weapons seat the left button held over the open map is the trigger (the autocannon
      // fires while it is held and selected); off the map, over a block, with a weapon picked up or paused, it is not.
      const triggerAt = station === 'weapons' && view === 'weapons' && d.tactical.outcome === Outcome.Running && !overlay.layerPaused && hasTurret(classOf(d.tactical, CREW_SLOT))
        && (contact?.aimWeapon() ?? null) === null && (options.leftHeld?.() ?? false) ? options.pointer?.() ?? null : null;
      options.requests?.trigger(triggerAt !== null && onWeaponsMap(triggerAt, contact?.state() != null, readoutRows({ duel: d, mode: 'weapons', active: source.active(), console: onConsole }).length));
      // W-2, W-4 spec §9: the reticle follows the pointer on the open Weapons map, for the laser fit's MANUAL laser and the
      // Hound's turrets (its fine bearing from the own ship's drawn marker, in either mode, so it is ready when the mode
      // changes); over a console block or the open window, off the canvas or with no pointer, the last aim stands.
      const reticlePointer = station === 'weapons' && view === 'weapons' && d.tactical.outcome === Outcome.Running && !overlay.layerPaused && (classOf(d.tactical, CREW_SLOT).slots.laser !== null || hasTurret(classOf(d.tactical, CREW_SLOT)))
        ? options.pointer?.() ?? null : null;
      const reticleOnMap = reticlePointer !== null && onWeaponsMap(reticlePointer, contact?.state() != null, readoutRows({ duel: d, mode: 'weapons', active: source.active(), console: onConsole }).length);
      if (reticlePointer && reticleOnMap) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), w = screenToWorld(cam!, viewport, reticlePointer.x, reticlePointer.y);
        if (w.x !== b.x || w.y !== b.y) options.requests?.reticle(fineHeadingOf(w.x - b.x, w.y - b.y));
      }
      // Feel-ii §1.1: the Helm's right button aims the held heading. A press or a release on the map asks for the bearing from
      // the own ship's drawn marker to the pointer (on the ship itself: clear); while it is held, a preview marker follows.
      // Helm round 2 §4: not at the crew Helm, whose right button pans; its left-button steer still draws the held heading.
      const aim = options.takeAim?.() ?? null, running = d.tactical.outcome === Outcome.Running;
      let preview: number | null = null;
      if (aim && onMap && station === 'helm' && view === 'helm' && running && !crewSeat) {
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
        const pc = cam!, picked = pickContact({ state: d.tactical, prev: source.prev, alpha, camera: pc, viewport, fog: fogView }, pingAt) === Contact.Enemy;
        const at = picked ? interpolatedShip(d.tactical, source.prev, alpha, targetOf(d.tactical, CREW_SLOT)) : screenToWorld(pc, viewport, pingAt.x, pingAt.y);
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
        ? contact.sync({ shown: onMap, station, target: d.tactical.systems[CREW_SLOT]!.target, active: (slot) => d.tactical.ships[slot]?.active === true, epoch: source.epoch(), enemyKnown: d.tactical.known[Contact.Enemy], designated: d.tactical.designated, laser: classOf(d.tactical, CREW_SLOT).slots.laser !== null, turret: hasTurret(classOf(d.tactical, CREW_SLOT)) })
        : false;
      // Valkyrn spec §5.1, §6.2: on the Flight map the nose follows the pointer (its bearing from the own ship's drawn marker,
      // every frame) while it is over the open map; on the ship itself or over a console block the last bearing stands. The
      // right button launches the torpedo, except while a weapon is picked up: then it only cancels the pick-up (the
      // targeting line's own listener has already dropped it, so the last frame's pick-up counts too).
      if (onMap && station === 'flight' && view === 'flight' && running && !overlay.layerPaused) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT);
        const f = flightPointer({ pointer: options.pointer?.() ?? null, ship: worldToScreen(cam!, viewport, b.x, b.y), zoom: cam!.zoom, contactShown: shown,
          press: aim?.press === true, aimed: lastAimed !== null || (contact?.aimWeapon() ?? null) !== null });
        if (f.steer !== null) options.requests?.steer(f.steer);
        if (f.launch) options.requests?.launch();
      }
      // Playtest2feedback §4a: on the crew Helm's map the held left button steers, every frame: the bearing from the own ship's
      // drawn marker to the pointer while it is on the open map and off the ship (else the last bearing stands).
      let steerTo: { x: number; y: number } | null = null;   // §6: the steering marker's end while the left button steers
      const leftHeld = options.leftHeld?.() ?? false;
      if (!leftHeld) helmPick = false;
      if (onMap && crewHelmMap && running && !overlay.layerPaused && leftHeld && !helmPick) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), p = options.pointer?.() ?? null;
        const h = helmSteer({ pointer: p, ship: worldToScreen(cam!, viewport, b.x, b.y), zoom: cam!.zoom, contactShown: shown });
        if (h !== null) { options.requests?.steer(h); steerTo = p; }   // final review M1: the marker only while a steer goes out
      }
      // W-4c Decision 14: a MANUAL launch drops a weapon pick-up (a TORPEDO card click both selects and picks it up), so the
      // held left button steers at once instead of belonging to the contact window. Once, on the flight's first drawn frame.
      const manualNow = manualTorpedoFlying(d.tactical);
      if (manualNow && !manualPrev && station === 'weapons') contact?.cancelAim();
      manualPrev = manualNow;
      // W-4 spec §7 (W-4c): at Weapons, while the crew's MANUAL torpedo flies, the held left button steers it, every frame: the
      // bearing from the torpedo's drawn marker to the pointer while it is on the open map and off the marker (else the last
      // bearing stands). Not while a weapon is picked up (the button is the window's then).
      if (onMap && station === 'weapons' && view === 'weapons' && running && !overlay.layerPaused && manualNow
        && (contact?.aimWeapon() ?? null) === null && (options.leftHeld?.() ?? false)) {
        const m = interpolatedMissile(d.tactical, source.missilePrev, alpha, CREW_SLOT);
        if (m) {
          const h = torpedoSteer({ pointer: options.pointer?.() ?? null, torpedo: worldToScreen(cam!, viewport, m.x, m.y), zoom: cam!.zoom, contactShown: shown,
            statusRows: readoutRows({ duel: d, mode: 'weapons', active: source.active(), console: onConsole }).length });
          if (h !== null) options.requests?.torpHeading(h);
        }
      }
      updateRockTrack(rockTrack, d.tactical);   // every frame, whichever view shows
      const vent = source.helmVent?.() ?? d.helmVent;   // §6: the puffs and the hiss
      const t = performance.now() / 1000;   // the presentation clock: the map's blinks and the window's, frame for frame
      ({ watch: fires, flashUntil } = fireWatch(fires, d, t, flashUntil));   // own ship window spec §4
      const events = source.drainEvents();
      pushMapEffects(fx, events, d.tactical);   // Engineering spike §10.4: under the fog
      if (cam) {   // spike ii §7 item 6: a blast or a break on this screen shakes it
        const c = cam, crewAt = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT);
        pushRockShakes(fx, events, crewAt, (x, y) => { const p = worldToScreen(c, viewport, x, y); return p.x >= 0 && p.x <= viewport.w && p.y >= 0 && p.y <= viewport.h; });
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
      const sitOf = (pid: number): SitSeat | null => { const s = consoleStation(d, pid); return s === 'helm' || s === 'weapons' || s === 'flight' ? s : null; };
      const me = source.active(), sitSeat = sitOf(me), sat = trackSit(sits, me, Array.from({ length: d.interior.playerCount }, (_, pid) => sitOf(pid)));   // Sci-2 spec §5.1: every seat of the crew
      if (sat && sitSeat) {
        seat = sitSeat; sitAt = t; sitThrottle = shownThrottle(); acted = false; goalUsed = false; carded = countSit(sitSeat);
        const own = d.tactical.ships[CREW_SLOT], e = d.tactical.ships[enemySlot];
        if (e?.active && fogView.seen.enemy) zoomTo(source.cameras[viewCamera(sitSeat)], frameZoom(e.x - own.x, e.y - own.y, viewport, CONSOLE_RESERVE.left, CONSOLE_RESERVE.right, OWN_SHIP));
      } else if (sitSeat !== seat) { seat = sitSeat; carded = false; }   // a Tab, a stand or Science: no new sit
      const held = source.uiHeld(), aimed = contact?.aimWeapon() ?? null;
      lastAimed = aimed;
      // The Helm goal is used by A/D or auto-face, and at the crew Helm by the steer too (owner 2026-11-19: A/D turn there again).
      // Helm round 2 §4: Space is no auto-face at the crew Helm, so it does not use the goal there.
      if (seat === 'helm' && (held.left || held.right || (held.fire && !crewSeat) || (crewSeat && steerTo !== null))) goalUsed = true;
      if (seat === 'weapons' && aimed === 'laser') goalUsed = true;
      if (seat !== null && (held.left || held.right || held.fire || held.up || held.down || aimed !== null || shownThrottle() !== sitThrottle)) acted = true;
      if (sound) {   // Audio-i spec section 4: the same events the effects use; pan from the screen on a map view, crew-relative inside
        const crew = d.tactical.ships[CREW_SLOT]!;
        sound.frame({ duel: d, events, axes: source.axes(), paused: source.paused(), live: source.live?.() ?? true, me: source.active(), crew: crewLife(d), dt, hostile: enemyHostile(d.tactical),   // duel polish i spec §C
          torpedo: torpedoTone(d), pings: pinged, vent,   // Feel-ii §2.5, §2.7; playtest2feedback §6
          pan: fogPan(d.tactical, (x, y) => (cam ? screenPan(worldToScreen(cam, viewport, x, y).x, viewport.w) : worldPan(x - crew.x))) });
      }
      // Paused, or a frozen online copy (a lost link): the callouts, flashes, heal motes and the charge pulse hold (polish i review).
      const frozen = source.paused() || source.live?.() === false;
      stepFx(fx, frozen ? 0 : fxDt(fx, dt));   // Feel-i: the kill's slow motion is render time only
      stepPings(pings, frozen ? 0 : dt);
      trackSolution(fx, linedUp(laserSituation(d.tactical, fx.sinceShot, gunnerPresent(d))), frozen ? 0 : dt);
      recordTrails(fx, d.tactical, source.missilePrev, alpha);
      layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
      let overlayView: MapOverlayView | null = null;
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt, events, frozen ? 0 : dt, { camera: source.interiorCamera, active: source.active() }, options.pointer?.() ?? null);   // Art-i spec section 7: the light and feel hold while paused; Engineering spike §6: the hover outline
      else {
        // Step 4: the map keeps its arrows and info line clear of the window while it is shown.
        const input = {
          rockTrack, state: d.tactical, prev: source.prev, alpha, camera: cam!, viewport, console: camKey!, axes: source.axes(),
          ships: fx.kill || !fogView.seen.enemy ? [0] : [0, 1], fog: fogView, paused: overlay.layerPaused, contacts: true, ...(onConsole ? { reserveLeft: CONSOLE_RESERVE.left, reserveRight: shown ? CONTACT_RESERVE : CONSOLE_RESERVE.right, reserveTop: STATUS_RESERVE, infoBand: { left: TABS_RIGHT, right: SIDE.x } } : { reserveRight: READOUT_COLUMN }), ...(onMap ? { avoid: OWN_SHIP } : {}), spreadArrows: true, missilePrev: source.missilePrev, fx, t, gunner: gunnerPresent(d),
          holdHeading: view === 'flight' ? -1 : preview ?? d.holdHeading, holdPreview: preview !== null, crewHull: hullFor(true, d.interior.layout.hull), gravity: camKey === 'helm', flight: view === 'flight', alert, pings,   // Feel-ii; Valkyrn spec §4.5: the crew hull
          laserAim: station === 'weapons' && view === 'weapons' ? options.requests?.reticleAim() ?? null : null,   // W-2: the MANUAL laser's aim (the reticle) (the model aims along the nose without one)
          turrets: source.turret ? { pew: source.turret(0), gun: source.turret(1) } : null,   // W-4 spec §10, §11: online the own selected turret is predicted
          weaponSel: source.weaponSel?.() ?? 0,
          reticle: station === 'weapons' && view === 'weapons' && reticleOnMap ? reticlePointer : null,   // W-4 spec §10: the cross at the pointer
          vent, steerTo,   // playtest2feedback §6: the puffs and the steering marker
          mapGrid: renderer.mapGrid?.() ?? DEFAULT_MAP_GRID   // Settings: the gravity grid or the square one
        } as const;
        const model = tacticalModel(input);
        layer.setCrt(crtScale(renderer.crt()));   // CRT map spec sections 3-4: the filter strength follows the setting
        layer.draw(model, combatModel({ ...input, t: frozen ? 0 : t, enemyArrow: model.arrows.find((a) => a.target === 'enemy') ?? null, goal: onConsole && seat === 'helm' && !goalUsed }), t);   // the blinks run on the presentation clock, paused or not
        overlayView = mapOverlayOf(model.overlay);
      }
      // Sci-1 spec §7.3: Science's hover readout, from the crew ship's drawn position to the cursor.
      const hover = station === 'science' && view !== 'interior'
        ? hoverReadout(cam!, viewport, interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), options.pointer?.() ?? null)
        : null;
      const consoleView = consoleModel({ duel: d, me: source.active(), mode: source.mode, hidden, held: source.uiHeld(), overlay: overlayView, throttle: source.throttle(), thrMille: source.thrMille?.() ?? d.thrMille, vent, hover,
        sinceShot: fx.sinceShot, goal: seat === 'weapons' && !goalUsed, t, refused: refusedView, shipView: view === 'interior', weaponSel: source.weaponSel?.() });
      // Step 5: the contact view, only while shown.
      const open = contact?.state() ?? null;
      const contactView = shown && station !== null && station !== 'ship'   // Science's window shows with nothing selected
        ? contactModel({ state: d.tactical, contact: open?.contact ?? null, aim: open?.aim ?? false, weapon: contact?.aimWeapon() ?? 'laser', station, t, weapons: consoleView?.weapons ?? consoleView?.flight?.weapons ?? null, seen: open?.contact === 0 ? fogView.seen.enemy : open?.contact === 1 ? fogView.seen.derelict : true, flashes: open?.contact === 0 ? flashesFor(fx.struck, targetOf(d.tactical, CREW_SLOT)) : [] })
        : null;
      options.ui.frame({
        readout: { rows: readoutRows({ duel: d, mode: view === 'flight' ? 'helm' : view, active: source.active(), console: onConsole, fog: fogView }), help: onConsole ? [] : readoutHelp(view === 'flight' ? 'helm' : view, view === 'helm' && crewSeat) },
        end: overlay.end,
        console: consoleView,
        crt: crtActive(view),
        ...sceneUi(view, overlay, options.pauseText, overlayView),
        hud: view === 'interior' ? shipHud(d) : null,   // duel polish i spec §E: the SHIP view, paused and on the end card too (review)
        ...(contact ? { contact: contactView } : {}),
        ownShip: onMap ? ownShipModel(d, OWN_SHIP_BOX, t, flashUntil) : null,   // own ship window spec §4: the console map views only
        ...(contactView?.aimWeapon ? { pointer: options.pointer?.() ?? null } : {}),   // FTL targeting spec §1: seeds the targeting line
        sitCard: onConsole && seat !== null && carded ? sitCard(seat, t - sitAt, acted, sitCardBelow(d.tactical, fogView), !!overlay.notice) : null   // Feel-i §1; Feel-ii §3.9: under the online notice
      });
      // Art-i spec section 7: the interior shakes its own world; the console views keep the fx shake (Feel-i: scaled by Settings).
      const shake = view === 'interior' ? { x: 0, y: 0 } : shakeOffset(fx, shakeScale(renderer.shake?.() ?? 'full'));
      scene.position.set(shake.x, shake.y);
      return consoleView?.station ?? null;
    },
    /** Engineering spike §5: the interior's last placement (null before its first draw), for the staging hook and tests. */
    interiorPlacement(): Placement | null { return interior.placement(); },
    dispose(): void {
      options.ui.clear();
      interior.destroy();
      renderer.app.stage.removeChild(root); root.destroy({ children: true });
      for (const child of hidden) child.visible = true;
    }
  };
}
export type DuelScene = ReturnType<typeof createDuelScene>;
