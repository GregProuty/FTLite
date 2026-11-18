// The duel snapshot (engine refactor spec §6, an R-1 deliverable). The values are exactly flattenDuel: SIM_VERSION, the
// tactical state in flattenTactical's order (the space then the ship module), presence, repair, the round (H-2 spec
// §7), the helm throttle (Artemis-ii) and held heading (Feel-ii), then the interior through the sector snapshot path.
// Regenerated, not stored: the map (from the seed, checked by mapHash), the broad-phase grid, the repair points and
// Derived (from the duel layout). Not stored: the per-tick events. Every check runs before any allocation, including
// every tactical field's bounds and slot invariants, presence and repair, except the final one, which restores into a
// fresh duel and requires hashDuel to equal the hash the header records.
// The publication validation cache (H-2 spec §5): what validation regenerates from a seed (the map, its validity and
// hash, the field offsets, the grace length) and from a layout (Derived, the canonical fields) is memoised in two small
// bounded caches. Every check keeps its order; only the regeneration is shared. The cached tactical shape is read only
// by validateTacticalValues and never leaves this module.
import { hashF64 } from '../../../../shared/hash';
import { canonicalFields, type CanonicalField } from '../canonicalFields';
import { deriveLayout, type Derived } from '../ship/derived';
import type { ShipLayout } from '../ship/schema';
import { validateCanonicalValues } from '../snapshotValidation';
import { validateMap } from '../tactical/map';
import { createTacticalState, Outcome, type TacticalState } from '../tactical/state';
import { DUEL_CLASSES } from '../tactical/defs';
import { TACTICAL_MODULES, hashTactical, tacticalLength, validateTacticalValues } from '../tactical/hash';
import { REPAIR_UNITS } from './tuning';
import { SIM_VERSION } from '../tuning';
import { flattenDuel, hashDuel, mapHash } from './hash';
import { unflattenDuelModules } from './modules';
import { createDuel, disposeDuel, type DuelState } from './state';
import { validHoldHeading, validThrottle } from './throttle';

export const DUEL_SNAPSHOT_FORMAT = 1;
export const DUEL_PLAYERS = 2;
export interface DuelSnapshotHeader {
  snapshotFormat: typeof DUEL_SNAPSHOT_FORMAT; simVersion: number; contentDigest: string;
  /** The encounter tick (the interior and the tactical tick, which are always equal) and the player count (2). */
  tick: number; playerCount: number;
  layoutId: string; layoutHash: string; seed: number;
  /** hashF64 of the map's canonical values (mapHash), recomputed from the seed on restore. */
  mapHash: string;
  /** hashDuel of the stored state, which the restored duel must reproduce. */
  hash: string;
}
export interface DuelSnapshot { header: DuelSnapshotHeader; values: number[] }

const HEADER_KEYS = ['snapshotFormat', 'simVersion', 'contentDigest', 'tick', 'playerCount', 'layoutId', 'layoutHash', 'seed', 'mapHash', 'hash'];

