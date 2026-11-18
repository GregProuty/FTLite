// The Artemis-style console's view model (spec 2026-11-17-artemis-consoles §4, §6.1, §6.3). Pure: built each frame by
// the scene from the duel, the local character and the merged held keys; null hides the console.
import { consoleInReach, repairInReach, seatOf, type Seat } from '../../app/duel/controls';
import { NO_HELD_FLAGS, type HeldFlags, type KeyAction } from '../../app/duel/input';
import type { DuelState } from '../../sim/duel/state';
import { Contact, missileOf } from '../../sim/tactical/state';
import { HEADING_COUNT, MAGAZINE } from '../../sim/tactical/tuning';
import { canLaunch, torpedoInRange } from '../../sim/tactical/weapons';
import type { MapOverlayView } from '../../ui/views';
import { chargeRow, type ReadoutRow } from './readoutModel';

export type ConsoleStation = 'helm' | 'weapons' | 'science' | 'ship';
export type TabState = 'current' | 'open' | 'locked';
export interface HelmPanel { heading: number; speed: number; held: HeldFlags; throttle: number }
/** `freq`: the crew laser's tuned frequency 0..2; `weakFreq`: the enemy's weak one, shown only after a Level 2 scan (Sci-1 spec §7.4). */
/** `torpedoInRange`: the target within the torpedo's range (weapons update spec §2), shown IN RANGE / OUT OF RANGE. */
export interface WeaponsPanel { lock: number; charge: ReadoutRow; magazine: string; canLaunch: boolean; torpedoInRange: boolean; missileFlying: boolean; fireHeld: boolean; held: HeldFlags; freq: number; weakFreq: number | null }
/** The Science block (Sci-1 spec §7.3): the hover readout, or null with no cursor over the map. */
export interface SciencePanel { hover: string | null }
export interface ConsoleView {
  station: ConsoleStation;
  tabs: Record<ConsoleStation, TabState>;
  /** What a click on an open tab does: E (sit), Tab (take the other character) or X (stand). */
  tabActions: Record<ConsoleStation, KeyAction | null>;
  helm: HelmPanel | null;
  weapons: WeaponsPanel | null;
  science: SciencePanel | null;
  side: { zoom: string; free: boolean; snapLabel: 'SNAP' | 'CAMERA' } | null;
}
export interface ConsoleModelInput {
  duel: DuelState; me: 0 | 1; mode: 'single' | 'online'; hidden: boolean; held: HeldFlags; overlay: MapOverlayView | null;
  /** The Helm throttle level to show (Artemis spec §6.1: the local base); the duel's own level when absent. */
  throttle?: number;
  /** Science's hover readout this frame (Sci-1 spec §7.3), from the scene; null or absent with no cursor. */
  hover?: string | null;
}

/** The tab rule of spec §6.3 on its inputs alone: `reach` is the console `consoleInReach` gives while standing (null
 *  for none), `repairNear` whether `repairInReach` finds a repair (E would repair, not sit). */
export function consoleTabs(i: { seat: Seat; reach: 'helm' | 'weapons' | 'science' | null; repairNear: boolean; otherSeat: Seat; mode: 'single' | 'online' }): Pick<ConsoleView, 'tabs' | 'tabActions'> {
  const tabs: Record<ConsoleStation, TabState> = { helm: 'locked', weapons: 'locked', science: 'locked', ship: 'locked' };
  const tabActions: Record<ConsoleStation, KeyAction | null> = { helm: null, weapons: null, science: null, ship: null };
  if (i.seat === 'standing') {
    tabs.ship = 'current';
    if (i.reach && !i.repairNear) { tabs[i.reach] = 'open'; tabActions[i.reach] = 'interact'; }
  } else { tabs[i.seat] = 'current'; tabs.ship = 'open'; tabActions.ship = 'stand'; }
  if (i.mode === 'single' && i.otherSeat !== 'standing' && tabs[i.otherSeat] === 'locked') { tabs[i.otherSeat] = 'open'; tabActions[i.otherSeat] = 'switch'; }
  return { tabs, tabActions };
}

/** The station a character's console shows (spec §6.3): its seat, or SHIP while standing. The scene reads it before the
 *  map is built (enemy ship window spec §6.5 step 1). */
export function consoleStation(d: DuelState, me: 0 | 1): ConsoleStation {
  const seat = seatOf(d, me);
  return seat === 'standing' ? 'ship' : seat;
}

export function consoleModel(i: ConsoleModelInput): ConsoleView | null {
  if (i.hidden) return null;
  const d = i.duel, seat = seatOf(d, i.me), station = consoleStation(d, i.me);
  const c = seat === 'standing' ? consoleInReach(d, i.me) : -1;
  const { tabs, tabActions } = consoleTabs({ seat, reach: c < 0 ? null : c === d.nav ? 'helm' : c === d.weapons ? 'weapons' : 'science', repairNear: seat === 'standing' && repairInReach(d, i.me) >= 0,
    otherSeat: seatOf(d, i.me === 0 ? 1 : 0), mode: i.mode });
  const t = d.tactical, held = i.held ?? NO_HELD_FLAGS;
  const ship = t.ships[0]!;
  const helm: HelmPanel | null = station === 'helm'
    ? { heading: ((Math.round((ship.heading / HEADING_COUNT) * 360) % 360) + 360) % 360, speed: Math.round(Math.hypot(ship.vx, ship.vy)), held, throttle: i.throttle ?? d.throttle }
    : null;
  const flying = missileOf(t, 0) !== null, sys = t.systems[0];
  const weapons: WeaponsPanel | null = station === 'weapons'
    ? { lock: sys.lock, charge: chargeRow(d), magazine: `${sys.magazine}/${MAGAZINE}`, canLaunch: canLaunch(t, 0), torpedoInRange: torpedoInRange(t, 0), missileFlying: flying, fireHeld: held.fire, held, freq: sys.freq, weakFreq: t.known[Contact.Enemy] >= 2 ? t.weakFreq : null }
    : null;
  const side = i.overlay && station !== 'ship'
    ? { zoom: i.overlay.zoomText.replace(/^ZOOM\s+/, ''), free: i.overlay.snapHint, snapLabel: station === 'weapons' ? 'CAMERA' as const : 'SNAP' as const }
    : null;
  const science = station === 'science' ? { hover: i.hover ?? null } : null;
  return { station, tabs, tabActions, helm, weapons, science, side };
}
