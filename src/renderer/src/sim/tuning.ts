// Every gameplay constant. All are hypotheses until playtested (spec §13).
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const HAZARD_EVERY = 5;                 // hazards run every 5th tick (12 Hz)
export const HAZARD_DT = DT * HAZARD_EVERY;
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 13;
export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)
export const REPAIR_FIRE = 0, REPAIR_BREACH = 1, REPAIR_POWER = 2;   // indices into telemetry.repairs (spec 4-ii section 5)
export const ACCEPTANCE_MINUTES = 20;   // default soak length for npm run acceptance
export const HULL_MAX = 100;
export const HEALTH_MAX = 100;
export const CREW_SPEED = 4;      // tiles per second
export const CREW_HALF = 0.3;     // AABB half-extent in tiles (must stay < 0.5, see ship schema reachability)
export const MOVE_EPS = 1e-6;
export const DOOR_ZONE = 1.0;          // Chebyshev distance (tiles) from a door tile's centre that holds it open
export const DOOR_CLOSE_DELAY = 1.0;   // seconds after the zone is clear
export const PASSAGE_OPEN = 1;
export const PASSAGE_CLOSED = 0.05;
export const PASSAGE_SEALED = 0.01;       // lowered further by Doors skill in increment 3
export const PASSAGE_BREACH = 0.1;        // a breach is a hole, not an open door (12-tile room half-life ~14 s)
export const BREATH_RATE = 0.01;          // oxygen units per second per living crew member
export const FIRE_O2_RATE = 0.02;         // oxygen units per second per unit of fire intensity
export const O2_SNAP_EPS = 1e-9;
export const FIRE_GROW_FRAC = 0.2;     // fire grows while room oxygen fraction is above this
export const FIRE_SHRINK_FRAC = 0.1;   // fire shrinks while below this (B < A: no flicker)
export const FIRE_GROW_RATE = 0.5;     // intensity per second
export const FIRE_SHRINK_RATE = 1.0;   // intensity per second
export const FIRE_CAP = 16;
export const FIRE_START = 1;
export const FIRE_SPREAD_P = 0.0027;   // per hazard tick per burning edge at passage 1 (~15% per 5 s)
export const FIRE_DAMAGE = 3;           // health per second while in a burning room (the Medbay heals, increment 2a-i)
export const O2_DAMAGE = 6;             // health per second below SUFFOCATE_FRAC
export const SUFFOCATE_FRAC = 0.1;
export const BLEEDOUT_TIME = 30;        // seconds Downed before Dead
export const BLEED_HAZARD_MULT = 2;     // bleed-out speed in fire or low oxygen
export const REVIVE_HEALTH_FRAC = 0.3;
export const REACH = 1.5;               // tiles from crew centre to the nearest point of the target tile
export const REPAIR_TIME_FIRE = 6;      // seconds for one repairer
export const REPAIR_TIME_BREACH = 8;
export const REVIVE_TIME = 4;
export const SPAWN_FIRST = 15;          // seconds until the first spawned hazard
export const SPAWN_INTERVAL = 30;       // seconds between spawned hazards
export const SPAWN_JITTER = 0.2;        // ±fraction of the interval
export const SPAWN_CAP = 3;             // max simultaneous fires + breaches + failed stations

// Power (increment 2a-i)
export const REACTOR_CAPACITY = 10;                 // bars, including Engineering's reserved one
export const STATION_MAX = [2, 3, 2, 1, 3, 2, 1] as const;   // by StationKind: Nav, Wpn, Sci, Eng, LS, Med, Doors (sum 14 > capacity: choices are forced)

export const OUTPUT_SLOW = 0.5, OUTPUT_FAST = 1.0;   // station output multiplier at skill 0..10 via lerp((skill + 10) / 20)
export const REPAIR_TIME_POWER = 6;                 // seconds for one repairer
export const STICK_EDGE_THRESHOLD = 0.5;
export const STICK_REPEAT_TICKS = 8;                // ~130 ms

// Life Support and Medbay (increment 2a-i)
export const INJECT_FRAC = 0.06;          // per second of room volume at full output (starter allocation, unmanned: 2/3 x 0.75 x 0.06 = 0.03, the old stub rate)
export const LS_SEATED_BONUS = 0.5;
export const MEDBAY_HEAL = 4;             // health per second at full output
export const MEDBAY_SEATED_BONUS = 0.5;
export const SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1, debris: 2 } as const;   // intervals in this order (total 6)

