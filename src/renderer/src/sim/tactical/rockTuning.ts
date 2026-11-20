// Spike ii (billiard asteroids, docs/superpowers/specs/2026-11-18-asteroids-ii-design.md): every number of the rock
// rules in one place, so the report and any tuning name one file. Each block names the spec section it comes from.
import { DT } from './tuning';

/** §3.1: hp at birth (and hpMax for the cracks) is ceil(r / ROCK_HP_PER): 2 to 6 for the seeded rocks. */
export const ROCK_HP_PER = 10;

/** §3.4: a piece under this radius is dust instead. */
export const ROCK_MIN_R = 8;
/** §3.4: the fan pattern's piece counts: 3 pieces at r ≥ FAN_TRIPLE_MIN_R, 2 at r ≥ FAN_SPLIT_MIN_R, else dust. The 2-piece
 *  threshold was tuned 2026-11-18 from 25 to 13 after the §9.4 feel proxy (1/10) so chain breaks keep making pieces
 *  (at r 13 each piece is 0.9 · 13 / √2 ≈ 8.27, just over ROCK_MIN_R). */
export const FAN_TRIPLE_MIN_R = 40;
export const FAN_SPLIT_MIN_R = 13;

/** Spike ii §3.2, asteroids-iii §13.3: rock gravity as a share of the ships', and the speed cap (u/s), a safety net counted in rockCapHits. */
export const ROCK_GRAVITY = 1.0;
export const ROCK_MAX_SPEED = 300;
/** §3.3: the crush rule: damage only above ROCK_CRUSH_SPEED, (vc − 30) / ROCK_CRUSH_STEP. (The restitution is §13.4: rockContacts.ts.) */
export const ROCK_CRUSH_SPEED = 30;
export const ROCK_CRUSH_STEP = 40;

/** §4.1: a laser shot that meets a rock: damage, and the push J along the shot line (Δv = J / m). */
export const LASER_ROCK_DAMAGE = 2;
export const LASER_ROCK_PUSH = 4000;
/** W-4 spec §5.1: an autocannon round wears a rock 1 / AUTOCANNON_ROUNDS_PER_ROCK_HP hp (exact in binary) and pushes it
 *  AUTOCANNON_ROCK_PUSH / m along the round: four rounds push as hard per hp as the laser did (4000 / 2). */
export const AUTOCANNON_ROUNDS_PER_ROCK_HP = 4;
export const AUTOCANNON_ROCK_PUSH = 500;
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

// ---- Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md, revision 3): every new number ----
/** §13.7: the four switches, all on. Compile-time defaults, never a setting or a UI; plan deviation 19: one object, so the
 *  unit tests and the measure script can run each rule in both states in one process (always restore it). */
export const ROCK_SWITCHES: { massCube: boolean; softEdge: boolean; clusterTumble: boolean; rocheBreak: boolean } = { massCube: true, softEdge: true, clusterTumble: true, rocheBreak: true };
/** §3.1, §13.1: a rail's centre is at least ROCK_RAIL_MIN from the planet and its offset at most RAIL_OFFSET_MAX; a rock's
 *  radius on restore at most ROCK_R_MAX; a Tumble's offset turns once per CLUSTER_SPIN_PERIOD seconds on top of its orbit. */
export const ROCK_RAIL_MIN = 150, RAIL_OFFSET_MAX = 200, ROCK_R_MAX = 60, CLUSTER_SPIN_PERIOD = 200;
/** §3.4, §13.2: rejoining: the clock (ticks), |v − V*| under REJOIN_SPEED (u/s), ρ + r ≤ R_MAP − REJOIN_EDGE_CLEAR,
 *  ρ − r ≥ PLANET_RADIUS + REJOIN_PLANET_CLEAR; a rigid-group snap REJOIN_SNAP_FACTOR · ω · |Δρ| under REJOIN_SNAP_MAX (u/s). */
export const REJOIN_MIN_TICKS = 120, REJOIN_SPEED = 0.5, REJOIN_EDGE_CLEAR = 50, REJOIN_PLANET_CLEAR = 80, REJOIN_SNAP_FACTOR = 1.5, REJOIN_SNAP_MAX = 2;
/** §13.3: the age-ramped settling drag (per second): 0 before SETTLE_A0 s of age, SETTLE_K_MAX from SETTLE_A1 s. */
export const SETTLE_K_MAX = 0.06, SETTLE_A0 = 20, SETTLE_A1 = 60;
/** §14 D14: a settled rock in one cluster's sweep joins its group when |v − V_group(p)| is under this (u/s). */
export const CLUSTER_JOIN_SNAP = 6;
/** §14 (the cost fix): a Free rock past its first REJOIN_RECHECK_TICKS eligible ticks re-checks rejoin every this many ticks. */
export const REJOIN_RECHECK_TICKS = 30;
/** §13.3 (softEdge): the rocks' edge spring (/s²) and the extra drag toward V_c past R_MAP (/s); the far-edge safety slack
 *  past R_MAP: ROCK_EDGE_SLACK_SOFT with the soft edge, ROCK_EDGE_SLACK without (K_EDGE then, as ships). */
