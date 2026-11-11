import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Skill, xpIndex } from '../src/renderer/src/sim/skills';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { DT, HAZARD_DT, HAZARD_EVERY, XP_RATE, XP_PER_SHOT, XP_PER_EVADE_ROLL, HEALTH_MAX, REPAIR_TIME_FIRE } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, seconds, teleport } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const xp = (s: ReturnType<typeof makeState>, pid: number, skill: number) => s.skills.xp[xpIndex(pid, skill)]!;
const confirm = { confirmPressed: true };

describe('continuous XP', () => {
  it('a seated Navigation operator gains XP_RATE x DT per tick while an object is warned, nothing otherwise, nothing offline or unseated', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, nav);
    run(s, 10); expect(xp(s, 0, Skill.Navigation)).toBe(0);
    placeDebris(s, A, 1e6, 1);
    run(s, 1); expect(xp(s, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * DT);
    run(s, 59); expect(xp(s, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * 1);
    failStation(s, nav); run(s, 60);
    expect(xp(s, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * 1);                  // offline (and stood): nothing
  });
  it('the observation point precedes impacts and healing: a Navigator downed by an impact keeps that tick; the Medbay operator earns the last healing tick', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 1, nav);
    Health.cur[s.crew[1]!] = 1; s.rng.combat.s = 36;                                // 0.956: no evasion
    placeDebris(s, A, 0, 1);                                                          // impacts this tick in room A (the Navigation room)
    run(s, 1);
    expect(Life.state[s.crew[1]!]).toBe(LifeState.Downed);
    expect(xp(s, 1, Skill.Navigation)).toBeCloseTo(XP_RATE * DT + XP_PER_EVADE_ROLL);   // the tick's continuous XP plus the roll
    run(s, 60); expect(xp(s, 1, Skill.Navigation)).toBeCloseTo(XP_RATE * DT + XP_PER_EVADE_ROLL);
    const t = makeState(1), med = idx(t, StationKind.Medbay);
    t.spawner.nextSpawnTick = 1e9; sitDown(t, 0, med); Health.cur[t.crew[0]!] = HEALTH_MAX - 0.01;   // heals to full on the first tick
    run(t, 1);
    expect(Health.cur[t.crew[0]!]).toBe(HEALTH_MAX); expect(xp(t, 0, Skill.Science)).toBeCloseTo(XP_RATE * DT);
    run(t, 10); expect(xp(t, 0, Skill.Science)).toBeCloseTo(XP_RATE * DT);         // nobody hurt: nothing more
  });
});

describe('event XP', () => {
  it('a shot adds XP_PER_SHOT hit or miss and stamps lastShotTick; a refused shot adds nothing', () => {
    const s = makeState(1), wpn = idx(s, StationKind.Weapons), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 1e6, 1, undefined, 2); sitDown(s, 0, wpn);
    s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1; s.rng.combat.s = 1;   // mismatch: miss
    run(s, 1, () => intents(confirm));
    expect(xp(s, 0, Skill.Weapons)).toBe(XP_PER_SHOT); expect(s.skills.lastShotTick).toBe(0); expect(s.debris.active[0]).toBe(1);
    run(s, 1, () => intents(confirm));                                              // no charge: refused
    expect(xp(s, 0, Skill.Weapons)).toBe(XP_PER_SHOT);
    s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF2; s.rng.combat.s = 1;   // match: hit
    run(s, 1, () => intents(confirm));
    expect(xp(s, 0, Skill.Weapons)).toBe(2 * XP_PER_SHOT); expect(s.debris.active[0]).toBe(0);
  });
  it('Life Support XP goes to the operator seated when a hazard tick delivers; none unmanned or when nothing is delivered', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; s.rooms.o2[A] = 0;                               // a drained room to fill
    run(s, HAZARD_EVERY);                                                            // unmanned delivery on tick 0
    expect(s.skills.lsDeliveredTick).toBe(0); expect(xp(s, 0, Skill.Engineering)).toBe(0);
    sitDown(s, 0, ls);
    run(s, HAZARD_EVERY);                                                            // hazard tick 5 delivers with the operator seated
    expect(xp(s, 0, Skill.Engineering)).toBeCloseTo(XP_RATE * HAZARD_DT);
    const t = makeState(1), lsT = idx(t, StationKind.LifeSupport);
    t.spawner.nextSpawnTick = 1e9; sitDown(t, 0, lsT);
    for (let r = 0; r < t.rooms.o2.length; r++) t.rooms.o2[r] = t.derived.volume[r]!;
    activateBreach(t, 7);                                                           // site 7 is in room E, the Life Support room: the operator breathes there, but a breached room takes no injection, and every other room is full
    run(t, 1);
    expect(t.skills.lsDeliveredTick).toBe(-1); expect(xp(t, 0, Skill.Engineering)).toBe(0);   // a Conscious seated operator earns nothing without delivery
  });
  it('repairers earn Repair XP per tick of progress; a hazard already repaired this tick earns nothing; revive earns nothing', () => {
    const s = makeState(2), G = room(s, 'G');
    s.spawner.nextSpawnTick = 1e9; igniteRoom(s, G);
    teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5);
    run(s, 1, () => intents({ interactHeld: true }, {}));
    expect(xp(s, 0, Skill.Repair)).toBeCloseTo(XP_RATE * DT); expect(xp(s, 1, Skill.Repair)).toBe(0);
    s.rooms.fireRepair[G] = 1 - 0.5 * DT / REPAIR_TIME_FIRE;                       // both finish on the next tick; the first holder completes it
    run(s, 1, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(s.rooms.fire[G]).toBe(0);
    expect(xp(s, 0, Skill.Repair)).toBeCloseTo(2 * XP_RATE * DT); expect(xp(s, 1, Skill.Repair)).toBe(0);   // player 1 found nothing left to repair
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 30;
    run(s, seconds(1), () => intents({ interactHeld: true }, {}));
    expect(xp(s, 0, Skill.Repair)).toBeCloseTo(2 * XP_RATE * DT);                   // reviving is not repairing
  });
});
