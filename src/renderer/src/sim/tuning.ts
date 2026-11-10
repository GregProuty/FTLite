// Every gameplay constant. All are hypotheses until playtested (spec §13).
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const HAZARD_EVERY = 5;                 // hazards run every 5th tick (12 Hz)
export const HAZARD_DT = DT * HAZARD_EVERY;
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 2;
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
export const SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1 } as const;
