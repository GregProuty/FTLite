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
export const SHIP_HULL = 30;
/** Engines damage level 0 / 1 / 2 scales thrust and turn rate (§5). */
export const ENGINE_FACTOR: readonly number[] = [1, 0.6, 0.25];

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
