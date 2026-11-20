// The duel map (spec §3): one planet at the origin, a belt ring with three gaps, three loose clusters, two spawns.
// Everything seeded comes from the duel's rng.tactical stream, so both screens and every replay build the same map.
import { nextFloat, nextInt, type RngState } from '../../../../shared/rng';
import { dirBetween, hx, hy } from './direction';
import {
  ASTEROID_GAP, BELT_COUNT, BELT_INNER, BELT_OUTER, CLUSTER_CENTRE_MIN, CLUSTER_COUNT,
  CLUSTER_MAX, CLUSTER_MIN, CLUSTER_R_MAX, CLUSTER_R_MIN, CLUSTER_RADIUS, CLUSTER_RHO_SEPARATION, CLUSTER_RHO_SLACK, EDGE_MARGIN, GAP_COUNT, GAP_MIN_SEPARATION, GAP_WIDTH,
  GM, GRAVITY_EPS, HEADING_COUNT, SHIP_GRAVITY, LANES, PLANET_RADIUS, R_MAP, SPAWN_CLEARANCE, SPAWN_RADIUS, type Lane
} from './tuning';

export interface Circle { x: number; y: number; r: number }
export interface Spawn { x: number; y: number; vx: number; vy: number; heading: number }
export interface MapDef {
  rMap: number;
  planet: Circle;
  /** Belt asteroids first (indices 0 .. beltCount − 1), then each cluster's asteroids in cluster order. */
  asteroids: Circle[];
  beltCount: number;
  clusterSizes: number[];
  /** Asteroids-iii §3.5: rocks placed per lane, in LANES order (the belt's slots: the inner lane's, the main lane's, the outer lane's). */
  laneSizes: number[];
  /** Asteroids-iii §3.5: each cluster centre's orbital radius, in cluster order (its rocks turn at this radius's rate). */
  clusterRho: number[];
  /** Asteroids-iii §13.1: each cluster centre, in cluster order (its rocks' rail centre). */
  clusterCentres: { x: number; y: number }[];
  /** Gap bearings as heading indices, ascending. */
  gaps: number[];
  spawns: [Spawn, Spawn];
}

/** Speed of a circular orbit at radius r under the softened gravity of spec §3. */
export function circularSpeed(r: number): number {
  const q = r * r + GRAVITY_EPS * GRAVITY_EPS;
  return Math.sqrt((GM * r * r) / (q * Math.sqrt(q)));
}

/** Speed of a ship's circular orbit at radius r: the ship feels SHIP_GRAVITY times the pull (the slingshot, tuning.ts). */
export function shipCircularSpeed(r: number): number { return circularSpeed(r) * Math.sqrt(SHIP_GRAVITY); }

/** True when circle c intrudes on the gap corridor along heading `gap` (a ray from the planet, GAP_WIDTH wide). */
export function inCorridor(c: Circle, gap: number): boolean {
  const gx = hx(gap), gy = hy(gap);
  if (c.x * gx + c.y * gy <= 0) return false;
  return Math.abs(c.x * gy - c.y * gx) < GAP_WIDTH / 2 + c.r;
}

/** Asteroids-iii §3.5: a lane's band of rock centres' reach: [ρ − rMax − ASTEROID_GAP, ρ + rMax + ASTEROID_GAP]. */
export function laneBand(lane: Lane): [number, number] { return [lane.rho - lane.rMax - ASTEROID_GAP, lane.rho + lane.rMax + ASTEROID_GAP]; }
/** The lane index of belt slot k (in LANES order), or −1 for a cluster rock. */
export function laneOf(map: MapDef, k: number): number {
  if (k < 0 || k >= map.beltCount) return -1;
  let end = 0;
  for (let i = 0; i < map.laneSizes.length; i++) { end += map.laneSizes[i]!; if (k < end) return i; }
  return -1;
}
/** The cluster index of slot k, or −1 for a belt rock. */
export function clusterOf(map: MapDef, k: number): number {
  let end = map.beltCount;
  if (k < end) return -1;
  for (let i = 0; i < map.clusterSizes.length; i++) { end += map.clusterSizes[i]!; if (k < end) return i; }
  return -1;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function circularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % HEADING_COUNT;
  return Math.min(d, HEADING_COUNT - d);
}

