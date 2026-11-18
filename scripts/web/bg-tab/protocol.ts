// TEST ONLY (web build spec §3.5): what the background-tab measurement pages report to their driver.
export interface PageMeasurement {
  mode: 'visible' | 'hidden';
  durationMs: number;
  /** Samples of document.visibilityState taken by the page's 100 ms control interval while measuring. */
  visibilitySamples: { hidden: number; visible: number };
  /** `<ms since start>:<state>` for every visibilitychange while measuring. */
  visibilityEvents: string[];
  /** On-time ticks (run within 2 tick periods of their own deadline) of the Worker's production tick driver in each complete 10 s window.
   *  A throttled Worker that catches up in bursts runs late ticks, which do not count. */
  tickWindows: number[];
  /** The latest a tick ran after its own deadline (data, not a pass rule). */
  maxTickLatenessMs: number;
  /** From each tick's deadline (performance.timeOrigin + its tick deadline) to receipt at the far end of the RTCDataChannel pair.
   *  Measured from the deadline, not the send, so a burst of caught-up ticks shows its full lateness. */
  relayDelaysMs: number[];
  /** Gaps between consecutive lease round-trip completions as the Worker sees them, plus the tail gap at stop. */
  leaseGapsMs: number[];
  leaseRoundTripsMs: number[];
  /** Mean period of the page's own 100 ms setInterval (data, not a validity condition). */
  controlPeriodMs: number;
  errors: string[];
}
export interface ControlMeasurement {
  durationMs: number;
  visibilitySamples: { hidden: number; visible: number };
  visibilityEvents: string[];
  periodMs: number;
  intervals: number;
}
export type WorkerIn = { kind: 'start' } | { kind: 'lease-reply'; id: number } | { kind: 'stop' };
export type WorkerOut =
  | { kind: 'tick'; tick: number; dueAt: number }
  | { kind: 'lease'; id: number }
  | { kind: 'result'; tickWindows: number[]; maxTickLatenessMs: number; leaseGapsMs: number[]; leaseRoundTripsMs: number[] };
