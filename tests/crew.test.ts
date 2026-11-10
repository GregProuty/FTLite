import { describe, it, expect } from 'vitest';
import { Health, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { reviveCrew, consciousCount, downCrew, EndReason } from '../src/renderer/src/sim/crew';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { oxygenStep } from '../src/renderer/src/sim/hazards/oxygen';
import { O2_DAMAGE, BREATH_RATE, HAZARD_DT, HEALTH_MAX, FIRE_DAMAGE, BLEEDOUT_TIME, REVIVE_HEALTH_FRAC } from '../src/renderer/src/sim/tuning';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { makeState, run, room, seconds, teleport } from './helpers/sim';

describe('doorway rule', () => {
  it('a crew member on the G door tile takes fire damage from G', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 7.5);
    igniteRoom(s, room(s, 'G'));
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - FIRE_DAMAGE, 0);
  });
  it('on the door tile with G at zero oxygen and I full, takes O2 damage', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 7.5);
    s.rooms.o2[room(s, 'G')] = 0;
    s.doors.state.fill(2);
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - O2_DAMAGE, 0);
  });
  it('breathes from the worse adjacent room', () => {
    const mk = (dead: boolean) => {
      const s = makeState(1);
      teleport(s, 0, 2.5, 7.5);
      const G = room(s, 'G'), I = room(s, 'I');
      s.rooms.o2[G] = s.derived.volume[G]! / 2;
      s.rooms.o2[I] = s.derived.volume[I]!;
      if (dead) Life.state[s.crew[0]!] = LifeState.Dead;
      oxygenStep(s, new Float64Array(s.rooms.o2.length));
      return s;
    };
    const alive = mk(false), dead = mk(true), G = room(alive, 'G'), I = room(alive, 'I');
    expect(dead.rooms.o2[G]! - alive.rooms.o2[G]!).toBeCloseTo(BREATH_RATE * HAZARD_DT, 9);
    expect(alive.rooms.o2[I]).toBe(dead.rooms.o2[I]);
  });
});

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
  it('downCrew downs a crew member immediately, stands them up and starts the bleed timer', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    sitDown(s, 0, eng);
    downCrew(s, 0);
    const eid = s.crew[0]!;
    expect(Life.state[eid]).toBe(LifeState.Downed); expect(Life.bleed[eid]).toBe(BLEEDOUT_TIME);
    expect(Seated.station[eid]).toBe(-1); expect(s.stations.occupant[eng]).toBe(-1);
    expect(Life.reviveProgress[eid]).toBe(0); expect(Life.reviverPid[eid]).toBe(-1);
  });
});
