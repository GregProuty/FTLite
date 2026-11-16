import type { Link, MonotonicClock, Scheduler, Unsubscribe } from '../../renderer/src/net/contracts';
import type { AdmissionPolicy } from '../../renderer/src/net/receivePolicy';
import type { StreamAttachmentOptions } from '../../shared/hostProcessProtocol';
import type { SessionWorkGate } from '../../shared/sessionLease';
import type { CaptureCause, ModeCheckpoint } from '../../shared/sessionCheckpoint';
export type { StreamAttachmentOptions } from '../../shared/hostProcessProtocol';
export type { AdmissionPolicy, Link, MonotonicClock, Scheduler, Unsubscribe };
export interface ModeHost {
  completeBootstrap(): void;
  start(initBytes: Uint8Array): void;
  attach(link: Link, players: readonly number[], policy: AdmissionPolicy, options?: StreamAttachmentOptions): Unsubscribe;
  checkpoint(): Uint8Array;
  captureCheckpoint(cause: CaptureCause): Promise<ModeCheckpoint>;
  restore(bytes: Uint8Array): void;
  pause(reason: string): void;
  dispose(): void;
}
export interface ModeHostDeps {
  onCheckpoint?(candidate: ModeCheckpoint): void;
  sessionGate?: SessionWorkGate;
  contentDigest: string; clock: MonotonicClock; scheduler: Scheduler;
  onCrash(record: { checkpoint: Uint8Array | null; diagnostic: unknown }): void;
}
export interface ModeDefinition {
  modeId: string; schemaVersion: number; simVersion: number;
  createHost(deps: ModeHostDeps): ModeHost;
  /** Opaque transport coalescing key, interpreted only by the mode. */
  latestStreamKey?(bytes: Uint8Array): string;
}
export interface ModeRegistry { get(modeId: string): ModeDefinition }
