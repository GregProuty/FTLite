import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Skill, xpIndex } from '../src/renderer/src/sim/skills';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { xpSystem } from '../src/renderer/src/sim/xp';
import { DT, HAZARD_DT, HAZARD_EVERY, XP_RATE, XP_PER_SHOT, XP_PER_EVADE_ROLL, HEALTH_MAX, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, HULL_MAX, DEBRIS_HULL_DAMAGE, XP_THRESHOLDS } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, seconds, teleport, overdrive } from './helpers/sim';

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
    run(s, 1);                                                                       // hazard tick 5 delivers with the operator seated: the whole award lands on that one tick
    expect(xp(s, 0, Skill.Engineering)).toBeCloseTo(XP_RATE * HAZARD_DT);
    run(s, HAZARD_EVERY - 1);                                                        // the four non-hazard ticks add nothing (event XP, not continuous)
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
  it('breach and power repairs earn Repair XP per tick of progress too, and a later holder earns nothing once it is done', () => {
    const b = makeState(2); b.spawner.nextSpawnTick = 1e9; activateBreach(b, 6); teleport(b, 0, 2.5, 10.5); teleport(b, 1, 2.5, 10.5);
    run(b, 1, () => intents({ interactHeld: true }, {}));
    expect(xp(b, 0, Skill.Repair)).toBeCloseTo(XP_RATE * DT); expect(xp(b, 1, Skill.Repair)).toBe(0);
    b.breaches.repair[6] = 1 - 0.5 * DT / REPAIR_TIME_BREACH;
    run(b, 1, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(b.breaches.active[6]).toBe(0); expect(xp(b, 0, Skill.Repair)).toBeCloseTo(2 * XP_RATE * DT); expect(xp(b, 1, Skill.Repair)).toBe(0);
    const p = makeState(2), eng = idx(p, StationKind.Engineering); p.spawner.nextSpawnTick = 1e9; failStation(p, eng); teleport(p, 0, 18.5, 9.5); teleport(p, 1, 18.5, 9.5);
    run(p, 1, () => intents({ interactHeld: true }, {}));
    expect(xp(p, 0, Skill.Repair)).toBeCloseTo(XP_RATE * DT); expect(xp(p, 1, Skill.Repair)).toBe(0);
    p.stations.repair[eng] = 1 - 0.5 * DT / REPAIR_TIME_POWER;
    run(p, 1, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(p.stations.failed[eng]).toBe(0); expect(xp(p, 0, Skill.Repair)).toBeCloseTo(2 * XP_RATE * DT); expect(xp(p, 1, Skill.Repair)).toBe(0);
  });
  it('torpedo shots earn XP_PER_SHOT on a hit and a miss, a refused one nothing; a successful evasion earns XP_PER_EVADE_ROLL', () => {
    const s = makeState(1), wpn = idx(s, StationKind.Weapons), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 1e6, 1); sitDown(s, 0, wpn);
    s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 36;   // 0.956: miss
    run(s, 1, () => intents(confirm));
    expect(xp(s, 0, Skill.Weapons)).toBe(XP_PER_SHOT); expect(s.skills.lastShotTick).toBe(0); expect(s.debris.active[0]).toBe(1);
    run(s, 1, () => intents(confirm));                                              // tube empty, nothing loaded yet: refused
    expect(xp(s, 0, Skill.Weapons)).toBe(XP_PER_SHOT);
    s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;                                 // 0.012: hit
    run(s, 1, () => intents(confirm));
    expect(xp(s, 0, Skill.Weapons)).toBe(2 * XP_PER_SHOT); expect(s.debris.active[0]).toBe(0); expect(s.skills.lastShotTick).toBe(2);
    const n = makeState(1), nav = idx(n, StationKind.Navigation);
    n.spawner.nextSpawnTick = 1e9; sitDown(n, 0, nav); n.rng.combat.s = 7;           // 0.012 < 0.35: evades
    placeDebris(n, A, 0, 1);
    run(n, 1);
    expect(n.hull).toBe(HULL_MAX); expect(n.debris.active[0]).toBe(0); expect(xp(n, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * DT + XP_PER_EVADE_ROLL);
  });
  it('the evasion roll uses the output from before its own XP award: a Navigator one point short of level 10 does not evade on a draw between the two thresholds', () => {
    const s = makeState(1), nav = overdrive(s, StationKind.Navigation), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; s.stations.coolant[nav] = 2; sitDown(s, 0, nav);
    s.skills.xp[xpIndex(0, Skill.Navigation)] = XP_THRESHOLDS[10]! - 1;             // level 9 now; the roll's lump XP would make it level 10
    s.rng.combat.s = 141;                                                            // 0.7906: above the level-9 threshold 0.785, below the level-10 threshold 0.80
    placeDebris(s, A, 0, 1);
    run(s, 1);
    expect(s.hull).toBe(HULL_MAX - DEBRIS_HULL_DAMAGE);                              // not evaded: level 9 output applied
    expect(xp(s, 0, Skill.Navigation)).toBe(XP_THRESHOLDS[10]);                      // the award still landed (capped at the top threshold)
  });
});

describe('xpSystem guards', () => {
  it('no continuous XP for an offline station with an occupant, an online station without one, or a non-Conscious occupant', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 1e6, 1);
    s.stations.occupant[nav] = 0; s.stations.failed[nav] = 1; xpSystem(s);          // occupant recorded but the station is offline
    expect(xp(s, 0, Skill.Navigation)).toBe(0);
    s.stations.failed[nav] = 0; s.stations.occupant[nav] = -1; xpSystem(s);         // online, nobody seated
    expect(xp(s, 0, Skill.Navigation)).toBe(0);
    s.stations.occupant[nav] = 0; Life.state[s.crew[0]!] = LifeState.Downed; xpSystem(s);   // seated record but not Conscious
    expect(xp(s, 0, Skill.Navigation)).toBe(0);
    Life.state[s.crew[0]!] = LifeState.Conscious; xpSystem(s);
    expect(xp(s, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * DT);                    // the same fixture with every guard satisfied earns
  });
});
