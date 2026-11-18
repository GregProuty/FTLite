// Helm demo duel tuning (spec docs/superpowers/specs/2026-11-14-helm-demo-design.md, sections 3 to 6).
// Every number here is a *(start)* value for tuning, not a decision.
import { DT } from '../tuning';

export { DT };

/** Headings: a fixed table of unit vectors, index 0 = north, clockwise (spec §4). */
export const HEADING_COUNT = 256;

// Map (§3)
export const R_MAP = 2800;
export const K_EDGE = 2;                       // /s², inward acceleration per unit past the edge
export const PLANET_RADIUS = 70;
export const GM = 2.5e6;
export const GRAVITY_EPS = 20;
export const BELT_INNER = 1100;
export const BELT_OUTER = 1300;
export const BELT_COUNT = 70;
export const BELT_R_MIN = 15;
export const BELT_R_MAX = 45;
export const GAP_COUNT = 3;
export const GAP_WIDTH = 160;
export const GAP_MIN_SEPARATION = 40;          // heading steps between any two gap bearings
export const CLUSTER_COUNT = 3;
export const CLUSTER_RADIUS = 150;             // asteroid centres lie within this of the cluster centre
export const CLUSTER_MIN = 4;
export const CLUSTER_MAX = 7;
export const CLUSTER_R_MIN = 20;
export const CLUSTER_R_MAX = 55;
export const CLUSTER_CENTRE_MIN = 1550;        // clear of the belt: 1300 + 150 + 55 + margin
export const CLUSTER_CENTRE_MAX = 2550;        // clear of the edge: 2800 - 150 - 55 - margin
export const EDGE_MARGIN = 100;                // no asteroid surface within this of the edge
export const ASTEROID_GAP = 10;                // minimum clear space between asteroid surfaces
export const SPAWN_RADIUS = 2000;
export const SPAWN_CLEARANCE = 300;            // no asteroid surface within this of a spawn point

// Ships (§5)
export const SHIP_RADIUS = 20;
export const SHIP_HULL = 40;                  // H-0c-ii-a: 30 → 40 so the scripted duels last 3 to 5 minutes
/** Weapons update spec §3: the Hunter's hull, raised so the scripted duels still last 3 to 5 minutes against the crew's
 *  double laser (tests/duelGates.test.ts). */
export const HUNTER_HULL = 70;
/** Engines damage level 0 / 1 / 2 scales thrust and turn rate (§5). Level 2 shuts the Engines off (owner 2026-11-17,
 *  FTL-style): no thrust, no turning; the ship drifts under gravity, drag and the idle stabilise. */
export const ENGINE_FACTOR: readonly number[] = [1, 0.6, 0];

// Contacts (§3, §4)
export const RESTITUTION = 0.5;                // share of the normal speed kept after a bounce
export const CONTACT_GRACE_TICKS = 60;         // 1 s before the same pair can cost hull again
export const PLANET_CONTACT_HULL = 4;
export const ASTEROID_CONTACT_HULL = 1;
export const SHIP_CONTACT_HULL = 1;

// Flight (§6)
export const TURN_DEG_PER_S = 150;
export const TURN_STEPS_PER_TICK = (TURN_DEG_PER_S / 360) * HEADING_COUNT * DT;   // about 1.78
export const THRUST = 120;                     // u/s²
export const REVERSE_FRACTION = 0.4;
export const DRAG = 0.15;                      // velocity × (1 − DRAG · dt) per tick
export const STABILISE = 80;                   // u/s² of sideways velocity removed while both axes are zero

// Broad phase (§4)
export const BROAD_CELL = 200;

/** Switches for the §4 test configurations; the game always uses DEFAULT_FLIGHT. */
export interface FlightTuning { gravity: boolean; edge: boolean; drag: number; stabilise: number }
export const DEFAULT_FLIGHT: FlightTuning = { gravity: true, edge: true, drag: DRAG, stabilise: STABILISE };

// Weapons and shields (§5, §7a)
export const LASER_RANGE = 450;
export const LASER_ARC_COS = 0.5;             // ±60° arc: inside when dot(h, d) ≥ cos 60° · |d|
/** Laser charge in whole units, so tick counts are exact: full at LASER_CHARGE_UNITS. Weapons damage level 0 / 1 / 2
 *  charges at these units per tick, which is 4 s × 1 / 1.6 / off (§5): full in 240 / 384 ticks, or never. Level 2 shuts
 *  the laser off (owner 2026-11-17, FTL-style): weapons.ts also drops any stored charge and refuses to fire. */
export const LASER_CHARGE_UNITS = 9600;
export const LASER_CHARGE_RATE: readonly number[] = [40, 25, 0];
export const LASER_HOLD_TICKS = 180;          // a full charge can be held 3 s, then it vents
export const LASER_HULL = 2;
/** The double laser (weapons update spec §1): a full charge fires a burst of the class's `shots`, the next shot
 *  LASER_BURST_GAP_TICKS after the one before (0.2 s). The crew's Cutter fires 2, the Hunter 1. */
export const CUTTER_LASER_SHOTS = 2;
export const HUNTER_LASER_SHOTS = 1;
export const LASER_BURST_GAP_TICKS = 12;
export const SHIELD_LAYERS = 2;
/** Shield recharge clock in whole units: a layer at SHIELD_RECHARGE_UNITS. Shields damage level 0 / 1 / 2 adds these units
 *  per tick, which is 5 s × 1 / 1.5 / stopped (§5): a layer in 300 / 450 ticks, or never. */
