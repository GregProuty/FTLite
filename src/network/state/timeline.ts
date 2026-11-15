export interface PresentationPoint { id: string; x: number; y: number; heading?: number; generation: string }
export interface PresentationSample { tick: number; epoch: string; paused: boolean; points: readonly PresentationPoint[] }
export interface PresentationTimelineOptions { delayMs?: number; maxSamples?: number }
const MAX_POINTS = 1024, MAX_TEXT = 128, MAX_MAGNITUDE = 1e12, TICK_MS = 1000 / 60;
function validText(text: string): boolean { return typeof text === 'string' && text.length <= MAX_TEXT; }
function finite(value: number): boolean { return Number.isFinite(value) && Math.abs(value) <= MAX_MAGNITUDE; }
function check(value: unknown): asserts value { if (!value) throw new Error('presentation-invalid'); }
function clone(points: readonly PresentationPoint[]): PresentationPoint[] { return points.map(point => ({ ...point })); }
export function createPresentationTimeline({ delayMs = 100, maxSamples = 16 }: PresentationTimelineOptions = {}) {
  check(Number.isFinite(delayMs) && delayMs >= 0 && delayMs <= 1000 && Number.isInteger(maxSamples) && maxSamples >= 2 && maxSamples <= 64);
  const samples: PresentationSample[] = [];
  let disconnected = false, disposed = false, alignment = 0, lastReceived = -Infinity;
  return {
    push(sample: PresentationSample, receivedAtMs: number): void {
      if (disposed || disconnected) return;
      check(finite(receivedAtMs) && Number.isSafeInteger(sample.tick) && sample.tick >= 0 && sample.tick <= MAX_MAGNITUDE / TICK_MS && validText(sample.epoch) && typeof sample.paused === 'boolean');
      check(Array.isArray(sample.points) && sample.points.length <= MAX_POINTS);
      const ids = new Set<string>();
      for (const point of sample.points) {
        check(validText(point.id) && point.id.length > 0 && validText(point.generation) && finite(point.x) && finite(point.y) && (point.heading === undefined || finite(point.heading)) && !ids.has(point.id)); ids.add(point.id);
      }
      const previous = samples.at(-1);
      const previousGenerations = new Map(previous?.points.map(point => [point.id, point.generation]));
      const sameTickTransition = previous && sample.tick === previous.tick && (sample.paused !== previous.paused
        || sample.points.length !== previous.points.length || sample.points.some(point => previousGenerations.get(point.id) !== point.generation));
      if (previous && sample.epoch === previous.epoch && (sample.tick < previous.tick || sample.tick === previous.tick && !sameTickTransition)) return;
      if (receivedAtMs < lastReceived) return;
      const authorityTime = sample.tick * TICK_MS;
      const reset = !previous || sameTickTransition || sample.epoch !== previous.epoch || sample.paused !== previous.paused || sample.paused || sample.tick - previous.tick > 60 || receivedAtMs - lastReceived > 1000;
      if (reset) { samples.length = 0; alignment = receivedAtMs - authorityTime; }
      else {
        // Arrival jitter cannot move the authority clock more than 2ms per sample.
        const observed = receivedAtMs - authorityTime;
        alignment += Math.max(-2, Math.min(2, observed - alignment));
      }
      lastReceived = receivedAtMs; samples.push({ ...sample, points: clone(sample.points) });
      while (samples.length > maxSamples || samples.length > 1 && sample.tick - samples[0]!.tick > 60) samples.shift();
    },
    sample(nowMs: number): readonly PresentationPoint[] {
      check(finite(nowMs));
      const newest = samples.at(-1); if (disposed || !newest) return [];
      if (disconnected || newest.paused) return clone(newest.points);
      const target = (nowMs - alignment - delayMs) / TICK_MS;
      const oldest = samples[0]!;
      if (target <= oldest.tick) return clone(oldest.points);
      if (target >= newest.tick) return clone(newest.points);
      for (let i = 1; i < samples.length; i++) {
        const right = samples[i]!, left = samples[i - 1]!;
        if (target > right.tick) continue;
        const fraction = (target - left.tick) / (right.tick - left.tick), before = new Map(left.points.map(point => [point.id, point]));
        return right.points.map(point => {
          const from = before.get(point.id);
          if (!from || from.generation !== point.generation) return { ...point };
          const result = { ...point, x: from.x + (point.x - from.x) * fraction, y: from.y + (point.y - from.y) * fraction };
          if (from.heading !== undefined && point.heading !== undefined) {
            const tau = Math.PI * 2, difference = ((point.heading % tau - from.heading % tau + Math.PI) % tau + tau) % tau - Math.PI;
            result.heading = from.heading % tau + difference * fraction;
          }
          return result;
        });
      }
      return clone(newest.points);
    },
    disconnect(): void { disconnected = true; if (samples.length > 1) samples.splice(0, samples.length - 1); },
    dispose(): void { disposed = true; disconnected = true; samples.length = 0; },
  };
}
