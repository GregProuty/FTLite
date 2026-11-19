import { describe, expect, it } from 'vitest';
import { judge, percentile, RULES, type BrowserRun } from '../scripts/web/bg-tab/report';
import type { ControlMeasurement, PageMeasurement } from '../scripts/web/bg-tab/protocol';

function page(mode: 'visible' | 'hidden', overrides: Partial<PageMeasurement> = {}): PageMeasurement {
  return { mode, durationMs: mode === 'hidden' ? 600500 : 60000, visibilitySamples: mode === 'hidden' ? { hidden: 600, visible: 0 } : { hidden: 0, visible: 600 },
    visibilityEvents: [], tickWindows: Array(mode === 'hidden' ? 60 : 6).fill(600), maxTickLatenessMs: 9, relayDelaysMs: Array(1000).fill(2),
    leaseGapsMs: Array(120).fill(5000), leaseRoundTripsMs: Array(120).fill(3), controlPeriodMs: 100, errors: [], ...overrides };
}
const control = (overrides: Partial<ControlMeasurement> = {}): ControlMeasurement =>
  ({ durationMs: 600500, visibilitySamples: { hidden: 600, visible: 0 }, visibilityEvents: [], periodMs: 1000, intervals: 600, ...overrides });
const run = (overrides: Partial<BrowserRun> = {}): BrowserRun =>
  ({ browser: 'chromium', headless: false, visible: page('visible'), hidden: page('hidden'), control: control(), ...overrides });

describe('background-tab verdict (web build spec §3.5)', () => {
  it('passes a valid run that holds 59 ticks a second, the relay and the lease', () => {
    const verdict = judge(run());
    expect(verdict).toMatchObject({ valid: true, pass: true, invalid: [], failures: [] });
    expect(verdict.figures.minTicksPerWindow).toBe(600);
  });
  it.each([
    ['headless', { headless: true }],
    ['too-short', { hidden: page('hidden', { durationMs: 599999 }) }],
    ['test-page-visible', { hidden: page('hidden', { visibilitySamples: { hidden: 599, visible: 1 } }) }],
    ['test-page-visible', { hidden: page('hidden', { visibilityEvents: ['3000:visible'] }) }],
    ['control-visible', { control: control({ visibilitySamples: { hidden: 599, visible: 1 } }) }],
    ['control-not-throttled', { control: control({ periodMs: 899 }) }],
    ['baseline-hidden', { visible: page('visible', { visibilitySamples: { hidden: 1, visible: 599 } }) }],
    ['page-errors', { hidden: page('hidden', { errors: ['boom'] }) }]
  ] as const)('marks the run invalid: %s', (reason, overrides) => {
    const verdict = judge(run(overrides as Partial<BrowserRun>));
    expect(verdict.valid).toBe(false); expect(verdict.pass).toBe(false); expect(verdict.invalid).toContain(reason);
  });
  it('records the test page control period as data, never as a validity condition', () => {
    const verdict = judge(run({ hidden: page('hidden', { controlPeriodMs: 100 }) }));
    expect(verdict.valid).toBe(true); expect(verdict.figures.testPageControlPeriodMs).toBe(100);
  });
  it.each([
    ['worker-ticks', { hidden: page('hidden', { tickWindows: [...Array(59).fill(600), RULES.minTicksPerWindow - 1] }) }],
    ['tick-windows-missing', { hidden: page('hidden', { tickWindows: Array(59).fill(600) }) }],
    ['relay-delay', { hidden: page('hidden', { relayDelaysMs: Array(1000).fill(23) }) }],
    ['lease-gap', { hidden: page('hidden', { leaseGapsMs: [...Array(119).fill(5000), 8001] }) }],
    ['lease-starved', { hidden: page('hidden', { leaseRoundTripsMs: Array(99).fill(3) }) }]
  ] as const)('fails a valid run: %s', (reason, overrides) => {
    const verdict = judge(run(overrides as Partial<BrowserRun>));
    expect(verdict.valid).toBe(true); expect(verdict.pass).toBe(false); expect(verdict.failures).toContain(reason);
  });
  it('fails a Worker throttled to 1 Hz that catches up in bursts, even with full windows', () => {
    // 60 catch-up ticks a second, each up to 1 s late: deadline-stamped relay delays expose it.
    const late = Array.from({ length: 6000 }, (_, i) => (i % 60) * 1000 / 60);
    const verdict = judge(run({ hidden: page('hidden', { tickWindows: Array(60).fill(600), relayDelaysMs: late, maxTickLatenessMs: 1000 }) }));
    expect(verdict.valid).toBe(true); expect(verdict.pass).toBe(false); expect(verdict.failures).toContain('relay-delay');
  });
  it('allows exactly 20 ms of p99 growth and an 8 s gap', () => {
    expect(judge(run({ hidden: page('hidden', { relayDelaysMs: Array(1000).fill(22), leaseGapsMs: [8000] }) })).pass).toBe(true);
  });
  it('takes the nearest-rank percentile', () => {
    expect(percentile([5, 1, 4, 2, 3], 99)).toBe(5); expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 99)).toBe(99);
    expect(percentile([], 99)).toBe(Infinity);
  });
});
