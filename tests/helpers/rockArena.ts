// Spike ii (billiard asteroids) test rigs: an empty rock arena with the Hunter switched off, rock writers, a full pool,
// and the tick's rock events.
import { createTacticalState, type DuelEvent, type TacticalState } from '../../src/renderer/src/sim/tactical/state';
import { beginRockTick, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from '../../src/renderer/src/sim/tactical/rocks';
import { todaysCrewWeapons } from './crewWeapons';

export type RockEvent = Extract<DuelEvent, { kind: 'rock' }>;

/** A tactical state with every rock removed (the seeded grid ignores empty slots), the Hunter switched off (slot 1
 *  inactive) and the crew ship parked at rest at (0, −2500), heading north; a fresh tick's masks. */
export function arena(seed = 5): TacticalState {
  const st = todaysCrewWeapons(createTacticalState(seed));   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: -2500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.ships[1].active = false;
  beginRockTick(st);
  return st;
}
/** A moving (kind 2) rock in slot k. */
export function mover(st: TacticalState, k: number, x: number, y: number, vx: number, vy: number, r: number, hp = rockHp(r)): void {
  writeRock(st, k, RockKind.Moving, x, y, vx, vy, r, hp);
}
/** Seeded asteroid k back in its own slot as a static rock at full hp (the grid indexes it there). */
export function seeded(st: TacticalState, k: number): void {
  const a = st.map.asteroids[k]!;
  writeRock(st, k, RockKind.Static, a.x, a.y, 0, 0, a.r, rockHp(a.r));
}
/** Every empty slot (but `except`) gets a moving rock of radius r on a far grid, x −2000..1800, y −1600..200. */
export function fillPool(st: TacticalState, r: number, except: readonly number[] = []): void {
  for (let k = 0; k < rockSlots(st); k++)
    if (st.rocks[k * ROCK_STRIDE] === RockKind.Gone && !except.includes(k)) mover(st, k, -2000 + (k % 20) * 200, -1600 + Math.floor(k / 20) * 200, 0, 0, r);
}
/** This tick's rock events, optionally of one kind. */
export function rockEvents(st: TacticalState, what?: RockEvent['what']): RockEvent[] {
  return st.events.filter((e): e is RockEvent => e.kind === 'rock' && (what === undefined || e.what === what));
}
