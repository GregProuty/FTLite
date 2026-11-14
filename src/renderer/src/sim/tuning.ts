// Every gameplay constant. All are hypotheses until playtested (spec §13).
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const HAZARD_EVERY = 5;                 // hazards run every 5th tick (12 Hz)
export const HAZARD_DT = DT * HAZARD_EVERY;
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 34;
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
export const AIRLOCK_PASSAGE = 3 * PASSAGE_OPEN;  // an open airlock is a wide hatch to vacuum: at PASSAGE_OPEN the leak of three closed doors held a burning room at 10% and the fire never died; 3 is the largest value that leaves the cutter's kEff unchanged (spec Demo-vii amendment 12)
export const BREATH_RATE = 0.01;          // oxygen units per second per living crew member
export const FIRE_O2_RATE = 0.02;         // oxygen units per second per unit of fire intensity
export const O2_SNAP_EPS = 1e-9;
export const FIRE_GROW_FRAC = 0.2;     // fire grows while room oxygen fraction is above this
export const FIRE_SHRINK_FRAC = 0.1;   // fire shrinks while below this (B < A: no flicker)
export const FIRE_GROW_RATE = 0.5;     // intensity per second
export const FIRE_SHRINK_RATE = 1.0;   // intensity per second
export const FIRE_CAP = 16;
export const FIRE_START = 1;
export const FIRE_SPREAD_P = 0.0012;   // per hazard tick per burning edge at passage 1 (~7% per 5 s; spec Demo-vi section 3, was 0.0027)
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
export const SPAWN_FIRST = 15;          // seconds until the first spawned hazard once awake (a hazard gate; the game's first jump re-arms the director, spec Loop-i section 4b)
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
export const SPAWN_WEIGHTS = { fire: 1, breach: 1, power: 1, debris: 2 } as const;   // intervals in this order (total 5; fire 2 -> 1, spec Demo-vi section 3)
export const FIRE_SPAWN_CAP = 2;        // the director picks no fire while this many rooms burn; spread, overheats and impacts are not capped (spec Demo-vi section 3)

// Debris (increment 2a-ii)
export const DEBRIS_SLOTS = 8;                        // never reached: SPAWN_CAP counts in-flight debris
export const DEBRIS_FLIGHT = 30, DEBRIS_FLIGHT_JITTER = 6;             // seconds from spawn to impact, +/- jitter
export const SCIENCE_LEAD_UNMANNED = 4;               // seconds of warning with Science unoccupied or offline
export const SCIENCE_LEAD_BASE = 12, SCIENCE_LEAD_SCALE = 16;          // seated lead = base + scale x output (18 s at level 1, 24 s at level 2, skill 0)
export const BEAM_CHARGE_TIME = 4;                    // seconds at output 1 (8 s at level 2, skill 0, on the Skiff; spec Demo-xiii section 4: was 6, a 12 s Pulse)
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
export const FIRE_HEAT_MAX = 6;                       // heat per hazard tick a full fire adds to each online station in its room (spec Demo-xi section 5)
export const FIRE_HEAT_FULL = 8;                      // fire intensity at which the fire heat is full; below it, proportional

