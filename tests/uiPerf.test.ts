import { expect, it, vi } from 'vitest';
import { createUiPerf, windowStats } from '../src/renderer/src/ui/perf';
it('windowStats is nearest-rank over the window', () => {
  expect(windowStats([])).toEqual({ median: 0, p95: 0 });
  expect(windowStats(Array.from({ length: 60 }, (_, i) => i + 1))).toEqual({ median: 30, p95: 57 });
});
it('a disabled counter runs the write and never schedules; an enabled one times it and logs once a second', () => {
  const every = vi.fn(), write = vi.fn(); createUiPerf(false, { every }).run(write); expect(write).toHaveBeenCalledOnce(); expect(every).not.toHaveBeenCalled();
  let t = 0, tick = (): void => {}; const log = vi.fn();
  const perf = createUiPerf(true, { now: () => t, log, every: (cb) => { tick = cb; } });
  perf.run(() => { t += 2; }); perf.run(() => { t += 4; }); tick();
  expect(log).toHaveBeenCalledWith('[uiperf] median 2.00 ms p95 4.00 ms');
});
