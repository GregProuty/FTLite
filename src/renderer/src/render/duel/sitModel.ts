// Feel-i (spec 2026-11-17-console-feel-design §1, sitting down): what a seat shows in its first seconds. The sit-down card
// (the seat's goal and its keys, for SIT_CARD_S or until the first action, on the first SIT_CARD_SITS sits of a seat
// per app session), the goal glow that stops once the control is used, and the auto-frame zoom that fits both ships.
// Pure apart from the session's sit counter, which lives for the app's run and is never saved.
import type { Viewport } from '../tactical/camera';

export const SIT_CARD_S = 4, SIT_CARD_FADE_S = 0.5, SIT_CARD_SITS = 3;
/** The auto-frame's zoom clamp and the screen px kept clear between the enemy and the map's usable edges. */
export const FRAME_ZOOM_MIN = 0.25, FRAME_ZOOM_MAX = 1, FRAME_MARGIN = 110;
/** Own ship window spec §3 (owner 2026-11-18): the framed enemy clears the avoid rect by the arrow margin, not FRAME_MARGIN. */
export const AVOID_MARGIN = 28;

export type SitSeat = 'helm' | 'weapons' | 'flight';
/** `top`: the card sits at the top of the map, clear of an enemy below the ship; else at the bottom. */
/** `under` (Feel-ii §3.9): the online start's notice (YOU: HELM) shows, so a top card moves below it. */
export interface SitCardView { seat: SitSeat; title: string; keys: readonly string[]; alpha: number; top: boolean; under?: boolean }
export const SIT_CARDS: Readonly<Record<SitSeat, { title: string; keys: readonly string[] }>> = {
  helm: { title: 'HELM: POINT AT THE ENEMY', keys: ['HOLD LMB  STEER', 'W/S  THROTTLE (IT STAYS)', 'TAP S  CUT THRUST', 'BRAKE: TAP S, OR FLIP AND BURN'] },   // helm round 2 §6.4: the lever, the tap and braking (four keys fit, plan Decision 4)
    weapons: { title: 'WEAPONS: CLICK A WEAPON, THEN A ROOM OR ROCK', keys: ['1  LASER', '2  TORPEDO', 'E/Q  NEXT ROOM', 'L-CLICK MAP  PEW'] },   // W-1: the pew
  flight: { title: 'FLIGHT: MOUSE TO STEER', keys: ['W/S THROTTLE', 'L-CLICK GUN', 'R-CLICK TORPEDO'] }   // Valkyrn spec §9
};

const shown: Record<SitSeat, number> = { helm: 0, weapons: 0, flight: 0 };
/** Count a sit at `seat`; true while it is one of the session's first SIT_CARD_SITS there (the card shows). */
export function countSit(seat: SitSeat): boolean { shown[seat]++; return shown[seat] <= SIT_CARD_SITS; }
/** Tests: forget the session's sits. */
export function resetSits(): void { shown.helm = 0; shown.weapons = 0; shown.flight = 0; }

/** Each character's Helm or Weapons seat last frame (null on foot or at Science), one per player of the crew (Sci-2 spec
 *  §5.1), so a sit is told from a Tab. Empty until the first frame. */
export interface SitTracker { seats: (SitSeat | null)[] }
export function createSitTracker(): SitTracker { return { seats: [] }; }
/** One frame (Feel-i review): true when the `active` character has just sat down at the Helm or Weapons, its own seat going
 *  from none to a console. A Tab to a character already seated is no sit (no card, no auto-frame). Records every seat. */
export function trackSit(tr: SitTracker, active: number, seats: readonly (SitSeat | null)[]): boolean {
  const sat = (tr.seats[active] ?? null) === null && (seats[active] ?? null) !== null;
  tr.seats = seats.slice();
  return sat;
}

/** The card `age` seconds after sitting, or null once its time is up or the seat has acted. Fades over its last half
 *  second. `enemyBelow`: the enemy is below the ship on screen, so the card goes to the top to keep it in view. */
export function sitCard(seat: SitSeat, age: number, acted: boolean, enemyBelow = false, notice = false): SitCardView | null {
  if (acted || age >= SIT_CARD_S || age < 0) return null;
  return { seat, ...SIT_CARDS[seat], alpha: Math.min(1, (SIT_CARD_S - age) / SIT_CARD_FADE_S), top: enemyBelow, ...(notice ? { under: true } : {}) };
}

/** The zoom that fits the enemy at (dx, dy) world units from the own ship on screen, the camera centred on the own ship:
 *  inside the map's usable span (clear of the left and right reserves) with FRAME_MARGIN, clamped to 0.25..1. Own ship
 *  window spec §3: with `avoid`, an up-left enemy is also kept clear of that rect on at least one axis. */
export function frameZoom(dx: number, dy: number, vp: Viewport, reserveLeft: number, reserveRight: number, avoid?: { x: number; y: number; w: number; h: number }): number {
  const left = vp.w / 2 - reserveLeft - FRAME_MARGIN, right = vp.w / 2 - reserveRight - FRAME_MARGIN, up = vp.h / 2 - FRAME_MARGIN;
  const zx = dx === 0 ? Infinity : (dx < 0 ? left : right) / Math.abs(dx), zy = dy === 0 ? Infinity : up / Math.abs(dy);
  const za = avoid && dx < 0 && dy < 0
    ? Math.max((vp.w / 2 - (avoid.x + avoid.w) - AVOID_MARGIN) / Math.abs(dx), (vp.h / 2 - (avoid.y + avoid.h) - AVOID_MARGIN) / Math.abs(dy))
    : Infinity;
  return Math.max(FRAME_ZOOM_MIN, Math.min(FRAME_ZOOM_MAX, zx, zy, za));
}