// Scanning, frequencies and torpedoes (increment 2b-ii)
export const FREQ_COUNT = 3;
export const SCAN_TIME = 6;                           // seconds at output 1 (16 / 8 / 5.3 s at Science levels 1 / 2 / 3)
/** The Science officer's system scan (spec Demo-x-b section 3): seconds at output 1 (scaled by the output like SCAN_TIME); each finding's chance 0.45 + 0.15 per Science level, capped; the card lists the results for SCAN_RESULT_SECONDS, the notice for SCAN_NOTICE_SECONDS. */
export const SYSTEM_SCAN_TIME = 8, SCAN_DETECT_BASE = 0.45, SCAN_DETECT_SKILL = 0.15, SCAN_DETECT_MAX = 0.95, SCAN_RESULT_SECONDS = 10, SCAN_NOTICE_SECONDS = 5;
/** Hidden things drawn with the map (spec Demo-x-b section 3): an ambusher at an Empty (AMBUSH_CHANCE) or Event (AMBUSH_EVENT_CHANCE) beacon arrives AMBUSH_DELAY s after arrival, warned AMBUSH_WARN s ahead when undetected; a detected one arrives with its shields down FIRST_STRIKE_SECONDS. A cache at an Empty beacon (CACHE_CHANCE) holds CACHE_FUEL fuel (one loot draw below CACHE_FUEL_CHANCE) or scrapCache scrap. */
export const AMBUSH_CHANCE = 0.5, AMBUSH_EVENT_CHANCE = 0.2, AMBUSH_DELAY = 30, AMBUSH_WARN = 3, FIRST_STRIKE_SECONDS = 10, CACHE_CHANCE = 0.4, CACHE_FUEL = 2, CACHE_FUEL_CHANCE = 0.5;
/** A cache's scrap: 20 at depth 0 to 40 at the last depth (17), rounded. */
export const scrapCache = (depth: number): number => 20 + Math.round(20 * depth / (SECTORS * SECTOR_COLUMNS - 1));
export const BEAM_MATCH_BASE = 0.65, BEAM_MATCH_SCALE = 0.30;   // beam tuned to the object's frequency
export const BEAM_MISS_BASE = 0.15, BEAM_MISS_SCALE = 0.10;     // beam on any other frequency
export const TORP_HIT_BASE = 0.85, TORP_HIT_SCALE = 0.10;       // homing: frequency does not matter
export const TORP_START = 3, TORP_CAP = 6;
export const TORP_LOAD_TIME = 10;                     // seconds at output 1 to move one from stock into the tube
export const TORP_REGEN_TIME = 90;                    // seconds per stock unit while Weapons is online
/** Loot weapons (spec Loop-iii sections 1-3): two extra slots, the Weapons level each needs to charge, the ion disable, the kill drop chance (the table is in weaponDefs.ts). */
export const WEAPON_SLOTS = 2, ION_SECONDS = 10, WEAPON_DROP_CHANCE = 0.25;
export const SLOT_LEVELS: readonly number[] = [2, 4];

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
export const CREW_INTERVAL_MULT = [1.5, 1.4, 1, 1] as const;   // spawn and fire interval multiplier by crew size, indexed players - 1 (spec Demo-i section 5)
export const SPAWN_CAP_MAX = 6, CAP_MINUTES = 4;        // +1 cap per 4 minutes up to the max
export const BUDGET_BASE = 3, BUDGET_GROWTH = 0.5;      // spawns per Build Up cycle: (base + growth x minutes) x playerScale
export const WEIGHT_MINUTES = 4;                       // power and debris weights grow every 4 minutes
export const ROUTE_BONUS = 2, ROUTE_IDLE_SECONDS = 60;  // routing toward consoles idle longer than this (3-4 players)
export const SINCE_CAP = 36000;                        // ticks: sinceProductive counters stop at 10 minutes