// Debris (increment 2a-ii)
export const DEBRIS_SLOTS = 8;                        // never reached: SPAWN_CAP counts in-flight debris
export const DEBRIS_FLIGHT = 30, DEBRIS_FLIGHT_JITTER = 6;             // seconds from spawn to impact, +/- jitter
export const SCIENCE_LEAD_UNMANNED = 4;               // seconds of warning with Science unoccupied or offline
export const SCIENCE_LEAD_BASE = 12, SCIENCE_LEAD_SCALE = 16;          // seated lead = base + scale x output (18 s at level 1, 24 s at level 2, skill 0)
export const BEAM_CHARGE_TIME = 6;                    // seconds at output 1 (24 / 12 / 8 s at levels 1 / 2 / 3, skill 0)
export const EVADE_BASE = 0.20, EVADE_SCALE = 0.40;                    // evasion chance = base + scale x output
export const DEBRIS_HULL_DAMAGE = 8;                  // of HULL_MAX per impact
export const DEBRIS_CREW_DAMAGE = 20;                 // of HEALTH_MAX per Conscious crew member in the hit room

// Overdrive, heat and coolant (increment 2b-i)
export const STATION_OVERDRIVE = 1;                   // extra level above STATION_MAX for every kind except Engineering
export const HEAT_MAX = 240;                          // integer heat units
export const HEAT_RISE = 2;                           // per hazard tick while overdriven (10 s to max unassisted)
export const HEAT_COOL_UNIT = 1;                      // per coolant unit per hazard tick (1 unit: 20 s; 2 units: hold)
export const HEAT_COOL_IDLE = 4;                      // per hazard tick while not overdriven (5 s from max to 0)
export const COOLANT_POOL = 4;                        // shared units, never consumed
export const COOLANT_MAX_PER_STATION = 2;
export const OVERHEAT_FIRE_CHANCE = 0.5;              // rng.hazards, one draw per overheat

// Scanning, frequencies and torpedoes (increment 2b-ii)
export const FREQ_COUNT = 3;
export const SCAN_TIME = 6;                           // seconds at output 1 (16 / 8 / 5.3 s at Science levels 1 / 2 / 3)
export const BEAM_MATCH_BASE = 0.65, BEAM_MATCH_SCALE = 0.30;   // beam tuned to the object's frequency
export const BEAM_MISS_BASE = 0.15, BEAM_MISS_SCALE = 0.10;     // beam on any other frequency
export const TORP_HIT_BASE = 0.85, TORP_HIT_SCALE = 0.10;       // homing: frequency does not matter
export const TORP_START = 3, TORP_CAP = 6;
export const TORP_LOAD_TIME = 10;                     // seconds at output 1 to move one from stock into the tube
export const TORP_REGEN_TIME = 90;                    // seconds per stock unit while Weapons is online

// Skills and XP (increment 3-i)
export const SKILL_COUNT = 6, SKILL_MAX = 10;
export const XP_THRESHOLDS = [0, 240, 600, 1080, 1680, 2400, 3240, 4200, 5280, 6480, 7800] as const;   // cumulative productive seconds per level
export const XP_RATE = 1;                              // per productive second
export const XP_PER_SHOT = 10;                         // Weapons, per shot taken
export const XP_PER_EVADE_ROLL = 5;                    // Navigation, per evasion roll
export const PRODUCTIVE_WINDOW_TICKS = 300;            // 5 s: a change keeps Engineering or Doors productive this long
export const REPAIR_SKILL_GAIN = 0.06;                 // repair speed 1 + gain x level
export const HEAT_COOL_SKILL = 0.2;                    // extra cooling per unit: floor(0.2 x level)
export const SEAL_SKILL = 0.05;                        // sealed passage x (1 - 0.05 x level)
export const BONUS_BAR_LEVELS = 4;                     // one bonus bar per 4 Engineering levels while seated

// Characters (increment 3-ii): Assets and Complications as multipliers on existing formulas
export const TRAIT_REPAIR_MULT = 1.25;        // Quick Hands
export const TRAIT_SLOW_SPEED = 0.85;         // Heavy Boots
export const TRAIT_FAST_SPEED = 1.2;          // Sprinter
export const TRAIT_COOLING_BONUS = 1;         // Cool Head, per coolant unit while seated at Engineering
export const TRAIT_FIRE_DAMAGE = 1.5;         // Flammable
export const TRAIT_O2_DAMAGE = 0.5;           // Iron Lungs
export const TRAIT_XP_MULT = 0.75;            // Slow Learner
export const TRAIT_BLEEDOUT = 0.6;            // Frail

