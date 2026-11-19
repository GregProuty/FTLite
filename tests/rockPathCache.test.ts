// Asteroids-iii §7.2 (renderer): the target's predicted path is made once per tick and rock, not once per frame.
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/renderer/src/sim/tactical/predict', async (orig) => {
  const m = await orig<typeof import('../src/renderer/src/sim/tactical/predict')>();
  return { ...m, predictRock: (...a: Parameters<typeof m.predictRock>) => { calls.n++; return m.predictRock(...a); } };
});
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { arena, rail } from './helpers/rockArena';

describe('the rock path cache', () => {
  it('a second frame at the same tick does not predict again and draws the same path; a new tick or rock does', () => {
    const st = arena(); rail(st, 3, 0, 2000, 20); rail(st, 4, 500, 2000, 20); st.systems[0].laserRock = 3;
    const frame = (alpha: number) => tacticalModel({ state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha, camera: createCamera(0, 2000, 1),
      viewport: { w: 1280, h: 720 }, console: 'weapons', axes: NO_AXES, ships: [0], paused: false, reserveRight: 0, contacts: true } as TacticalModelInput);
    const a = frame(0.2).rockPath!, before = calls.n, b = frame(0.7).rockPath!;
    expect(calls.n).toBe(before); expect(b).toEqual(a);
    stepDuel(st, IDLE_INPUT); frame(0.2);
    expect(calls.n).toBe(before + 1);
    st.systems[0].laserRock = 4; frame(0.2);
    expect(calls.n).toBe(before + 2);
  });
});
