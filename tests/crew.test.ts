import { describe, it, expect } from 'vitest';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { reviveCrew, consciousCount, EndReason } from '../src/renderer/src/sim/crew';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { HEALTH_MAX, FIRE_DAMAGE, BLEEDOUT_TIME, REVIVE_HEALTH_FRAC } from '../src/renderer/src/sim/tuning';
import { makeState, run, room, seconds, teleport } from './helpers/sim';

describe('crew lifecycle', () => {
  it('takes fire damage in a burning room', () => {
    const s = makeState(1);
    igniteRoom(s, room(s, 'G'));
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - FIRE_DAMAGE, 0);
  });
  it('takes damage in a low-oxygen room', () => {
    const s = makeState(1);
    s.rooms.o2[room(s, 'G')] = 0;
    s.doors.state.fill(2); // sealed, so it stays empty
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBeLessThan(HEALTH_MAX);
  });
  it('goes Downed at 0 health, bleeds out, then Dead; solo run ends on Downed', () => {
    const s = makeState(1);
    const eid = s.crew[0]!;
    Health.cur[eid] = 0.05;                 // two ticks of FIRE_DAMAGE/60 finish it
    igniteRoom(s, room(s, 'G'));
    run(s, 2);
    expect(Life.state[eid]).toBe(LifeState.Downed);
    expect(Life.bleed[eid]).toBeCloseTo(BLEEDOUT_TIME, 1);
    expect(s.ended).toBe(1); expect(s.endReason).toBe(EndReason.Crew);
  });
  it('bleeds out faster in fire and becomes Dead; two-player run continues', () => {
    const s = makeState(2);
    const eid = s.crew[0]!;
    teleport(s, 1, 20.5, 5.5);                              // teammate safe in the corridor
    Life.state[eid] = LifeState.Downed; Life.bleed[eid] = BLEEDOUT_TIME;
    s.doors.state.fill(2);
    run(s, seconds(BLEEDOUT_TIME / 2 + 1));
    expect(Life.state[eid]).toBe(LifeState.Downed);        // normal rate: half gone
    const t = makeState(2);
    const e2 = t.crew[0]!;
    teleport(t, 1, 20.5, 5.5);
    Life.state[e2] = LifeState.Downed; Life.bleed[e2] = BLEEDOUT_TIME;
    igniteRoom(t, room(t, 'G'));
    run(t, seconds(BLEEDOUT_TIME / 2 + 1));
    expect(Life.state[e2]).toBe(LifeState.Dead);           // doubled rate in fire
    expect(t.ended).toBe(0);
    expect(consciousCount(t)).toBe(1);
  });
  it('reviveCrew returns a Downed crew member at partial health', () => {
    const s = makeState(2);
    const eid = s.crew[0]!;
    Life.state[eid] = LifeState.Downed; Life.bleed[eid] = 5; Health.cur[eid] = 0;
    reviveCrew(s, eid);
    expect(Life.state[eid]).toBe(LifeState.Conscious);
    expect(Health.cur[eid]).toBe(HEALTH_MAX * REVIVE_HEALTH_FRAC);
    expect(Life.bleed[eid]).toBe(0);
  });
  it('run ends when hull reaches 0', () => {
    const s = makeState(2);
    s.hull = 0;
    run(s, 1);
    expect(s.ended).toBe(1); expect(s.endReason).toBe(EndReason.Hull);
  });
  it('an ended run does not advance', () => {
    const s = makeState(2);
    s.hull = 0; run(s, 5);
    expect(s.tick).toBe(1);
  });
});
