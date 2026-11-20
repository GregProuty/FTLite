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
export const BELT_OUTER = 1450;                // asteroids-iv §10b: was 1300; the big outer lane reaches 1390 + 55 = 1445
export const BELT_COUNT = 75;                  // the lanes' counts' sum: 17 + 36 + 17 + 5 (was 70)
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
export const CLUSTER_CENTRE_MIN = 1670;        // clear of the belt: rock surfaces reach 1670 − 150 − 55 = 1465 ≥ 1445 + 10 (was 1550)
export const CLUSTER_CENTRE_MAX = 2550;        // clear of the edge: 2800 - 150 - 55 - margin
export const EDGE_MARGIN = 100;                // no asteroid surface within this of the edge
export const ASTEROID_GAP = 10;                // minimum clear space between asteroid surfaces
export const SPAWN_RADIUS = 2000;
export const SPAWN_CLEARANCE = 300;            // no asteroid surface within this of a spawn point
/** Asteroids-iii §3.5: the belt as lanes (inner, main, outer, big): each lane's orbital radius, its rock-radius band and
 *  its count (17 + 36 + 17 + 5 = BELT_COUNT). The first three are 78 apart; the largest cross-lane radius sum plus
 *  ASTEROID_GAP is 75. Asteroids-iv §10b (owner 2026-11-20): the fourth lane, just outside the belt, carries five big rocks
 *  (radius 40-55); its cross-lane sum with the outer lane plus the gap is 20 + 55 + 10 = 85 ≤ 1390 − 1278 = 112. */
export interface Lane { rho: number; rMin: number; rMax: number; count: number }
export const LANES: readonly Lane[] = [
  { rho: 1122, rMin: 15, rMax: 20, count: 17 },
  { rho: 1200, rMin: 25, rMax: 45, count: 36 },
  { rho: 1278, rMin: 15, rMax: 20, count: 17 },
  { rho: 1390, rMin: 40, rMax: 55, count: 5 }
];
/** §13.2: the lane zones: [1092, 1161) inner, [1161, 1239) main, [1239, 1334) outer, [1334, 1450] big (the part of the belt
 *  nearest each lane; 1334 is midway between 1278 and 1390; asteroids-iv §10b, was [1092, 1161, 1239, 1308]). */
export const LANE_ZONE_EDGES: readonly number[] = [1092, 1161, 1239, 1334, 1450];
/** §3.5: cluster centres' orbital radii differ by at least 2·(CLUSTER_RADIUS + CLUSTER_R_MAX) + ASTEROID_GAP (420), so
 *  clusters never meet each other or the belt; and the slack CLUSTER_CENTRE_MIN..MAX leaves for three of them
 *  (2550 − 1670 − 2·420 = 40; asteroids-iv §10b, was 160). */
export const CLUSTER_RHO_SEPARATION = 2 * (CLUSTER_RADIUS + CLUSTER_R_MAX) + ASTEROID_GAP;
export const CLUSTER_RHO_SLACK = CLUSTER_CENTRE_MAX - CLUSTER_CENTRE_MIN - (CLUSTER_COUNT - 1) * CLUSTER_RHO_SEPARATION;

// Ships (§5)
export const SHIP_RADIUS = 20;
/** W-1: duel hull ×1.75 to hold the 180 s floor with the pew (40 → 70; Task 6, controller's knob 8, one factor on every
 *  duel class's hull); the duel gates (tests/duelGates.test.ts): Hound median 224.1 s, 7 crew wins, 3 losses; Valkyrn median 183.1 s, 7 Hunter wins. */
export const SHIP_HULL = 70;                  // H-0c-ii-a: 30 → 40 so the scripted duels last 3 to 5 minutes; W-1: 40 → 70
/** Weapons update spec §3: the Hunter's hull, raised so the scripted duels still last 3 to 5 minutes against the crew's
 *  double laser (tests/duelGates.test.ts). W-1: duel hull ×1.75 to hold the 180 s floor with the pew (70 → 123, 122.5
 *  rounded up). */
export const HUNTER_HULL = 95;   // UI round (SIM 64 → 65): 123 → 95 (spec §1.1, owner 2026-11-19 "Hunter should have less health").
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
/** Helm round 2 §2.2: the Hound's (CUTTER_CLASS's) full reverse, half its full thrust (60 u/s²). REVERSE_FRACTION stays
 *  every other class's, so the Hunter still brakes at 40 %. */
export const HOUND_REVERSE_FRACTION = 0.5;
export const DRAG = 0.15;                      // velocity × (1 − DRAG · dt) per tick
export const STABILISE = 80;                   // u/s² of sideways velocity removed while both axes are zero