export const K_EDGE_ROCK = 0.25, EDGE_SETTLE_K = 0.3, ROCK_EDGE_SLACK = 400, ROCK_EDGE_SLACK_SOFT = 700;
/** §13.2: the lane pull's strength (/s², inside a lane zone, scaled by k / SETTLE_K_MAX) and how close to its lane's radius
 *  (u) a rock must be for a lane capture. */
export const LANE_PULL = 0.004, LANE_CAPTURE_DR = 5;
/** §13.3 (rocheBreak): a free rock inside ROCHE_R with r ≥ FAN_SPLIT_MIN_R and at least ROCHE_MIN_AGE ticks old fan-breaks
 *  ('tidal'), its pieces kicked v_esc · (TIDAL_KICK_MIN + TIDAL_KICK_SPAN · f_j). */
export const ROCHE_R = 175, ROCHE_MIN_AGE = 30, TIDAL_KICK_MIN = 0.03, TIDAL_KICK_SPAN = 0.05;
/** §13.4 (massCube): m = r³ / ROCK_MASS_DIVISOR (r 30 weighs 900, the ship's mass); r² with the switch off. */
export const ROCK_MASS_DIVISOR = 30;
/** §5.4, §13.4: a bounce above BOUNCE_MIN (u/s) closing with e = E_LOW + E_SPAN · clamp((vc − BOUNCE_MIN) / E_RAMP, 0, 1),
 *  else an e = 0 impulse; the touch counter above TOUCH_MIN; each tick a pair corrects SEPARATE_SHARE · max(0, overlap −
 *  SEPARATE_SLOP), each rock moving at most ROCK_SEPARATE_MAX (u). */
export const BOUNCE_MIN = 4, TOUCH_MIN = 8, ROCK_SEPARATE_MAX = 8, SEPARATE_SHARE = 0.5, SEPARATE_SLOP = 0.5, E_LOW = 0.3, E_SPAN = 0.5, E_RAMP = 26;
/** §6.1: the rock grid's cell (u) and its query pad: one tick at the speed cap, the capped separation and 1 (14 u). */
export const ROCK_GRID_CELL = 96;
export const ROCK_GRID_PAD = ROCK_MAX_SPEED * DT + ROCK_SEPARATE_MAX + 1;
/** §6.2: a ship-rock impact (u/s) under this is soft: no hull, no asteroidHits, no grace stamp. */
export const RAM_SOFT = 15;
/** §5.1: the burst's piece counts by parent radius (8 at ≥ 40, 6 at ≥ 30, 4 at ≥ 20, else dust; spike ii's 35 and 25
 *  change on purpose) and birth offsets (× parent r); §5.2: the fan's offset. */
export const BURST_8_MIN_R = 40, BURST_6_MIN_R = 30, BURST_4_MIN_R = 20;
export const BURST_OFFSET: Readonly<Record<4 | 6 | 8, number>> = { 8: 0.85, 6: 0.8, 4: 0.7 };
export const FAN_OFFSET = 0.6;
/** §13.6, §5.2, §14 D13 (burst back to medium, 0.30 + 0.30 f): piece j's kick is v_esc(ρ) · (MIN + SPAN · f_j), f_j the fractional part of j · GOLDEN_FRAC. */
export const BURST_KICK_MIN = 0.3, BURST_KICK_SPAN = 0.3, FAN_KICK_MIN = 0.1, FAN_KICK_SPAN = 0.15;
export const GOLDEN_FRAC = 0.6180339887498949;
/** §5.3: a blast's push on a rock is at most BLAST_PUSH_CAP · v_esc(ρ), a laser's at most LASER_PUSH_CAP · v_esc(ρ). */
export const BLAST_PUSH_CAP = 0.5, LASER_PUSH_CAP = 0.25;

// ---- Asteroids-iv (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md) ----
/** §3.2: a rim cell is a candidate to drop when its hash mod 100 is under RIM_DROP. §5.3: a shatter's crater takes the
 *  cells whose centre lies within CRATER_K spacings of the struck cell's centre. */
export const RIM_DROP = 30, CRATER_K = 0.75;
