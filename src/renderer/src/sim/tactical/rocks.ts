// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §3), on spike ii's pool: `state.rocks` is a
// fixed-capacity pool, ROCK_STRIDE values per slot: kind (0 gone, 1 rail, 2 free, 3 tumble), x, y, vx, vy, r, hp, t.
// A rail slot (Rail or Tumble, §13.1) holds its centre (x, y) and its offset (vx, vy) at tick t, and its ρω is |centre|.
// It turns on its rail, worked out from the tick by railPos (rails.ts): a Rail rigidly, a Tumble with its offset spinning
// too, so nothing in the slot changes while it stays there. A Free slot's x, y, vx, vy are live and t is
// the tick it was last born, freed or pushed. Slots 0 .. n − 1 start as the seeded map's asteroids, all Rail at t = 0;
// the ROCK_RESERVE slots after them start empty. `isRail` is true for both rail kinds.
// Readers of a rock's position or velocity use rockX / rockY / rockVx / rockVy / rockAt: a Free slot is read as it stands,
// a rail through railPos at the phase tick, memoised per pool array (s.rocks) in a WeakMap and checked against every input
// (kind, centre, offset, t and the phase tick), so a stale entry is never returned and the memo is never hashed, snapshotted or copied by a clone.
// The phase (§3.3): during stepDuel (beginRockStep .. endRockStep, a step context in a WeakMap, not state) rails are read
// at tick + 1, because every contact that tick happens after the free rocks move to T + 1; between ticks at tick.
// Freeing (§3.4): a Rail becomes Free at its rail position and velocity in the free frame (T before this step's free
// motion, T + 1 after it; plan deviation 2), with t = the phase tick.
// Broad phase (§6.1): the rock grid (grid.ts), rebuilt at beginRockStep and kept current by regridRock; a scan outside a step.
// Per-tick transient masks (§3.1, §3.3, §3.4; not hashed, cleared at the start and the end of every stepDuel tick):
// rockBorn (a new piece this tick), rockDone (had its contact turn), rockTouched (freed, pushed, hit or in a contact).
// Breaking is rockBreak.ts, motion and rock-rock contacts rockContacts.ts, every number rockTuning.ts.
import { clusterOf, type MapDef } from './map';
import { railPos, type RailOut } from './rails';
import { emptyRockGrid, linkRock, peekRockGrid, queryRockGrid } from './grid';
import { ROCK_GRID_PAD, ROCK_HP_PER, ROCK_R_MAX, ROCK_SWITCHES } from './rockTuning';
import type { TacticalState } from './state';
export type { RockCause } from './state';

export const ROCK_STRIDE = 8;
export const RockKind = { Gone: 0, Rail: 1, Free: 2, Tumble: 3 } as const;
/** §13.1: a rail slot of either kind (a Rail turns rigidly, a Tumble spins its offset too). */
export function isRail(kind: number): boolean { return kind === RockKind.Rail || kind === RockKind.Tumble; }
/** §3.1: spare slots for pieces. */
export const ROCK_RESERVE = 160;

/** The pool's capacity for a map: its asteroids plus the reserve. Also the number of rock bodies in a ship's graceUntil. */
export function rockCapacity(map: MapDef): number { return map.asteroids.length + ROCK_RESERVE; }
/** Spike ii §3.1: the hp a rock of radius r is born with. */
export function rockHp(r: number): number { return Math.ceil(r / ROCK_HP_PER); }
/** Spike ii §3.1: the cracks read hp / hpMax, with hpMax recomputed from r. */
export const rockHpMax = rockHp;
/** Spike ii §3.1: a rock's mass, r² (no unit). */
export function rockMass(r: number): number { return r * r; }

/** §13.1: seeded asteroid k's rail: a belt rock a Rail centred on itself (offset 0); a cluster rock on its cluster's centre
 *  with its offset, a Tumble when the clusterTumble switch is on (else a Rail: the cluster turns rigidly). */