/** Switches for the §4 test configurations. The game flies each slot's flightFor (physics.ts): CREW_FLIGHT for a
 *  newtonianHelm crew class (playtest2feedback §2, helm round 2 §3.1), else DEFAULT_FLIGHT. `stabiliseUnderThrust` (helm
 *  round 2 §3.1; absent is false): the stabilise also acts while the main engine thrusts, so only the turn and the
 *  thrusters stop it. */
export interface FlightTuning { gravity: boolean; edge: boolean; drag: number; stabilise: number; stabiliseUnderThrust?: boolean }
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
/** The derelict's orbit bands, clear of the three-lane belt (BELT_INNER 1100 to 1300). Since asteroids-iv §10b the far band's
 *  inner edge passes through the big outer lane (1390 ± 55); the derelict never collides with rocks. */
export const DERELICT_NEAR_MIN = 700, DERELICT_NEAR_MAX = 1000, DERELICT_FAR_MIN = 1400, DERELICT_FAR_MAX = 1599;
/** Its phase is redrawn while it would start within this of either spawn, at most DERELICT_PHASE_DRAWS draws in all. */
export const DERELICT_SPAWN_CLEAR = 600, DERELICT_PHASE_DRAWS = 16;

// The Valkyrn (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §6.1, §7): the solo fighter's class and its minigun.
// Start values; Part iii's gate tunes them (spec §10).
/** Valkyrn spec §6.1, §12: the Valkyrn's hull. 30, kept at the start value; the Valkyrn gate (tests/duelGates.test.ts):
 *  median 229.8 s, 9 crew wins, 1 Hunter win over seeds 1 to 10. At hull 12 the gate does not move from 10 to 30: the
 *  Hunter takes at most 6 hull in the rounds the crew wins, and its one win (seed 2) is asteroid contacts. 5 gave
 *  5 Hunter wins and a 162.9 s median. W-1: duel hull ×1.75 to hold the 180 s floor with the pew (30 → 53, 52.5 rounded
 *  up): with the Hunter's pew at hull 30 the Valkyrn median was 109.7 s, 10 Hunter wins. */
export const VALKYRN_HULL = 53;
export const VALKYRN_THRUST = 200;                 // u/s²; UI round (SIM 64 → 65): 160 → 200, +25% acceleration and top speed (spec §1.2, owner "Valkyrn needs to be faster")
export const VALKYRN_TURN_DEG_PER_S = 200;
export const VALKYRN_TURN_STEPS_PER_TICK = (VALKYRN_TURN_DEG_PER_S / 360) * HEADING_COUNT * DT;   // about 2.37
/** The gun (spec §7.1): a round every GUN_INTERVAL_TICKS (10 a second) at GUN_SPEED along the nose plus the ship's
 *  velocity, for GUN_LIFE_TICKS (about 607 u of reach at rest), from two muzzles GUN_MUZZLE_LATERAL either side of the
 *  nose line, at the ship's radius + 1 ahead. */
export const GUN_INTERVAL_TICKS = 6;
export const GUN_SPEED = 700;                      // u/s
export const GUN_LIFE_TICKS = 52;
export const GUN_MUZZLE_LATERAL = 12;
/** Heat (spec §7.1): a round adds GUN_HEAT_PER_SHOT and it cools GUN_COOL a tick; reaching GUN_HEAT_MAX locks the gun,
 *  which then cools GUN_COOL_LOCKED a tick and unlocks at 0. Weapons damaged halves both (integer halves). */
export const GUN_HEAT_PER_SHOT = 50;
export const GUN_COOL = 4;
export const GUN_COOL_LOCKED = 8;
export const GUN_HEAT_MAX = 1000;
/** The round pool's fixed size (spec §7.2). */
export const GUN_POOL = 64;
/** Hits (spec §7.2): rounds per shield layer stripped, per hull point, and per Room level. */
/** Valkyrn spec §7.2, §12: gun hits per shield layer stripped. 8, kept at the start value; the Valkyrn gate
 *  (tests/duelGates.test.ts): median 229.8 s, 9 crew wins, 1 Hunter win over seeds 1 to 10. */
export const GUN_HITS_PER_LAYER = 8;
/** Valkyrn spec §7.2, §12: gun hits on an unshielded enemy per hull point. 12 (start 3) from the Valkyrn gate
 *  (tests/duelGates.test.ts): median 229.8 s, 9 crew wins, 1 Hunter win over seeds 1 to 10. At 3 the median was 100.2 s
 *  with 10 crew wins; 9 gave 186.5 s and 11 gave 217.5 s, both with no Hunter win. */
