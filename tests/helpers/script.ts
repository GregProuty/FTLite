import type { Replay, CompactIntent } from '../../src/renderer/src/sim/replay';

/** Deterministic exercise pattern: each player walks a square and holds Interact every other 5 s window. */
export function scriptedReplay(seed: number, playerCount: number, ticks: number): Replay {
  const intents: CompactIntent[][] = [];
  for (let t = 0; t < ticks; t++) {
    const row: CompactIntent[] = [];
    for (let p = 0; p < playerCount; p++) {
      const phase = Math.floor((t + p * 45) / 90) % 4;
      const dir: [number, number] = phase === 0 ? [1, 0] : phase === 1 ? [0, -1] : phase === 2 ? [-1, 0] : [0, 1];
      const hold = Math.floor(t / 300) % 2 === 0 ? 1 : 0;
      const confirm = t % 600 === p * 7 ? 4 : 0;
      row.push([dir[0], dir[1], hold | confirm]);
    }
    intents.push(row);
  }
  return { version: 1, seed, playerCount, layoutId: 'starter', intents };
}
