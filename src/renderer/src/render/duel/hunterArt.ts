// UI round Part 3 §3.4: where the Hunter render sits, in ship units (f to image x, s to image y). A copy of the `frame`
// in tools/ship-render/hunter.json (outside the renderer's source tree); tests/hunterArt.test.ts asserts they match.
export const HUNTER_FRAME = { f0: -1.24, s0: -0.7, f1: 1.35, s1: 0.7 } as const;
