// Feel-ii (spec 2026-11-18-feel-ii-design §2.7): crew pings. A middle click or G on a console map drops a ping at the map
// point, or on the enemy when the pointer is over it; it shows on every seat for PING_S as an expanding ring and a short
// label, HERE or TARGET. Pure and presentation only: Single player keeps them on its one screen, the online duel sends
// them on the cosmetic channel beside the sim's commands (never a sim command), at most one a second per player.

import { PING_GAP_MS } from '../../net/contracts';

/** Seconds a ping shows; the most kept at once; the shortest gap between one player's pings (ms). */
export const PING_S = 3, PINGS_MAX = 6;
export { PING_GAP_MS };
/** A ping in world units; `target` pings ride on the enemy ship's drawn position instead of a fixed point. */
export interface Ping { x: number; y: number; target: boolean; player: number; age: number }
/** The world-space request a click or G makes. */
export interface PingRequest { x: number; y: number; target: boolean }

/** Whether a player may ping now (PING_GAP_MS since its last, `last` null for none). */
export function pingAllowed(last: number | null, now: number): boolean { return last === null || now - last >= PING_GAP_MS; }

/** Add a ping (the oldest goes past PINGS_MAX); a player's newer ping replaces the one it still shows. */
export function pushPing(list: Ping[], p: PingRequest & { player: number }): void {
  for (let k = list.length - 1; k >= 0; k--) if (list[k]!.player === p.player) list.splice(k, 1);
  list.push({ x: p.x, y: p.y, target: p.target, player: p.player, age: 0 });
  while (list.length > PINGS_MAX) list.shift();
}

/** Age every ping by dt seconds and drop the ones past PING_S. */
export function stepPings(list: Ping[], dt: number): void {
  for (const p of list) p.age += dt;
  for (let k = list.length - 1; k >= 0; k--) if (list[k]!.age >= PING_S) list.splice(k, 1);
}

/** One ping on screen: two rings (the outer expanding once a second), its label and its fade. */
export interface PingDraw { x: number; y: number; r: number; inner: number; alpha: number; label: { text: string; x: number; y: number } }
/** The draw list, in screen px: `toScreen` maps world to screen, `enemy` is the enemy's drawn screen position (null when
 *  it is not shown, then its target pings sit at their dropped point). */
export function pingDraws(list: readonly Ping[], toScreen: (x: number, y: number) => { x: number; y: number }, enemy: { x: number; y: number } | null): PingDraw[] {
  return list.map((p) => {
    const at = p.target && enemy ? enemy : toScreen(p.x, p.y), k = p.age % 1, fade = Math.min(1, (PING_S - p.age) / 0.5);
    return { x: at.x, y: at.y, r: 10 + 26 * k, inner: 8, alpha: Math.max(0, fade) * (1 - 0.6 * k), label: { text: p.target ? 'TARGET' : 'HERE', x: at.x, y: at.y - 30 } };
  });
}