/** The seed cache's and the layout cache's bounds (H-2 spec §5). */
export const SEED_CACHE_MAX = 8;
export const LAYOUT_CACHE_MAX = 4;
/** The highest round index a snapshot or roundSeed accepts: far beyond any session, and it bounds the seed chain. */
export const MAX_DUEL_ROUNDS = 1024;
interface SeedEntry {
  valid: boolean; mapHash: string; spaceLength: number; fieldOffsets: ReadonlyMap<string, number>; graceLength: number;
  /** createTacticalState(seed), read only by validateTacticalValues; never returned to a caller. */
  shape: TacticalState;
}
interface LayoutEntry { id: string; layoutHash: string; derived: Derived; fields: readonly CanonicalField[]; interiorCount: number; tickOffset: number }
const seedCache = new Map<number, SeedEntry>();
const layoutCache = new Map<ShipLayout, LayoutEntry>();
function remember<K, V>(cache: Map<K, V>, key: K, max: number, make: () => V): V {
  const hit = cache.get(key);
  if (hit !== undefined) { cache.delete(key); cache.set(key, hit); return hit; }   // least recently used goes first
  const value = make();
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value as K);
  return value;
}
function seedEntry(seed: number): SeedEntry {
  return remember(seedCache, seed, SEED_CACHE_MAX, () => {
    const shape = createTacticalState(seed), fieldOffsets = new Map<string, number>();
    let offset = 1;
    for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) { fieldOffsets.set(f.name, offset); offset += f.count; }
    return { valid: validateMap(shape.map).length === 0, mapHash: mapHash(shape.map), spaceLength: tacticalLength(shape), fieldOffsets,
      graceLength: shape.ships[0].graceUntil.length, shape };
  });
}
/** Keyed by the layout object: computing its layoutHash (deriveLayout) is the cost the cache avoids. */
function layoutEntry(layout: ShipLayout): LayoutEntry {
  return remember(layoutCache, layout, LAYOUT_CACHE_MAX, () => {
    const derived = deriveLayout(layout), fields = canonicalFields(layout, DUEL_PLAYERS), last = fields[fields.length - 1]!;
    return { id: layout.id, layoutHash: derived.layoutHash, derived, fields, interiorCount: last.offset + last.count, tickOffset: fields.find((f) => f.name === 'tick')!.offset };
  });
}
/** What a seed's map is, from the cache: whether it validates, its mapHash, and the length of a ship's graceUntil. */
export function duelSeedFacts(seed: number): { valid: boolean; mapHash: string; spaceLength: number; graceLength: number } {
  const e = seedEntry(seed);
  return { valid: e.valid, mapHash: e.mapHash, spaceLength: e.spaceLength, graceLength: e.graceLength };
}
/** Test probe (H-2 spec §5): the cache sizes and, for a cached seed, hashTactical of its shape (never the shape). */
export function duelCacheProbe(seed?: number): { seeds: number; layouts: number; shapeHash: string | null } {
  const e = seed === undefined ? undefined : seedCache.get(seed);
  return { seeds: seedCache.size, layouts: layoutCache.size, shapeHash: e ? hashTactical(e.shape) : null };
}

/** The round module's values and the outcome, read from a validated snapshot (H-2 spec §7). */
export interface DuelRoundValues { round: number; helmPlayer: 0 | 1; baseTick: number; decidedTick: number; outcome: number }
export function duelRoundOf(snapshot: DuelSnapshot): DuelRoundValues {
  const e = seedEntry(snapshot.header.seed), v = snapshot.values, at = 1 + e.spaceLength + 2 + 3;
  return { round: v[at]!, helmPlayer: v[at + 1]! as 0 | 1, baseTick: v[at + 2]!, decidedTick: v[at + 3]!, outcome: v[e.fieldOffsets.get('outcome')!]! };
}

export function saveDuelSnapshot(d: DuelState, contentDigest: string): DuelSnapshot {
  const values = Array.from(flattenDuel(d));
  return { header: { snapshotFormat: DUEL_SNAPSHOT_FORMAT, simVersion: SIM_VERSION, contentDigest, tick: d.interior.tick, playerCount: DUEL_PLAYERS,
    layoutId: d.interior.layout.id, layoutHash: d.interior.derived.layoutHash, seed: d.tactical.seed, mapHash: mapHash(d.tactical.map), hash: hashF64(Float64Array.from(values)) }, values };
}

/** Validate a portable duel snapshot without allocating a duel: header, versions, digest, layout, map, value count,
 *  the interior's canonical values, equal ticks, and the recorded hash over the values. Returns an owned copy. */
