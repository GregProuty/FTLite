// The sector's EncounterRules (engine refactor spec §6): today's step, snapshot, hash, cues, callouts, safe points and
// end record, behind the generic authority's hooks. Every hook calls exactly what core.ts called before R-1, so the
// sector goldens, replays and determinism fixture stay byte-identical.
import type { RunInit } from '../net/contracts';
import { sectorCodec } from '../net/codec';
import type { CardUiState } from '../clientControl/cardController';
import { audioCues, cueCounters, type CueCounters } from '../events/audioCues';
import { calloutFor } from '../events/callout';
import { visitRef } from '../sim/commands';
import { Life, LifeState } from '../sim/components';
import { hashState } from '../sim/hash';
import { deriveLayout } from '../sim/ship/derived';
import { loadSnapshot, saveSnapshot, type Snapshot } from '../sim/snapshot';
import { assertSimStateLive, createSimState, disposeSimState, type SimState } from '../sim/state';
import { stepCommands } from '../sim/step';
import { telemetryRecord } from '../sim/telemetry';
import { SIM_VERSION } from '../sim/tuning';
import { validateCheckpoint, validateRunInit } from './checkpoint';
import type { EncounterRules } from './rules';

export interface SectorTypes { state: SimState; init: RunInit; controllers: CardUiState[]; snapshot: Snapshot; cueBaseline: CueCounters }

export const sectorRules: EncounterRules<SectorTypes> = {
  modeId: 'sector',
  validateInit(value, contentDigest, resolveLayout) {
    const layout = resolveLayout((value as RunInit).layoutId);
    const init = validateRunInit(layout, value, contentDigest);
    if (init.simVersion !== SIM_VERSION || init.contentDigest !== contentDigest || init.layoutHash !== deriveLayout(layout).layoutHash || layout.id !== init.layoutId) throw new Error('incompatible run');
    return init;
  },
  create(init, resolveLayout) {
    return createSimState(resolveLayout(init.layoutId), init.playerCount, init.seed, init.characters, { unlocked: init.unlocked, quirk: init.quirk });
  },
  dispose: disposeSimState,
  assertLive: assertSimStateLive,
  playerCount: (state) => state.playerCount,
  tick: (state) => state.tick,
  step: stepCommands,
  terminal: (state, init) => state.ended ? { ended: true, endRecord: { mode: 'sector', record: telemetryRecord(state, init.seed) } } : { ended: false, endRecord: null },
  safePointKey: (state) => JSON.stringify(visitRef(state)),
  callouts(state, player) {
    if (Life.state[state.crew[player]!] === LifeState.Dead) return null;
    const context = calloutFor(state, player);
    return { text: context.text, station: context.flash };
  },
  cueBaseline: cueCounters,
  cues: (prev, state) => audioCues(prev, cueCounters(state)),
  snapshot: saveSnapshot,
  // The snapshot has already been validated against the authority's digest, so its own header digest is that digest.
  restore: (snapshot, resolveLayout) => loadSnapshot(resolveLayout(snapshot.header.layoutId), snapshot, snapshot.header.contentDigest),
  hash: hashState,
  validateCheckpoint: (value, contentDigest, resolveLayout) => validateCheckpoint(resolveLayout((value as { init?: { layoutId?: string } } | null)?.init?.layoutId as string), value, contentDigest),
  commandCodec: sectorCodec,
  initialControllers: () => []
};