// Enemy ship (Combat-i)
export const ENCOUNTER_FIRST = 210, ENCOUNTER_MAX = 120;   // seconds: the hazard gates' first arrival (the game has no timed first enemy since Loop-i section 4b), stay (survival-gate fallback, spec Combat-i section 13; first pass 180); one enemy per node, no cooldown (spec Demo-vi section 2)
export const NEVER = 2147483647;                      // a tick that never comes: no further arrival at this node
export const ENCOUNTER_START = 8, ENCOUNTER_REWARD_HULL = 8, ENCOUNTER_BOOST = 4, ENCOUNTER_NOTICE_SECONDS = 8, ENCOUNTER_SPAWN_MULT = 2;   // spec Demo-vi: seconds from a Hazard-node arrival to contact, hull for a win, drive charge multiplier after a win, notice seconds, director interval multiplier while fighting
export const SHOT_BREACH_FIRST = 0.25;                 // a Shot impact tries a breach first below this roll, else a fire first (debris 0.5; spec Demo-vi section 3)
export const ENEMY_HULL = 100, ENEMY_FIRST_SHOT = 5;
export const ENEMY_FIRE_INTERVAL = 20, ENEMY_FIRE_MIN = 6, ENEMY_FIRE_JITTER = 0.2;   // escalation shares ESCALATION_RATE and CREW_INTERVAL_MULT (survival-gate fallback, spec Combat-ii section 13; first pass 15)
export const ENEMY_SHOTS_MAX = 1;                      // shots in flight at once (survival-gate fallback, spec Combat-i section 13; first pass 2)
export const ENEMY_SHOT_FLIGHT = 10, ENEMY_SHOT_JITTER = 2;   // seconds (debris is 30 +/- 6)
export const ENEMY_SHOT_HULL_DAMAGE = 10;              // spec Demo-xiii section 4, amendment 5: 4 -> 10, an ignored first enemy costs 20 hull a minute (the lever, not the interval); debris is 8; crew damage shared (survival-gate fallback, spec Combat-i section 13; first pass 6)
export const ENEMY_BEAM_BASE = 0.70, ENEMY_BEAM_SCALE = 0.30;   // engines-up chance 0.70 at output 0.5 after ENEMY_EVADE; was 0.55 before Combat-ii
export const ENEMY_BEAM_DAMAGE = 15, ENEMY_TORP_DAMAGE = 35;
/** FTL-style ship combat (spec Demo-i section 11.2): shield layers by column, recharge seconds per layer, hull per column, aim and console-failure chances, the flee at a hull fraction with its delay, the surrender bounty. */
export const ENEMY_SHIELD_LAYERS: readonly number[] = [1, 1, 1, 2, 2, 2, 2, 2], SHIELD_RECHARGE_TIME = 6, ENEMY_HULL_PER_COLUMN = 10, ENEMY_AIM_CHANCE = 0.6, ENEMY_SHOT_SYSTEM_CHANCE = 0.5;
export const ENEMY_SHOT_CREW_DAMAGE = 12;                // of HEALTH_MAX per Conscious crew member in the room a shot hits (survival-gate lever 2 after aimed shots, Demo-i gate (spec section 12); debris stays 20)
export const ENEMY_FLEE_FRAC = 0.25, ENEMY_FLEE_DELAY = 8;
/** The enemy interior (spec Demo-viii section 2b): rooms (0 Weapons, 1 Engines, 2 Shields, 3 Piloting, 4 Hold), the problem-draw thresholds after a hit, timer seconds, damage per second. */
export const ENEMY_ROOMS = 5, ENEMY_HIT_FIRE = 0.35, ENEMY_HIT_BREACH = 0.15, ENEMY_FIRE_SECONDS = 15, ENEMY_BREACH_SECONDS = 20, ENEMY_FIRE_HULL_DPS = 0.3, ENEMY_FIRE_SYS_DPS = 1.5, ENEMY_BREACH_HULL_DPS = 0.2;
export const ENEMY_SYS_HP = 30, ENEMY_SYS_REPAIR = 45, ENEMY_EVADE = 0.15;   // subsystem health, seconds to self-repair, beam threshold penalty while its Piloting is up (spec Combat-ii section 8; Demo-x-c section 4: Piloting, not the engines)

// Boarders (Boarders-i)
export const BOARDER_SLOTS = 4;
export const BOARDING_FIRST_SMALL = 330, ENCOUNTER_FIRST_SMALL = 270;   // seconds: the hazard gates' first party / first encounter for crews of two or fewer (spec Demo-i section 5; the game itself waits for the first jump, Loop-i section 4b)
export const BOARDING_FIRST = 240, BOARDING_COOLDOWN = 180, BOARDING_JITTER = 0.2;   // seconds: the hazard gates' first party, gap after the last kill (x jitter)
export const BOARDING_PARTY = 2;
export const BOARDER_O2_DPS = O2_DAMAGE, BOARDER_FIRE_DPS = FIRE_DAMAGE;                   // boarders suffocate and burn like the crew, below SUFFOCATE_FRAC (spec Demo-ix section 1)
export const BOARDER_HEALTH = 60, BOARDER_DPS = 6;                                   // health; damage per second to the focused crew member before Combat defence
export const CREW_MELEE_DPS = 8, COMBAT_GAIN = 0.06, COMBAT_DEFENCE = 0.04;          // crew damage per second at level 0; x(1 + gain x level); damage taken x(1 - defence x level)
export const BOARDER_MOVE = 8, BOARDER_SABOTAGE = 15;                                // seconds between moves while alone; seconds alone with an online console before it fails
export const XP_PER_KILL = 20;                                                       // Combat XP to the killer
export const HEALTH_EPS = 1e-9;                                                      // health below this snaps to 0 (melee arithmetic, spec Boarders-i section 2)

