// The duel's commands (spec §13). H-0c-ii moves these into the shared command union in net/contracts.ts as an explicit
// Net-1 amendment; until then the duel step takes them in this local envelope, so nothing here touches the authority.
import type { CommandReason } from '../../net/contracts';

export type DuelCommand =
  | { kind: 'sit'; station: number }
  | { kind: 'stand' }
  | { kind: 'presence'; present: boolean }
  | { kind: 'laserLock'; room: number }
  | { kind: 'laserCharge'; held: boolean }
  | { kind: 'missileLaunch' };

export interface DuelEnvelope { id: { player: number; sequence: number }; requestedTick: number; command: DuelCommand }

/** Today's reasons plus the duel's own (spec §7 table, §13). */
export type DuelReason = CommandReason | 'not-in-duel' | 'not-at-weapons' | 'missile-in-flight';

export interface DuelResult { id: { player: number; sequence: number }; tick: number; status: 'applied' | 'noop' | 'rejected'; reason?: DuelReason }