function pickGaps(rng: RngState): number[] {
  const gaps: number[] = [];
  while (gaps.length < GAP_COUNT) {
    const g = nextInt(rng, HEADING_COUNT);
    if (gaps.every((o) => circularGap(o, g) >= GAP_MIN_SEPARATION)) gaps.push(g);
  }
  return gaps.sort((a, b) => a - b);
}

function spawnAt(heading: number): Spawn {
  const v = circularSpeed(SPAWN_RADIUS), prograde = heading + HEADING_COUNT / 4;   // clockwise orbit
  return { x: hx(heading) * SPAWN_RADIUS, y: hy(heading) * SPAWN_RADIUS, vx: hx(prograde) * v, vy: hy(prograde) * v, heading: prograde % HEADING_COUNT };
}

function fits(c: Circle, placed: readonly Circle[], gaps: readonly number[], spawns: readonly Spawn[], belt: boolean): boolean {
  if (Math.sqrt(c.x * c.x + c.y * c.y) + c.r > R_MAP - EDGE_MARGIN) return false;
  for (const o of placed) if (dist(c.x, c.y, o.x, o.y) < c.r + o.r + ASTEROID_GAP) return false;
  for (const s of spawns) if (dist(c.x, c.y, s.x, s.y) < c.r + SPAWN_CLEARANCE) return false;
  if (belt) for (const g of gaps) if (inCorridor(c, g)) return false;
  return true;
}

export function generateMap(rng: RngState): MapDef {
  const gaps = pickGaps(rng);
  const first = nextInt(rng, HEADING_COUNT);
  const spawns: [Spawn, Spawn] = [spawnAt(first), spawnAt(first + HEADING_COUNT / 2)];
  // Asteroids-iii §3.5: the belt as lanes. Each lane's rocks sit on its exact radius with radii jittered in its band; the
  // existing angle draws, gap corridors, fits and spawn clearance place them (20,000 tries per lane).
  const asteroids: Circle[] = [], laneSizes: number[] = [];
  for (const lane of LANES) {
    let placed = 0;
    for (let tries = 0; placed < lane.count && tries < 20000; tries++) {
      const r = lane.rMin + nextFloat(rng) * (lane.rMax - lane.rMin);
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      const c = { x: dx * lane.rho, y: dy * lane.rho, r };
      if (fits(c, asteroids, gaps, spawns, true)) { asteroids.push(c); placed++; }
    }
    laneSizes.push(placed);
  }
  const beltCount = asteroids.length;
  // Asteroids-iii §3.5 (plan deviation 5): centre radii at least CLUSTER_RHO_SEPARATION apart: three sorted slacks in
  // [0, CLUSTER_RHO_SLACK] on top of CLUSTER_CENTRE_MIN + k · CLUSTER_RHO_SEPARATION. Clusters then never meet each other
  // or the belt. Only the bearing is redrawn until the spawn clearance holds.
  const slack = [nextFloat(rng), nextFloat(rng), nextFloat(rng)].map((u) => u * CLUSTER_RHO_SLACK).sort((a, b) => a - b);
  const clusterRho = Array.from({ length: CLUSTER_COUNT }, (_, k) => CLUSTER_CENTRE_MIN + k * CLUSTER_RHO_SEPARATION + slack[k]!);
  const clusterCentres: { x: number; y: number }[] = [];
  const clusterSizes: number[] = [];
  for (let k = 0; k < CLUSTER_COUNT; k++) {
    let cx = 0, cy = 0, found = false;
    const rad = clusterRho[k]!;
    for (let t = 0; t < 500 && !found; t++) {
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      cx = dx * rad; cy = dy * rad;
      found = spawns.every((s) => dist(cx, cy, s.x, s.y) >= CLUSTER_RADIUS + CLUSTER_R_MAX + SPAWN_CLEARANCE);
    }
    clusterCentres.push({ x: cx, y: cy });
    const want = CLUSTER_MIN + nextInt(rng, CLUSTER_MAX - CLUSTER_MIN + 1);
    let placed = 0;
    for (let t = 0; t < 500 && placed < want && found; t++) {
      const r = CLUSTER_R_MIN + nextFloat(rng) * (CLUSTER_R_MAX - CLUSTER_R_MIN);
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      const off = Math.sqrt(nextFloat(rng)) * CLUSTER_RADIUS;
      const c = { x: cx + dx * off, y: cy + dy * off, r };
      if (fits(c, asteroids, gaps, spawns, false)) { asteroids.push(c); placed++; }
    }
    clusterSizes.push(placed);
  }
  return { rMap: R_MAP, planet: { x: 0, y: 0, r: PLANET_RADIUS }, asteroids, beltCount, clusterSizes, laneSizes, clusterRho, clusterCentres, gaps, spawns };
}