export function seededRail(map: MapDef, k: number, tumble = ROCK_SWITCHES.clusterTumble): [number, number, number, number, number] {
  const a = map.asteroids[k]!, c = clusterOf(map, k);
  if (c < 0) return [RockKind.Rail, a.x, a.y, 0, 0];
  const o = map.clusterCentres[c]!;
  return [tumble ? RockKind.Tumble : RockKind.Rail, o.x, o.y, a.x - o.x, a.y - o.y];
}
/** §3.5, §13.1: every seeded rock a rail at t = 0 where the map put it; the reserve empty. */
export function initRocks(map: MapDef): Float64Array {
  const out = new Float64Array(rockCapacity(map) * ROCK_STRIDE);
  map.asteroids.forEach((a, k) => { const [kind, cx, cy, ox, oy] = seededRail(map, k); out.set([kind, cx, cy, ox, oy, a.r, rockHp(a.r), 0], k * ROCK_STRIDE); });
  return out;
}

export const rockKind = (s: TacticalState, k: number): number => s.rocks[k * ROCK_STRIDE]!;
export const rockAlive = (s: TacticalState, k: number): boolean => s.rocks[k * ROCK_STRIDE]! !== RockKind.Gone;
export function rockSlots(s: TacticalState): number { return s.rocks.length / ROCK_STRIDE; }

// ---- §3.3: the step context and the phase ----
interface RockStep { moved: boolean }
const steps = new WeakMap<TacticalState, RockStep>();
/** The start of a stepDuel tick: rails are read at tick + 1 until endRockStep. */
export function beginRockStep(s: TacticalState): void { steps.set(s, { moved: false }); rebuildRockGrid(s); }
/** stepRocks' motion pass is over: Free slots now stand at tick + 1 (plan deviation 2). */
export function rocksMoved(s: TacticalState): void { const c = steps.get(s); if (c) c.moved = true; }
/** The end of a stepDuel tick (before tick++). */
export function endRockStep(s: TacticalState): void { steps.delete(s); }
export function inRockStep(s: TacticalState): boolean { return steps.has(s); }
/** §3.3: the tick rails are read at: tick + 1 inside a step, tick between ticks. */
export function rockPhase(s: TacticalState): number { return steps.has(s) ? s.tick + 1 : s.tick; }
/** Plan deviation 2: the tick a Free slot stands at now: tick before this step's free motion, tick + 1 after it, tick
 *  between ticks. A rail freed now is written at this tick's rail position. */
export function freeFrame(s: TacticalState): number { const c = steps.get(s); return c && !c.moved ? s.tick : rockPhase(s); }

// ---- §3.3: the accessors and the rail memo ----
interface RailMemo { inputs: Float64Array; outputs: Float64Array }
/** Keyed by the pool array (s.rocks), not the state object: a shallow copy such as predictMissile's `{ ...state }` shares the
 *  pool and so the memo; a clone or a fresh state has its own array. Every input is still checked on every read. */
const memos = new WeakMap<Float64Array, RailMemo>();
const scratch: RailOut = { x: 0, y: 0, vx: 0, vy: 0 };
const MEMO_IN = 7;
/** The memo's outputs for rail slot k at the phase tick, recomputed unless every input (kind, centre, offset, t, the
 *  phase tick) matches exactly (Object.is, so −0 and 0 differ). Outputs per slot: x, y, vx, vy at k · 4. */
