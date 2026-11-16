import { describe, expect, it } from 'vitest';
import { createPresentationTimeline } from '../src/network/state/timeline';
const sample = (tick: number, x: number, generation = 'a', epoch = 'room', paused = false, heading = 0) => ({ tick, epoch, paused, points: [{ id: 'crew', x, y: x * 2, generation, heading }] });
describe('generic presentation timeline', () => {
  it('interpolates 100ms behind authority at 60Hz without mutating samples', () => {
    const timeline = createPresentationTimeline(), first = sample(0, 0), next = sample(12, 12);
    timeline.push(first, 1000); timeline.push(next, 1200);
    expect(timeline.sample(1200)[0]).toMatchObject({ x: 6, y: 12 }); expect(next.points[0]!.x).toBe(12);
    expect(timeline.sample(9999)[0]!.x).toBe(12);
  });
  it('takes the shortest heading arc and snaps point generations', () => {
    const timeline = createPresentationTimeline(); timeline.push(sample(0, 0, 'a', 'room', false, Math.PI * 1.9), 0); timeline.push(sample(12, 12, 'a', 'room', false, Math.PI * 0.1), 200);
    expect(Math.sin(timeline.sample(200)[0]!.heading!)).toBeCloseTo(0);
    timeline.push(sample(24, 1000, 'teleport'), 400); expect(timeline.sample(400)[0]!.x).toBe(1000);
  });
  it('immediately discards dense history when an advancing tick changes generation', () => {
    const timeline = createPresentationTimeline();
    for (const tick of [0, 3, 6, 9]) timeline.push(sample(tick, tick, 'before'), tick * 1000 / 60);
    expect(timeline.sample(150)[0]).toMatchObject({ x: 3, generation: 'before' });
    timeline.push(sample(12, 1000, 'after-teleport'), 200);
    for (const now of [200, 225, 250, 251, 300]) expect(timeline.sample(now)[0]).toMatchObject({ x: 1000, generation: 'after-teleport' });
    timeline.push(sample(15, 1003, 'after-teleport'), 250);
    for (const now of [250, 275, 300, 325, 350]) {
      expect(timeline.sample(now)[0]!.generation).toBe('after-teleport');
      expect(timeline.sample(now)[0]!.x).toBeGreaterThanOrEqual(1000);
    }
  });
  it.each(['replace', 'add', 'remove'])('snaps advancing-tick identity changes: %s', change => {
    const timeline = createPresentationTimeline();
    for (const tick of [0, 3, 6, 9]) timeline.push(sample(tick, tick), tick * 1000 / 60);
    const next = sample(12, 12), extra = { id: 'new', generation: 'a', x: 1000, y: 2000 };
    next.points = change === 'replace' ? [{ ...extra, heading: 0 }] : change === 'add' ? [...next.points, { ...extra, heading: 0 }] : [];
    timeline.push(next, 200);
    expect(timeline.sample(200)).toEqual(next.points);
    expect(timeline.sample(250)).toEqual(next.points);
    timeline.push(sample(6, 999, 'stale-generation'), 251);
    expect(timeline.sample(251)).toEqual(next.points);
  });
  it('ignores duplicates/out-of-order and snaps on epoch, pause and long stalls', () => {
    const timeline = createPresentationTimeline(); timeline.push(sample(0, 0), 0); timeline.push(sample(12, 12), 200);
    timeline.push(sample(12, 999), 201); timeline.push(sample(6, 999), 202); expect(timeline.sample(200)[0]!.x).toBe(6);
    timeline.push(sample(13, 50, 'a', 'new'), 220); expect(timeline.sample(220)[0]!.x).toBe(50);
    timeline.push(sample(14, 60, 'a', 'new', true), 230); expect(timeline.sample(230)[0]!.x).toBe(60);
    timeline.push(sample(1000, 70, 'a', 'new'), 20000); expect(timeline.sample(20000)[0]!.x).toBe(70);
  });
  it('freezes at newest on disconnect, rejects future mutation and releases on dispose', () => {
    const timeline = createPresentationTimeline(); timeline.push(sample(0, 0), 0); timeline.push(sample(12, 12), 200); timeline.disconnect();
    expect(timeline.sample(200)[0]!.x).toBe(12); timeline.push(sample(24, 24), 400); expect(timeline.sample(9999)[0]!.x).toBe(12);
    timeline.dispose(); expect(timeline.sample(9999)).toEqual([]);
  });
  it('snaps pause and generation changes that occur without advancing authority tick', () => {
    const timeline = createPresentationTimeline(); timeline.push(sample(0, 0), 0); timeline.push(sample(12, 12), 200);
    timeline.push(sample(12, 12, 'a', 'room', true), 201); expect(timeline.sample(201)[0]!.x).toBe(12);
    timeline.push(sample(12, 100, 'teleported', 'room', false), 202); expect(timeline.sample(202)[0]!.x).toBe(100);
    timeline.push(sample(12, 200, 'teleported-again', 'room', false), 203); expect(timeline.sample(203)[0]!.x).toBe(200);
  });
  it('handles missing identities and finite extreme headings without nonfinite interpolation', () => {
    const timeline = createPresentationTimeline();
    timeline.push({ ...sample(0, -1e12, 'a', 'room', false, -1e12), points: [{ id: 'old', generation: 'a', x: -1e12, y: 0, heading: -1e12 }] }, 0);
    timeline.push({ ...sample(12, 0), points: [{ id: 'new', generation: 'b', x: 1e12, y: 0 }, { id: 'old', generation: 'a', x: 1e12, y: 0, heading: 1e12 }] }, 200);
    expect(timeline.sample(200).map(p => p.id)).toEqual(['new', 'old']);
    expect(timeline.sample(200)[1]!.x).toBe(1e12); expect(Number.isFinite(timeline.sample(200)[1]!.heading)).toBe(true);
    const continuous = createPresentationTimeline();
    continuous.push({ ...sample(0, 0), points: [{ id: 'crew', generation: 'a', x: -1e12, y: 0, heading: -1e12 }] }, 0);
    continuous.push({ ...sample(12, 0), points: [{ id: 'crew', generation: 'a', x: 1e12, y: 0, heading: 1e12 }] }, 200);
    expect(continuous.sample(200)[0]!.x).toBe(0); expect(Number.isFinite(continuous.sample(200)[0]!.heading)).toBe(true);
    expect(() => timeline.push({ ...sample(18, 0), points: [sample(18, 0).points[0]!, sample(18, 0).points[0]!] }, 300)).toThrow();
    expect(() => timeline.push({ ...sample(18, 0), epoch: 'x'.repeat(129) }, 300)).toThrow();
  });
  it('bounds input and options, refuses nonfinite timing/coordinates and copies returned points', () => {
    expect(() => createPresentationTimeline({ maxSamples: 65 })).toThrow(); expect(() => createPresentationTimeline({ delayMs: Infinity })).toThrow();
    const timeline = createPresentationTimeline({ maxSamples: 2 });
    for (const bad of [sample(0, Infinity), sample(0, NaN)]) expect(() => timeline.push(bad, 0)).toThrow();
    expect(() => timeline.push(sample(0, 0), Infinity)).toThrow(); expect(() => timeline.sample(NaN)).toThrow();
    expect(() => timeline.push({ ...sample(0, 0), points: Array.from({ length: 1025 }, (_, i) => ({ id: String(i), x: 0, y: 0, generation: 'a' })) }, 0)).toThrow();
    timeline.push(sample(0, 0), 0); timeline.push(sample(6, 6), 100); timeline.push(sample(12, 12), 200);
    const points = timeline.sample(0); expect(points[0]!.x).toBe(6); (points[0] as { x: number }).x = 100; expect(timeline.sample(0)[0]!.x).toBe(6);
  });
});