// Sector map and jumps (Run-i)
export const EDGE_CHANCE = 0.5;                                                     // chance of each candidate forward edge
/** Sectors (spec Loop-i section 1): sectors per run, columns per sector map (0 the arrival beacon, the last the exit), beacons per middle column, the node index stride (column x 4 + node). */
export const SECTORS = 3, SECTOR_COLUMNS = 6, MIDDLE_MIN = 2, MIDDLE_MAX = 4, NODE_STRIDE = 4;
/** Fuel (spec Loop-i section 2): the start, one per jump; the shop's +2 for 12 scrap; Wait for help's seconds, chance and gift; a kill gives KILL_FUEL_MIN + nextInt(loot, 2), a cleared field FIELD_FUEL. */
export const FUEL_START = 8, FUEL_COST = 12, SHOP_FUEL = 2, WAIT_SECONDS = 20, WAIT_FUEL_CHANCE = 0.6, WAIT_FUEL = 2, KILL_FUEL_MIN = 1, FIELD_FUEL = 1;
/** The Pursuit (spec Loop-i section 3): the fleet front's column on arrival in a sector and its step per jump and per wait; the elite pursuit enemy's hull and fire-interval multipliers. */
export const PURSUIT_START = -1.5, PURSUIT_STEP = 0.75, PURSUIT_HULL_MULT = 1.5, PURSUIT_FIRE_MULT = 0.75;
export const WARDEN_HULL_MULT = 1.5, WARDEN_FIRE_MULT = 0.7, WARDEN_SHIELD_EXTRA = 1;   // the Warden at the final beacon (spec Loop-iv section 2): x the final depth's hull, x the fire interval, layers over the depth's maximum
export const JUMP_CHARGE_TIME = 60;                                                 // seconds from arrival to a ready drive
export const BOARDING_AFTER_JUMP = 120;                                             // seconds after a jump before a party can arrive (no draw); the enemy follows the node type (ENCOUNTER_START, spec Demo-vi section 2)

