import { describe, it, expect } from 'vitest';
import { activeHazardCount, spawner } from '../src/renderer/src/sim/hazards/spawner';
import { burningRoomCount, igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activeBreachCount } from '../src/renderer/src/sim/hazards/breach';
import { failedStationCount, sitDown } from '../src/renderer/src/sim/stations';
import { Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { SPAWN_FIRST, SPAWN_INTERVAL, SPAWN_CAP, SPAWN_JITTER } from '../src/renderer/src/sim/tuning';
import { makeState, run, seconds } from './helpers/sim';

describe('timer spawner', () => {
  it('spawns the first hazard after SPAWN_FIRST and counts fires, breaches and failed stations', () => {
    const s = makeState(2);
    run(s, seconds(SPAWN_FIRST) - 1);
    expect(activeHazardCount(s)).toBe(0);
    run(s, 2);
    expect(activeHazardCount(s)).toBe(1);
    expect(burningRoomCount(s) + activeBreachCount(s) + failedStationCount(s)).toBe(1);
  });
  it('skips a spawn while the cap is full and still advances the timer', () => {
    const s = makeState(0);
    for (let r = 0; r < SPAWN_CAP; r++) igniteRoom(s, r);
    s.spawner.nextSpawnTick = s.tick;
    spawner(s);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP);
    expect(s.spawner.nextSpawnTick).toBeGreaterThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 - SPAWN_JITTER)));
    expect(s.spawner.nextSpawnTick).toBeLessThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 + SPAWN_JITTER)));
  });
  it('produces all three types over many spawns, deterministically per seed', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = makeState(0, seed);                               // no crew: nothing gets repaired, so every spawn stays visible until the cap
      for (let n = 0; n < 3; n++) { s.spawner.nextSpawnTick = s.tick; spawner(s); }
      if (burningRoomCount(s)) kinds.add('fire'); if (activeBreachCount(s)) kinds.add('breach'); if (failedStationCount(s)) kinds.add('power');
    }
    expect(kinds).toEqual(new Set(['fire', 'breach', 'power']));
    const a = makeState(2, 7), b = makeState(2, 7);
    run(a, seconds(120)); run(b, seconds(120));
    expect(Array.from(a.stations.failed)).toEqual(Array.from(b.stations.failed));
    expect(Array.from(a.rooms.fire)).toEqual(Array.from(b.rooms.fire));
  });
  it('a failure spawned inside step() stands the occupant in that same tick', () => {
    const s = makeState(2), nav = s.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(s, 0, nav);
    // Force a spawn every tick, clearing the other hazards so the cap never blocks, until the seeded spawner fails Navigation.
    for (let n = 0; n < 2000 && !s.stations.failed[nav]; n++) {
      s.spawner.nextSpawnTick = s.tick; s.rooms.fire.fill(0); s.breaches.active.fill(0);
      for (let i = 0; i < s.stations.failed.length; i++) if (i !== nav) s.stations.failed[i] = 0;
      run(s, 1);
    }
    expect(s.stations.failed[nav]).toBe(1);
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[nav]).toBe(-1);   // already standing when the tick ended
  });
  it('power failures accumulate on distinct stations up to the cap and never re-fail one', () => {
    const s = makeState(0, 3);
    for (let i = 0; i < 4; i++) s.stations.failed[i] = 1;                       // four failed: only three candidates remain and the cap (3) is already full
    s.spawner.nextSpawnTick = s.tick; spawner(s);
    expect(failedStationCount(s)).toBe(4);                                       // cap full: nothing spawned
    s.stations.failed.fill(0); s.stations.failed[0] = 1; s.stations.failed[1] = 1; s.stations.repair[0] = 0.5;
    for (let n = 0; n < 60 && failedStationCount(s) < SPAWN_CAP; n++) { s.spawner.nextSpawnTick = s.tick; s.rooms.fire.fill(0); s.breaches.active.fill(0); spawner(s); }
    expect(failedStationCount(s)).toBe(SPAWN_CAP);
    expect(s.stations.repair[0]).toBe(0.5);                                      // the already failed station was not failed again (that would reset repair)
  });
});
