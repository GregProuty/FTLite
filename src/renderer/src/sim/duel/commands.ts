// The duel's commands (Helm demo spec §13), now members of the one command union and result type in net/contracts.ts
// (engine refactor spec §6): DuelCommand is the duel's slice of Command, a duel envelope is a CommandEnvelope that
// carries a runId like every other, and the duel's reasons are members of COMMAND_REASONS.
import type { CommandEnvelope, CommandReason, CommandResult, DuelCommand } from '../../net/contracts';
export type { DuelCommand } from '../../net/contracts';

/** The run id a local (offline) duel stamps on its envelopes; an authority duel uses its init's runId. */
export const LOCAL_DUEL_RUN = 'duel';

export type DuelEnvelope = CommandEnvelope<DuelCommand>;
export type DuelReason = CommandReason;
export type DuelResult = CommandResult;