export const GUN_HITS_PER_HULL = 12;
/** W-4 spec §12: the autocannon's own copy of the hits a hull point (the tuning ladder's rung 1; GUN keeps GUN_HITS_PER_HULL). */
export const AUTOCANNON_HITS_PER_HULL = 12;
/** Valkyrn spec §7.2, §12: gun hits on a Room per damage level. 6, kept at the start value; the Valkyrn gate
 *  (tests/duelGates.test.ts): median 229.8 s, 9 crew wins, 1 Hunter win over seeds 1 to 10. */
export const GUN_HITS_PER_LEVEL = 6;
/** W-4 amendment §3.4: the wear a pew pew hit by hand adds to its target room's gunRoomWear (the autocannon's counter, a
 *  level at the owner's gun's hitsPerLevel, 6): two hits a level. */
export const PEW_ROOM_WEAR = 3;

// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §2, §4) and helm round 2 (spec 2026-11-19-helm-round2-design
// §3): the crew Helm's flight on a class whose `newtonianHelm` is true (the Hound). Start values, tuned in playtest.
/** Playtest2feedback §2: the top speed thrust may not push a ship flying with drag 0 past (u/s); gravity, the edge and
 *  bounces still can. Helm round 2 §3.1: no game ship flies with drag 0 now; the test configurations still do. */
export const MAX_SPEED = 400;
/** §4, helm round 2 §3.3: one vented cold gas axis's push (u/s²), in the ship frame; never scaled by the Engines. 70 (was
 *  35): a full charge on one thruster is 105 u/s before drag, a real dodge. */
export const RCS_THRUST = 70;
/** Helm round 2 §3.1: the Hound's own drag and stabilise (the values every ship flew before the playtest2feedback spike),
 *  so tuning them never moves the Hunter. */
export const CREW_DRAG = 0.15;
export const CREW_STABILISE = 80;
/** Helm round 2 §3.1: the crew Helm's flight: gravity, the edge spring, drag, and a stabilise that also acts under thrust. */
export const CREW_FLIGHT: FlightTuning = { gravity: true, edge: true, drag: CREW_DRAG, stabilise: CREW_STABILISE, stabiliseUnderThrust: true };
// Pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §4; W-1): the Cutter's and the Hunter's skill-shot gun. Start values,
// tuned in playtest; Task 6 of the W-1 plan may move only the Hunter's and the scripted gunner's knobs.
/** Fine heading units to the turn (spec §4): a heading index times HEADING_COUNT plus its fraction aimAcc, 0..255. */
export const AIM_STEPS = HEADING_COUNT * HEADING_COUNT;
/** The gun holds PEW_SHOTS thirds; one third refills every PEW_RECHARGE_TICKS (a full bar in 180 ticks, 3 s). */
export const PEW_SHOTS = 3;
export const PEW_RECHARGE_TICKS = 60;
/** Engineering spike §11 (merge with W-1): the pew's charge is counted in units, PEW_CHARGE_SCALE to a tick at the class's
 *  own rate, so a third is rechargeTicks × PEW_CHARGE_SCALE units (the crew's 360, the Hunter's 720). 6 makes every crew
 *  rate by bars (bars.ts PEW_TICKS_BY_BARS: 60, 45, 30, 24 ticks a third) a whole number of units a tick (6, 8, 12, 15). */
export const PEW_CHARGE_SCALE = 6;
/** The round pool's fixed size, shared by every ship (the oldest round is reused when it is full). */
export const PEW_POOL = 16;
/** A round flies straight at PEW_SPEED (u/s) for PEW_LIFE ticks, about 450 u, with no gravity and no inherited velocity. */
export const PEW_SPEED = 900;
export const PEW_LIFE = 30;
/** Hull per hit on a ship with no shield layer up (a shielded hit strips one layer instead). */
export const PEW_HULL = 1;
/** The aim cone's half-angle in degrees about the heading, and the same in fine heading units (rounded down). */
export const PEW_ARC = 60;
export const PEW_ARC_STEPS = Math.floor((PEW_ARC / 360) * AIM_STEPS);   // 10922
/** W-4 spec §3.3: the autocannon's arc, ±30° in fine heading steps (5461). */
export const AUTOCANNON_ARC_STEPS = Math.floor((30 / 360) * AIM_STEPS);
/** W-4 spec §3.3: each turret's traverse in fine steps a tick, [AUTO, MAN] (MAN +25 %, rounded): pew 120 / 150 °/s,
 *  the autocannon 90 / 112.4 °/s. */
