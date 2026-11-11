import { describe, it, expect } from 'vitest';
import { telemetrySystem } from '../src/renderer/src/sim/telemetry';
import { step } from '../src/renderer/src/sim/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { downCrew } from '../src/renderer/src/sim/crew';
import { debrisSystem } from '../src/renderer/src/sim/debris';
import { fireWeapon, beamHits, Weapon } from '../src/renderer/src/sim/weapons';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Phase, HazardType, enterPhase, updateStress, directorSystem } from '../src/renderer/src/sim/director';
import { DEBRIS_CREW_DAMAGE, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, REVIVE_TIME, DT } from '../src/renderer/src/sim/tuning';
import { makeState, run, intents, teleport, placeDebris, room, seconds, quiet, armSpawn } from './helpers/sim';
import { createRng, nextFloat } from '../src/shared/rng';
import { NEUTRAL_INTENT } from '../src/shared/intent';

const nav = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Navigation]!;
const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const hold = { interactHeld: true };

describe('telemetry: initial values', () => {
  it('a fresh state has -1 ticks and pids, zero counters, Conscious prevLife and one Build Up entry', () => {
    const t = makeState(2).telemetry;
    expect([t.firstDownTick, t.firstDownPid, t.firstDeathTick, t.firstDeathPid]).toEqual([-1, -1, -1, -1]);
    expect([t.impacts, t.evadeRolls, t.evasions, t.shots, t.hits, t.maxStress]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(t.mannedTicks)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(t.idleRun)).toEqual([0, 0]); expect(Array.from(t.longestIdle)).toEqual([0, 0]);
    expect(Array.from(t.prevLife)).toEqual([LifeState.Conscious, LifeState.Conscious]);
    expect(Array.from(t.spawns)).toEqual([0, 0, 0, 0]); expect(Array.from(t.repairs)).toEqual([0, 0, 0]);
    expect(Array.from(t.phaseEntries)).toEqual([1, 0, 0, 0]);
  });
});