export const SHIELD_RECHARGE_UNITS = 900;
export const SHIELD_RATE: readonly number[] = [3, 2, 0];

// Missiles (§7b, §4 collision matrix)
export const MAGAZINE = 4;
export const MAGAZINE_REGEN_TICKS = 2700;     // 45 s per missile regained
export const MISSILE_RADIUS = 4;
export const MISSILE_SPAWN_OFFSET = 25;       // ship radius 20 + missile radius 4 + 1 clear
export const MISSILE_LAUNCH_SPEED = 60;
export const MISSILE_THRUST = 160;
export const MISSILE_TURN_STEPS_PER_TICK = (120 / 360) * HEADING_COUNT * DT;   // 120°/s, about 1.42
export const MISSILE_FUEL_TICKS = 360;        // 6 s of thrust
export const MISSILE_LIFE_TICKS = 480;        // then 2 s of coasting, then it self-destructs
export const MISSILE_ARM_TICKS = 60;          // its own ship is ignored for the first 1 s
export const MISSILE_HULL = 3;
/** Weapons update spec §2: a torpedo can be launched only at a target ship whose centre is within MISSILE_RANGE of the
 *  owner's, from any bearing; it flies straight, unguided, for MISSILE_BOOST_TICKS after launch, then homes. */
export const MISSILE_RANGE = 360;
export const MISSILE_BOOST_TICKS = 20;
// Homing guidance (homing torpedo spec §1): velocity-correcting lead pursuit on the owner's locked target.
// Tuned on tests/torpedoGuidance.test.ts (start 200 / 50 / 3 hit 85% of the coasting gate): 100% of the gate's 20
// seeds (99% of 200), and 95% (83% of 200) against a hard full-thrust turn. Weapons update (launches within 360, the
// 20-tick boost): nose on 100% of 20 (97% of 200), target 90°–180° off the nose 90% (88% of 200), hard turn 85% (78%),
// hard turn behind 45% (38%); a boost of 0 to 30 ticks and these three constants were swept, and none did better behind.
export const MISSILE_CRUISE_SPEED = 300;      // the desired velocity's floor, u/s
export const MISSILE_MIN_CLOSING = 450;       // the closing speed's floor in the time to go, u/s
export const MISSILE_LEAD_CAP_S = 2;          // the time to go's cap, s

// The hunter (§9)
export const HUNTER_LEAD_S = 0.5;
export const HUNTER_THRUST_COS = 0.8660254037844386;   // thrust when the heading error is under 30°
export const HUNTER_LOOKAHEAD_S = 0.75;
export const HUNTER_AVOID_MARGIN = 30;
export const HUNTER_JITTER_TICKS = 12;        // release jitter drawn uniformly from 0..12 ticks
export const HUNTER_MISSILE_COOLDOWN_TICKS = 1800;
export const HUNTER_TRAIL_TICKS = 18;         // missile pursuit aims where the crew was 0.3 s ago
export const HUNTER_WALK_TICKS = 360;         // 6 s stand-in for crossing its ship
export const REPAIR_WORK_TICKS = 240;         // 4 s per damage level
// Feel-i (console feel spec §2): the Helm's auto-face stops turning once the lead point is within sin 2.5° (one tick's
// turn at 150°/s) of the nose, so a step of 1 or 2 heading units can never overshoot past the band and chatter.
export const AUTO_FACE_SIN = 0.043619387365336;
export const HUNTER_STANDOFF = 320;           // within this it stops pursuing and holds its nose on the crew
export const HUNTER_BRAKE_SPEED = 40;         // and brakes (reverse thrust) when closing faster than this

// Science (Sci-1 spec 2026-11-17-science-scans §4): the hostility clock, the scans, the derelict and its salvage.
export const HOSTILE_AFTER_TICKS = 1800;          // the enemy turns hostile on its own in the step of rt 1799 (30 s of hold; owner 2026-11-17)
/** Scan units to reach each level (index = level); Level 1 at 900, Level 2 at 1800. */
export const SCAN_UNITS: readonly number[] = [0, 900, 1800];
export const SCAN_RATE_SCIENCE = 5;               // units per tick from the Science console
export const SCAN_RATE_OTHER = 2;                 // from the Helm or Weapons console
export const SALVAGE_RANGE = 60;                  // the crew ship within this of the derelict ...
export const SALVAGE_SPEED = 40;                  // ... at most this fast relative to it (u/s) ...
export const SALVAGE_TICKS = 300;                 // ... for 5 s salvages it
export const TRAP_HULL = 3;                       // a trapped derelict costs this much hull
export const LOOT_HULL = 8;                       // Hull loot, capped at the class hull
/** The derelict's orbit bands, clear of the belt (BELT_INNER 1100 to BELT_OUTER 1300). */
export const DERELICT_NEAR_MIN = 700, DERELICT_NEAR_MAX = 1000, DERELICT_FAR_MIN = 1400, DERELICT_FAR_MAX = 1599;
/** Its phase is redrawn while it would start within this of either spawn, at most DERELICT_PHASE_DRAWS draws in all. */
export const DERELICT_SPAWN_CLEAR = 600, DERELICT_PHASE_DRAWS = 16;