// Events and shops (Run-ii)
export const SHOP_CHANCE = 0.15, EVENT_CHANCE = 0.25, ASTEROID_CHANCE = 0.15, EMPTY_CHANCE = 0.05;   // node type draw thresholds (map stream, after the edges), else Hazard (0.40) (spec Loop-i section 4: Shop 0.25 -> 0.15, Empty new; Demo-x-b section 2: Empty 0.15 -> 0.05; column 1 is all Hazard without a draw, column 2 has no Empty)
/** Asteroid fields (spec Demo-viii section 1): seconds between field rocks (one hazards draw per re-arm, +/- jitter), the rock flight, how long the field spawns, the extra seconds before it clears (every rock has landed), the reward. */
export const FIELD_INTERVAL = 6, FIELD_JITTER = 0.2, FIELD_FLIGHT = 10, FIELD_FLIGHT_JITTER = 2, FIELD_SECONDS = 60, FIELD_CLEAR_EXTRA = 12;   // FIELD_INTERVAL 4 -> 6 (amendment A2)
/** A field rock hits weaker than debris (spec Demo-viii amendment A1: 15 rocks x 8 hull sank the duo gate's ship): hull, and half the debris crew damage. */
export const ROCK_BREACH_FIRST = 0.75;   // a rock impact tries a breach first below this roll (amendment A4; debris 0.5)
export const FIELD_ROCK_HULL = 3, FIELD_ROCK_CREW = Math.floor(DEBRIS_CREW_DAMAGE / 2);
/** Scrap rewards grow with the column at the moment they are paid (spec Demo-ix section 2): a base plus a per-column step. */
export const scrapPerJump = (column: number): number => 10 + 4 * column;     // paid on arrival, after the jump advanced the column (amendment B8)
export const scrapEnemy = (column: number): number => 20 + 6 * column;
export const scrapSurrender = (column: number): number => 15 + 4 * column;
export const scrapBoarder = (column: number): number => 8 + 2 * column;
export const scrapField = (column: number): number => 15 + 5 * column;       // an asteroid field cleared (Demo-viii)
export const EVENT_SCRAP_SCALE = 0.15;   // event scrap amounts are written for depth 0 and multiplied by 1 + EVENT_SCRAP_SCALE x depth (spec Loop-v section 1)
export const SHOP_HULL = 25, SHOP_HULL_COST = 30, SHOP_TORPEDOES = 2, SHOP_TORPEDOES_COST = 20;
// Upgrades from the Engineering console (Loop-ii): the next level costs BASE + STEP x the levels owned
export const UPGRADE_MAX = 3, UPGRADE_BASE = 30, UPGRADE_STEP = 15;           // levels above STATION_MAX per kind: 30, 45, 60 scrap
export const REACTOR_BONUS_MAX = 5, REACTOR_BASE = 25, REACTOR_STEP = 10;     // reactor bars above REACTOR_CAPACITY: 25, 35, 45, 55, 65 scrap
// Progression and permadeath (Run-iii)
export const SCORE_NODE = 100, SCORE_VICTORY = 500, SCORE_ENEMY = 20, SCORE_BOARDER = 5;
export const UNLOCK_SCRAP = 30, UNLOCK_TORPEDOES = 2;
export const QUIRK_COUNT = 6;
export const QUIRK_PASSAGE_MULT = 2, QUIRK_HEAT_RISE = 1, QUIRK_DOOR_DELAY_MULT = 2, QUIRK_DEBRIS_OFFSET = -2, QUIRK_LEAD_OFFSET = 4, QUIRK_CHARGE_MULT = 1.25;

// HUD budgets (spec Demo-i sections 3 and 4): characters per card and notice line, pixels at 16 px m5x7 (measured from the TTF advance table)
export const CONSOLE_LINE_MAX = 40;   // characters per console-card line (308 px card at about 6.25 px per character, spec Demo-vii section 1)
export const LOBBY_LINE_MAX = 90, NOTICE_LINE_MAX = 64, LOBBY_PX_MAX = 560, NOTICE_PX_MAX = 400;
// Working together (spec Coop-i sections 1 and 2)
export const SHIELD_ROTATE = 30;      // seconds between enemy shield re-tunes while its shields system is up; 20 -> 30 (amendment C14): a level-1 scan takes 16 s, which left 4 s to lock and fire
export const LOCK_SECONDS = 8;        // a Science lock on the shield frequency
export const LOCK_HIT_BONUS = 0.15;   // added to the beam hit threshold under a lock while a layer is up
export const TEAM_MULT = 1.25;        // each holder's rate when two or more hold Interact on one target

export const HIT_FLASH_TICKS = 12;   // ticks the HUD enemy silhouette flashes after our last hit (spec Demo-ii section 4); read only by the HUD model, not hashed
export const EVADE_WINDOW = 1.0;     // seconds of an evasive manoeuvre: impacts inside it roll twice the evade chance (spec Coop-ii section 1)
export const EVADE_COOLDOWN = 6;     // seconds after the manoeuvre before Navigation can start another
export const EVADE_CAP = 0.8;        // the doubled chance is capped here (amendment D1)
export const CARRY_SPEED_MULT = 0.8;  // a crew member carrying a torpedo moves at this fraction of their speed (spec Coop-ii section 2)
export const VOTE_SECONDS = 15;      // an open event resolves by this time at the latest (spec Coop-ii section 3)
export const VOTE_SETTLE = 1;        // once every conscious player has a valid vote, it resolves after this long without a change, so the last voter can still switch (spec Coop-ii amendment D11)
export const CONFIRM_SECONDS = 5;    // a second officer's Confirm must come this soon after the pilot's jump (spec Coop-ii section 3)
