import { describe, it, expect } from 'vitest';
import { CHARACTERS, RECRUIT, DEFAULT_CHARACTERS, Asset, Complication, characterOf, repairTraitMult, speedMult, fireDamageMult, o2DamageMult, xpMult, coolingTraitBonus, bleedoutMult } from '../src/renderer/src/sim/characters';
import { Skill, xpIndex, skillCurve } from '../src/renderer/src/sim/skills';
import { createSimState } from '../src/renderer/src/sim/state';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown, stationOutput } from '../src/renderer/src/sim/stations';
import { SKILL_COUNT, XP_THRESHOLDS, STATION_MAX } from '../src/renderer/src/sim/tuning';
import { LAYOUT, makeState, RECRUITS, intents, run, teleport, room, seconds, placeDebris } from './helpers/sim';
import { Health, Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { coolingPerUnit } from '../src/renderer/src/sim/heat';
import { debrisSystem } from '../src/renderer/src/sim/debris';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { failStation } from '../src/renderer/src/sim/power';
import { downCrew, reviveCrew } from '../src/renderer/src/sim/crew';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { repairMult, addXp } from '../src/renderer/src/sim/skills';
import { DT, HAZARD_DT, CREW_SPEED, FIRE_DAMAGE, O2_DAMAGE, BLEEDOUT_TIME, HEALTH_MAX, HEAT_COOL_UNIT, HEAT_COOL_SKILL, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, REVIVE_TIME, XP_RATE, XP_PER_SHOT, XP_PER_EVADE_ROLL, DEBRIS_CREW_DAMAGE, TRAIT_REPAIR_MULT, TRAIT_SLOW_SPEED, TRAIT_FAST_SPEED, TRAIT_FIRE_DAMAGE, TRAIT_O2_DAMAGE, TRAIT_XP_MULT, TRAIT_BLEEDOUT } from '../src/renderer/src/sim/tuning';

const ASSET_MECHANIC = { [Asset.QuickHands]: 'repair', [Asset.CoolHead]: 'cooling', [Asset.IronLungs]: 'damage', [Asset.Sprinter]: 'speed' } as Record<number, string>;
const COMPLICATION_MECHANIC = { [Complication.HeavyBoots]: 'speed', [Complication.Flammable]: 'damage', [Complication.SlowLearner]: 'xp', [Complication.Frail]: 'bleed' } as Record<number, string>;

describe('character data', () => {
  it('four playable characters with distinct names and traits on different mechanics; Recruit is neutral', () => {
    const playable = CHARACTERS.slice(0, 4);
    expect(new Set(playable.map((c) => c.name)).size).toBe(4);
    for (const c of playable) { expect(c.asset).not.toBe(Asset.None); expect(c.complication).not.toBe(Complication.None); expect(c.headStart.length).toBeGreaterThan(0); }
    expect(new Set(playable.map((c) => c.asset)).size).toBe(4); expect(new Set(playable.map((c) => c.complication)).size).toBe(4);
    for (const c of playable) expect(ASSET_MECHANIC[c.asset]).toBeDefined(), expect(COMPLICATION_MECHANIC[c.complication]).toBeDefined(), expect(ASSET_MECHANIC[c.asset]).not.toBe(COMPLICATION_MECHANIC[c.complication]);
    const r = CHARACTERS[RECRUIT]!;
    expect(r.name).toBe('Recruit'); expect(r.asset).toBe(Asset.None); expect(r.complication).toBe(Complication.None); expect(r.headStart).toEqual([]);
    expect(DEFAULT_CHARACTERS).toEqual([0, 1, 2, 3]);
  });
  it('trait readers return the neutral value for Recruit and the tuned value for the owner', () => {
    const s = makeState(4, 1, DEFAULT_CHARACTERS), n = makeState(1);
    expect(repairTraitMult(s, 0)).toBe(1.25); expect(repairTraitMult(s, 1)).toBe(1); expect(repairTraitMult(n, 0)).toBe(1);
    expect(speedMult(s, 0)).toBe(0.85); expect(speedMult(s, 3)).toBe(1.2); expect(speedMult(s, 1)).toBe(1); expect(speedMult(n, 0)).toBe(1);
    expect(fireDamageMult(s, 1)).toBe(1.5); expect(fireDamageMult(s, 0)).toBe(1);
    expect(o2DamageMult(s, 2)).toBe(0.5); expect(o2DamageMult(s, 0)).toBe(1);
    expect(xpMult(s, 2)).toBe(0.75); expect(xpMult(s, 0)).toBe(1);
    expect(coolingTraitBonus(s, 1)).toBe(1); expect(coolingTraitBonus(s, 0)).toBe(0);
    expect(bleedoutMult(s, 3)).toBe(0.6); expect(bleedoutMult(s, 0)).toBe(1);
    expect(fireDamageMult(n, 0)).toBe(1); expect(o2DamageMult(n, 0)).toBe(1); expect(xpMult(n, 0)).toBe(1); expect(coolingTraitBonus(n, 0)).toBe(0); expect(bleedoutMult(n, 0)).toBe(1);
    expect(characterOf(n, 0).name).toBe('Recruit');
  });
});

describe('assignment and head starts', () => {
  it('createSimState assigns the default list, falls back to Recruit beyond it, and writes the exact head-start XP matrix', () => {
    const s = createSimState(LAYOUT, 4, 1);
    expect(Array.from(s.crewCharacter)).toEqual([0, 1, 2, 3]);
    const expected = new Float64Array(4 * SKILL_COUNT);
    expected[xpIndex(0, Skill.Repair)] = XP_THRESHOLDS[3]!; expected[xpIndex(1, Skill.Engineering)] = XP_THRESHOLDS[3]!;
    expected[xpIndex(2, Skill.Science)] = XP_THRESHOLDS[2]!; expected[xpIndex(2, Skill.Navigation)] = XP_THRESHOLDS[1]!;     // Reyes: unscaled by Slow Learner
    expected[xpIndex(3, Skill.Weapons)] = XP_THRESHOLDS[3]!;
    expect(Array.from(s.skills.xp)).toEqual(Array.from(expected));
    const short = createSimState(LAYOUT, 3, 1, [2]);
    expect(Array.from(short.crewCharacter)).toEqual([2, RECRUIT, RECRUIT]);
    const neutral = makeState(2);
    expect(Array.from(neutral.crewCharacter)).toEqual([RECRUIT, RECRUIT]); expect(Array.from(neutral.skills.xp).every((v) => v === 0)).toBe(true);
    expect(RECRUITS).toEqual([4, 4, 4, 4]);
  });
  it('crewCharacter round-trips through a snapshot (a non-default assignment, which the loader cannot recreate) and alone changes the hash', () => {
    const s = makeState(2, 5, [3, 2]);
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(Array.from(t.crewCharacter)).toEqual([3, 2]); expect(hashState(t)).toBe(hashState(s));
    const u = makeState(2, 5, [3, 2]); u.crewCharacter[1] = RECRUIT;                                      // only the assignment byte differs: XP was written at creation for [3, 2]
    expect(Array.from(u.skills.xp)).toEqual(Array.from(s.skills.xp)); expect(hashState(u)).not.toBe(hashState(s));
  });
  it('Dubois seated at Weapons runs it at level 3 output', () => {
    const s = createSimState(LAYOUT, 4, 1), wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    sitDown(s, 3, wpn);
    expect(stationOutput(s, wpn)).toBeCloseTo((2 / STATION_MAX[StationKind.Weapons]!) * skillCurve(3));
  });
});

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const xp = (s: ReturnType<typeof makeState>, pid: number, skill: number) => s.skills.xp[xpIndex(pid, skill)]!;
/** Ticks until a repair of time T completes at combined multiplier m, exactly: the first tick whose accumulated progress reaches 1. */
const ticksFor = (T: number, m: number) => Math.ceil(T / (m * DT) - 1e-9);

describe('trait effects', () => {
  it('Quick Hands with Repair 3 repairs a fire and a power failure in 6 / 1.475 s and a breach in 8 / 1.475 s; Lindqvist (Repair 0, no repair trait) adds 1 x; revive is unchanged', () => {
    const m = TRAIT_REPAIR_MULT * repairMult(3);
    expect(m).toBeCloseTo(1.475);
    const fire = makeState(1, 1, DEFAULT_CHARACTERS), G = room(fire, 'G'); fire.spawner.nextSpawnTick = 1e9; igniteRoom(fire, G); teleport(fire, 0, 2.5, 9.5);
    const nF = ticksFor(REPAIR_TIME_FIRE, m);
    run(fire, nF - 2, () => intents({ interactHeld: true })); expect(fire.rooms.fire[G]).toBeGreaterThan(0);
    run(fire, 4, () => intents({ interactHeld: true })); expect(fire.rooms.fire[G]).toBe(0);
    const br = makeState(1, 1, DEFAULT_CHARACTERS); br.spawner.nextSpawnTick = 1e9; activateBreach(br, 6); teleport(br, 0, 2.5, 10.5);
    const nB = ticksFor(REPAIR_TIME_BREACH, m);
    run(br, nB - 2, () => intents({ interactHeld: true })); expect(br.breaches.active[6]).toBe(1);
    run(br, 4, () => intents({ interactHeld: true })); expect(br.breaches.active[6]).toBe(0);
    const pw = makeState(1, 1, DEFAULT_CHARACTERS), eng = idx(pw, StationKind.Engineering); pw.spawner.nextSpawnTick = 1e9; failStation(pw, eng); teleport(pw, 0, 18.5, 9.5);
    const nP = ticksFor(REPAIR_TIME_POWER, m);
    run(pw, nP - 2, () => intents({ interactHeld: true })); expect(pw.stations.failed[eng]).toBe(1);
    run(pw, 4, () => intents({ interactHeld: true })); expect(pw.stations.failed[eng]).toBe(0);
    const two = makeState(2, 1, DEFAULT_CHARACTERS), G2 = room(two, 'G'); two.spawner.nextSpawnTick = 1e9; igniteRoom(two, G2); teleport(two, 0, 2.5, 9.5); teleport(two, 1, 3.5, 9.5);
    run(two, 1, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(two.rooms.fireRepair[G2]).toBeCloseTo(DT * (m + 1) / REPAIR_TIME_FIRE, 12);                   // Okoro's 1.475 plus Lindqvist's 1 (Repair 0, no repair trait)
    const rv = makeState(2, 1, DEFAULT_CHARACTERS); rv.spawner.nextSpawnTick = 1e9;
    Life.state[rv.crew[1]!] = LifeState.Downed; Life.bleed[rv.crew[1]!] = 30; teleport(rv, 0, 2.5, 9.5); teleport(rv, 1, 3.0, 9.5);
    run(rv, seconds(REVIVE_TIME) - 2, () => intents({ interactHeld: true }, {})); expect(Life.state[rv.crew[1]!]).toBe(LifeState.Downed);
    run(rv, 3, () => intents({ interactHeld: true }, {})); expect(Life.state[rv.crew[1]!]).toBe(LifeState.Conscious);
  });
  it('Heavy Boots walks at 0.85 x and Sprinter at 1.2 x CREW_SPEED; a Recruit at 1 x', () => {
    const s = makeState(4, 1, DEFAULT_CHARACTERS);
    for (const pid of [0, 3]) teleport(s, pid, 10, 5.5);                                                   // open corridor floor
    run(s, 60, () => intents({ moveX: 1 }, {}, {}, { moveX: 1 }));
    expect(Position.x[s.crew[0]!]).toBeCloseTo(10 + CREW_SPEED * TRAIT_SLOW_SPEED, 3);
    expect(Position.x[s.crew[3]!]).toBeCloseTo(10 + CREW_SPEED * TRAIT_FAST_SPEED, 3);
    const n = makeState(1); teleport(n, 0, 10, 5.5); run(n, 60, () => intents({ moveX: 1 }));
    expect(Position.x[n.crew[0]!]).toBeCloseTo(10 + CREW_SPEED, 3);
  });
  it('Cool Head adds one cooling per unit on top of the skill term while seated; Okoro adds none', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS), eng = idx(s, StationKind.Engineering);
    s.spawner.nextSpawnTick = 1e9;
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    sitDown(s, 1, eng);                                                                                   // Lindqvist: Engineering 3
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT + 1 + Math.floor(HEAT_COOL_SKILL * 3));
    run(s, 1, () => intents({}, { cancelPressed: true })); sitDown(s, 0, eng);                             // Okoro: Engineering 0, no trait
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
  });
  it('Flammable takes 1.5 x fire damage, Iron Lungs 0.5 x suffocation damage; a debris impact ignores both', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS), G = room(s, 'G');
    s.spawner.nextSpawnTick = 1e9;
    for (const pid of [0, 1, 2]) teleport(s, pid, 2.5, 9.5);
    igniteRoom(s, G);
    run(s, 1);
    expect(HEALTH_MAX - Health.cur[s.crew[0]!]!).toBeCloseTo(FIRE_DAMAGE * DT, 9);
    expect(HEALTH_MAX - Health.cur[s.crew[1]!]!).toBeCloseTo(FIRE_DAMAGE * TRAIT_FIRE_DAMAGE * DT, 9);
    const t = makeState(3, 1, DEFAULT_CHARACTERS), G2 = room(t, 'G');
    t.spawner.nextSpawnTick = 1e9; for (const pid of [0, 1, 2]) teleport(t, pid, 2.5, 9.5);
    t.rooms.o2[G2] = 0; t.doors.state.fill(2);
    run(t, 1);
    expect(HEALTH_MAX - Health.cur[t.crew[0]!]!).toBeCloseTo(O2_DAMAGE * DT, 9);
    expect(HEALTH_MAX - Health.cur[t.crew[2]!]!).toBeCloseTo(O2_DAMAGE * TRAIT_O2_DAMAGE * DT, 9);
    const d = makeState(3, 1, DEFAULT_CHARACTERS), A = room(d, 'A');
    d.spawner.nextSpawnTick = 1e9; teleport(d, 1, 2.5, 2.5); teleport(d, 2, 2.5, 2.5); d.rng.combat.s = 36;
    placeDebris(d, A, 0, 1); debrisSystem(d);                                                             // the impact alone: through step() the fire it may start would add environmental damage this tick
    expect(HEALTH_MAX - Health.cur[d.crew[1]!]!).toBeCloseTo(DEBRIS_CREW_DAMAGE, 9);                      // Lindqvist in the hit room: no fire multiplier on impacts
    expect(HEALTH_MAX - Health.cur[d.crew[2]!]!).toBeCloseTo(DEBRIS_CREW_DAMAGE, 9);                      // Reyes in the hit room: no suffocation multiplier on impacts
  });
  it('Slow Learner scales every XP path by 0.75 while Okoro earns the full amounts', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS);
    addXp(s, 0, Skill.Combat, 100); addXp(s, 2, Skill.Combat, 100);
    expect(xp(s, 0, Skill.Combat)).toBe(100); expect(xp(s, 2, Skill.Combat)).toBe(75);
    const nav = makeState(3, 1, DEFAULT_CHARACTERS), navI = idx(nav, StationKind.Navigation), A = room(nav, 'A');
    nav.spawner.nextSpawnTick = 1e9; sitDown(nav, 2, navI); placeDebris(nav, A, 1e6, 1);
    const before = xp(nav, 2, Skill.Navigation); run(nav, 1);
    expect(xp(nav, 2, Skill.Navigation) - before).toBeCloseTo(TRAIT_XP_MULT * XP_RATE * DT, 12);
    nav.rng.combat.s = 36; placeDebris(nav, A, 0, 1); const b2 = xp(nav, 2, Skill.Navigation); run(nav, 1);
    expect(xp(nav, 2, Skill.Navigation) - b2).toBeCloseTo(TRAIT_XP_MULT * (XP_RATE * DT + XP_PER_EVADE_ROLL), 9);
    const w = makeState(3, 1, DEFAULT_CHARACTERS), wpn = idx(w, StationKind.Weapons);
    w.spawner.nextSpawnTick = 1e9; placeDebris(w, A, 1e6, 1); sitDown(w, 2, wpn); w.weapons.charge = 1; w.weapons.selector = Weapon.BeamF1; w.rng.combat.s = 36;
    run(w, 1, () => intents({}, {}, { confirmPressed: true }));
    expect(xp(w, 2, Skill.Weapons)).toBeCloseTo(TRAIT_XP_MULT * XP_PER_SHOT, 9);
    const ls = makeState(3, 1, DEFAULT_CHARACTERS), lsI = idx(ls, StationKind.LifeSupport);
    ls.spawner.nextSpawnTick = 1e9; ls.rooms.o2[A] = 0; sitDown(ls, 2, lsI);
    run(ls, 1);                                                                                           // hazard tick 0 delivers with Reyes seated
    expect(xp(ls, 2, Skill.Engineering)).toBeCloseTo(TRAIT_XP_MULT * XP_RATE * HAZARD_DT, 9);
    const rp = makeState(3, 1, DEFAULT_CHARACTERS), G = room(rp, 'G');
    rp.spawner.nextSpawnTick = 1e9; igniteRoom(rp, G); teleport(rp, 2, 2.5, 9.5);
    run(rp, 1, () => intents({}, {}, { interactHeld: true }));
    expect(xp(rp, 2, Skill.Repair)).toBeCloseTo(TRAIT_XP_MULT * XP_RATE * DT, 12);
  });
  it('Frail bleeds out from 18 s and dies in 18 s on clean floor or 9 s in fire or low oxygen; Okoro starts at 30 s', () => {
    const mk = () => { const s = makeState(4, 1, DEFAULT_CHARACTERS); s.spawner.nextSpawnTick = 1e9; teleport(s, 0, 20.5, 5.5); teleport(s, 1, 20.5, 5.5); teleport(s, 2, 20.5, 5.5); teleport(s, 3, 2.5, 9.5); return s; };
    const a = mk(); downCrew(a, 3); downCrew(a, 0);
    expect(Life.bleed[a.crew[3]!]).toBeCloseTo(BLEEDOUT_TIME * TRAIT_BLEEDOUT); expect(Life.bleed[a.crew[0]!]).toBe(BLEEDOUT_TIME);
    reviveCrew(a, a.crew[0]!);
    run(a, seconds(BLEEDOUT_TIME * TRAIT_BLEEDOUT) - 1); expect(Life.state[a.crew[3]!]).toBe(LifeState.Downed);
    run(a, 2); expect(Life.state[a.crew[3]!]).toBe(LifeState.Dead); expect(a.ended).toBe(0);
    const b = mk(); downCrew(b, 3); igniteRoom(b, room(b, 'G'));
    run(b, seconds(BLEEDOUT_TIME * TRAIT_BLEEDOUT / 2) - 1); expect(Life.state[b.crew[3]!]).toBe(LifeState.Downed);
    run(b, 2); expect(Life.state[b.crew[3]!]).toBe(LifeState.Dead);
    const c = mk(); downCrew(c, 3); c.rooms.o2[room(c, 'G')] = 0; c.doors.state.fill(2); c.stations.level[idx(c, StationKind.LifeSupport)] = 0;   // Life Support off, or injection refills G within nine seconds
    run(c, seconds(BLEEDOUT_TIME * TRAIT_BLEEDOUT / 2) - 1); expect(Life.state[c.crew[3]!]).toBe(LifeState.Downed);
    run(c, 2); expect(Life.state[c.crew[3]!]).toBe(LifeState.Dead);
  });
});

describe('determinism with the four characters', () => {
  it('two runs and a snapshot round-trip at tick 300 agree after 600 ticks', () => {
    const f = () => intents({ moveX: 1 }, { moveY: 1 }, { interactHeld: true }, {});
    const a = makeState(4, 11, DEFAULT_CHARACTERS), b = makeState(4, 11, DEFAULT_CHARACTERS), c = makeState(4, 11, DEFAULT_CHARACTERS);
    run(a, 600, f); run(b, 600, f);
    run(c, 300, f);
    const c2 = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(c))));
    run(c2, 300, f);
    expect(hashState(b)).toBe(hashState(a)); expect(hashState(c2)).toBe(hashState(a));
  });
});