export const PEW_TURRET_TRAVERSE: readonly [number, number] = [364, 455];
export const AUTOCANNON_TURRET_TRAVERSE: readonly [number, number] = [273, 341];
/** W-4 spec §4.2: the autocannon's AUTO range (a round reaches about 607 u at rest). */
export const AUTOCANNON_AUTO_RANGE = 600;
/** W-4 spec §12: cos 30°, the autocannon's ±30° arc as inArc's cosine: the scripted Helm lines the guns up outside it. */
export const AUTOCANNON_ARC_COS = 0.8660254037844386;
/** W-4 spec §4.3: AUTO stops the autocannon at 80 % heat, so it never locks. */
export const GUN_AUTO_HEAT_STOP = 800;
/** W-4 spec §4.2 (owner 2026-11-19): AUTO is on solution when its turret ends the tick within this many fine steps (1.0°)
 *  of the lead. With the lead's half step the worst aim error is 310 steps, 17.8 u at the autocannon's 600 u (the Hunter's
 *  radius is 20); 182 is also the autocannon's per-tick lag in a 150°/s turn (455 − 273), so a trailing gun still fires. */
export const AUTO_FIRE_TOLERANCE = 182;
/** cos 60°, for the Hunter's "inside the cone" test by dot product (geometry.ts inArc). */
export const PEW_ARC_COS = 0.5;
/** A round's reach: PEW_SPEED · PEW_LIFE · DT (450). The Hunter attacks inside it. */
export const PEW_RANGE = PEW_SPEED * PEW_LIFE * DT;
/** W-1 (pew pew spec §1): the Hunter's ticks between two rounds of one attack burst. 20 (was 12), Task 6 tuning; the duel gates (tests/duelGates.test.ts): Hound median 224.1 s, 7 crew wins, 3 losses; Valkyrn median 183.1 s, 7 Hunter wins. */
export const HUNTER_PEW_GAP = 20;
/** W-1 (pew pew spec §1; Task 6's extended tuning ladder): the Hunter's own pew recharge, ticks per third, so it can refill
 *  slower than the crew's PEW_RECHARGE_TICKS (60). 120 (the best of 120 / 150 / 180 at the old hulls, none passing alone);
 *  with the hull ×1.75, the duel gates (tests/duelGates.test.ts): Hound median 224.1 s, 7 crew wins, 3 losses; Valkyrn median 183.1 s, 7 Hunter wins (.superpowers/sdd/task-6-report.md). */
export const HUNTER_PEW_RECHARGE_TICKS = 120;
/** W-1 (pew pew spec §1): the Hunter's seeded aim error, ±HUNTER_PEW_ERROR degrees, in fine heading units (rounded down:
 *  HUNTER_PEW_ERROR_STEPS). 8 (was 4), Task 6 tuning; the duel gates (tests/duelGates.test.ts): Hound median 224.1 s, 7 crew wins, 3 losses; Valkyrn median 183.1 s, 7 Hunter wins.
 *  16 (was 8) at the merge with asteroids-ii (billiard rocks): at 8 the gates fell short (Hound median 172.7 s, 6 crew wins,
 *  4 losses; Valkyrn median 168.9 s, 3 crew wins, 7 Hunter wins, most by downed crew, which the hull factor does not reach:
 *  ×2.25 still gave a 176.2 s Valkyrn median); at 16: Hound median 208.8 s, 6 crew wins, 4 losses; Valkyrn median 210.9 s,
 *  4 crew wins, 6 Hunter wins (12 passed at 189.8 s / 206.7 s, a thinner Hound margin). */
export const HUNTER_PEW_ERROR = 16;
export const HUNTER_PEW_ERROR_STEPS = Math.floor((HUNTER_PEW_ERROR / 360) * AIM_STEPS);
/** Point defence: a crew torpedo within HUNTER_PD_RANGE inside the cone is tried for with HUNTER_PD_CHANCE a second, one
 *  roll a tick that succeeds 1 in HUNTER_PD_ODDS (200 at 60 Hz). HUNTER_PD_CHANCE 0.3 (was 0.5), Task 6 tuning;
 *  the duel gates (tests/duelGates.test.ts): Hound median 224.1 s, 7 crew wins, 3 losses; Valkyrn median 183.1 s, 7 Hunter wins. */
export const HUNTER_PD_RANGE = 300;
export const HUNTER_PD_CHANCE = 0.3;
export const HUNTER_PD_ODDS = Math.round(1 / (HUNTER_PD_CHANCE * DT));

// Manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4; W-2). No new tuning knob: the beam is today's laser.
/** W-2: the laser's ±60° arc (LASER_ARC_COS 0.5) in fine heading units, rounded down as PEW_ARC_STEPS is: the MANUAL aim's clamp. */
export const LASER_ARC_STEPS = Math.floor((60 / 360) * AIM_STEPS);   // 10922
