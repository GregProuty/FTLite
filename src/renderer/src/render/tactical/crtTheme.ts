// The amber phosphor ramp of the console screens (CRT map spec section 2). Every colour the tactical layer and the
// console overlays draw in a console view is one of these six; meaning survives by brightness, solid vs hollow, solid vs
// dashed, hatching and two-state blinks, never by hue. Pure: no Pixi.

/** The ramp, darkest first: the tube's dark teal-grey glass, then the phosphor from faint to hot. */
export const CRT = { glass: 0x0c0e0b, faint: 0x2a1a08, dim: 0x7a4a10, mid: 0xc47a12, main: 0xffae1a, hot: 0xffd36b } as const;
export type CrtTone = keyof typeof CRT;
export const CRT_RAMP: readonly number[] = Object.values(CRT);

/** Dash patterns in screen pixels: dashed 6 on / 4 off, dotted 1 on / 3 off; the damage hatch every 4 px at 45 degrees. */
export const DASH = 6, GAP = 4, DOT = 1, DOT_GAP = 3, HATCH_SPACING = 4, HATCH_ANGLE = Math.PI / 4;

/** Blink rates (Hz): the enemy ring and the enemy missile; room damage level 2; the readout's alert bar. */
export const ENEMY_BLINK_HZ = 1, DAMAGE_BLINK_HZ = 2, ALERT_BLINK_HZ = 2;

/** A two-state square wave on the presentation time t (seconds): 0 or 1, floor(t * 2 * hz) % 2. Never "off". */
export function blink(t: number, hz: number): 0 | 1 {
  return (((Math.floor(t * 2 * hz) % 2) + 2) % 2) as 0 | 1;
}
