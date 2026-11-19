import type { HostCommandInput, HostResponse } from '../../shared/netSession';
import type { HostIdentity, StreamAttachmentOptions } from '../../shared/hostProcessProtocol';
import type { CaptureCause, CheckpointCandidate } from '../../shared/sessionCheckpoint';
import type { LeaseFenceReason, LeaseRenewalRequest, SessionLeaseIdentity } from '../../shared/sessionLease';
import type { LeaseGrant } from '../../shared/roomSession';
import type { TransportController } from '../transport/contracts';

type Unsubscribe = () => void;
export interface HostProcessOptions extends HostIdentity {
  sessionLease?: SessionLeaseIdentity;
  signal?: AbortSignal;
  onCrash?(record: { checkpoint: Uint8Array | null; diagnostic: unknown }): void;
}
/** The host simulation's owner (web build spec §3.2), unchanged from the Electron utility owner. */
export interface HostProcessHandle {
  onCheckpoint(callback: (candidate: CheckpointCandidate) => void): Unsubscribe;
  ackCheckpoint(captureId: number): Promise<void>;
  captureCheckpoint(cause: CaptureCause): Promise<CheckpointCandidate>;
  onLeaseRequest(callback: (request: LeaseRenewalRequest) => void): Unsubscribe;
  applyLease(request: LeaseRenewalRequest, grant: LeaseGrant): Promise<void>;
  invalidateLease(reason: LeaseFenceReason): Promise<void>;
  completeBootstrap(): Promise<void>;
  readonly transport: TransportController;
  request(command: HostCommandInput): Promise<HostResponse>;
  attachPeer(peer: string, players: readonly number[], port: MessagePort, options?: StreamAttachmentOptions): Promise<void>;
  onExit(callback: (reason: string) => void): Unsubscribe;
  dispose(): Promise<void>;
}
