// What the particles show and where (Art-i spec sections 6-8): fire embers and smoke, sparks at failed stations and
// damaged duel repair rooms, breach venting and debris, crew at work, lingering hit smoke and wall-vent steam. Every
// signal is read from sim state the renderer already has; nothing here writes back. Pure: no Pixi.
import { TILE_PX } from '../../../../shared/resolution';
import type { SimState } from '../../sim/state';
import type { DuelState } from '../../sim/duel/state';
import { Position } from '../../sim/components';
import { interactTarget, TargetKind } from '../../sim/interact';
import { FIRE_CAP } from '../../sim/tuning';
import { fireTiles, breachFloorNeighbour } from '../hazardTiles';
import { cellAt } from '../gradeModel';
import { RAMP } from '../palette';
import { hashString, hashU32, type Random } from './random';
import type { Emitter, ParticleSpec, Source } from './emitter';

const T = TILE_PX, HALF = T / 2;
const tileCentre = (t: number, width: number): { x: number; y: number } => { const tx = t % width; return { x: tx * T + HALF, y: ((t - tx) / width) * T + HALF }; };

/** The ramps the sources step along (each a run of one palette ramp, bright to dark). */
export const EMBER = RAMP.fire.slice(0, 6), SMOKE = RAMP.vent.slice(2), SPARK = RAMP.electric, STEAM = RAMP.vent, FOAM = RAMP.vent.slice(0, 3), DEBRIS = RAMP.vent.slice(1);

// ---- who is working (spec section 6) ----

export interface RepairSample { tick: number; fire: number[]; breach: number[]; station: number[] }
/** The repair progress at the last drawn tick and the drawn tick before it (kept in RenderMemory). */
export interface RepairWatch { last: RepairSample | null; prev: RepairSample | null }

export function sampleRepair(state: SimState): RepairSample {
  return { tick: state.tick, fire: Array.from(state.rooms.fireRepair), breach: Array.from(state.breaches.repair), station: Array.from(state.stations.repair) };
}

/** Once per frame: a new tick shifts the last sample to prev and samples again; the same tick changes nothing. */
export function watchRepair(w: RepairWatch, state: SimState): void {
  if (w.last && w.last.tick === state.tick) return;
  w.prev = w.last; w.last = sampleRepair(state);
}

export type WorkKind = 'fire' | 'breach' | 'power' | 'repair';
/** A crew member at work: the player, what they work on, and the point (ship world units) the sparks or foam come from. */
export interface Working { pid: number; kind: WorkKind; x: number; y: number }

/**
 * Sector working = conscious, unseated (interactTarget is None otherwise), the target is a fire, breach or station
 * repair, and that target's repair progress rose between the last two drawn ticks. The point: the burning tile of the
 * room nearest the crew member, the breach site, or the station's tile.
 */
export function sectorWorking(state: SimState, w: RepairWatch): Working[] {
  const { last, prev } = w;
  if (!last || !prev) return [];
  const d = state.derived, out: Working[] = [];
  for (let pid = 0; pid < state.playerCount; pid++) {
    const t = interactTarget(state, pid), eid = state.crew[pid]!;
    if (t.kind === TargetKind.Fire) {
      if (!(last.fire[t.index]! > prev.fire[t.index]!)) continue;
      const tiles = fireTiles(d.roomTiles[t.index]!, state.rooms.fire[t.index]!, FIRE_CAP);
      const px = Position.x[eid]! * T, py = Position.y[eid]! * T;
      let best = tileCentre(tiles[0] ?? d.roomTiles[t.index]![0]!, d.width), bd = Infinity;
      for (const tile of tiles) { const c = tileCentre(tile, d.width), dd = (c.x - px) ** 2 + (c.y - py) ** 2; if (dd < bd) { bd = dd; best = c; } }
      out.push({ pid, kind: 'fire', ...best });
    } else if (t.kind === TargetKind.Breach) {
      if (last.breach[t.index]! > prev.breach[t.index]!) out.push({ pid, kind: 'breach', ...tileCentre(d.siteTile[t.index]!, d.width) });
    } else if (t.kind === TargetKind.Power) {
      if (last.station[t.index]! > prev.station[t.index]!) out.push({ pid, kind: 'power', ...tileCentre(d.stationTile[t.index]!, d.width) });
    }
  }
  return out;
}

/** Duel working = a repairWork event for that player in the latest tick's d.events; the point is that room's repair tile. */
export function duelWorking(d: DuelState): Working[] {
  const out: Working[] = [], width = d.interior.derived.width;
  for (const e of d.events) {
    if (e.kind !== 'repairWork') continue;
    const p = d.points.find((q) => q.tacticalRoom === e.room);
    if (p) out.push({ pid: e.player, kind: 'repair', ...tileCentre(p.tile, width) });
  }
  return out;
}

