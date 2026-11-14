import { MAX_PLAYERS } from '../../../shared/intent';
import type { ShipLayout } from './ship/schema';
import { deriveLayout, type Derived } from './ship/derived';
import { assertSimStateLive, createSimState, disposeSimState, STREAM_NAMES, type SimState } from './state';
import { flatten, unflatten, FLATTEN_MANIFEST } from './flatten';
import { validateCanonicalValues } from './snapshotValidation';
import { SIM_VERSION } from './tuning';

export const SNAPSHOT_FORMAT = 2;
export interface SnapshotHeader {
  formatVersion: number; simVersion: number; contentDigest: string; tick: number;
  rngStates: Record<string, number>;
  layoutId: string; layoutHash: string; playerCount: number; manifest: string[];
}
export interface Snapshot { header: SnapshotHeader; values: number[] }

/** Unbundled callers must supply the digest computed for their gameplay sources. */
export function snapshotContentDigest(explicit?: string): string {
  const digest = explicit ?? (typeof __GAMEPLAY_CONTENT_DIGEST__ === 'undefined' ? undefined : __GAMEPLAY_CONTENT_DIGEST__);
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new Error('snapshot requires a valid gameplay content digest');
  return digest;
}
export function saveSnapshot(state: SimState, contentDigest?: string): Snapshot {
  assertSimStateLive(state);
  const rngStates: Record<string, number> = {};
  for (const n of STREAM_NAMES) rngStates[n] = state.rng[n].s;
  return { header: { formatVersion: SNAPSHOT_FORMAT, simVersion: SIM_VERSION, contentDigest: snapshotContentDigest(contentDigest), tick: state.tick, rngStates,
    layoutId: state.layout.id, layoutHash: state.derived.layoutHash, playerCount: state.playerCount, manifest: [...FLATTEN_MANIFEST] }, values: Array.from(flatten(state)) };
}
function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`snapshot ${label} must be an object`);
  const own = Object.keys(value);
  if (own.length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(value, k))) throw new Error(`snapshot ${label} fields do not match`);
  return value as Record<string, unknown>;
}
function validated(layout: ShipLayout, derived: Derived, input: unknown, expectedContentDigest?: string): Snapshot {
  const digest = snapshotContentDigest(expectedContentDigest);
  const snap = record(input, ['header', 'values'], 'structure');
  if (snap.header && typeof snap.header === 'object' && 'formatVersion' in snap.header && snap.header.formatVersion !== SNAPSHOT_FORMAT) {
    throw new Error(`snapshot format ${String(snap.header.formatVersion)} not supported (expected ${SNAPSHOT_FORMAT})`);
  }
  const h = record(snap.header, ['formatVersion', 'simVersion', 'contentDigest', 'tick', 'rngStates', 'layoutId', 'layoutHash', 'playerCount', 'manifest'], 'header');
  if (h.formatVersion !== SNAPSHOT_FORMAT) throw new Error(`snapshot format ${String(h.formatVersion)} not supported (expected ${SNAPSHOT_FORMAT})`);
  if (h.simVersion !== SIM_VERSION) throw new Error('snapshot sim version does not match');
  if (h.contentDigest !== digest) throw new Error('snapshot content digest does not match');
  if (h.layoutId !== layout.id || h.layoutHash !== derived.layoutHash) throw new Error('snapshot layout does not match');
  const manifest = h.manifest;
  if (!Array.isArray(manifest) || manifest.length !== FLATTEN_MANIFEST.length || FLATTEN_MANIFEST.some((v, i) => manifest[i] !== v)) throw new Error('snapshot manifest does not match');
  if (typeof h.playerCount !== 'number' || !Number.isInteger(h.playerCount) || h.playerCount < 1 || h.playerCount > MAX_PLAYERS || h.playerCount > layout.spawns.length) throw new Error('snapshot player count is invalid');
  if (typeof h.tick !== 'number' || !Number.isSafeInteger(h.tick) || h.tick < 0) throw new Error('snapshot tick is invalid');
  const rng = record(h.rngStates, STREAM_NAMES, 'rngStates');
  if (!Array.isArray(snap.values)) throw new Error('snapshot values must be an array');
  const values = snap.values.slice() as number[];
  validateCanonicalValues(layout, derived, h.playerCount, values);
  if (values[0] !== SIM_VERSION) throw new Error('snapshot sim version does not match header');
  if (values[1] !== parseInt(derived.idHash, 16) || values[2] !== parseInt(derived.layoutHash, 16)) throw new Error('snapshot canonical identity does not match header');
  if (values[3] !== h.tick || values[5] !== h.playerCount || values[9] !== h.playerCount) throw new Error('snapshot tick/player/crew fields disagree with header');
  const rngStates: Record<string, number> = {};
  for (let i = 0; i < STREAM_NAMES.length; i++) {
    const name = STREAM_NAMES[i]!, value = rng[name];
    if (value !== values[10 + i]) throw new Error('snapshot RNG fields disagree with header');
    rngStates[name] = value as number;
  }
  return { header: { formatVersion: SNAPSHOT_FORMAT, simVersion: SIM_VERSION, contentDigest: digest, tick: h.tick, rngStates,
    layoutId: layout.id, layoutHash: derived.layoutHash, playerCount: h.playerCount, manifest: [...FLATTEN_MANIFEST] }, values };
}
/** Validate portable data without allocating a world or modifying a live state. */
export function validateSnapshot(layout: ShipLayout, snap: unknown, expectedContentDigest?: string): Snapshot {
  return validated(layout, deriveLayout(layout), snap, expectedContentDigest);
}
/** Restore matching shape in place; every rejection precedes all live writes. */
export function restoreSnapshot(state: SimState, snap: unknown, expectedContentDigest?: string): void {
  assertSimStateLive(state);
  const checked = validated(state.layout, state.derived, snap, expectedContentDigest);
  if (checked.header.playerCount !== state.playerCount) throw new Error('snapshot player count does not match live state');
  unflatten(state, Float64Array.from(checked.values));
}
/** Construct only after validation; release partially constructed state on failure. */
export function loadSnapshot(layout: ShipLayout, snap: unknown, expectedContentDigest?: string): SimState {
  const checked = validateSnapshot(layout, snap, expectedContentDigest);
  const state = createSimState(layout, checked.header.playerCount, 0);
  try { unflatten(state, Float64Array.from(checked.values)); return state; }
  catch (error) { disposeSimState(state); throw error; }
}