describe('telemetry: manned ticks and idle streaks', () => {
  it('mannedTicks counts only an occupant at an online station; a failed station with a stale occupant byte does not count', () => {
    const s = makeState(1); quiet(s); const n = nav(s);
    run(s, 5);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(0);
    sitDown(s, 0, n); run(s, 10);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(10);
    s.stations.failed[n] = 1; s.stations.occupant[n] = 0;      // stale occupant byte on a failed station
    telemetrySystem(s);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(10);
  });
  it('idleRun counts walking and standing, resets on a seated tick, and longestIdle keeps the maximum streak', () => {
    const s = makeState(1); quiet(s); const n = nav(s);
    run(s, 30, () => intents({ moveX: 1 }));                      // walking is idle
    expect(s.telemetry.idleRun[0]).toBe(30); expect(s.telemetry.longestIdle[0]).toBe(30);
    sitDown(s, 0, n); run(s, 1);
    expect(s.telemetry.idleRun[0]).toBe(0); expect(s.telemetry.longestIdle[0]).toBe(30);
    run(s, 1, () => intents({ cancelPressed: true })); run(s, 49);  // stood: 50 idle ticks
    expect(s.telemetry.idleRun[0]).toBe(50); expect(s.telemetry.longestIdle[0]).toBe(50);
    sitDown(s, 0, n); run(s, 1); run(s, 1, () => intents({ cancelPressed: true })); run(s, 9);
    expect(s.telemetry.longestIdle[0]).toBe(50);                   // a shorter streak does not lower it
  });
  it('a repair tick is active; a revive tick is active for the reviver only; Downed and Dead ticks are idle', () => {
    const s = makeState(2); quiet(s); const G = room(s, 'G');
    igniteRoom(s, G); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5);
    run(s, 10, () => intents(hold, {}));
    expect(s.telemetry.idleRun[0]).toBe(0); expect(s.telemetry.idleRun[1]).toBe(10);
    const r = makeState(2); quiet(r);
    downCrew(r, 1); teleport(r, 0, 2.5, 9.5); teleport(r, 1, 2.5, 9.5);
    run(r, 5, () => intents(hold, {}));
    expect(r.telemetry.idleRun[0]).toBe(0); expect(r.telemetry.idleRun[1]).toBe(5);   // Downed is idle even while being revived
    const third = makeState(3); quiet(third);
    downCrew(third, 2); teleport(third, 0, 2.5, 9.5); teleport(third, 1, 2.5, 9.5); teleport(third, 2, 2.5, 9.5);
    run(third, 5, () => intents(hold, hold, {}));
    expect(third.telemetry.idleRun[0]).toBe(0); expect(third.telemetry.idleRun[1]).toBe(5);   // pid 1 also holds Interact but is not the arbitrated reviver
    const d = makeState(2); quiet(d); run(d, 3);
    downCrew(d, 1); run(d, 2);                                       // Downed ticks are idle
    expect(d.telemetry.idleRun[1]).toBe(5);
    Life.bleed[d.crew[1]!] = DT / 2; run(d, 1);                        // bleeds out this tick
    expect(Life.state[d.crew[1]!]).toBe(LifeState.Dead); expect(d.telemetry.idleRun[1]).toBe(6);
    run(d, 4);                                                       // Dead ticks keep counting
    expect(d.telemetry.idleRun[1]).toBe(10); expect(d.telemetry.longestIdle[1]).toBe(10);
  });
  it('the revive completion tick counts as active for the reviver', () => {
    const s = makeState(2); quiet(s);
    downCrew(s, 1); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 2.5, 9.5);
    Life.reviveProgress[s.crew[1]!] = 1 - DT / REVIVE_TIME / 2;     // completes on the next progress tick
    run(s, 1, () => intents(hold, {}));
    expect(Life.state[s.crew[1]!]).toBe(LifeState.Conscious); expect(s.telemetry.idleRun[0]).toBe(0);
  });
  it('mixed case: a crew member who adds repair progress and is downed by debris in the same tick is active that tick and idle the next', () => {
    const s = makeState(1); quiet(s); const G = room(s, 'G');
    igniteRoom(s, G); teleport(s, 0, 2.5, 9.5); Health.cur[s.crew[0]!] = DEBRIS_CREW_DAMAGE;
    placeDebris(s, G, 0);                                            // impacts this tick; nobody at Navigation so no roll
    run(s, 1, () => intents(hold));
    expect(Life.state[s.crew[0]!]).toBe(LifeState.Downed);
    expect(s.telemetry.idleRun[0]).toBe(0); expect(s.telemetry.firstDownTick).toBe(0); expect(s.telemetry.firstDownPid).toBe(0);
    expect(s.ended).toBe(1);                                         // solo: the run ended on that tick
    run(s, 1);                                                       // step returns early: nothing changes
    expect(s.telemetry.idleRun[0]).toBe(0);
    const two = makeState(2); quiet(two); const G2 = room(two, 'G');
    igniteRoom(two, G2); teleport(two, 0, 2.5, 9.5); Health.cur[two.crew[0]!] = DEBRIS_CREW_DAMAGE; placeDebris(two, G2, 0);
    run(two, 1, () => intents(hold, {})); run(two, 1);
    expect(two.telemetry.idleRun[0]).toBe(1);                        // the tick after the downing is idle
  });
});

