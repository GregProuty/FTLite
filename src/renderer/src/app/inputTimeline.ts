import { NEUTRAL_FRAME, type InputFrame } from '../clientControl/inputFrame';

type Sample = { atMs: number; frames: readonly InputFrame[] | null };
/** Samples are copied at arrival; held state and one-shot edges become eligible at their real timestamp. */
export function createInputTimeline(players: number) {
  const samples: Sample[] = [];
  let lastSample = 0;
  const held = Array.from({ length: players }, () => ({ ...NEUTRAL_FRAME }));
  const edges = Array.from({ length: players }, () => ({ interactPresses: 0, confirmPresses: 0, cancelPresses: 0 }));
  function enqueue(atMs: number, frames: readonly InputFrame[] | null): void {
    if (!Number.isFinite(atMs) || atMs < lastSample) return;
    lastSample = atMs; samples.push({ atMs, frames });
  }
  return {
    sample(atMs: number, frames: readonly InputFrame[]): void { enqueue(atMs, Array.from({ length: players }, (_, p) => ({ ...(frames[p] ?? NEUTRAL_FRAME) }))); },
    neutralize(atMs: number): void { enqueue(atMs, null); },
    consume(tickTimeMs: number): readonly InputFrame[] {
      while (samples.length && samples[0]!.atMs <= tickTimeMs + 1e-7) {
        const sample = samples.shift()!;
        for (let p = 0; p < players; p++) {
          const frame = sample.frames?.[p] ?? NEUTRAL_FRAME;
          held[p] = { ...frame };
          for (const key of ['interactPresses', 'confirmPresses', 'cancelPresses'] as const) {
            edges[p]![key] = sample.frames ? edges[p]![key] + Math.max(0, frame[key]) : 0;
          }
        }
      }
      return held.map((frame, p) => {
        const out = { ...frame };
        for (const key of ['interactPresses', 'confirmPresses', 'cancelPresses'] as const) {
          out[key] = Number(edges[p]![key] > 0); edges[p]![key] -= out[key];
        }
        return out;
      });
    }
  };
}
