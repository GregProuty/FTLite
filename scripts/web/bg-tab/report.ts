// TEST ONLY (web build spec §3.5): the validity and pass rules of the background-tab measurement, exactly as the spec
// states them. Everything else the pages report is recorded as data.
import type { ControlMeasurement, PageMeasurement } from './protocol';

export const RULES = { minDurationMs: 600000, minControlPeriodMs: 900, minTicksPerWindow: 590, minWindows: 60,
  maxRelayP99GrowthMs: 20, maxLeaseGapMs: 8000, minLeaseCompletions: 100 } as const;
export interface BrowserRun { browser: 'chromium' | 'firefox'; headless: boolean; visible: PageMeasurement; hidden: PageMeasurement; control: ControlMeasurement }
export interface BrowserVerdict {
  browser: BrowserRun['browser']; valid: boolean; invalid: string[]; pass: boolean; failures: string[];
  figures: { minTicksPerWindow: number; windows: number; relayP99HiddenMs: number; relayP99VisibleMs: number; maxLeaseGapMs: number;
    leaseCompletions: number; controlTabPeriodMs: number; testPageControlPeriodMs: number; maxTickLatenessMs: number };
}
/** Nearest-rank percentile; Infinity for no samples (so an empty relay fails). */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1))]!;
}
const sawVisible = (m: { visibilitySamples: { visible: number }; visibilityEvents: string[] }) =>
  m.visibilitySamples.visible > 0 || m.visibilityEvents.some(event => event.endsWith(':visible'));
export function judge(run: BrowserRun): BrowserVerdict {
  const invalid: string[] = [], failures: string[] = [];
  if (run.headless) invalid.push('headless');
  if (run.hidden.durationMs < RULES.minDurationMs) invalid.push('too-short');
  if (sawVisible(run.hidden)) invalid.push('test-page-visible');
  if (sawVisible(run.control)) invalid.push('control-visible');
  if (!(run.control.periodMs >= RULES.minControlPeriodMs)) invalid.push('control-not-throttled');
  if (run.visible.visibilitySamples.hidden > 0) invalid.push('baseline-hidden');
  if (run.hidden.errors.length || run.visible.errors.length) invalid.push('page-errors');
  const windows = run.hidden.tickWindows, minTicks = windows.length ? Math.min(...windows) : 0;
  if (windows.length < RULES.minWindows) failures.push('tick-windows-missing');
  if (minTicks < RULES.minTicksPerWindow) failures.push('worker-ticks');
  const p99h = percentile(run.hidden.relayDelaysMs, 99), p99v = percentile(run.visible.relayDelaysMs, 99);
  if (!(p99h - p99v <= RULES.maxRelayP99GrowthMs)) failures.push('relay-delay');
  const maxGap = run.hidden.leaseGapsMs.length ? Math.max(...run.hidden.leaseGapsMs) : Infinity;
  if (!(maxGap <= RULES.maxLeaseGapMs)) failures.push('lease-gap');
  if (run.hidden.leaseRoundTripsMs.length < RULES.minLeaseCompletions) failures.push('lease-starved');
  return { browser: run.browser, valid: !invalid.length, invalid, pass: !invalid.length && !failures.length, failures,
    figures: { minTicksPerWindow: minTicks, windows: windows.length, relayP99HiddenMs: p99h, relayP99VisibleMs: p99v, maxLeaseGapMs: maxGap,
      leaseCompletions: run.hidden.leaseRoundTripsMs.length, controlTabPeriodMs: run.control.periodMs,
      testPageControlPeriodMs: run.hidden.controlPeriodMs, maxTickLatenessMs: run.hidden.maxTickLatenessMs } };
}
