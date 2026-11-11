import { describe, it, expect } from 'vitest';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { MEDBAY_HEAL, MEDBAY_SEATED_BONUS, OUTPUT_SLOW, OUTPUT_FAST, STATION_MAX, HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, run, teleport, seconds } from './helpers/sim';

const med = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Medbay]!;

describe('Medbay', () => {
  it('heals Conscious crew standing in the Medbay at the level-scaled rate, more when seated, nothing elsewhere or offline', () => {
    const s = makeState(2); s.director.nextSpawnTick = 1e9;
    const mid = (OUTPUT_SLOW + OUTPUT_FAST) / 2, rate = MEDBAY_HEAL * (1 / STATION_MAX[StationKind.Medbay]) * mid;
    Health.cur[s.crew[0]!] = 50; Health.cur[s.crew[1]!] = 50;
    teleport(s, 0, 17.5, 2.5);                                   // in F, next to the console
    run(s, seconds(2));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(50 + rate * 2, 1);
    expect(Health.cur[s.crew[1]!]).toBe(50);                     // still in G
    sitDown(s, 1, med(s)); Health.cur[s.crew[1]!] = 50; Health.cur[s.crew[0]!] = 50;
    run(s, seconds(2));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(50 + rate * (1 + MEDBAY_SEATED_BONUS) * 2, 1);
    expect(Health.cur[s.crew[1]!]).toBeCloseTo(50 + rate * (1 + MEDBAY_SEATED_BONUS) * 2, 1);   // the occupant is in the room too
    failStation(s, med(s)); Health.cur[s.crew[0]!] = 50;
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBe(50);
  });
  it('clamps at HEALTH_MAX and ignores Downed crew', () => {
    const s = makeState(2); s.director.nextSpawnTick = 1e9;
    teleport(s, 0, 17.5, 2.5); teleport(s, 1, 18.5, 2.5);
    Health.cur[s.crew[0]!] = HEALTH_MAX - 0.5;
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 30; Health.cur[s.crew[1]!] = 0;
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBe(HEALTH_MAX); expect(Health.cur[s.crew[1]!]).toBe(0);
  });
});
