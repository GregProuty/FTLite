// The gun (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §7.1, §7.2): a fixed minigun on a class whose gun slot is
// not null. tickGun runs from applyWeaponsInput every tick, before anything moves (where the laser fires): it cools the
// heat and counts the cooldown down, then fires a round from the pre-move pose while the trigger is held at an attended
// Weapons station. Rounds live in the fixed pool tactical.rounds. Only + − × ÷ and sqrt (the determinism guard).
import type { GunDef } from './defs';
import { hx, hy } from './direction';
import { classOf, Room, type GunRound, type TacticalState } from './state';
import type { ShipInput } from './weapons';

/** Put a round in the pool (spec §7.2): the lowest free entry, else the active round with the highest age, the lowest
 *  index on a tie. Returns its entry. */
export function placeRound(state: TacticalState, r: Omit<GunRound, 'active'>): GunRound {
  let k = state.rounds.findIndex((e) => !e.active);
  if (k < 0) { k = 0; for (let j = 1; j < state.rounds.length; j++) if (state.rounds[j]!.age > state.rounds[k]!.age) k = j; }
  const e = state.rounds[k]!;
  Object.assign(e, { x: r.x, y: r.y, vx: r.vx, vy: r.vy, age: r.age, owner: r.owner, active: true });
  return e;
}

/** One round from ship i's next muzzle: `muzzleForward` ahead of the centre and `muzzleLateral` to starboard (90°
 *  clockwise of the nose, (−hy, hx)) or port, at `speed` along the nose plus the ship's velocity; the muzzles alternate,
 *  the cooldown restarts, and the heat rises, locking the gun when it reaches heatMax. */
function fireRound(state: TacticalState, i: number, g: GunDef): void {
  const ship = state.ships[i]!, s = state.systems[i]!, h0 = hx(ship.heading), h1 = hy(ship.heading), side = s.gunMuzzle === 0 ? 1 : -1;
  placeRound(state, {
    x: ship.x + h0 * g.muzzleForward - h1 * g.muzzleLateral * side, y: ship.y + h1 * g.muzzleForward + h0 * g.muzzleLateral * side,
    vx: ship.vx + h0 * g.speed, vy: ship.vy + h1 * g.speed, age: 0, owner: i
  });
  state.events.push({ kind: 'gunFire', ship: i, muzzle: s.gunMuzzle });
  s.gunMuzzle = 1 - s.gunMuzzle; s.gunCooldown = g.intervalTicks; s.gunShots++;
  s.gunHeat = Math.min(g.heatMax, s.gunHeat + g.heatPerShot);
  if (s.gunHeat >= g.heatMax) s.gunLocked = true;
}

/**
 * One tick of ship i's gun (spec §7.1), every tick whether or not anyone is at Weapons: the heat cools by `cool` (by
 * `coolLocked` while locked; both halved while Weapons is damaged, Decision 7) and a locked gun unlocks at 0; the
 * cooldown counts down; then a round fires when the trigger is held at an attended Weapons station, the gun is not
 * locked, Weapons is below level 2 and the cooldown is 0. A class without a gun does nothing.
 */
export function tickGun(state: TacticalState, i: number, input: ShipInput): void {
  const g = classOf(state, i).slots.gun;
  if (g === null) return;
  const s = state.systems[i]!, cool = s.gunLocked ? g.coolLocked : g.cool;
  s.gunHeat = Math.max(0, s.gunHeat - (s.rooms[Room.Weapons] >= 1 ? cool / 2 : cool));
  if (s.gunLocked && s.gunHeat === 0) s.gunLocked = false;
  if (s.gunCooldown > 0) s.gunCooldown--;
  if (!input.weapons || !input.gunHeld || s.gunLocked || s.rooms[Room.Weapons] >= 2 || s.gunCooldown > 0) return;
  fireRound(state, i, g);
}
