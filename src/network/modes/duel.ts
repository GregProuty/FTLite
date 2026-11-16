// The duel mode (engine refactor spec §6): the second registered mode, one defineEncounterMode call over the duel
// rules. Its producers are the humans alone (the duel has no bots in R-1; a vacant player simply sends nothing), and its
// stream adapter is duelStream. The online duel UI and the main/renderer wiring are H-2.
import { duelRules, type DuelTypes } from '../../renderer/src/authority/duelRules';
import { duelCodec } from '../../renderer/src/net/codec';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import { createDuelStreamBinding } from './duelStream';
import { defineEncounterMode, jsonModeCodecs, type EncounterProducers } from './encounterMode';
import type { ModeDefinition, Unsubscribe } from './contracts';

const CUTTER = parseShip(cutter);
function resolveLayout(id: string) { if (id !== CUTTER.id) throw Error('unknown duel layout'); return CUTTER; }
const decode = duelCodec(2);

export const duelMode: ModeDefinition = defineEncounterMode<DuelTypes>({
  modeId: 'duel', schemaVersion: 1, simVersion: SIM_VERSION, rules: duelRules, resolveLayout,
  codecs: jsonModeCodecs(duelRules, resolveLayout, 'duel'),
  producers({ authority }): EncounterProducers<DuelTypes> {
    const humans = new Set<Unsubscribe>();
    return {
      controllers: () => [], beforeControls() {}, beforeTick() {},
      attachHuman(link, players, options) {
        const off = authority.attach(link, players, options); humans.add(off);
        return () => { if (humans.delete(off)) off(); };
      },
      dispose() { for (const off of [...humans]) { humans.delete(off); off(); } }
    };
  },
  publication: (link, options) => createDuelStreamBinding(link, options),
  latestStreamKey(bytes) { const message = decode.decodeMessage(bytes); return message.kind === 'held' ? `held:${message.frame.player}` : 'state'; }
});
