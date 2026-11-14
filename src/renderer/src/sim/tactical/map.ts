// The duel map (spec §3): one planet at the origin, a belt ring with three gaps, three loose clusters, two spawns.
// Everything seeded comes from the duel's rng.tactical stream, so both screens and every replay build the same map.
import { nextFloat, nextInt, type RngState } from '../../../../shared/rng';
import { dirBetween, hx, hy } from './direction';
import {
  ASTEROID_GAP, BELT_COUNT, BELT_INNER, BELT_OUTER, BELT_R_MAX, BELT_R_MIN, CLUSTER_CENTRE_MAX, CLUSTER_CENTRE_MIN, CLUSTER_COUNT,
  CLUSTER_MAX, CLUSTER_MIN, CLUSTER_R_MAX, CLUSTER_R_MIN, CLUSTER_RADIUS, EDGE_MARGIN, GAP_COUNT, GAP_MIN_SEPARATION, GAP_WIDTH,
  GM, GRAVITY_EPS, HEADING_COUNT, PLANET_RADIUS, R_MAP, SPAWN_CLEARANCE, SPAWN_RADIUS
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
  /** Gap bearings as heading indices, ascending. */
  gaps: number[];
  spawns: [Spawn, Spawn];
}

/** Speed of a circular orbit at radius r under the softened gravity of spec §3. */
export function circularSpeed(r: number): number {
  const q = r * r + GRAVITY_EPS * GRAVITY_EPS;
  return Math.sqrt((GM * r * r) / (q * Math.sqrt(q)));
}

/** True when circle c intrudes on the gap corridor along heading `gap` (a ray from the planet, GAP_WIDTH wide). */
export function inCorridor(c: Circle, gap: number): boolean {
  const gx = hx(gap), gy = hy(gap);
  if (c.x * gx + c.y * gy <= 0) return false;
  return Math.abs(c.x * gy - c.y * gx) < GAP_WIDTH / 2 + c.r;
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
  const asteroids: Circle[] = [];
  for (let tries = 0; asteroids.length < BELT_COUNT && tries < 20000; tries++) {
    const r = BELT_R_MIN + nextFloat(rng) * (BELT_R_MAX - BELT_R_MIN);
    const rad = BELT_INNER + r + nextFloat(rng) * (BELT_OUTER - BELT_INNER - 2 * r);
    const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
    const c = { x: dx * rad, y: dy * rad, r };
    if (fits(c, asteroids, gaps, spawns, true)) asteroids.push(c);
  }
  const beltCount = asteroids.length;
  const clusterSizes: number[] = [];
  for (let k = 0; k < CLUSTER_COUNT; k++) {
    let cx = 0, cy = 0, found = false;
    for (let t = 0; t < 500 && !found; t++) {
      const rad = CLUSTER_CENTRE_MIN + nextFloat(rng) * (CLUSTER_CENTRE_MAX - CLUSTER_CENTRE_MIN);
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      cx = dx * rad; cy = dy * rad;
      found = spawns.every((s) => dist(cx, cy, s.x, s.y) >= CLUSTER_RADIUS + CLUSTER_R_MAX + SPAWN_CLEARANCE)
        && asteroids.slice(beltCount).every((o) => dist(cx, cy, o.x, o.y) >= 2 * CLUSTER_RADIUS + CLUSTER_R_MAX);
    }
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
  return { rMap: R_MAP, planet: { x: 0, y: 0, r: PLANET_RADIUS }, asteroids, beltCount, clusterSizes, gaps, spawns };
}

/** Every rule of spec §3's seeded layout; an empty list means the map is fair. */
export function validateMap(m: MapDef): string[] {
  const out: string[] = [];
  if (m.beltCount !== BELT_COUNT) out.push(`belt has ${m.beltCount} asteroids, expected ${BELT_COUNT}`);
  if (m.clusterSizes.length !== CLUSTER_COUNT) out.push(`${m.clusterSizes.length} clusters, expected ${CLUSTER_COUNT}`);
  m.clusterSizes.forEach((n, k) => { if (n < CLUSTER_MIN || n > CLUSTER_MAX) out.push(`cluster ${k} has ${n} asteroids`); });
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
      if (r - a.r < BELT_INNER || r + a.r > BELT_OUTER) out.push(`belt asteroid ${i} is outside the belt`);
      for (const g of m.gaps) if (inCorridor(a, g)) out.push(`belt asteroid ${i} blocks gap ${g}`);
    }
    for (let j = i + 1; j < m.asteroids.length; j++) {
      const b = m.asteroids[j]!;
      if (dist(a.x, a.y, b.x, b.y) < a.r + b.r + ASTEROID_GAP) out.push(`asteroids ${i} and ${j} overlap`);
    }
  });
  return out;
}
