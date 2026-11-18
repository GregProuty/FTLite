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