describe('telemetry: first down and first death', () => {
  it('records the transition tick and pid once; a later crew member does not overwrite it; the lower pid wins a same-tick tie', () => {
    const s = makeState(3); quiet(s);
    run(s, 10);
    downCrew(s, 2); run(s, 1);
    expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([10, 2]);
    downCrew(s, 0); run(s, 1);
    expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([10, 2]);
    Life.bleed[s.crew[2]!] = DT / 2; run(s, 1);                       // pid 2 bleeds out this tick
    expect([s.telemetry.firstDeathTick, s.telemetry.firstDeathPid]).toEqual([12, 2]);
    Life.bleed[s.crew[0]!] = DT / 2; run(s, 1);
    expect([s.telemetry.firstDeathTick, s.telemetry.firstDeathPid]).toEqual([12, 2]);
    const tie = makeState(3); quiet(tie); run(tie, 4);
    downCrew(tie, 2); downCrew(tie, 1); run(tie, 1);
    expect([tie.telemetry.firstDownTick, tie.telemetry.firstDownPid]).toEqual([4, 1]);
    Life.bleed[tie.crew[1]!] = DT / 2; Life.bleed[tie.crew[2]!] = DT / 2; run(tie, 1);   // both bleed out on tick 5; pid 0 stays Conscious
    expect(Life.state[tie.crew[0]!]).toBe(LifeState.Conscious); expect(tie.ended).toBe(0);
    expect([tie.telemetry.firstDeathTick, tie.telemetry.firstDeathPid]).toEqual([5, 1]);
  });
  it('a Conscious -> Dead jump in one tick sets both the down and the death edge', () => {
    const s = makeState(2); quiet(s); run(s, 6);
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = DT / 2;   // set directly, so telemetry last saw Conscious
    run(s, 1);
    expect(Life.state[s.crew[1]!]).toBe(LifeState.Dead);
    expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid, s.telemetry.firstDeathTick, s.telemetry.firstDeathPid]).toEqual([6, 1, 6, 1]);
  });
  it('ending-tick capture through step(): a solo downing ends the run on that tick and later steps leave every field unchanged', () => {
    const s = makeState(1); quiet(s); run(s, 7);
    downCrew(s, 0); run(s, 1);
    expect(s.ended).toBe(1); expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([7, 0]); expect(s.telemetry.idleRun[0]).toBe(8);
    const before = JSON.stringify(s.telemetry, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Int32Array) : v));
    run(s, 3);
    expect(JSON.stringify(s.telemetry, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Int32Array) : v))).toBe(before);
  });
  it('a seated operator downed on the ending tick is not manning that tick (final-state sample) while the roll it made is counted', () => {
    const s = makeState(1); quiet(s); const n = nav(s), A = room(s, 'A');
    sitDown(s, 0, n); run(s, 3);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(3);
    Health.cur[s.crew[0]!] = DEBRIS_CREW_DAMAGE; s.rng.combat.s = 4;   // first draw 0.924: not evaded
    placeDebris(s, A, 0); run(s, 1);
    expect(s.ended).toBe(1); expect(Life.state[s.crew[0]!]).toBe(LifeState.Downed);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(3); expect(s.telemetry.idleRun[0]).toBe(1);
    expect([s.telemetry.evadeRolls, s.telemetry.evasions, s.telemetry.impacts]).toEqual([1, 0, 1]);
    expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([3, 0]);
  });
  it('scratch.activeThisTick is cleared every step', () => {
    const s = makeState(1); quiet(s); const G = room(s, 'G');
    igniteRoom(s, G); teleport(s, 0, 2.5, 9.5);
    run(s, 1, () => intents(hold)); expect(s.scratch.activeThisTick[0]).toBe(1);
    run(s, 1); expect(s.scratch.activeThisTick[0]).toBe(0);
  });
});