// Director (increment 4-i)
export const STRESS_PERIOD = 5;                        // seconds between stress recomputes
export const STRESS_WEIGHTS = { fire: 0.25, breach: 0.30, power: 0.20, debris: 0.20, downed: 0.40, enemy: 0.30, boarder: 0.35 } as const;
export const STRESS_RISE = 0.5, STRESS_FALL = 0.15;    // smoothing per period; the fall is halved while a hazard is unattended
export const PEAK_LEVEL = 0.7, RELAX_LEVEL = 0.25;
export const SUSTAIN_SECONDS = 10, FADE_TIMEOUT = 30, RELAX_MIN = 30, RELAX_MAX = 60, STALL_SECONDS = 60;
export const SPAWN_INTERVAL_MIN = 10;                  // seconds; the escalated interval never goes below this
export const ESCALATION_RATE = 0.1;                    // per minute: interval = SPAWN_INTERVAL / (1 + rate x minutes)
export const SOLO_INTERVAL_MULT = 1.5;
export const SPAWN_CAP_MAX = 6, CAP_MINUTES = 4;        // +1 cap per 4 minutes up to the max
export const BUDGET_BASE = 3, BUDGET_GROWTH = 0.5;      // spawns per Build Up cycle: (base + growth x minutes) x playerScale
export const WEIGHT_MINUTES = 4;                       // power and debris weights grow every 4 minutes
export const ROUTE_BONUS = 2, ROUTE_IDLE_SECONDS = 60;  // routing toward consoles idle longer than this (3-4 players)
export const SINCE_CAP = 36000;                        // ticks: sinceProductive counters stop at 10 minutes

// Enemy ship (Combat-i)
export const ENCOUNTER_FIRST = 210, ENCOUNTER_MAX = 120, ENCOUNTER_COOLDOWN = 150;   // seconds: first arrival, stay, gap (x jitter) (survival-gate fallback, spec Combat-i section 13; first pass 180)
export const ENEMY_HULL = 100, ENEMY_FIRST_SHOT = 5;
export const ENEMY_FIRE_INTERVAL = 20, ENEMY_FIRE_MIN = 6, ENEMY_FIRE_JITTER = 0.2;   // escalation shares ESCALATION_RATE and SOLO_INTERVAL_MULT (survival-gate fallback, spec Combat-ii section 13; first pass 15)
export const ENEMY_SHOTS_MAX = 1;                      // shots in flight at once (survival-gate fallback, spec Combat-i section 13; first pass 2)
export const ENEMY_SHOT_FLIGHT = 10, ENEMY_SHOT_JITTER = 2;   // seconds (debris is 30 +/- 6)
export const ENEMY_SHOT_HULL_DAMAGE = 4;               // debris is 8; crew damage shared (survival-gate fallback, spec Combat-i section 13; first pass 6)
export const ENEMY_BEAM_BASE = 0.70, ENEMY_BEAM_SCALE = 0.30;   // engines-up chance 0.70 at output 0.5 after ENEMY_EVADE; was 0.55 before Combat-ii
export const ENEMY_BEAM_DAMAGE = 15, ENEMY_TORP_DAMAGE = 35;
export const ENEMY_SYS_HP = 30, ENEMY_SYS_REPAIR = 45, ENEMY_EVADE = 0.15;   // subsystem health, seconds to self-repair, beam threshold penalty while the engines are up (spec Combat-ii section 8)

// Boarders (Boarders-i)
export const BOARDER_SLOTS = 4;
export const BOARDING_FIRST = 240, BOARDING_COOLDOWN = 180, BOARDING_JITTER = 0.2;   // seconds: first party, gap after the last kill (x jitter)
export const BOARDING_PARTY = 2;
export const BOARDER_HEALTH = 60, BOARDER_DPS = 6;                                   // health; damage per second to the focused crew member before Combat defence
export const CREW_MELEE_DPS = 8, COMBAT_GAIN = 0.06, COMBAT_DEFENCE = 0.04;          // crew damage per second at level 0; x(1 + gain x level); damage taken x(1 - defence x level)
export const BOARDER_MOVE = 8, BOARDER_SABOTAGE = 15;                                // seconds between moves while alone; seconds alone with an online console before it fails
export const XP_PER_KILL = 20;                                                       // Combat XP to the killer
export const HEALTH_EPS = 1e-9;                                                      // health below this snaps to 0 (melee arithmetic, spec Boarders-i section 2)

// Sector map and jumps (Run-i)
export const RUN_COLUMNS = 8, EDGE_CHANCE = 0.5;                                   // node columns; chance of each candidate edge
export const JUMP_CHARGE_TIME = 60;                                                 // seconds from arrival to a ready drive
export const ENCOUNTER_AFTER_JUMP = 60, BOARDING_AFTER_JUMP = 120;                  // seconds after a jump before the enemy / a party can arrive (no draw)
