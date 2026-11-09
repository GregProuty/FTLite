import { describe, it, expect } from 'vitest';
import { activeHazardCount, stubSpawner } from '../src/renderer/src/sim/hazards/stub';
import { burningRoomCount, igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activeBreachCount } from '../src/renderer/src/sim/hazards/breach';
import { totalO2 } from '../src/renderer/src/sim/hazards/oxygen';
import { SPAWN_FIRST, SPAWN_INTERVAL, SPAWN_CAP, SPAWN_JITTER } from '../src/renderer/src/sim/tuning';
import { makeState, run, seconds } from './helpers/sim';

describe('stub injector and spawner', () => {
  it('keeps a quiet ship full of oxygen', () => {
    const s = makeState(2);
    s.spawner.nextSpawnTick = 1e9;
    run(s, seconds(60));
    expect(totalO2(s)).toBeGreaterThan(0.99 * Array.from(s.derived.volume).reduce((a, b) => a + b, 0));
    expect(s.o2Counters.injected).toBeGreaterThan(0);
  });
  it('spawns the first hazard after SPAWN_FIRST', () => {
    const s = makeState(2);
    run(s, seconds(SPAWN_FIRST) - 1);
    expect(activeHazardCount(s)).toBe(0);
    run(s, 2);
    expect(activeHazardCount(s)).toBe(1);
    expect(burningRoomCount(s) + activeBreachCount(s)).toBe(activeHazardCount(s));
  });
  it('the spawner skips a spawn while the cap is full (fire spread is not capped)', () => {
    const s = makeState(0);
    for (let r = 0; r < SPAWN_CAP; r++) igniteRoom(s, r);
    s.spawner.nextSpawnTick = s.tick;
    stubSpawner(s);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP);
    expect(s.spawner.nextSpawnTick).toBeGreaterThan(s.tick);   // the timer still advances
    expect(s.spawner.nextSpawnTick).toBeGreaterThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 - SPAWN_JITTER)));
    expect(s.spawner.nextSpawnTick).toBeLessThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 + SPAWN_JITTER)));
  });
  it('spawn sequence is deterministic per seed and differs between seeds', () => {
    const a = makeState(2, 7), b = makeState(2, 7), c = makeState(2, 8);
    run(a, seconds(120)); run(b, seconds(120)); run(c, seconds(120));
    expect(Array.from(a.rooms.fire)).toEqual(Array.from(b.rooms.fire));
    expect(Array.from(a.breaches.active)).toEqual(Array.from(b.breaches.active));
    const same = Array.from(a.rooms.fire).every((f, i) => (f > 0) === (c.rooms.fire[i]! > 0))
      && Array.from(a.breaches.active).every((v, i) => v === c.breaches.active[i]);
    expect(same).toBe(false);
  });
});
