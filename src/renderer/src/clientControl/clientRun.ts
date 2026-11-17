// The sector client (H-2 spec §4): the generic stream client (streamClient.ts) over a sector SimState replica, with the
// sector codec and publication validation, plus the card hooks: the card UI reconciled on every publication and result,
// the vote executions, and the held sequence kept on the card UI where translateTick advances it. Its signature and
// behaviour are unchanged; every caller compiles as before.
import type { CommandResult, Link, PlayerId, PublishedState } from '../net/contracts';
import { decodeMessage, encodeMessage, validatePublication } from '../net/codec';
import type { ShipLayout } from '../sim/ship/schema';
import { disposeSimState, type SimState } from '../sim/state';
import { loadSnapshot, restoreSnapshot, SNAPSHOT_FORMAT, type Snapshot } from '../sim/snapshot';
import { SIM_VERSION } from '../sim/tuning';
import { createCardUi, reconcileUi, reconcileCommandResult, type CommandBudget } from './cardController';
import { createStreamClient } from './streamClient';
import type { AdmissionPolicy } from '../net/receivePolicy';
export type { CommandProducerStatus } from './streamClient';

export type ClientRun = ReturnType<typeof createClientRun>;
const sectorCodec = { encodeMessage, decodeMessage };

export function createClientRun(link: Link, owned: readonly PlayerId[], options: { runId: string; contentDigest?: string; resolveLayout(id: string): ShipLayout; admissionPolicy?: AdmissionPolicy; remoteStreaming?: boolean }) {
  const ui = createCardUi(options.runId), receiveTime = options.admissionPolicy === 'receive-time';
  const voteExecutions = new Map<PlayerId, { sequence: number; tick: number }>();
  let publication: PublishedState | null = null;
  function reconcileVoteExecutions(): void {
    if (!publication) return;
    for (const [player, executed] of voteExecutions) {
      const producer = ui.players[player];
      if (!producer?.pendingVote || producer.pendingVoteSequence !== executed.sequence) voteExecutions.delete(player);
      else if (publication.tick > executed.tick && publication.commandHighWater[player]! >= executed.sequence) {
        producer.pendingVote = null; voteExecutions.delete(player);
      }
    }
  }
  const core = createStreamClient<Snapshot, SimState>(link, owned, {
    runId: options.runId, admissionPolicy: options.admissionPolicy, remoteStreaming: options.remoteStreaming,
    codec: sectorCodec, validatePublication,
    supported: (next) => next.snapshot.header.formatVersion === SNAPSHOT_FORMAT && next.snapshot.header.simVersion === SIM_VERSION,
    replica: {
      matches: (replica, header) => header.layoutId === replica.layout.id && header.layoutHash === replica.derived.layoutHash && header.playerCount === replica.playerCount,
      load: (snapshot) => loadSnapshot(JSON.parse(JSON.stringify(options.resolveLayout(snapshot.header.layoutId))) as ShipLayout, snapshot, options.contentDigest),
      restore: (replica, snapshot) => restoreSnapshot(replica, snapshot, options.contentDigest),
      dispose: disposeSimState,
      playerCount: (replica) => replica.playerCount
    },
    heldSequences: { has: (player) => !!ui.players[player], get: (player) => ui.players[player]!.heldSequence, set: (player, value) => { ui.players[player]!.heldSequence = value; } },
    onAccepted(replica, next) {
      publication = next; reconcileUi(replica, ui, next.runId, next.commandHighWater, options.admissionPolicy);
      if (receiveTime) reconcileVoteExecutions();
    },
    onResult(result: CommandResult) {
      reconcileCommandResult(ui, result);
      if (receiveTime) {
        const producer = ui.players[result.id.player];
        if ((result.status === 'applied' || result.status === 'noop') && producer?.pendingVote && producer.pendingVoteSequence === result.id.sequence)
          voteExecutions.set(result.id.player, { sequence: result.id.sequence, tick: result.tick });
        reconcileVoteExecutions();
      }
    }
  });
  const commandBudget: CommandBudget | undefined = core.commandBudget;
  return { ...core, ui, commandBudget,
    dispose(): void { core.dispose(); publication = null; voteExecutions.clear(); } };
}
