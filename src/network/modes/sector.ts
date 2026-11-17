// The sector mode (engine refactor spec §6): one defineEncounterMode call over the sector rules, with today's JSON
// byte codecs, card-bot producers and sector stream adapter.
import { sectorRules } from '../../renderer/src/authority/sectorRules';
import { decodeMessage } from '../../renderer/src/net/codec';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import starter from '../../renderer/src/sim/ship/starter.json';
import skiff from '../../renderer/src/sim/ship/skiff.json';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import hound from '../../renderer/src/sim/ship/hound.json';
import { createSectorStreamBinding } from './sectorStream';
import { createSectorProducers } from './sectorProducers';
import { defineEncounterMode, jsonModeCodecs } from './encounterMode';
import type { ModeDefinition } from './contracts';

const layouts = new Map([starter, skiff, cutter, hound].map(json => { const layout = parseShip(json); return [layout.id, layout]; }));
function resolveLayout(id: string) { const layout = layouts.get(id); if (!layout) throw Error('unknown sector layout'); return layout; }

export const sectorMode: ModeDefinition = defineEncounterMode({
  modeId: 'sector', schemaVersion: 1, simVersion: SIM_VERSION, rules: sectorRules, resolveLayout,
  codecs: jsonModeCodecs(sectorRules, resolveLayout, 'sector'),
  producers: ({ authority, init, contentDigest, restoredControllers }) => createSectorProducers({ authority, runId: init.runId, playerCount: init.playerCount,
    contentDigest, resolveLayout, restoredControllers }),
  publication: (link, options) => createSectorStreamBinding(link, options),
  latestStreamKey(bytes) { const message = decodeMessage(bytes); return message.kind === 'held' ? `held:${message.frame.player}` : 'state'; }
});
