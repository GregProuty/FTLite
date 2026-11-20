// The Artemis-style console's view model (spec 2026-11-17-artemis-consoles §4, §6.1, §6.3). Pure: built each frame by
// the scene from the duel, the local character and the merged held keys; null hides the console.
import { consoleInReach, crewHelmSeat, flightSeat, repairInReach, seatOf, type Seat } from '../../app/duel/controls';
import { NO_HELD_FLAGS, type HeldFlags, type KeyAction } from '../../app/duel/input';
import type { DuelState } from '../../sim/duel/state';
import { hasTurret, pewThird } from '../../sim/tactical/defs';
import { gunInterval } from '../../sim/tactical/gun';
import { autocannonRateText } from '../../app/duel/weaponsSeat';
import { classOf, Contact, handControl, missileOf, Room, type TacticalState } from '../../sim/tactical/state';
import { enemyHostile } from '../../sim/tactical/science';
import { HEADING_COUNT, MAGAZINE } from '../../sim/tactical/tuning';
import { beamShots, canLaunch, torpedoInRange } from '../../sim/tactical/weapons';
import type { MapOverlayView } from '../../ui/views';
import { chargeRow, type ReadoutRow } from './readoutModel';
import { gunnerPresent, laserCardReason, laserSituation, manualCardReason, weaponsOffline, type RefusedControl } from './situationModel';
import { DuelSystem } from '../../sim/duel/power';
import { throttleCap, trimmedWeaponPower, weaponBarsUsable, WeaponSlot } from '../../sim/tactical/bars';
import { powerStrip, type ConsolePowerStrip } from './shipHudModel';
import { engineBars, throttleCap as crewThrottleCap, throttleFloor } from '../../sim/duel/helmFlight';
import { GAS_MAX, GAS_SPEND, THR_MAX, THR_MIN } from '../../sim/duel/tuning';
export { THR_MAX, THR_MIN };   // playtest2feedback §6: the throttle bar's range, for the UI (which imports no sim values)

export type ConsoleStation = 'helm' | 'weapons' | 'science' | 'flight' | 'ship';
export type TabState = 'current' | 'open' | 'locked';
type TabKey = Exclude<ConsoleStation, 'flight'>;
/** The tab strip's states. Valkyrn spec §5: `flight` is present only on a layout with the Flight seat, so the Hound's tabs
 *  keep their four keys. */
export type ConsoleTabs = Record<TabKey, TabState> & { flight?: TabState };
export type ConsoleTabActions = Record<TabKey, KeyAction | null> & { flight?: KeyAction | null };
/** Feel-ii §2.8: a refused control on this block: which, the reason, and whether it is still in its flash. */
export interface RefusedView { control: RefusedControl; reason: string; flash: boolean }
/** Playtest2feedback §6: the crew Helm's readings: the shown thrMille, the throttle's cap and floor, and (owner 2026-11-19,
 *  replacing §5's split) the effective Engines bars that set them. Helm round 2 §6.1: the cold gas charge (`gas` of
 *  `gasMax`), whether it is below one tick's spend (`gasLow`), and whether a thruster vents this frame (`venting`). */
export interface CrewHelmPanel { thrMille: number; cap: number; floor: number; bars: number; gas: number; gasMax: number; gasLow: boolean; venting: boolean }
/** The crew Helm's readings (CrewHelmPanel). `vent` is this frame's vent the scene draws (online, this seat's prediction);
 *  absent, the duel's helmVent (plan Decision 14). */
