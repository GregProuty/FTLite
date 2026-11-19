// Spike ii and asteroids-iii test rigs: an empty rock arena with the Hunter switched off, rock writers (a Free rock, a
// Rail at its own radius, a seeded slot as the map makes it), a full pool, and the tick's rock events.
import { createTacticalState, type DuelEvent, type TacticalState } from '../../src/renderer/src/sim/tactical/state';
import { beginRockTick, initRocks, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from '../../src/renderer/src/sim/tactical/rocks';
import { ROCK_SWITCHES } from '../../src/renderer/src/sim/tactical/rockTuning';
import { todaysCrewWeapons } from './crewWeapons';

export type RockEvent = Extract<DuelEvent, { kind: 'rock' }>;

/** A tactical state with every rock removed, the Hunter switched off (slot 1 inactive) and the crew ship parked at rest at
 *  (0, −2500), heading north; a fresh tick's masks. */
export function arena(seed = 5): TacticalState {
  const st = todaysCrewWeapons(createTacticalState(seed));   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: -2500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.ships[1].active = false;
  beginRockTick(st);
  return st;
}
/** A Free (kind 2) rock in slot k; its clock t defaults to the phase tick. */
export function mover(st: TacticalState, k: number, x: number, y: number, vx: number, vy: number, r: number, hp = rockHp(r), t?: number): void {
  writeRock(st, k, RockKind.Free, x, y, vx, vy, r, hp, t);
}
/** A Rail (kind 1) rock in slot k at (x, y) now: its centre (x, y), offset 0, anchored at st.tick (it turns at its own radius). */
export function rail(st: TacticalState, k: number, x: number, y: number, r: number, hp = rockHp(r)): void {
  writeRock(st, k, RockKind.Rail, x, y, 0, 0, r, hp, st.tick);
}
/** Seeded asteroid k back in its own slot as the map makes it (a rail at t = 0, full hp). */
export function seeded(st: TacticalState, k: number): void {
  st.rocks.set(initRocks(st.map).subarray(k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE), k * ROCK_STRIDE);
}
/** Every empty slot (but `except`) gets a Free rock of radius r on a far grid, x −2000..1800, y −1600..200. */
export function fillPool(st: TacticalState, r: number, except: readonly number[] = []): void {
  for (let k = 0; k < rockSlots(st); k++)
    if (st.rocks[k * ROCK_STRIDE] === RockKind.Gone && !except.includes(k)) mover(st, k, -2000 + (k % 20) * 200, -1600 + Math.floor(k / 20) * 200, 0, 0, r);
}
/** This tick's rock events, optionally of one kind. */
export function rockEvents(st: TacticalState, what?: RockEvent['what']): RockEvent[] {
  return st.events.filter((e): e is RockEvent => e.kind === 'rock' && (what === undefined || e.what === what));
}

/** Asteroids-iii §13.7: run `run` with some switches set, always restoring them (plan deviation 19). */
export function withSwitches(patch: Partial<typeof ROCK_SWITCHES>, run: () => void): void {
  const saved = { ...ROCK_SWITCHES };
  Object.assign(ROCK_SWITCHES, patch);
  try { run(); } finally { Object.assign(ROCK_SWITCHES, saved); }
}