/** A working crew member bobs 1 art pixel (2 world units) at 4 Hz: up for the second half of each 0.25 s. */
export function bobOffset(t: number): number { return Math.floor(t * 8) % 2 === 1 ? -2 : 0; }

// ---- steady sources (rates per second) ----

export const EMBER_RATE = 5, SMOKE_RATE = 1.5, SPARK_RATE = 8, VENT_RATE = 16, FOAM_RATE = 14, WORK_SPARK_RATE = 10, HIT_SMOKE_RATE = 6;

const smoke = (r: Random, x: number, y: number): ParticleSpec => ({ x: x + r.range(-10, 10), y: y + r.range(-6, 6), vx: r.range(-2, 8), vy: -r.range(8, 16), life: r.range(1.2, 2), size: r.next() < 0.5 ? 2 : 3, ramp: SMOKE, blend: 'normal' });
const spark = (r: Random, x: number, y: number): ParticleSpec => {
  const a = r.range(0, Math.PI * 2), v = r.range(40, 80);
  return { x: x + r.range(-4, 4), y: y + r.range(-4, 4), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: r.range(0.25, 0.45), size: 1, ramp: SPARK, blend: 'add', gravity: 160 };
};

/** Embers rising (additive) and smoke drifting (normal) from every burning tile. */
export function fireSources(state: SimState): Source[] {
  const d = state.derived, out: Source[] = [];
  for (let r = 0; r < d.volume.length; r++) {
    const fire = state.rooms.fire[r]!;
    if (fire <= 0) continue;
    for (const t of fireTiles(d.roomTiles[r]!, fire, FIRE_CAP)) {
      const c = tileCentre(t, d.width);
      out.push({ key: `ember:${t}`, rate: EMBER_RATE, make: (q) => ({ x: c.x + q.range(-12, 12), y: c.y + q.range(-4, 8), vx: q.range(-8, 8), vy: -q.range(25, 45), life: q.range(0.6, 1.1), size: 1, ramp: EMBER, blend: 'add' }) });
      out.push({ key: `smoke:${t}`, rate: SMOKE_RATE, make: (q) => smoke(q, c.x, c.y) });
    }
  }
  return out;
}

/** Sparks at each point: the failed stations (sector) or the damaged repair rooms' repair tiles (duel). */
export function sparkSources(points: readonly { key: string; x: number; y: number }[]): Source[] {
  return points.map((p) => ({ key: `spark:${p.key}`, rate: SPARK_RATE, make: (q) => spark(q, p.x, p.y) }));
}

/** Sector: every failed station's tile centre (stations.failed[i] === 1). */
export function failedStationPoints(state: SimState): { key: string; x: number; y: number }[] {
  const d = state.derived, out: { key: string; x: number; y: number }[] = [];
  for (let i = 0; i < d.stationTile.length; i++) if (state.stations.failed[i] === 1) out.push({ key: `station:${i}`, ...tileCentre(d.stationTile[i]!, d.width) });
  return out;
}

/** Duel: the repair tile of every damaged tactical room (level > 0). */
export function damagedRepairPoints(d: DuelState): { key: string; x: number; y: number }[] {
  const ship = d.tactical.systems[0]!, width = d.interior.derived.width;
  return d.points.filter((p) => ship.rooms[p.tacticalRoom]! > 0).map((p) => ({ key: `room:${p.tacticalRoom}`, ...tileCentre(p.tile, width) }));
}

/** The unit step from a breach's room-side floor tile to its site (the hole), or null when the site has none. */
export function breachDirection(state: SimState, site: number): { dx: number; dy: number } | null {
  const d = state.derived, f = breachFloorNeighbour(d, site);
  if (f < 0) return null;
  const s = d.siteTile[site]!;
  return { dx: (s % d.width) - (f % d.width), dy: Math.trunc(s / d.width) - Math.trunc(f / d.width) };
}

/** A stream from each active breach's floor tile toward its hole. */
export function ventingSources(state: SimState): Source[] {
  const d = state.derived, out: Source[] = [];
  for (let s = 0; s < d.siteTile.length; s++) {
    if (state.breaches.active[s] !== 1) continue;
    const dir = breachDirection(state, s);
    if (!dir) continue;
    const from = tileCentre(breachFloorNeighbour(d, s), d.width);
    out.push({ key: `vent:${s}`, rate: VENT_RATE, make: (q) => {
      const side = q.range(-8, 8), v = q.range(60, 90), drift = q.range(-8, 8);
      return { x: from.x + (dir.dx === 0 ? side : 0), y: from.y + (dir.dy === 0 ? side : 0), vx: dir.dx * v + (dir.dx === 0 ? drift : 0), vy: dir.dy * v + (dir.dy === 0 ? drift : 0), life: q.range(0.35, 0.55), size: 1, ramp: STEAM, blend: 'normal' };
    } });
  }
  return out;
}

