// bitECS 0.4 SoA components. Arrays are indexed by entity id; the sim owns them and flatten.ts serializes them.
export const Position = { x: [] as number[], y: [] as number[] };
export const Health = { cur: [] as number[] };
export const LifeState = { Conscious: 0, Downed: 1, Dead: 2 } as const;
export const Life = {
  state: [] as number[],          // LifeState
  bleed: [] as number[],          // seconds left while Downed
  reviveProgress: [] as number[], // 0..1
  reviverPid: [] as number[]      // PlayerId currently reviving this crew, or -1
};
export const Stable = { id: [] as number[] };
export const Owner = { pid: [] as number[] };