export function crewPanel(d: DuelState, thrMille: number, vent: { x: number; y: number } | null = null): CrewHelmPanel {
  const engine = engineBars(d), v = vent ?? d.helmVent;
  return { thrMille, cap: crewThrottleCap(engine), floor: throttleFloor(engine), bars: engine, gas: d.gas, gasMax: GAS_MAX, gasLow: d.gas < GAS_SPEND, venting: v.x !== 0 || v.y !== 0 };
}
export interface HelmPanel {
  heading: number; speed: number; held: HeldFlags; throttle: number; refused?: RefusedView | null; holdHeading?: number;
  /** Playtest2feedback §6: the crew Helm's block (a newtonianHelm class at the Helm); absent: the notched throttle. */
  crew?: CrewHelmPanel;
  /** Valkyrn spec §5: the Helm block on the Flight seat (its hints name the mouse and the torpedo). */
  flight?: boolean;
  /** Engineering spike §10.2: the highest forward throttle level the Engines bars allow; notches above it draw locked. */
  cap?: number;
}
/** `freq`: the crew laser's tuned frequency 0..2; `weakFreq`: the enemy's weak one, shown only after a Level 2 scan (Sci-1 spec §7.4). */
/** `torpedoInRange`: the target within the torpedo's range (weapons update spec §2), shown IN RANGE / OUT OF RANGE. */
/** FTL targeting spec §1, the weapon cards: `laserTarget` the laser's target room (−1 none), `torpTarget` the torpedo's
 *  (−1 none), `burst` the laser's shots a charge (the card's `x2` mark). */
/** Feel-i (console feel spec §3): `laserReason` the LASER card's why-not (`OUT OF ARC: HELM TURN RIGHT`, `OUT OF RANGE
 *  612/450`, `WEAPONS OFFLINE`) or FIRING, null while it simply charges; `goal` the card's goal glow (§1: untargeted, and
 *  not yet picked up this sit). */
/** Spike ii §6.5: whether the laser's rock target, the torpedo's next rock target and the flying torpedo's rock are set. */
export interface WeaponsPanel { lock: number; charge: ReadoutRow; magazine: string; canLaunch: boolean; torpedoInRange: boolean; missileFlying: boolean; fireHeld: boolean; held: HeldFlags; freq: number; weakFreq: number | null;
  laserTarget: number; torpTarget: number; burst: number; laserReason?: string | null; goal?: boolean; refused?: RefusedView | null;
  laserRock?: boolean; torpRock?: boolean; torpRockFlying?: boolean;
  /** W-2 (pew pew spec §2): the laser's mode for the LASER card's AUTO / MAN tag (true MANUAL); absent draws no tag. */
  laserManual?: boolean;
  /** W-3 (pew pew spec §3): the torpedo's mode for the TORPEDO card's AUTO / MAN tag (true MANUAL; absent draws no tag);
   *  `torpSteer`: the crew's torpedo in flight is a MANUAL one that can turn now (past its boost, fuel left: the card says
   *  STEER LMB, W-4 spec §10); `torpCoast`: it is a MANUAL one whose fuel is spent (COASTING). Both false during its boost (FLYING). */
  torpManual?: boolean; torpSteer?: boolean; torpCoast?: boolean;
  /** Engineering spike §10.3: the bars each weapon stands on now (pew pew, beam, torpedo; 0..4, trimmed) and the Weapons
   *  bars not yet spent. Optional, so a hand-built panel may leave them out (the probe's fixture). */
  weaponBars?: number[]; weaponFree?: number;
  /** W-1 (pew pew spec 1): each third's fill 0..1 (the PEW card's pips); absent or null without the pew. */
  pew?: readonly number[] | null;
  /** W-4 spec §10: the Hound's AUTOCANNON card (absent or null on a laser class): heat 0..1, locked, Weapons offline, and
   *  its rate text at the current bars (`6/S`, `OFF`); `selected` the selected card (0..2). */
  autocannon?: { heat: number; locked: boolean; offline: boolean; rate: string } | null; selected?: number;
  /** W-4 spec §10 (W-4b), amendment §2.5: each gun's own switch (its tag is lit while it is set to MAN); the gun slot in the
   *  gunner's hands (0 or 1, −1 none: handControl, owner 2026-11-19), whose tag reads MAN while every other gun's reads AUTO,
   *  a MAN one that is not selected too; and whether the 30 s hold keeps the AUTO-driven guns quiet (their tags then read
   *  HOLD instead of AUTO). */
  pewManual?: boolean; gunManual?: boolean; gunsHand?: number; gunsHold?: boolean }