/** Every rule of spec §3's seeded layout; an empty list means the map is fair. */
export function validateMap(m: MapDef): string[] {
  const out: string[] = [];
  if (m.beltCount !== BELT_COUNT) out.push(`belt has ${m.beltCount} asteroids, expected ${BELT_COUNT}`);
  if (m.clusterSizes.length !== CLUSTER_COUNT) out.push(`${m.clusterSizes.length} clusters, expected ${CLUSTER_COUNT}`);
  m.clusterSizes.forEach((n, k) => { if (n < CLUSTER_MIN || n > CLUSTER_MAX) out.push(`cluster ${k} has ${n} asteroids`); });
  // Asteroids-iii §3.5: the lanes and the clusters' ρ separation.
  if (m.laneSizes.length !== LANES.length || m.laneSizes.some((n, i) => n !== LANES[i]!.count)) out.push(`lane sizes ${m.laneSizes.join('/')} are not ${LANES.map((l) => l.count).join('/')}`);
  if (m.laneSizes.reduce((a, b) => a + b, 0) !== m.beltCount) out.push('lane sizes do not add up to the belt');
  if (m.clusterRho.length !== m.clusterSizes.length) out.push(`${m.clusterRho.length} cluster radii for ${m.clusterSizes.length} clusters`);
  for (let i = 0; i < m.clusterRho.length; i++) for (let j = i + 1; j < m.clusterRho.length; j++)
    if (Math.abs(m.clusterRho[i]! - m.clusterRho[j]!) < CLUSTER_RHO_SEPARATION - 1e-9) out.push(`clusters ${i} and ${j} are closer than ${CLUSTER_RHO_SEPARATION} in ρ`);
  if (m.asteroids.length !== m.beltCount + m.clusterSizes.reduce((a, b) => a + b, 0)) out.push('asteroid count does not match belt + clusters');
  if (m.gaps.length !== GAP_COUNT) out.push(`${m.gaps.length} gaps, expected ${GAP_COUNT}`);
  for (let i = 0; i < m.gaps.length; i++) for (let j = i + 1; j < m.gaps.length; j++)
    if (circularGap(m.gaps[i]!, m.gaps[j]!) < GAP_MIN_SEPARATION) out.push(`gaps ${i} and ${j} are too close`);
  m.asteroids.forEach((a, i) => {
    const r = Math.sqrt(a.x * a.x + a.y * a.y);
    if (r + a.r > m.rMap - EDGE_MARGIN) out.push(`asteroid ${i} is too near the edge`);
    if (r - a.r < m.planet.r) out.push(`asteroid ${i} overlaps the planet`);
    for (const s of m.spawns) if (dist(a.x, a.y, s.x, s.y) < a.r + SPAWN_CLEARANCE) out.push(`asteroid ${i} crowds a spawn`);
    if (i < m.beltCount) {
      const lane = LANES[laneOf(m, i)];
      if (!lane || Math.abs(r - lane.rho) > 1e-9) out.push(`belt asteroid ${i} is off its lane`);
      else if (a.r < lane.rMin || a.r > lane.rMax) out.push(`belt asteroid ${i} is outside its lane's size band`);
      if (r - a.r < BELT_INNER || r + a.r > BELT_OUTER) out.push(`belt asteroid ${i} is outside the belt`);
      for (const g of m.gaps) if (inCorridor(a, g)) out.push(`belt asteroid ${i} blocks gap ${g}`);
    } else { const c = m.clusterRho[clusterOf(m, i)]; if (c === undefined || Math.abs(r - c) > CLUSTER_RADIUS + 1e-9) out.push(`cluster asteroid ${i} is off its cluster's radius`); }
    for (let j = i + 1; j < m.asteroids.length; j++) {
      const b = m.asteroids[j]!;
      if (dist(a.x, a.y, b.x, b.y) < a.r + b.r + ASTEROID_GAP) out.push(`asteroids ${i} and ${j} overlap`);
    }
  });
  return out;
}
