// The duel snapshot (engine refactor spec §6, an R-1 deliverable). The values are exactly flattenDuel: SIM_VERSION, the
// tactical state in flattenTactical's order (the space then the ship module), presence, repair, then the interior
// through the sector snapshot path.
// Regenerated, not stored: the map (from the seed, checked by mapHash), the broad-phase grid, the repair points and
// Derived (from the Cutter layout). Not stored: the per-tick events. Every check runs before any allocation, including
// every tactical field's bounds and slot invariants, presence and repair, except the final one, which restores into a
// fresh duel and requires hashDuel to equal the hash the header records.
import { hashF64 } from '../../../../shared/hash';
import { canonicalFields } from '../canonicalFields';
import { deriveLayout } from '../ship/derived';
import type { ShipLayout } from '../ship/schema';
import { validateCanonicalValues } from '../snapshotValidation';
import { validateMap } from '../tactical/map';
import { createTacticalState } from '../tactical/state';
import { DUEL_CLASSES } from '../tactical/defs';
import { TACTICAL_MODULES, tacticalLength, validateTacticalValues } from '../tactical/hash';
import { REPAIR_UNITS } from './tuning';
import { SIM_VERSION } from '../tuning';
import { flattenDuel, hashDuel, mapHash } from './hash';
import { unflattenDuelModules } from './modules';
import { createDuel, disposeDuel, type DuelState } from './state';

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
  const derived = deriveLayout(layout);
  if (h.layoutId !== layout.id || h.layoutHash !== derived.layoutHash) throw new Error('duel snapshot layout does not match');
  if (h.playerCount !== DUEL_PLAYERS) throw new Error('duel snapshot player count is invalid');
  if (typeof h.tick !== 'number' || !Number.isSafeInteger(h.tick) || h.tick < 0) throw new Error('duel snapshot tick is invalid');
  if (typeof h.seed !== 'number' || !Number.isInteger(h.seed) || h.seed < 0 || h.seed > 0xffffffff) throw new Error('duel snapshot seed is invalid');
  if (typeof h.mapHash !== 'string' || typeof h.hash !== 'string') throw new Error('duel snapshot hashes are invalid');
  const tactical = createTacticalState(h.seed);   // the map and grid only: no interior allocation
  if (validateMap(tactical.map).length > 0) throw new Error('duel snapshot seed makes an invalid map');
  if (mapHash(tactical.map) !== h.mapHash) throw new Error('duel snapshot map does not match its seed');
  if (!Array.isArray(snap.values) || snap.values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('duel snapshot values must be finite numbers');
  // -0 is written as 0 (flattenDuel and here): no sim path distinguishes the two zeros (no 1/x, atan2 or Object.is on state),
  // so the snapshot and the live state hash and behave identically.
  const values = (snap.values as number[]).map((v) => (v === 0 ? 0 : v));
  const fields = canonicalFields(layout, DUEL_PLAYERS), last = fields[fields.length - 1]!, interiorCount = last.offset + last.count;
  const space = tacticalLength(tactical), interiorAt = 1 + space + 2 + 3;
  if (values.length !== interiorAt + interiorCount) throw new Error('duel snapshot length does not match the layout and map');
  if (values[0] !== SIM_VERSION) throw new Error('duel snapshot sim version does not match its values');
  if (values[2] !== h.seed) throw new Error('duel snapshot seed does not match its values');
  if (validateTacticalValues(tactical, values, 1) !== 1 + space) throw new Error('duel snapshot tactical length does not match');   // bounds and slot invariants, before anything is allocated
  // The duel's slot identity: exactly its two slots, both active, the Cutter and the hunter, each locked on the other.
  const at = new Map<string, number>();
  let offset = 1;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(tactical)) { at.set(f.name, offset); offset += f.count; }
  const slotValue = (name: string): number => values[at.get(name)!]!;
  if (slotValue('ships.length') !== DUEL_CLASSES.length
    || DUEL_CLASSES.some((cls, i) => slotValue(`ships.${i}.active`) !== 1 || slotValue(`systems.${i}.cls`) !== cls || slotValue(`systems.${i}.target`) !== 1 - i))
    throw new Error('duel snapshot duel slot identity does not match: two active slots, the Cutter and the hunter, each locked on the other');
  for (let k = 1 + space; k < interiorAt; k++) {
    const v = values[k]!, presence = k < 1 + space + 2;
    if (presence ? v !== 0 && v !== 1 : !Number.isInteger(v) || v < 0 || v >= REPAIR_UNITS) throw new Error(`duel snapshot ${presence ? 'presence' : 'repair'} value ${v} is out of range`);
  }
  const interior = values.slice(interiorAt);
  validateCanonicalValues(layout, derived, DUEL_PLAYERS, interior);
  // The identity values unflatten checks (flatten.ts), required here so nothing is allocated for a snapshot it would refuse.
  if (interior[0] !== SIM_VERSION) throw new Error('duel snapshot interior sim version does not match');
  if (interior[1] !== parseInt(derived.idHash, 16) || interior[2] !== parseInt(derived.layoutHash, 16)) throw new Error('duel snapshot interior layout does not match');
  if (interior[5] !== DUEL_PLAYERS || interior[9] !== DUEL_PLAYERS) throw new Error('duel snapshot interior crew count does not match');
  const interiorTick = values[interiorAt + fields.find((f) => f.name === 'tick')!.offset];
  if (values[1] !== h.tick || interiorTick !== h.tick) throw new Error('duel snapshot interior and tactical ticks differ from the header');
  if (hashF64(Float64Array.from(values)) !== h.hash) throw new Error('duel snapshot hash does not match its values');
  return { header: { snapshotFormat: DUEL_SNAPSHOT_FORMAT, simVersion: SIM_VERSION, contentDigest, tick: h.tick, playerCount: DUEL_PLAYERS,
    layoutId: layout.id, layoutHash: derived.layoutHash, seed: h.seed, mapHash: h.mapHash, hash: h.hash }, values };
}

/** Construct a duel from a snapshot: a fresh duel from its seed, every module written back, then the restored state's
 *  ticks and hashDuel checked against the header. Releases the duel on any failure. */
export function loadDuelSnapshot(layout: ShipLayout, value: unknown, contentDigest: string): DuelState {
  const snap = validateDuelSnapshot(layout, value, contentDigest);
  const d = createDuel(layout, snap.header.seed);
  try {
    if (unflattenDuelModules(d, snap.values, 1) !== snap.values.length) throw new Error('duel snapshot length does not match');
    if (d.interior.tick !== d.tactical.tick) throw new Error('duel snapshot interior and tactical ticks differ');
    if (hashDuel(d) !== snap.header.hash) throw new Error('restored duel hash does not match the snapshot');
    return d;
  } catch (error) { disposeDuel(d); throw error; }
}
