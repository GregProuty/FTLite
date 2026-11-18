// The duel mode (engine refactor spec §6): the second registered mode, one defineEncounterMode call over the duel
// rules. Its producers are the humans and, for a seat with nobody attached, the away steward (duelProducers.ts, H-2
// spec §6), and its stream adapter is duelStream. Schema version 2 (H-2 spec §7): the init's helmPlayer, the round module and its checkpoint
// rules, the round event and its two reasons, and the widened end record.
import { duelRules, type DuelTypes } from '../../renderer/src/authority/duelRules';
import { duelCodec } from '../../renderer/src/net/codec';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { DUEL_LAYOUT } from '../../renderer/src/sim/duel/layout';
import { DUEL_CREW_MAX } from '../../renderer/src/sim/duel/state';
import { createDuelStreamBinding } from './duelStream';
import { createDuelProducers } from './duelProducers';
import { defineEncounterMode, jsonModeCodecs } from './encounterMode';
import type { ModeDefinition } from './contracts';

function resolveLayout(id: string) { if (id !== DUEL_LAYOUT.id) throw Error('unknown duel layout'); return DUEL_LAYOUT; }
const decode = duelCodec(DUEL_CREW_MAX);

export const duelMode: ModeDefinition = defineEncounterMode<DuelTypes>({
  modeId: 'duel', schemaVersion: 2, simVersion: SIM_VERSION, rules: duelRules, resolveLayout,
  codecs: jsonModeCodecs(duelRules, resolveLayout, 'duel'),
  producers: ({ authority, init, contentDigest, pause }) => createDuelProducers({ authority, runId: init.runId, contentDigest, playerCount: init.playerCount, pause }),
  publication: (link, options) => createDuelStreamBinding(link, options),
  latestStreamKey(bytes) { const message = decode.decodeMessage(bytes); return message.kind === 'held' ? `held:${message.frame.player}` : 'state'; }
});
