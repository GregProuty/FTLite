// Spike ii (billiard asteroids, docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): every number of the rock
// rules in one place, so the report and any tuning name one file. Each block names the spec section it comes from.

/** §3.1: hp at birth (and hpMax for the cracks) is ceil(r / ROCK_HP_PER): 2 to 6 for the seeded rocks. */
export const ROCK_HP_PER = 10;
/** §3.1: a static rock wakes on a rock-rock contact or a ship's ram only above this closing speed (u/s). */
export const ROCK_WAKE_SPEED = 40;

/** §3.4: a piece under this radius is dust instead. */
export const ROCK_MIN_R = 8;
/** §3.4: the fan pattern's piece speed (laser, blast-secondary, collision or ram break), u/s, on top of the parent's velocity. */
export const ROCK_FLING = 150;
/** §3.4: the burst pattern's piece speed (a torpedo's direct hit), u/s, on top of the parent's velocity. */
export const ROCK_BLAST_FLING = 200;

/** §3.2: rock gravity as a share of the ships', drag per second, and the speed cap applied at each motion step (u/s). */
export const ROCK_GRAVITY = 1.0;
export const ROCK_DRAG = 0.1;
export const ROCK_MAX_SPEED = 300;
/** §3.3: rock-rock restitution, and the crush rule: damage only above ROCK_CRUSH_SPEED, (vc − 30) / ROCK_CRUSH_STEP. */
export const ROCK_RESTITUTION = 0.8;
export const ROCK_CRUSH_SPEED = 30;
export const ROCK_CRUSH_STEP = 40;

/** §4.1: a laser shot that meets a rock: damage, and the push J along the shot line (Δv = J / m). */
export const LASER_ROCK_DAMAGE = 2;
export const LASER_ROCK_PUSH = 4000;
/** §6.3: the crew laser never fires on its own because a rock is in the way; digging is a rock target. */
export const AUTO_DIG = false;
