import type { RtcAttemptOptions, RtcSignal } from '../../shared/rtcSession';

type Unsubscribe = () => void;
export type { RtcAttemptOptions } from '../../shared/rtcSession';
export interface RtcLinkStats { rttMs: number; route: 'lan' | 'internet' }
/** The session's view of one page transport (web build spec §3): attempt lifetime, signals and link figures. */
export interface TransportController {
  startAttempt(options: RtcAttemptOptions, port: MessagePort): Promise<{ latestPayloadLimit: number }>;
  receiveSignal(signal: RtcSignal): Promise<void>;
  onSignal(callback: (signal: RtcSignal) => void): Unsubscribe;
  onAttemptClosed(callback: (attemptId: string) => void): Unsubscribe;
  /** A ready attempt's link figures (H-2 spec §8), about once a second: its RTT and route label. */
  onStats?(callback: (attemptId: string, stats: RtcLinkStats) => void): Unsubscribe;
  closeAttempt(attemptId: string): Promise<void>;
  dispose(): Promise<void>;
}
