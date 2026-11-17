import { TILE_PX } from '../../../shared/resolution';
import type { Facing8 } from './assetNames';

/** The player colours (moved here from crewSprites.ts, which re-exports them). */
export const CREW_COLORS = [0x4fc3f7, 0x81c784, 0xffb74d, 0xe57373];

/** Art-iv spec section 5: a crew member on a painted ship is a round VTT token, about half a map square (one tile) across. */
export const TOKEN_RADIUS = 0.45 * TILE_PX;
const RIM = 0x14161c, GREY = 0x777777, RING = 0xffe08a, CROSS = 0xe5533d;
const ANGLE: Readonly<Record<Facing8, number>> = { e: 0, se: Math.PI / 4, s: Math.PI / 2, sw: 3 * Math.PI / 4, w: Math.PI, nw: -3 * Math.PI / 4, n: -Math.PI / 2, ne: -Math.PI / 4 };

/** `colour`: the player's own colour in every life state (the painted figure keeps it, muted, when downed). `angle`: the facing in radians. */
export interface TokenLook { radius: number; colour: number; angle: number; slot: number; fill: number; fillAlpha: number; rim: number; ring: number | null; cross: boolean; crossColor: number; tick: { x: number; y: number } | null }

/** Pure: the token for a player by life state, seat and facing. */
export function tokenLook(pid: number, life: 'conscious' | 'downed' | 'dead', seated: boolean, facing: Facing8): TokenLook {
  const up = life === 'conscious', a = ANGLE[facing];
  return {
    radius: TOKEN_RADIUS, colour: CREW_COLORS[pid % 4]!, angle: a, slot: pid % 4, fill: up ? CREW_COLORS[pid % 4]! : GREY, fillAlpha: life === 'dead' ? 0.6 : 1, rim: RIM,
    ring: up && seated ? RING : null, cross: life === 'downed', crossColor: CROSS,
    tick: up ? { x: Math.cos(a) * TOKEN_RADIUS, y: Math.sin(a) * TOKEN_RADIUS } : null
  };
}