export function validateDuelSnapshot(layout: ShipLayout, value: unknown, contentDigest: string): DuelSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('duel snapshot must be an object');
  const snap = value as Record<string, unknown>;
  if (Object.keys(snap).sort().join(',') !== 'header,values') throw new Error('duel snapshot fields do not match');
  const h = snap.header as Record<string, unknown> | null;
  if (!h || typeof h !== 'object' || Object.keys(h).length !== HEADER_KEYS.length || HEADER_KEYS.some((k) => !Object.hasOwn(h, k))) throw new Error('duel snapshot header fields do not match');
  if (h.snapshotFormat !== DUEL_SNAPSHOT_FORMAT) throw new Error(`duel snapshot format ${String(h.snapshotFormat)} not supported (expected ${DUEL_SNAPSHOT_FORMAT})`);
  if (h.simVersion !== SIM_VERSION) throw new Error('duel snapshot sim version does not match');
  if (h.contentDigest !== contentDigest) throw new Error('duel snapshot content digest does not match');
  const lay = layoutEntry(layout), derived = lay.derived;
  if (h.layoutId !== layout.id || h.layoutHash !== derived.layoutHash) throw new Error('duel snapshot layout does not match');
  if (h.playerCount !== DUEL_PLAYERS) throw new Error('duel snapshot player count is invalid');
  if (typeof h.tick !== 'number' || !Number.isSafeInteger(h.tick) || h.tick < 0) throw new Error('duel snapshot tick is invalid');
  if (typeof h.seed !== 'number' || !Number.isInteger(h.seed) || h.seed < 0 || h.seed > 0xffffffff) throw new Error('duel snapshot seed is invalid');
  if (typeof h.mapHash !== 'string' || typeof h.hash !== 'string') throw new Error('duel snapshot hashes are invalid');
  const seed = seedEntry(h.seed);   // the map and grid only, from the cache: no interior allocation
  if (!seed.valid) throw new Error('duel snapshot seed makes an invalid map');
  if (seed.mapHash !== h.mapHash) throw new Error('duel snapshot map does not match its seed');
  if (!Array.isArray(snap.values) || snap.values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('duel snapshot values must be finite numbers');
  // -0 is written as 0 (flattenDuel and here): no sim path distinguishes the two zeros (no 1/x, atan2 or Object.is on state),
  // so the snapshot and the live state hash and behave identically.
  const values = (snap.values as number[]).map((v) => (v === 0 ? 0 : v));
  const space = seed.spaceLength, roundAt = 1 + space + 2 + 3, helmAt = roundAt + 4, interiorAt = helmAt + 2;
  if (values.length !== interiorAt + lay.interiorCount) throw new Error('duel snapshot length does not match the layout and map');
  if (values[0] !== SIM_VERSION) throw new Error('duel snapshot sim version does not match its values');
  if (values[2] !== h.seed) throw new Error('duel snapshot seed does not match its values');
  if (validateTacticalValues(seed.shape, values, 1) !== 1 + space) throw new Error('duel snapshot tactical length does not match');   // bounds and slot invariants, before anything is allocated
  // The duel's slot identity: exactly its two slots, both active, the Cutter and the hunter, each locked on the other.
  const slotValue = (name: string): number => values[seed.fieldOffsets.get(name)!]!;
  if (slotValue('ships.length') !== DUEL_CLASSES.length
    || DUEL_CLASSES.some((cls, i) => slotValue(`ships.${i}.active`) !== 1 || slotValue(`systems.${i}.cls`) !== cls || slotValue(`systems.${i}.target`) !== 1 - i))
    throw new Error('duel snapshot duel slot identity does not match: two active slots, the Cutter and the hunter, each locked on the other');
  for (let k = 1 + space; k < roundAt; k++) {
    const v = values[k]!, presence = k < 1 + space + 2;
    if (presence ? v !== 0 && v !== 1 : !Number.isInteger(v) || v < 0 || v >= REPAIR_UNITS) throw new Error(`duel snapshot ${presence ? 'presence' : 'repair'} value ${v} is out of range`);
  }
  // The round module: a round index (at most MAX_DUEL_ROUNDS, and round n begins no earlier than tick 2n: each round
  // before it took a deciding step and a rematch step), the Helm player 0 or 1, a base tick no later than the tick, and
  // a decided tick that is −1 exactly while the outcome is Running, otherwise between the base tick and the tick.
  const [round, helm, base, decided] = values.slice(roundAt, helmAt) as [number, number, number, number];
  const running = values[seed.fieldOffsets.get('outcome')!] === Outcome.Running;
  if (!Number.isSafeInteger(round) || round < 0 || round > MAX_DUEL_ROUNDS) throw new Error(`duel snapshot round ${round} is invalid`);
  if (helm !== 0 && helm !== 1) throw new Error(`duel snapshot helm player ${helm} is invalid`);
  if (!Number.isSafeInteger(base) || base < 0 || base > h.tick) throw new Error(`duel snapshot base tick ${base} is invalid`);
  if (2 * round > base) throw new Error(`duel snapshot round ${round} is invalid at base tick ${base}`);
  if (running ? decided !== -1 : !Number.isSafeInteger(decided) || decided < base || decided > h.tick) throw new Error(`duel snapshot decided tick ${decided} does not match the outcome`);
  // The helm module (Artemis spec §5.1): the throttle, an integer level in −1..4.
  const level = values[helmAt]!;
  if (!validThrottle(level)) throw new Error(`duel snapshot throttle ${level} is invalid`);
  // Feel-ii (spec §1.1): the held heading, −1 or a heading index 0..255.
  const holdHeading = values[helmAt + 1]!;
  if (!validHoldHeading(holdHeading)) throw new Error(`duel snapshot held heading ${holdHeading} is invalid`);
  const interior = values.slice(interiorAt);
  validateCanonicalValues(layout, derived, DUEL_PLAYERS, interior);
  // The identity values unflatten checks (flatten.ts), required here so nothing is allocated for a snapshot it would refuse.
  if (interior[0] !== SIM_VERSION) throw new Error('duel snapshot interior sim version does not match');
  if (interior[1] !== parseInt(derived.idHash, 16) || interior[2] !== parseInt(derived.layoutHash, 16)) throw new Error('duel snapshot interior layout does not match');
  if (interior[5] !== DUEL_PLAYERS || interior[9] !== DUEL_PLAYERS) throw new Error('duel snapshot interior crew count does not match');
  const interiorTick = values[interiorAt + lay.tickOffset];
  if (values[1] !== h.tick || interiorTick !== h.tick) throw new Error('duel snapshot interior and tactical ticks differ from the header');
  if (hashF64(Float64Array.from(values)) !== h.hash) throw new Error('duel snapshot hash does not match its values');
  return { header: { snapshotFormat: DUEL_SNAPSHOT_FORMAT, simVersion: SIM_VERSION, contentDigest, tick: h.tick, playerCount: DUEL_PLAYERS,
    layoutId: layout.id, layoutHash: derived.layoutHash, seed: h.seed, mapHash: h.mapHash, hash: h.hash }, values };
}

