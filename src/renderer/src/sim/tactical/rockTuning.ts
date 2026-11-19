// Spike ii (billiard asteroids, docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): every number of the rock
// rules in one place, so the report and any tuning name one file. Each block names the spec section it comes from.

/** §3.1: hp at birth (and hpMax for the cracks) is ceil(r / ROCK_HP_PER): 2 to 6 for the seeded rocks. */
export const ROCK_HP_PER = 10;
/** §3.1: a static rock wakes on a rock-rock contact or a ship's ram only above this closing speed (u/s). */
export const ROCK_WAKE_SPEED = 40;

/** §3.4: a piece under this radius is dust instead. */
export const ROCK_MIN_R = 8;
/** §3.4: the fan pattern's piece counts: 3 pieces at r ≥ FAN_TRIPLE_MIN_R, 2 at r ≥ FAN_SPLIT_MIN_R, else dust. The 2-piece
 *  threshold was tuned 2026-11-18 from 25 to 13 after the §9.4 feel proxy (1/10) so chain breaks keep making pieces
 *  (at r 13 each piece is 0.9 · 13 / √2 ≈ 8.27, just over ROCK_MIN_R). */
export const FAN_TRIPLE_MIN_R = 40;
export const FAN_SPLIT_MIN_R = 13;
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

/** §4.2: the torpedo's area blast: radius; rock damage from MIN at the edge to MAX at the centre; the push J on rocks
 *  (Δv = J · fall / m) and the speed given to ships (u/s, · fall). Ships take no hull from the blast. */
export const BLAST_RADIUS = 120;
export const BLAST_ROCK_DAMAGE_MIN = 2;
export const BLAST_ROCK_DAMAGE_MAX = 6;
export const BLAST_PUSH = 60000;
export const BLAST_SHIP_PUSH = 120;

/** §5.1: every ship's mass for rock contacts (all classes in this spike). */
export const SHIP_MASS = 900;
/** §5.1: a moving rock's hull cost, min(RAM_HULL_MAX, 1 + floor(max(0, impact − RAM_HULL_FREE) / RAM_HULL_STEP)). */
export const RAM_HULL_FREE = 40;
export const RAM_HULL_STEP = 40;
export const RAM_HULL_MAX = 4;
