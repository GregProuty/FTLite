import type { ShipLayout } from './ship/schema';
import { createSimState, STREAM_NAMES, type SimState } from './state';
import { flatten, unflatten, FLATTEN_MANIFEST } from './flatten';
import { SIM_VERSION } from './tuning';

export const SNAPSHOT_FORMAT = 1;

export interface SnapshotHeader {
  formatVersion: number; simVersion: number; tick: number;
  rngStates: Record<string, number>;
  layoutId: string; layoutHash: string; playerCount: number; manifest: string[];
}
export interface Snapshot { header: SnapshotHeader; values: number[] }

export function saveSnapshot(state: SimState): Snapshot {
  const rngStates: Record<string, number> = {};
  for (const n of STREAM_NAMES) rngStates[n] = state.rng[n].s;
  return {
    header: {
      formatVersion: SNAPSHOT_FORMAT, simVersion: SIM_VERSION, tick: state.tick, rngStates,
      layoutId: state.layout.id, layoutHash: state.derived.layoutHash, playerCount: state.playerCount, manifest: [...FLATTEN_MANIFEST]
    },
    values: Array.from(flatten(state))
  };
}

/** Derived tables are rebuilt from `layout`; the header's layout hash guarantees both sides rebuilt the same data (spec §4). */
export function loadSnapshot(layout: ShipLayout, snap: Snapshot): SimState {
  const h = snap.header;
  if (h.formatVersion !== SNAPSHOT_FORMAT) throw new Error(`snapshot format ${h.formatVersion} not supported (expected ${SNAPSHOT_FORMAT})`);
  if (h.simVersion !== SIM_VERSION) throw new Error(`snapshot sim version ${h.simVersion} does not match ${SIM_VERSION}`);
  const state = createSimState(layout, h.playerCount, 0);
  if (h.layoutId !== layout.id || h.layoutHash !== state.derived.layoutHash) throw new Error('snapshot layout does not match the loaded ship layout');
  unflatten(state, Float64Array.from(snap.values));
  return state;
}