/** Write a validated snapshot's modules back into `d`, then check its ticks and hashDuel against the header. */
function writeBack(d: DuelState, snap: DuelSnapshot): void {
  if (unflattenDuelModules(d, snap.values, 1) !== snap.values.length) throw new Error('duel snapshot length does not match');
  if (d.interior.tick !== d.tactical.tick) throw new Error('duel snapshot interior and tactical ticks differ');
  if (hashDuel(d) !== snap.header.hash) throw new Error('restored duel hash does not match the snapshot');
}

/** Construct a duel from a snapshot: a fresh duel from its seed, every module written back, then the restored state's
 *  ticks and hashDuel checked against the header. Releases the duel on any failure. */
export function loadDuelSnapshot(layout: ShipLayout, value: unknown, contentDigest: string): DuelState {
  const snap = validateDuelSnapshot(layout, value, contentDigest);
  const d = createDuel(layout, snap.header.seed);
  try { writeBack(d, snap); return d; } catch (error) { disposeDuel(d); throw error; }
}

/**
 * Restore a snapshot into an existing duel in place (H-2 spec §4): the client applies 20 publications a second, and
 * loadDuelSnapshot allocates a fresh interior on every call. `snapshot` is a value validateDuelSnapshot already
 * returned (the publication path validates once), so it is not validated again; its layout and seed must be the
 * duel's own (a new seed, a new round, is a replacement: load it instead). A failure leaves `d` unusable: dispose it.
 */
export function restoreDuelSnapshot(d: DuelState, snapshot: DuelSnapshot, contentDigest: string): void {
  const h = snapshot.header;
  if (h.contentDigest !== contentDigest || h.simVersion !== SIM_VERSION) throw new Error('duel snapshot versions do not match');
  if (h.layoutId !== d.interior.layout.id || h.layoutHash !== d.interior.derived.layoutHash || h.seed !== d.tactical.seed) throw new Error('duel snapshot is for another layout or seed: load it instead');
  writeBack(d, snapshot);
  d.events = []; d.tactical.events = [];   // not snapshotted: a restore holds no per-tick events, as a fresh load
}