/** Foam at a fire, sparks at anything else. */
export function workSources(working: readonly Working[]): Source[] {
  return working.map((w) => w.kind === 'fire'
    ? { key: `foam:${w.pid}`, rate: FOAM_RATE, make: (q: Random) => { const a = q.range(0, Math.PI * 2), v = q.range(15, 35); return { x: w.x + q.range(-6, 6), y: w.y + q.range(-6, 6), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: q.range(0.4, 0.7), size: 2, ramp: FOAM, blend: 'normal' } as ParticleSpec; } }
    : { key: `work:${w.pid}`, rate: WORK_SPARK_RATE, make: (q: Random) => spark(q, w.x, w.y) });
}

/** Lingering smoke after a hit: from random tiles of the hit area until `until` (presentation seconds). */
export interface HitSmoke { key: string; tiles: readonly number[]; until: number }
export function hitSmokeSources(smokes: readonly HitSmoke[], t: number, width: number): Source[] {
  return smokes.filter((s) => t < s.until && s.tiles.length).map((s) => ({ key: `hit:${s.key}`, rate: HIT_SMOKE_RATE, make: (q: Random) => { const c = tileCentre(s.tiles[q.int(s.tiles.length)]!, width); return smoke(q, c.x, c.y); } }));
}

// ---- bursts ----

/** Breach sites that opened since the last frame (0 to 1); `seen` null on a run's first frame (nothing opens). */
export function breachOpenings(active: ArrayLike<number>, seen: Uint8Array | null): { opened: number[]; seen: Uint8Array } {
  const next = Uint8Array.from(active), opened: number[] = [];
  if (seen && seen.length === next.length) for (let s = 0; s < next.length; s++) if (next[s] === 1 && seen[s] !== 1) opened.push(s);
  return { opened, seen: next };
}

export const DEBRIS_COUNT = 14;
/** Hull debris on the tick a breach opens: thrown from the site back into the room. */
export function debrisBurst(e: Emitter, state: SimState, site: number): void {
  const d = state.derived, c = tileCentre(d.siteTile[site]!, d.width), dir = breachDirection(state, site) ?? { dx: 0, dy: -1 };
  for (let k = 0; k < DEBRIS_COUNT; k++) {
    const r = e.random, a = Math.atan2(-dir.dy, -dir.dx) + r.range(-1.1, 1.1), v = r.range(30, 90);
    e.spawn({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: r.range(0.5, 0.9), size: r.next() < 0.6 ? 1 : 2, ramp: DEBRIS, blend: 'normal' });
  }
}

// ---- wall vents (spec section 8) ----

export interface WallVent { tile: number; x: number; y: number; dx: number; dy: number }
const AROUND = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;

/** Wall tiles next to a floor tile where hash(layoutHash, tile) mod 8 = 0; the puff leaves the wall band's floor-side
 *  edge toward the first floor neighbour (up, left, right, down). */
export function wallVents(rows: readonly string[], width: number, height: number, layoutHash: string): WallVent[] {
  const seed = hashString(layoutHash), out: WallVent[] = [];
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    if (cellAt(rows, tx, ty) !== 'wall') continue;
    const tile = ty * width + tx;
    if (hashU32(seed, tile) % 8 !== 0) continue;
    const floor = AROUND.find(([ox, oy]) => cellAt(rows, tx + ox, ty + oy) === 'floor');
    if (!floor) continue;
    const [dx, dy] = floor;
    out.push({ tile, x: tx * T + HALF + dx * 6, y: ty * T + HALF + dy * 6, dx, dy });
  }
  return out;
}

export const PUFF_MIN_S = 4, PUFF_MAX_S = 8, PUFF_COUNT = 7;
/** Each vent puffs every 4-8 s (drawn from the generator); `next` holds each vent's next puff time and is filled on first use. */
export function stepVents(e: Emitter, vents: readonly WallVent[], next: number[], t: number): void {
  vents.forEach((v, k) => {
    if (next[k] === undefined) next[k] = t + e.random.range(0, PUFF_MAX_S);
    if (t < next[k]!) return;
    next[k] = t + e.random.range(PUFF_MIN_S, PUFF_MAX_S);
    for (let n = 0; n < PUFF_COUNT; n++) {
      const r = e.random, v2 = r.range(10, 25), side = r.range(-6, 6);
      e.spawn({ x: v.x + (v.dx === 0 ? side : 0), y: v.y + (v.dy === 0 ? side : 0), vx: v.dx * v2 + r.range(-3, 3), vy: v.dy * v2 - r.range(4, 10), life: r.range(0.8, 1.4), size: r.next() < 0.5 ? 1 : 2, ramp: STEAM, blend: 'normal' });
    }
  });
}