function railOutputs(s: TacticalState, k: number): Float64Array {
  const n = rockSlots(s);
  let m = memos.get(s.rocks);
  if (!m || m.outputs.length !== n * 4) { m = { inputs: new Float64Array(n * MEMO_IN).fill(NaN), outputs: new Float64Array(n * 4) }; memos.set(s.rocks, m); }
  const v = s.rocks, b = k * ROCK_STRIDE, i = k * MEMO_IN, inp = m.inputs, T = rockPhase(s);
  const kind = v[b]!, cx = v[b + 1]!, cy = v[b + 2]!, ox = v[b + 3]!, oy = v[b + 4]!, t = v[b + 7]!;
  if (!Object.is(inp[i], kind) || !Object.is(inp[i + 1], cx) || !Object.is(inp[i + 2], cy) || !Object.is(inp[i + 3], ox) || !Object.is(inp[i + 4], oy) || !Object.is(inp[i + 5], t) || !Object.is(inp[i + 6], T)) {
    railPos(cx, cy, ox, oy, t, T, kind === RockKind.Tumble, scratch);
    inp[i] = kind; inp[i + 1] = cx; inp[i + 2] = cy; inp[i + 3] = ox; inp[i + 4] = oy; inp[i + 5] = t; inp[i + 6] = T;
    const o = m.outputs, j = k * 4;
    o[j] = scratch.x; o[j + 1] = scratch.y; o[j + 2] = scratch.vx; o[j + 3] = scratch.vy;
  }
  return m.outputs;
}
export function rockX(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4]! : s.rocks[b + 1]!; }
export function rockY(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4 + 1]! : s.rocks[b + 2]!; }
export function rockVx(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4 + 2]! : s.rocks[b + 3]!; }
export function rockVy(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4 + 3]! : s.rocks[b + 4]!; }
/** Slot k's clock: a rail's anchor tick, a Free rock's last birth, freeing or push. */
export function rockT(s: TacticalState, k: number): number { return s.rocks[k * ROCK_STRIDE + 7]!; }
/** §13.1: a rail's ρω, |centre| (constant while it turns). */
export function railCentreRadius(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE, x = s.rocks[b + 1]!, y = s.rocks[b + 2]!; return Math.sqrt(x * x + y * y); }
export interface RockView { x: number; y: number; vx: number; vy: number; r: number; hp: number; kind: number }
/** Slot k as the accessors read it now. */
export function rockAt(s: TacticalState, k: number): RockView {
  const v = s.rocks, b = k * ROCK_STRIDE;
  if (isRail(v[b]!)) { const o = railOutputs(s, k), j = k * 4; return { kind: v[b]!, x: o[j]!, y: o[j + 1]!, vx: o[j + 2]!, vy: o[j + 3]!, r: v[b + 5]!, hp: v[b + 6]! }; }
  return { kind: v[b]!, x: v[b + 1]!, y: v[b + 2]!, vx: v[b + 3]!, vy: v[b + 4]!, r: v[b + 5]!, hp: v[b + 6]! };
}

// ---- §3.4: freeing, the clock and the touched mask ----
/** §3.4: rock k is touched this tick (freed, pushed, hit or in a contact): it cannot rejoin a rail this tick. */
export function markTouched(s: TacticalState, k: number): void { s.rockTouched[k] = 1; }
/** §3.4: a push restarts a Free rock's clock: t = the phase tick. */
export function restartClock(s: TacticalState, k: number): void { if (s.rocks[k * ROCK_STRIDE] === RockKind.Free) s.rocks[k * ROCK_STRIDE + 7] = rockPhase(s); }
/** §3.4, §13.1: a rail (Rail or Tumble) becomes Free at its rail position and velocity in the free frame, t = the phase
 *  tick, touched. Any other kind is left alone. */
export function freeRock(s: TacticalState, k: number): void {
  const v = s.rocks, b = k * ROCK_STRIDE;
  if (!isRail(v[b]!)) return;
  railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, freeFrame(s), v[b] === RockKind.Tumble, scratch);
  v[b] = RockKind.Free; v[b + 1] = scratch.x; v[b + 2] = scratch.y; v[b + 3] = scratch.vx; v[b + 4] = scratch.vy; v[b + 7] = rockPhase(s);
  markTouched(s, k);
  regridRock(s, k);
}

/** §3.1, §3.3, §3.4: the start (and the end) of a tick: the three transient masks cleared (made again at the pool's size
 *  if it changed). */
export function beginRockTick(s: TacticalState): void {
  const n = rockSlots(s);
  if (s.rockBorn.length !== n || s.rockDone.length !== n || s.rockTouched.length !== n) { s.rockBorn = new Uint8Array(n); s.rockDone = new Uint8Array(n); s.rockTouched = new Uint8Array(n); return; }
  s.rockBorn.fill(0); s.rockDone.fill(0); s.rockTouched.fill(0);
}
/** Spike ii §3.1: whether slot k was written with a new piece this tick. */
export function rockBorn(s: TacticalState, k: number): boolean { return s.rockBorn[k] === 1; }

/** Slots of every live rock whose bounding box (at its accessor position) may overlap the square around (x, y) of
 *  half-size h, ascending, no repeats: a scan of every slot (§6.1: the readers outside a step). */
