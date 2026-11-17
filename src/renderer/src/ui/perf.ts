// The dev-only UI budget counter (React UI spec §2): with ?uiperf=1 each sink write runs inside flushSync, so one sample
// is the sharing pass plus React's render, commit and layout effects (PixelText's canvas draws) for that frame.
import { flushSync } from 'react-dom';

/** The median and 95th percentile of a window of samples (nearest-rank). */
export function windowStats(samples: readonly number[]): { median: number; p95: number } {
  if (samples.length === 0) return { median: 0, p95: 0 };
  const s = [...samples].sort((a, b) => a - b), at = (q: number): number => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
  return { median: at(0.5), p95: at(0.95) };
}
export interface UiPerf { run(write: () => void): void }
export function createUiPerf(enabled: boolean, deps: { now?: () => number; log?: (line: string) => void; every?: (cb: () => void, ms: number) => unknown } = {}): UiPerf {
  if (!enabled) return { run: (write) => write() };
  const now = deps.now ?? (() => performance.now()), log = deps.log ?? ((line) => console.info(line)), samples: number[] = [];
  (deps.every ?? ((cb, ms) => setInterval(cb, ms)))(() => { const { median, p95 } = windowStats(samples); log(`[uiperf] median ${median.toFixed(2)} ms p95 ${p95.toFixed(2)} ms`); }, 1000);
  return { run(write) { const t0 = now(); flushSync(write); samples.push(now() - t0); if (samples.length > 60) samples.shift(); } };
}
