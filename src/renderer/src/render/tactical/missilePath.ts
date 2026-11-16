// The missile-path predictor (H-1 spec §7): the Weapons view's predicted path for the missile in flight. Pure: it flies a
// copy through the sim's own flyMissile, so the rules (turn by the sign of the steering, thrust while age ≤ the fuel time,
// gravity, no drag) are exactly the sim's, and it never touches the state it is given.
import { flyMissile } from '../../sim/tactical/missiles';
import { touchesSolid, type PathPoint } from '../../sim/tactical/predict';
import { emptyMissile, type Missile, type MissileFlight, type TacticalState } from '../../sim/tactical/state';
import { MISSILE_LIFE_TICKS, MISSILE_RADIUS, R_MAP } from '../../sim/tactical/tuning';

/** The horizon cap in ticks and the default point stride (spec §7). */
export const MISSILE_PATH_MAX_TICKS = 240, MISSILE_PATH_STRIDE = 4;

/**
 * Points every `stride` ticks over the missile's remaining life (capped at 240 ticks), with `steer` held constant. It
 * stops, keeping the final point, at the first planet or asteroid contact, at the map edge, or at expiry; ships are ignored.
 */
export function predictMissilePath(state: TacticalState, missile: MissileFlight & { owner?: number }, steer: number, stride: number = MISSILE_PATH_STRIDE): PathPoint[] {
  const m: Missile = { ...missile, active: true, owner: missile.owner ?? 0 }, every = Math.max(1, Math.floor(stride));
  const scratch: TacticalState = { ...state, missiles: [m, emptyMissile()] };   // flyMissile reads only its owner's entry
  const horizon = Math.min(MISSILE_PATH_MAX_TICKS, MISSILE_LIFE_TICKS - missile.age), out: PathPoint[] = [];
  for (let t = 1; t <= horizon; t++) {
    flyMissile(scratch, m.owner, steer);
    const ended = touchesSolid(state, m.x, m.y, MISSILE_RADIUS) || m.x * m.x + m.y * m.y > R_MAP * R_MAP || m.age >= MISSILE_LIFE_TICKS;
    if (ended || t % every === 0 || t === horizon) out.push({ x: m.x, y: m.y });
    if (ended) break;
  }
  return out;
}
