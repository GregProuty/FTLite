// Duel polish i spec §D: the healing motes and revive feedback model, and the crew reading it shares with the audio.
import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { healing } from '../src/renderer/src/sim/duel/health';
import { HIT_FRESH_TICKS } from '../src/renderer/src/render/impactModel';
import { createRandom } from '../src/renderer/src/render/particles/random';
import {
  MOTE_RISE, MOTE_S, MOTE_SPREAD, REVIVED_S, RING_FROM, RING_S, RING_TO, createHealFx, crewLife, healFxDraw, stepHealFx, type HealFxView
} from '../src/renderer/src/render/duel/healFxModel';
import { TILE_PX } from '../src/shared/resolution';

const pos = [{ x: 100, y: 200 }, { x: 300, y: 400 }];
const view = (o: Partial<HealFxView> = {}): HealFxView => ({ tick: 5, round: 0, downed: [false, false], healing: [false, false], pos, ...o });

describe('healing feedback (duel polish i spec §D)', () => {
  it('a healing character spawns three motes a second within its tile, each rising 16 px and fading over 0.8 s', () => {
    const fx = createHealFx(), rnd = createRandom(1);
    stepHealFx(fx, view({ healing: [true, false] }), 1 / 60, rnd);
    expect(fx.motes).toHaveLength(1);   // at once when the healing starts
    const seen = new Set(fx.motes);
    for (let k = 1; k < 180; k++) { stepHealFx(fx, view({ healing: [true, false] }), 1 / 60, rnd); for (const m of fx.motes) seen.add(m); }
    expect(seen.size).toBe(9);   // three seconds: three a second
    expect(fx.motes.length).toBeLessThanOrEqual(3);   // each gone after 0.8 s
    for (const m of fx.motes) { expect(Math.abs(m.x - 100)).toBeLessThanOrEqual(MOTE_SPREAD); expect(m.y).toBe(200); }
    const one = createHealFx();
    stepHealFx(one, view({ healing: [true, false] }), 1 / 60, rnd);
    stepHealFx(one, view({ healing: [false, false] }), MOTE_S / 2, rnd);
    const d = healFxDraw(one).motes[0]!;
    expect(d.alpha).toBeCloseTo(0.5);
    expect(d.y).toBeCloseTo(200 - TILE_PX * 0.2 - MOTE_RISE / 2)   // a spawn starts at age 0;
    stepHealFx(one, view({ healing: [false, false] }), MOTE_S, rnd);
    expect(one.motes).toEqual([]);
  });
  it('paused (dt 0): the motes hold and nothing spawns', () => {
    const fx = createHealFx(), rnd = createRandom(1);
    stepHealFx(fx, view({ healing: [true, true] }), 1 / 60, rnd);
    const before = JSON.stringify(fx.motes);
    for (let k = 0; k < 30; k++) stepHealFx(fx, view({ healing: [true, true] }), 0, rnd);
    expect(JSON.stringify(fx.motes)).toBe(before);
  });
  it('a long frame spawns at most three motes per character', () => {
    const fx = createHealFx();
    stepHealFx(fx, view({ healing: [true, false] }), 1 / 60, createRandom(1));
    stepHealFx(fx, view({ healing: [true, false] }), 0.7, createRandom(2));
    expect(fx.motes.length).toBeLessThanOrEqual(4);
  });
  it('a revive shows REVIVED over 1.5 s and a ring growing 0.4 to 1.2 tiles over 0.5 s; a re-baseline shows nothing', () => {
    const fx = createHealFx(), rnd = createRandom(1);
    stepHealFx(fx, view({ downed: [false, true] }), 1 / 60, rnd);
    expect(fx.revives).toEqual([]);   // no baseline: nothing
    stepHealFx(fx, view({ tick: 6, downed: [false, false] }), 1 / 60, rnd);
    let d = healFxDraw(fx);
    expect(d.labels).toEqual([{ pid: 1, x: 300, y: 400 - TILE_PX, alpha: 1 }]);
    expect(d.rings[0]).toMatchObject({ x: 300, y: 400, r: RING_FROM * TILE_PX, alpha: 1 });
    stepHealFx(fx, view({ tick: 7 }), RING_S / 2, rnd);
    d = healFxDraw(fx);
    expect(d.rings[0]!.r).toBeCloseTo((RING_FROM + RING_TO) / 2 * TILE_PX); expect(d.rings[0]!.alpha).toBeCloseTo(0.5);
    stepHealFx(fx, view({ tick: 8 }), RING_S / 2, rnd);
    d = healFxDraw(fx);
    expect(d.rings).toEqual([]); expect(d.labels).toHaveLength(1);
    stepHealFx(fx, view({ tick: 9 }), REVIVED_S, rnd);
    expect(healFxDraw(fx).labels).toEqual([]);
    for (const o of [{ tick: 8 }, { tick: 9 + HIT_FRESH_TICKS + 1 }, { tick: 10, round: 1 }]) {
      const f = createHealFx();
      stepHealFx(f, view({ tick: 9, downed: [true, true] }), 1 / 60, rnd);
      stepHealFx(f, view({ ...o, downed: [false, false] }), 1 / 60, rnd);
      expect(f.revives).toEqual([]);
    }
  });
  it('crewLife reads health, downed and the Medbay healing from the duel', () => {
    const d = createSeatedDuel(parseShip(cutter), 5);
    try {
      const e1 = d.interior.crew[1]!;
      Health.cur[e1] = 40; Life.state[e1] = LifeState.Downed;
      const l = crewLife(d);
      expect(l.health[1]).toBe(40); expect(l.downed).toEqual([false, true]);
      expect(l.healing).toEqual([healing(d, 0), healing(d, 1)]);
    } finally { disposeDuel(d); }
  });
});
