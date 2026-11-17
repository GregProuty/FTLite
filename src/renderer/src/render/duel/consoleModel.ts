// The Artemis-style console's view model (spec 2026-11-17-artemis-consoles §4, §6.1, §6.3). Pure: built each frame by
// the scene from the duel, the local character and the merged held keys; null hides the console.
import { consoleInReach, repairInReach, seatOf, type Seat } from '../../app/duel/controls';
import { NO_HELD_FLAGS, type HeldFlags, type KeyAction } from '../../app/duel/input';
import type { DuelState } from '../../sim/duel/state';
import { missileOf } from '../../sim/tactical/state';
import { HEADING_COUNT, MAGAZINE } from '../../sim/tactical/tuning';
import { canLaunch } from '../../sim/tactical/weapons';
import type { MapOverlayView } from '../../ui/views';
import { chargeRow, type ReadoutRow } from './readoutModel';

export type ConsoleStation = 'helm' | 'weapons' | 'ship';
export type TabState = 'current' | 'open' | 'locked';
export interface HelmPanel { heading: number; speed: number; held: HeldFlags }
export interface WeaponsPanel { lock: number; charge: ReadoutRow; magazine: string; canLaunch: boolean; missileFlying: boolean; fireHeld: boolean; held: HeldFlags }
export interface ConsoleView {
  station: ConsoleStation;
  tabs: Record<ConsoleStation, TabState>;
  /** What a click on an open tab does: E (sit), Tab (take the other character) or X (stand). */
  tabActions: Record<ConsoleStation, KeyAction | null>;
  helm: HelmPanel | null;
  weapons: WeaponsPanel | null;
  side: { zoom: string; free: boolean; snapLabel: 'SNAP' | 'CAMERA' } | null;
}
export interface ConsoleModelInput { duel: DuelState; me: 0 | 1; mode: 'single' | 'online'; hidden: boolean; held: HeldFlags; overlay: MapOverlayView | null }

/** The tab rule of spec §6.3 on its inputs alone: `reach` is the console `consoleInReach` gives while standing (null
 *  for none), `repairNear` whether `repairInReach` finds a repair (E would repair, not sit). */
export function consoleTabs(i: { seat: Seat; reach: 'helm' | 'weapons' | null; repairNear: boolean; otherSeat: Seat; mode: 'single' | 'online' }): Pick<ConsoleView, 'tabs' | 'tabActions'> {
  const tabs: Record<ConsoleStation, TabState> = { helm: 'locked', weapons: 'locked', ship: 'locked' };
  const tabActions: Record<ConsoleStation, KeyAction | null> = { helm: null, weapons: null, ship: null };
  if (i.seat === 'standing') {
    tabs.ship = 'current';
    if (i.reach && !i.repairNear) { tabs[i.reach] = 'open'; tabActions[i.reach] = 'interact'; }
  } else { tabs[i.seat] = 'current'; tabs.ship = 'open'; tabActions.ship = 'stand'; }
  if (i.mode === 'single' && i.otherSeat !== 'standing' && tabs[i.otherSeat] === 'locked') { tabs[i.otherSeat] = 'open'; tabActions[i.otherSeat] = 'switch'; }
  return { tabs, tabActions };
}

export function consoleModel(i: ConsoleModelInput): ConsoleView | null {
  if (i.hidden) return null;
  const d = i.duel, seat = seatOf(d, i.me), station: ConsoleStation = seat === 'standing' ? 'ship' : seat;
  const c = seat === 'standing' ? consoleInReach(d, i.me) : -1;
  const { tabs, tabActions } = consoleTabs({ seat, reach: c < 0 ? null : c === d.nav ? 'helm' : 'weapons', repairNear: seat === 'standing' && repairInReach(d, i.me) >= 0,
    otherSeat: seatOf(d, i.me === 0 ? 1 : 0), mode: i.mode });
  const t = d.tactical, held = i.held ?? NO_HELD_FLAGS;
  const ship = t.ships[0]!;
  const helm: HelmPanel | null = station === 'helm'
    ? { heading: ((Math.round((ship.heading / HEADING_COUNT) * 360) % 360) + 360) % 360, speed: Math.round(Math.hypot(ship.vx, ship.vy)), held }
    : null;
  const flying = missileOf(t, 0) !== null, sys = t.systems[0];
  const weapons: WeaponsPanel | null = station === 'weapons'
    ? { lock: sys.lock, charge: chargeRow(d), magazine: `${sys.magazine}/${MAGAZINE}`, canLaunch: canLaunch(t, 0), missileFlying: flying, fireHeld: held.fire, held }
    : null;
  const side = i.overlay && station !== 'ship'
    ? { zoom: i.overlay.zoomText.replace(/^ZOOM\s+/, ''), free: i.overlay.snapHint, snapLabel: station === 'weapons' ? 'CAMERA' as const : 'SNAP' as const }
    : null;
  return { station, tabs, tabActions, helm, weapons, side };
}