describe('telemetry: event counters', () => {
  it('spawns per type through a pinned director roll; phaseEntries counts each enterPhase; maxStress follows the highest smoothed value', () => {
    const typesSeen = new Set<number>();
    for (let seed = 1; seed <= 24; seed++) {                           // director seeds cover every type; each spawn increments exactly its own counter
      const s = makeState(2); armSpawn(s); s.rng.director.s = seed;
      directorSystem(s);
      if (s.director.lastType < 0) continue;                          // a skipped attempt (no target) increments nothing
      typesSeen.add(s.director.lastType);
      const expected = [0, 0, 0, 0]; expected[s.director.lastType] = 1;
      expect(Array.from(s.telemetry.spawns)).toEqual(expected);
    }
    expect([...typesSeen].sort()).toEqual([HazardType.Fire, HazardType.Breach, HazardType.Power, HazardType.Debris]);
    const s = makeState(2);
    enterPhase(s, Phase.SustainPeak); enterPhase(s, Phase.PeakFade); enterPhase(s, Phase.Relax); enterPhase(s, Phase.BuildUp);
    expect(Array.from(s.telemetry.phaseEntries)).toEqual([2, 1, 1, 1]);
    const t = makeState(2); quiet(t);
    igniteRoom(t, 0); igniteRoom(t, 1); igniteRoom(t, 2); updateStress(t);
    const peak = t.director.stress; expect(peak).toBeGreaterThan(0); expect(t.telemetry.maxStress).toBe(peak);
    t.rooms.fire.fill(0); updateStress(t); updateStress(t);
    expect(t.director.stress).toBeLessThan(peak); expect(t.telemetry.maxStress).toBe(peak);
  });
  it('impacts, evadeRolls and evasions through pinned combat rolls', () => {
    const A = room(makeState(1), 'A');
    const un = makeState(1); placeDebris(un, A, 0); debrisSystem(un);
    expect([un.telemetry.evadeRolls, un.telemetry.evasions, un.telemetry.impacts]).toEqual([0, 0, 1]);     // unmanned: no roll
    const ev = makeState(1); sitDown(ev, 0, nav(ev)); ev.rng.combat.s = 7; placeDebris(ev, A, 0); debrisSystem(ev);   // 0.012: evaded
    expect([ev.telemetry.evadeRolls, ev.telemetry.evasions, ev.telemetry.impacts]).toEqual([1, 1, 0]);
    const no = makeState(1); sitDown(no, 0, nav(no)); no.rng.combat.s = 4; placeDebris(no, A, 0); debrisSystem(no);   // 0.924: not evaded
    expect([no.telemetry.evadeRolls, no.telemetry.evasions, no.telemetry.impacts]).toEqual([1, 0, 1]);
  });
  it('shots and hits: a beam hit, a beam miss, a torpedo hit, and a rejected attempt with no charge', () => {
    const B = room(makeState(1), 'B');
    const hit = makeState(1), w1 = wpn(hit); sitDown(hit, 0, w1); placeDebris(hit, B, 600, 1); hit.stations.cursor[w1] = 0; hit.weapons.charge = 1; hit.rng.combat.s = 7;   // 0.012: hits at any threshold
    expect(fireWeapon(hit)).toBe(true); expect([hit.telemetry.shots, hit.telemetry.hits]).toEqual([1, 1]);
    const miss = makeState(1), w2 = wpn(miss); sitDown(miss, 0, w2); placeDebris(miss, B, 600, 1, undefined, 3); miss.stations.cursor[w2] = 0; miss.weapons.charge = 1; miss.weapons.selector = 0; miss.rng.combat.s = 4;
    expect(beamHits(nextFloat(createRng(4)), stationOutput(miss, w2), false)).toBe(false);   // guard: 0.924 misses an unmatched frequency at the starter output
    expect(fireWeapon(miss)).toBe(false); expect([miss.telemetry.shots, miss.telemetry.hits]).toEqual([1, 0]);
    const torp = makeState(1), w3 = wpn(torp); sitDown(torp, 0, w3); placeDebris(torp, B, 600, 1); torp.stations.cursor[w3] = 0; torp.weapons.selector = Weapon.Torpedo; torp.weapons.torpedoLoaded = 1; torp.rng.combat.s = 7;
    expect(fireWeapon(torp)).toBe(true); expect([torp.telemetry.shots, torp.telemetry.hits]).toEqual([1, 1]);
    const none = makeState(1), w4 = wpn(none); sitDown(none, 0, w4); placeDebris(none, B, 600, 1); none.stations.cursor[w4] = 0; none.weapons.charge = 0.5;
    expect(fireWeapon(none)).toBe(false); expect([none.telemetry.shots, none.telemetry.hits]).toEqual([0, 0]);
  });
  it('repairs count each kind once on completion, even with two holders', () => {
    const f = makeState(1), G = room(f, 'G'); quiet(f); igniteRoom(f, G); teleport(f, 0, 2.5, 9.5);
    run(f, seconds(REPAIR_TIME_FIRE) + 5, () => intents(hold));
    expect(Array.from(f.telemetry.repairs)).toEqual([1, 0, 0]);
    const b = makeState(1); quiet(b); activateBreach(b, 6); teleport(b, 0, 2.5, 10.5);
    run(b, seconds(REPAIR_TIME_BREACH) + 5, () => intents(hold));
    expect(Array.from(b.telemetry.repairs)).toEqual([0, 1, 0]);
    const p = makeState(1), eng = p.derived.stationOfKind[StationKind.Engineering]!; quiet(p); failStation(p, eng); teleport(p, 0, 18.5, 9.5);
    run(p, seconds(REPAIR_TIME_POWER) + 5, () => intents(hold));
    expect(Array.from(p.telemetry.repairs)).toEqual([0, 0, 1]);
    const two = makeState(2), G2 = room(two, 'G'); quiet(two); igniteRoom(two, G2); teleport(two, 0, 2.5, 9.5); teleport(two, 1, 3.5, 9.5); two.rooms.fireRepair[G2] = 0.999;
    run(two, 1, () => intents(hold, hold));
    expect(two.rooms.fire[G2]).toBe(0); expect(Array.from(two.telemetry.repairs)).toEqual([1, 0, 0]);
  });
});