export function rocksNearScan(s: TacticalState, x: number, y: number, h: number): number[] {
  const v = s.rocks, out: number[] = [];
  for (let k = 0, n = rockSlots(s); k < n; k++) {
    const b = k * ROCK_STRIDE;
    if (v[b] === RockKind.Gone) continue;
    const r = v[b + 5]!;
    if (Math.abs(rockX(s, k) - x) <= h + r && Math.abs(rockY(s, k) - y) <= h + r) out.push(k);
  }
  return out;
}
/** §6.1: the grid rebuilt from every live rock's accessor position (allocation-free after the first build). */
export function rebuildRockGrid(s: TacticalState): void {
  const n = rockSlots(s), g = emptyRockGrid(s, n);
  for (let k = 0; k < n; k++) if (s.rocks[k * ROCK_STRIDE] !== RockKind.Gone) linkRock(g, k, rockX(s, k), rockY(s, k));
}
/** §6.1, plan deviation 6: slot k relinked at its accessor position (a birth, a freeing, a move); inside a step only. */
export function regridRock(s: TacticalState, k: number): void {
  const g = peekRockGrid(s);
  if (g && inRockStep(s) && g.next.length === rockSlots(s)) linkRock(g, k, rockX(s, k), rockY(s, k));
}
/** rocksNearScan's answer from the grid (its box widened by ROCK_R_MAX and the pad, then the exact bounding-box rule at the
 *  accessor positions); a scan when there is no grid of this pool's size. */
export function rocksNearGrid(s: TacticalState, x: number, y: number, h: number): number[] {
  const g = peekRockGrid(s);
  if (!g || g.next.length !== rockSlots(s)) return rocksNearScan(s, x, y, h);
  const v = s.rocks, out: number[] = [], count = queryRockGrid(g, x, y, h + ROCK_R_MAX + ROCK_GRID_PAD);
  for (let i = 0; i < count; i++) {
    const k = g.scratch[i]!, b = k * ROCK_STRIDE;
    if (v[b] === RockKind.Gone) continue;
    const r = v[b + 5]!;
    if (Math.abs(rockX(s, k) - x) <= h + r && Math.abs(rockY(s, k) - y) <= h + r) out.push(k);
  }
  return out;
}
/** The broad phase every caller uses: ascending, no repeats; the grid inside a step, a scan of every slot outside (§6.1). */
export function rocksNear(s: TacticalState, x: number, y: number, h: number): number[] {
  return inRockStep(s) ? rocksNearGrid(s, x, y, h) : rocksNearScan(s, x, y, h);
}

/** Write slot k's eight values (a rail: its centre in x, y and its offset in vx, vy); t defaults to the phase tick. */
export function writeRock(s: TacticalState, k: number, kind: number, x: number, y: number, vx: number, vy: number, r: number, hp: number, t: number = rockPhase(s)): void {
  s.rocks.set([kind, x, y, vx, vy, r, hp, t], k * ROCK_STRIDE);
}

/** Where the segment a → b first enters circle (cx, cy, r), as t in [0, 1], or −1 when it never does. Starting inside is 0. */
export function segmentEntry(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const ex = bx - ax, ey = by - ay, fx = ax - cx, fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c < 0) return 0;
  const a = ex * ex + ey * ey;
  if (a === 0) return -1;
  const bb = fx * ex + fy * ey, disc = bb * bb - a * c;
  if (disc < 0 || bb > 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}

/** The first solid body along a → b: the planet (−1), a rock slot (≥ 0), or null; with the entry t. */
export function firstBlocker(s: TacticalState, ax: number, ay: number, bx: number, by: number): { rock: number; t: number } | null {
  let best: { rock: number; t: number } | null = null;
  const p = s.map.planet, tp = segmentEntry(ax, ay, bx, by, p.x, p.y, p.r);
  if (tp >= 0) best = { rock: -1, t: tp };
  const half = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2;
  for (const k of rocksNear(s, (ax + bx) / 2, (ay + by) / 2, half)) {
    if (s.rockBorn[k] === 1) continue;   // spike ii §6.2: a piece made earlier this tick is not in the way
    const a = rockAt(s, k), t = segmentEntry(ax, ay, bx, by, a.x, a.y, a.r);
    if (t >= 0 && (!best || t < best.t)) best = { rock: k, t };   // ascending k: a tie keeps the lower slot (the planet wins ties)
  }
  return best;
}