/** Valkyrn spec §8: the GUN card: OFFLINE (Weapons at 2), OVERHEAT (locked) or READY; heat 0..1. */
export interface GunPanel { state: 'READY' | 'OVERHEAT' | 'OFFLINE'; heat: number; locked: boolean }
/** Valkyrn spec §5: the Flight seat's weapons: the GUN card (null with the laser fit) and the Weapons panel its cards and the
 *  contact window read. */
export interface FlightPanel { gun: GunPanel | null; weapons: WeaponsPanel }
/** The Science block (Sci-1 spec §7.3): the hover readout, or null with no cursor over the map. */
export interface SciencePanel { hover: string | null }
export interface ConsoleView {
  station: ConsoleStation;
  tabs: ConsoleTabs;
  /** What a click on an open tab does: E (sit), Tab (take the other character, or on a crew of one the ship view) or X (stand). */
  tabActions: ConsoleTabActions;
  helm: HelmPanel | null;
  weapons: WeaponsPanel | null;
  science: SciencePanel | null;
  side: { zoom: string; free: boolean; snapLabel: 'SNAP' | 'CAMERA' } | null;
  /** Valkyrn spec §5: the Flight seat's block; present only there. */
  flight?: FlightPanel | null;
  /** Engineering spike §9.3: this console's own system power (Helm -> Engines, Weapons -> Weapons, Science -> Sensors);
   *  absent on the ship view and the Flight seat. */
  power?: ConsolePowerStrip | null;
}
export interface ConsoleModelInput {
  duel: DuelState; me: number; mode: 'single' | 'online'; hidden: boolean; held: HeldFlags; overlay: MapOverlayView | null;
  /** The Helm throttle level to show (Artemis spec §6.1: the local base); the duel's own level when absent. */
  throttle?: number;
  /** Playtest2feedback §3, §6: the crew Helm's thrMille to show (Single player the sim's; online the local prediction); the duel's when absent. */
  thrMille?: number;
  /** Helm round 2 §6.1: the crew ship's vent this frame (the scene's, the puffs' source), for the GAS bar's hot fill; absent: the duel's. */
  vent?: { x: number; y: number } | null;
  /** Science's hover readout this frame (Sci-1 spec §7.3), from the scene; null or absent with no cursor. */
  hover?: string | null;
  /** Feel-i: seconds since the crew laser last fired on this screen (the FIRING hold; absent: never), and whether the
   *  LASER card's goal glow may show this sit (the scene stops it once the laser is picked up). */
  sinceShot?: number; goal?: boolean; t?: number;
  /** Feel-ii §2.8: the latest refused control while its reason shows; it goes to the block that owns the control. */
  refused?: RefusedView | null;
  /** Valkyrn spec §4.4: Tab's ship view while seated (n = 1): the console shows SHIP. */
  shipView?: boolean;
  /** W-4 spec §10: the Hound's selected weapon. */
  weaponSel?: number;
}

/** The tab rule of spec §6.3 on its inputs alone: `reach` is the console `consoleInReach` gives while standing (null
 *  for none), `repairNear` whether `repairInReach` finds a repair (E would repair, not sit). */
export function consoleTabs(i: { seat: Seat; reach: 'helm' | 'weapons' | 'science' | 'flight' | null; repairNear: boolean; otherSeat: Seat; mode: 'single' | 'online'; flight?: boolean; shipView?: boolean }): Pick<ConsoleView, 'tabs' | 'tabActions'> {
  const tabs: ConsoleTabs = { helm: 'locked', weapons: 'locked', science: 'locked', ship: 'locked', ...(i.flight ? { flight: 'locked' as const } : {}) };
  const tabActions: ConsoleTabActions = { helm: null, weapons: null, science: null, ship: null, ...(i.flight ? { flight: null } : {}) };
  if (i.seat !== 'standing' && i.shipView) { tabs.ship = 'current'; tabs[i.seat] = 'open'; tabActions[i.seat] = 'switch'; }   // Valkyrn spec §4.4: Tab back to the console
  else if (i.seat === 'standing') {
    tabs.ship = 'current';
    if (i.reach && !i.repairNear) { tabs[i.reach] = 'open'; tabActions[i.reach] = 'interact'; }
  } else { tabs[i.seat] = 'current'; tabs.ship = 'open'; tabActions.ship = 'stand'; }
  if (i.mode === 'single' && i.otherSeat !== 'standing' && tabs[i.otherSeat] === 'locked') { tabs[i.otherSeat] = 'open'; tabActions[i.otherSeat] = 'switch'; }
  return { tabs, tabActions };
}

