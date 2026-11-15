import type { Link, MonotonicClock, Scheduler, Unsubscribe } from '../../renderer/src/net/contracts';
import type { AdmissionPolicy } from '../../renderer/src/net/receivePolicy';
export type { AdmissionPolicy, Link, MonotonicClock, Scheduler, Unsubscribe };
export interface ModeHost {
  start(initBytes: Uint8Array): void;
  attach(link: Link, players: readonly number[], policy: AdmissionPolicy): Unsubscribe;
  checkpoint(): Uint8Array;
  restore(bytes: Uint8Array): void;
  pause(reason: string): void;
  dispose(): void;
}
export interface ModeHostDeps {
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
