// The amber phosphor ramp of the console screens (CRT map spec section 2). Every colour the tactical layer and the
// console overlays draw in a console view is one of these six; meaning survives by brightness, solid vs hollow, solid vs
// dashed, hatching and two-state blinks, never by hue. Pure: no Pixi.

/** The ramp, darkest first: the tube's dark teal-grey glass, then the phosphor from faint to hot. */
export const CRT = { glass: 0x0c0e0b, faint: 0x2a1a08, dim: 0x7a4a10, mid: 0xc47a12, main: 0xffae1a, hot: 0xffd36b } as const;
export type CrtTone = keyof typeof CRT;
export const CRT_RAMP: readonly number[] = Object.values(CRT);

/** Dash patterns in screen pixels: dashed 6 on / 4 off, dotted 1 on / 3 off; the damage hatch every 4 px at 45 degrees. */
export const DASH = 6, GAP = 4, HATCH_SPACING = 4, HATCH_ANGLE = Math.PI / 4;

/** Blink rates (Hz): the enemy ring and the enemy missile; room damage level 2; the readout's alert bar. */
export const ENEMY_BLINK_HZ = 1, DAMAGE_BLINK_HZ = 2, ALERT_BLINK_HZ = 2;

/** A two-state square wave on the presentation time t (seconds): 0 or 1, floor(t * 2 * hz) % 2. Never "off". */
export function blink(t: number, hz: number): 0 | 1 {
  return (((Math.floor(t * 2 * hz) % 2) + 2) % 2) as 0 | 1;
}

/** A room's damage look (hull silhouettes spec section 2's table; enemy ship window spec §6.3): the fill (null: none),
 *  the 1 px stroke and the hatch colour (null: none) for a ship side, a damage level and the DAMAGE_BLINK_HZ phase.
 *  The console map and the contact window both draw by it. */
export interface RoomLook { readonly fill: number | null; readonly stroke: number; readonly hatch: number | null }
const look = (fill: number | null, stroke: number, hatch: number | null): RoomLook => Object.freeze({ fill, stroke, hatch });
type LookRows = readonly (readonly [RoomLook, RoomLook])[];
const CREW_LOOKS: LookRows = [
  [look(null, CRT.glass, null), look(null, CRT.glass, null)],
  [look(CRT.mid, CRT.glass, CRT.glass), look(CRT.mid, CRT.glass, CRT.glass)],
  [look(CRT.glass, CRT.hot, null), look(CRT.hot, CRT.glass, null)]
];
const ENEMY_LOOKS: LookRows = [
  [look(null, CRT.mid, null), look(null, CRT.mid, null)],
  [look(CRT.dim, CRT.main, CRT.main), look(CRT.dim, CRT.main, CRT.main)],
  [look(CRT.hot, CRT.glass, null), look(CRT.glass, CRT.main, CRT.main)]
];
/** The look for one room: frozen shared objects, so a frame allocates nothing. */
export function roomLook(crew: boolean, level: 0 | 1 | 2, phase: 0 | 1): RoomLook { return (crew ? CREW_LOOKS : ENEMY_LOOKS)[level]![phase]; }
/** A room's damage value (0..2) as the table's level: 0, 1, anything else 2 (as drawShip always read it). */
export function roomLevel(n: number): 0 | 1 | 2 { return n === 0 ? 0 : n === 1 ? 1 : 2; }