/** The station a character's console shows (spec §6.3): its seat, or SHIP while standing. The scene reads it before the
 *  map is built (enemy ship window spec §6.5 step 1). */
export function consoleStation(d: DuelState, me: number): ConsoleStation {
  const seat = seatOf(d, me);
  return seat === 'standing' ? 'ship' : seat;
}

const HELM_CONTROLS: readonly RefusedControl[] = ['turn', 'auto-face', 'throttle', 'heading', 'gas'];   // helm round 2 §3.3: NO GAS shows on the Helm block

/** W-1 (pew pew spec 1): the crew pew's pips, one per third, each its fill 0..1 (a full third 1, the one recharging its
 *  share, the rest 0); null for a class without the pew. A third is the def's pewThird (Engineering spike §11: charge units). */
export function pewPips(t: TacticalState): number[] | null {
  const def = classOf(t, 0).slots.pew;
  if (!def) return null;
  const c = t.systems[0].pewCharge;
  const third = pewThird(def);
  return Array.from({ length: def.shots }, (_, k) => Math.max(0, Math.min(1, (c - k * third) / third)));
}
export function consoleModel(i: ConsoleModelInput): ConsoleView | null {
  if (i.hidden) return null;
  const d = i.duel, seat = seatOf(d, i.me), shipView = (i.shipView ?? false) && seat !== 'standing', fl = flightSeat(d);
  const station: ConsoleStation = shipView ? 'ship' : consoleStation(d, i.me);
  const c = seat === 'standing' ? consoleInReach(d, i.me) : -1;
  const { tabs, tabActions } = consoleTabs({ seat, reach: c < 0 ? null : fl && (c === d.nav || c === d.weapons) ? 'flight' : c === d.nav ? 'helm' : c === d.weapons ? 'weapons' : 'science', repairNear: seat === 'standing' && repairInReach(d, i.me) >= 0,
    otherSeat: i.mode === 'single' ? seatOf(d, i.me === 0 ? 1 : 0) : 'standing', mode: i.mode, flight: fl, shipView });   // the Tab target: Single player's other character only
  const t = d.tactical, held = i.held ?? NO_HELD_FLAGS;
  const ship = t.ships[0]!;
  const helm: HelmPanel | null = station === 'helm' || station === 'flight'
    ? { heading: ((Math.round((ship.heading / HEADING_COUNT) * 360) % 360) + 360) % 360, speed: Math.round(Math.hypot(ship.vx, ship.vy)), held, throttle: i.throttle ?? d.throttle,
        refused: i.refused && HELM_CONTROLS.includes(i.refused.control) ? i.refused : null, holdHeading: d.holdHeading, cap: throttleCap(t.systems[0]!), ...(station === 'flight' ? { flight: true } : {}),
        ...(station === 'helm' && crewHelmSeat(d, i.me) ? { crew: crewPanel(d, i.thrMille ?? d.thrMille, i.vent ?? null) } : {}) }   // playtest2feedback §6; helm round 2 §6.1: the gas
    : null;
  const flightM = missileOf(t, 0), flying = flightM !== null, sys = t.systems[0], torpDef = classOf(t, 0).slots.missile;   // W-3: the crew's torpedo in flight and its def, for the card's words
  const weaponsPanel = (): WeaponsPanel => {
    const reason = laserCardReason(laserSituation(t, i.sinceShot ?? Infinity, gunnerPresent(d)), weaponsOffline(t)), w = trimmedWeaponPower(sys), sel = i.weaponSel ?? 0;   // Engineering spike §10.3: the bars each weapon stands on now
    return { lock: sys.lock, charge: chargeRow(d), magazine: `${sys.magazine}/${MAGAZINE}`, canLaunch: canLaunch(t, 0), torpedoInRange: torpedoInRange(t, 0), missileFlying: flying, fireHeld: held.fire, held, freq: sys.freq, weakFreq: t.known[Contact.Enemy] >= 2 ? t.weakFreq : null,
      laserTarget: sys.laserTargeted ? sys.lock : -1, torpTarget: sys.torpLock, burst: classOf(t, 0).slots.laser ? beamShots(t, 0) : 0,   // spec §10.3: the beam's shots by its bars
      weaponBars: w, weaponFree: weaponBarsUsable(sys) - (w[0]! + w[1]! + w[2]!),
      laserRock: sys.laserRock >= 0, torpRock: sys.torpRock >= 0, torpRockFlying: sys.torpRockFlying >= 0,   // spike ii §6.5
      // W-2 (pew pew spec §2): the mode for the tag; in MANUAL the laser never fires by itself, so no FIRING and no goal glow.
      laserReason: sys.laserManual ? manualCardReason(reason) : reason, goal: (i.goal ?? false) && classOf(t, 0).slots.laser !== null && !sys.laserTargeted && !sys.laserManual,   /* W-4 spec §2.1: the FTL opener's glow is the laser's */ laserManual: sys.laserManual,
      torpManual: sys.torpManual, torpSteer: flightM?.manual === true && flightM.age > torpDef.boostTicks && flightM.age <= torpDef.fuelTicks, torpCoast: flightM?.manual === true && flightM.age > torpDef.fuelTicks,   // W-3 (pew pew spec §3): canLaunch above reads the mode (no range in MANUAL); the words follow flyMissile's steering window
      refused: i.refused && !HELM_CONTROLS.includes(i.refused.control) ? i.refused : null, pew: pewPips(t),
      ...(hasTurret(classOf(t, 0)) && classOf(t, 0).slots.gun ? { autocannon: { heat: Math.max(0, Math.min(1, sys.gunHeat / classOf(t, 0).slots.gun!.heatMax)), locked: sys.gunLocked === true,
        offline: sys.rooms[Room.Weapons] >= 2, rate: autocannonRateText(gunInterval(t, 0, handControl(t, 0, sel, 1))) }, selected: sel,   // W-4 spec §10; the rate is MAN's only in hand
        pewManual: sys.pewManual, gunManual: sys.gunManual, gunsHand: [0, 1].find((g) => handControl(t, 0, sel, g)) ?? -1, gunsHold: !enemyHostile(t) } : {}) };   // W-4 amendment §2.5
  };
  const weapons: WeaponsPanel | null = station === 'weapons' ? weaponsPanel() : null;
  const gunDef = classOf(t, 0).slots.gun;   // Valkyrn spec §5, §8: the Flight seat's GUN card (null with the laser fit) and its weapons
  const flight: FlightPanel | null = station === 'flight'
    ? { gun: gunDef ? { state: sys.rooms[Room.Weapons] >= 2 ? 'OFFLINE' : sys.gunLocked === true ? 'OVERHEAT' : 'READY', heat: Math.max(0, Math.min(1, sys.gunHeat / gunDef.heatMax)), locked: sys.gunLocked === true } : null,
        weapons: weaponsPanel() }
    : null;
  const side = i.overlay && station !== 'ship'
    ? { zoom: i.overlay.zoomText.replace(/^ZOOM\s+/, ''), free: i.overlay.snapHint, snapLabel: station === 'weapons' ? 'CAMERA' as const : 'SNAP' as const }
    : null;
  const science = station === 'science' ? { hover: i.hover ?? null } : null;
  const own = station === 'helm' ? DuelSystem.Engines : station === 'weapons' ? DuelSystem.Weapons : station === 'science' ? DuelSystem.Sensors : -1;   // Engineering spike §9.3
  return { station, tabs, tabActions, helm, weapons, science, side, ...(flight ? { flight } : {}), ...(own >= 0 ? { power: powerStrip(d, own) } : {}) };
}
