import { describe, it, expect } from 'vitest';
import { boarderSystem, damageBoarder, boarderTarget, boardersInRoom, activeBoarderCount, combatDps, combatDefence, roomCentre, boarderMarkers, ALONE_IDLE, ALONE_SABOTAGED } from '../src/renderer/src/sim/boarders';
import { interactTarget, TargetKind } from '../src/renderer/src/sim/interact';
import { rawStress, anyUnattended, activeHazardCount } from '../src/renderer/src/sim/director';
import { botIntent } from '../src/renderer/src/sim/bot';
import { sitDown } from '../src/renderer/src/sim/stations';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { failStation, repairStation } from '../src/renderer/src/sim/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { downCrew, EndReason } from '../src/renderer/src/sim/crew';
import { DoorState } from '../src/renderer/src/sim/grid';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Health, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { Skill, xpIndex } from '../src/renderer/src/sim/skills';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, DT, BOARDING_FIRST, BOARDING_COOLDOWN, BOARDING_JITTER, BOARDING_PARTY, BOARDER_HEALTH, BOARDER_DPS, CREW_MELEE_DPS, COMBAT_GAIN, COMBAT_DEFENCE, BOARDER_MOVE, BOARDER_SABOTAGE, XP_PER_KILL, XP_RATE, HEALTH_MAX, MEDBAY_HEAL, STRESS_WEIGHTS, BOARDER_SLOTS, TRAIT_XP_MULT } from '../src/renderer/src/sim/tuning';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { makeState, run, quiet, placeBoarder, room, intents, teleport, setSkill } from './helpers/sim';

const T = TICK_HZ;
const hold = { interactHeld: true };
/** No director spawns, no enemy, no scheduled boarding: only what the fixture places. */
function calm(players = 1, seed = 1, characters?: readonly number[]) {
  const s = makeState(players, seed, characters); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; return s;
}
const streams = (s: ReturnType<typeof makeState>): [number, number, number] => [s.rng.director.s, s.rng.hazards.s, s.rng.combat.s];
const sealAllBut = (s: ReturnType<typeof makeState>, keep: number[]) => { for (let e = 0; e < s.doors.state.length; e++) if (s.derived.edgeIsDoor[e] && !keep.includes(e)) s.doors.state[e] = DoorState.Sealed; };

describe('boarders: initial values, helpers', () => {
  it('a fresh state has no boarders, the first boarding armed, zero counters', () => {
    const s = makeState(2), b = s.boarders;
    expect(Array.from(b.active)).toEqual([0, 0, 0, 0]); expect(Array.from(b.aloneSince)).toEqual([-1, -1, -1, -1]); expect(b.nextArrivalTick).toBe(BOARDING_FIRST * T);
    expect([s.telemetry.boardings, s.telemetry.boardersKilled]).toEqual([0, 0]); expect(activeBoarderCount(s)).toBe(0);
    expect(combatDps(0)).toBe(CREW_MELEE_DPS); expect(combatDps(10)).toBeCloseTo(CREW_MELEE_DPS * 1.6, 12); expect(combatDefence(10)).toBeCloseTo(0.4, 12);
  });
  it('roomCentre and boarderMarkers on the starter ship: A is (3, 2.5), slots 0 and 1 in A sit at x 2.4 and 2.8', () => {
    const s = calm(); const A = room(s, 'A'), G = room(s, 'G');
    expect(roomCentre(s, A)).toEqual([3, 2.5]); expect(roomCentre(s, G)).toEqual([4, 9.5]);
    expect(boarderMarkers(s)).toEqual([]);
    const k0 = placeBoarder(s, A), k1 = placeBoarder(s, A, 30);
    expect(boarderMarkers(s)).toEqual([{ stableId: s.boarders.stableId[k0], x: 2.4, y: 2.5, health: 1 }, { stableId: s.boarders.stableId[k1], x: 2.8, y: 2.5, health: 30 / BOARDER_HEALTH }]);
  });
});

describe('boarders: arrival (boarderSystem called directly)', () => {
  it('arrives exactly at BOARDING_FIRST with one hazards draw: two boarders in the drawn room with consecutive ids; no arrival while any boarder is aboard; the last kill arms the cooldown and a second party arrives', () => {
    const s = makeState(2); quiet(s); s.enemy.nextArrivalTick = 1e9;
    s.tick = BOARDING_FIRST * T - 1; boarderSystem(s); expect(activeBoarderCount(s)).toBe(0);
    s.tick = BOARDING_FIRST * T; s.rng.hazards.s = 7; const d0 = s.rng.director.s, id = s.nextStableId;
    const hz = createRng(7), rm = nextInt(hz, s.derived.volume.length);
    boarderSystem(s);
    const b = s.boarders;
    expect(Array.from(b.active)).toEqual([1, 1, 0, 0]); expect([b.room[0], b.room[1]]).toEqual([rm, rm]); expect([b.stableId[0], b.stableId[1]]).toEqual([id, id + 1]);
    expect([b.health[0], b.health[1]]).toEqual([BOARDER_HEALTH, BOARDER_HEALTH]); expect([b.nextMoveTick[0], b.nextMoveTick[1]]).toEqual([s.tick + BOARDER_MOVE * T, s.tick + BOARDER_MOVE * T]);
    expect(s.telemetry.boardings).toBe(1); expect(s.rng.hazards.s).toBe(hz.s); expect(s.rng.director.s).toBe(d0); expect(b.nextArrivalTick).toBe(BOARDING_FIRST * T);
    s.tick += 1; boarderSystem(s); expect(activeBoarderCount(s)).toBe(2);                         // no second party while one is aboard
    s.rng.director.s = 7; const dr = createRng(7), u = nextFloat(dr);
    damageBoarder(s, 0, BOARDER_HEALTH, 0); expect(s.rng.director.s).toBe(7);                      // not the last one: no draw
    damageBoarder(s, 1, BOARDER_HEALTH, 0);
    expect(activeBoarderCount(s)).toBe(0); expect(s.telemetry.boardersKilled).toBe(2); expect(s.rng.director.s).toBe(dr.s);
    expect(b.nextArrivalTick).toBe(s.tick + Math.round(BOARDING_COOLDOWN * T * (1 + BOARDING_JITTER * (2 * u - 1))));
    s.tick = b.nextArrivalTick; boarderSystem(s);
    expect(activeBoarderCount(s)).toBe(2); expect(s.telemetry.boardings).toBe(2); expect(b.stableId[0]).toBeGreaterThan(id + 1);
  });
  it('a party landing in a room with crew attacks on the arrival tick; landing in an empty room starts the clock on the arrival tick', () => {
    const s = makeState(1); quiet(s); s.enemy.nextArrivalTick = 1e9; const A = room(s, 'A'); teleport(s, 0, 2.5, 2.5);
    // find a hazards state whose room draw is A
    let seed = 1; while (nextInt(createRng(seed), s.derived.volume.length) !== A) seed++;
    s.tick = BOARDING_FIRST * T; s.rng.hazards.s = seed; boarderSystem(s);
    expect(s.boarders.room[0]).toBe(A); expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - 2 * BOARDER_DPS * DT, 9);   // both boarders struck
    const e = makeState(1); quiet(e); e.enemy.nextArrivalTick = 1e9; teleport(e, 0, 2.5, 9.5);   // crew in G, party lands in A
    e.tick = BOARDING_FIRST * T; e.rng.hazards.s = seed; boarderSystem(e);
    expect(e.boarders.aloneSince[0]).toBe(e.tick);                                                // A has an online console: the clock runs from the arrival tick
  });
});

describe('boarders: melee (through step)', () => {
  it('a Recruit kills a boarder on the 450th blow, takes 44.9 (none on the killing tick) and earns 27.5 Combat XP; idle crew only bleed', () => {
    const s = calm(); const G = room(s, 'G'); teleport(s, 0, 2.5, 9.5); const k = placeBoarder(s, G);
    const blows = Math.ceil(BOARDER_HEALTH / (CREW_MELEE_DPS * DT) - 1e-9);                       // 450
    run(s, blows - 1, () => intents(hold));
    expect(s.boarders.active[k]).toBe(1); expect(s.boarders.health[k]).toBeCloseTo(BOARDER_HEALTH - (blows - 1) * CREW_MELEE_DPS * DT, 6);
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - (blows - 1) * BOARDER_DPS * DT, 6);
    run(s, 1, () => intents(hold));
    expect(s.boarders.active[k]).toBe(0); expect(s.boarders.stableId[k]).toBe(0); expect(s.telemetry.boardersKilled).toBe(1);
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - (blows - 1) * BOARDER_DPS * DT, 6);    // no damage on the killing tick
    expect(s.skills.xp[xpIndex(0, Skill.Combat)]).toBeCloseTo(blows * XP_RATE * DT + XP_PER_KILL, 6);
    const idle = calm(); teleport(idle, 0, 2.5, 9.5); const k2 = placeBoarder(idle, room(idle, 'G'));
    run(idle, 60);
    expect(Health.cur[idle.crew[0]!]).toBeCloseTo(HEALTH_MAX - 60 * BOARDER_DPS * DT, 6); expect(idle.boarders.health[k2]).toBe(BOARDER_HEALTH);
  });
  it('two fighters kill on the 225th blow; only the lowest pid is struck; level 10 deals 12.8 per second and takes 60 %; a Slow Learner earns 0.75 of both XP paths', () => {
    const s = calm(2); const G = room(s, 'G'); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5); const k = placeBoarder(s, G);
    const blows = Math.ceil(BOARDER_HEALTH / (2 * CREW_MELEE_DPS * DT) - 1e-9);                   // 225
    run(s, blows, () => intents(hold, hold));
    expect(s.boarders.active[k]).toBe(0); expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - (blows - 1) * BOARDER_DPS * DT, 6); expect(Health.cur[s.crew[1]!]).toBe(HEALTH_MAX);
    const ten = calm(); teleport(ten, 0, 2.5, 9.5); setSkill(ten, 0, Skill.Combat, 10); const k3 = placeBoarder(ten, room(ten, 'G'));
    run(ten, 1, () => intents(hold));
    expect(ten.boarders.health[k3]).toBeCloseTo(BOARDER_HEALTH - combatDps(10) * DT, 9); expect(Health.cur[ten.crew[0]!]).toBeCloseTo(HEALTH_MAX - BOARDER_DPS * DT * (1 - combatDefence(10)), 9);
    run(ten, 280, () => intents(hold)); expect(ten.boarders.active[k3]).toBe(1);                   // 281 blows landed, still alive
    run(ten, 1, () => intents(hold)); expect(ten.boarders.active[k3]).toBe(0); expect(Health.cur[ten.crew[0]!]).toBeCloseTo(HEALTH_MAX - 281 * BOARDER_DPS * DT * (1 - 10 * COMBAT_DEFENCE), 9);   // none on the killing tick
    const slow = calm(1, 1, [2]); teleport(slow, 0, 2.5, 9.5); placeBoarder(slow, room(slow, 'G'));   // Reyes: Slow Learner
    const soloBlows = Math.ceil(BOARDER_HEALTH / (CREW_MELEE_DPS * DT) - 1e-9);                   // derived, so a tuning lever does not break it
    run(slow, soloBlows, () => intents(hold));
    expect(slow.telemetry.boardersKilled).toBe(1); expect(slow.skills.xp[xpIndex(0, Skill.Combat)]).toBeCloseTo(TRAIT_XP_MULT * (soloBlows * XP_RATE * DT + XP_PER_KILL), 6);
  });
  it('the Fight target is the boarder with the lowest StableId (not the lowest slot) and outranks Revive; later holders skip a boarder killed this tick; fighting draws nothing', () => {
    const s = calm(2); const G = room(s, 'G'); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5);
    const k0 = placeBoarder(s, G), k1 = placeBoarder(s, G); const a = s.boarders.stableId[k0]!, b = s.boarders.stableId[k1]!;
    s.boarders.stableId[k0] = b; s.boarders.stableId[k1] = a;                                     // slot 1 now holds the lower id
    expect(boarderTarget(s, 0)).toBe(k1); expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Fight, index: k1 });
    downCrew(s, 1); expect(interactTarget(s, 0).kind).toBe(TargetKind.Fight);                     // a Downed teammate in reach does not outrank the fight
    damageBoarder(s, k0, 1000, 0); damageBoarder(s, k1, 1000, 0); expect(interactTarget(s, 0).kind).toBe(TargetKind.Revive);
    const two = calm(2); teleport(two, 0, 2.5, 9.5); teleport(two, 1, 3.5, 9.5); const kk = placeBoarder(two, room(two, 'G'), CREW_MELEE_DPS * DT - 1e-6);   // one blow from pid 0 kills it
    const [d0, h0, c0] = streams(two); const dr = createRng(d0); nextFloat(dr);
    run(two, 1, () => intents(hold, hold));
    expect(two.boarders.active[kk]).toBe(0); expect(two.telemetry.boardersKilled).toBe(1);
    expect(two.skills.xp[xpIndex(0, Skill.Combat)]).toBeCloseTo(XP_RATE * DT + XP_PER_KILL, 9); expect(two.skills.xp[xpIndex(1, Skill.Combat)]).toBe(0); expect(two.scratch.activeThisTick[1]).toBe(0); expect(two.scratch.activeThisTick[0]).toBe(1);
    expect(streams(two)).toEqual([dr.s, h0, c0]);                                                 // the last kill draws the cooldown once; hazards and combat untouched
    const long = calm(2); teleport(long, 0, 2.5, 9.5); teleport(long, 1, 3.5, 9.5); placeBoarder(long, room(long, 'G')); const b0 = streams(long);
    run(long, 100, () => intents(hold, hold)); expect(streams(long)).toEqual(b0);
  });
  it('a seated crew member is struck but has no Fight target and is not stood up; a lethal blow downs at once and the focus moves next tick; the last Conscious ends the run', () => {
    const s = calm(1); const n = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, n); placeBoarder(s, room(s, 'A'));
    run(s, 1);
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - BOARDER_DPS * DT, 9); expect(interactTarget(s, 0).kind).toBe(TargetKind.None); expect(Seated.station[s.crew[0]!]).toBe(n);
    const two = calm(2); teleport(two, 0, 2.5, 9.5); teleport(two, 1, 3.5, 9.5); Health.cur[two.crew[0]!] = 0.05; placeBoarder(two, room(two, 'G'));
    run(two, 1);
    expect(Life.state[two.crew[0]!]).toBe(LifeState.Downed); expect(Life.bleed[two.crew[0]!]).toBeGreaterThan(0); expect(Health.cur[two.crew[1]!]).toBe(HEALTH_MAX);
    run(two, 1); expect(Health.cur[two.crew[1]!]).toBeCloseTo(HEALTH_MAX - BOARDER_DPS * DT, 9);
    const duo = calm(2); teleport(duo, 0, 2.5, 9.5); teleport(duo, 1, 3.5, 9.5); Health.cur[duo.crew[0]!] = 0.05; placeBoarder(duo, room(duo, 'G')); placeBoarder(duo, room(duo, 'G'));
    run(duo, 1); expect(Life.state[duo.crew[0]!]).toBe(LifeState.Downed); expect(Health.cur[duo.crew[1]!]).toBeCloseTo(HEALTH_MAX - BOARDER_DPS * DT, 9);   // the second boarder retargets the same tick
    const solo = calm(1); teleport(solo, 0, 2.5, 9.5); Health.cur[solo.crew[0]!] = 0.05; placeBoarder(solo, room(solo, 'G'));
    run(solo, 1); expect(solo.ended).toBe(1); expect(solo.endReason).toBe(EndReason.Crew);
  });
  it('Medbay ordering: the survivor heals the same tick as the blow; boarders are immune to fire and never healed; a Downed crew member alone is ignored', () => {
    const s = calm(1); const F = room(s, 'F'), mb = s.derived.stationOfKind[StationKind.Medbay]!; teleport(s, 0, 17.5, 3.5); placeBoarder(s, F);
    run(s, 1, () => intents(hold));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - BOARDER_DPS * DT + MEDBAY_HEAL * stationOutput(s, mb) * DT, 9);
    const fire = calm(1); const G = room(fire, 'G'); igniteRoom(fire, G); const k = placeBoarder(fire, G); run(fire, 120); expect(fire.boarders.health[k]).toBe(BOARDER_HEALTH);
    const heal = calm(1); const k2 = placeBoarder(heal, room(heal, 'F'), 30); run(heal, 120); expect(heal.boarders.health[k2]).toBe(30);
    const down = calm(1); teleport(down, 0, 2.5, 9.5); downCrew(down, 0); Life.bleed[down.crew[0]!] = 1e9; const k3 = placeBoarder(down, room(down, 'G'));
    const h0 = Health.cur[down.crew[0]!]; const due = down.boarders.nextMoveTick[k3]!;
    while (down.tick <= due) { boarderSystem(down); down.tick++; }                                  // processes the due tick itself
    expect(Health.cur[down.crew[0]!]).toBe(h0); expect(down.boarders.room[k3]).toBe(room(down, 'I'));   // ignored, then it moved on to I, G's only neighbour
  });
});

describe('boarders: movement (boarderSystem at chosen ticks)', () => {
  it('pursuit: alone in A with crew in I it moves to I exactly at nextMoveTick with no draw; random: in I with only A and B unsealed it draws once', () => {
    const s = calm(1); const A = room(s, 'A'), I = room(s, 'I'); teleport(s, 0, 2.5, 5.5); const k = placeBoarder(s, A);
    const due = s.boarders.nextMoveTick[k]!, h0 = s.rng.hazards.s;
    s.tick = due - 1; boarderSystem(s); expect(s.boarders.room[k]).toBe(A);
    s.tick = due; boarderSystem(s); expect(s.boarders.room[k]).toBe(I); expect(s.rng.hazards.s).toBe(h0); expect(s.boarders.nextMoveTick[k]).toBe(due + BOARDER_MOVE * T);
    const r = calm(1); const I2 = room(r, 'I'), A2 = room(r, 'A'), B2 = room(r, 'B'); teleport(r, 0, 17.5, 3.5);   // crew far away in F, whose door is sealed below
    sealAllBut(r, [0, 1]);                                                                         // only A-I and B-I unsealed
    const k2 = placeBoarder(r, I2); r.tick = r.boarders.nextMoveTick[k2]!; r.rng.hazards.s = 7; const hz = createRng(7), pick = nextInt(hz, 2);
    boarderSystem(r);
    expect(r.boarders.room[k2]).toBe([A2, B2][pick]); expect(r.rng.hazards.s).toBe(hz.s); expect(r.boarders.aloneSince[k2]).toBe(ALONE_IDLE);
    const m = calm(2); teleport(m, 0, 7.5, 2.5); teleport(m, 1, 2.5, 2.5);                          // crew in B and A: both adjacent to I
    const k3 = placeBoarder(m, room(m, 'I')); m.tick = m.boarders.nextMoveTick[k3]!; const hm = m.rng.hazards.s; boarderSystem(m);
    expect(m.boarders.room[k3]).toBe(room(m, 'A')); expect(m.rng.hazards.s).toBe(hm);             // the lowest room index among the occupied candidates, no draw
  });
  it('contained: with its only door Sealed it stays and draws nothing while the clock advances; a closed door is passable; crew in the room keep it there', () => {
    const s = calm(1); const A = room(s, 'A'); teleport(s, 0, 2.5, 9.5); s.doors.state[0] = DoorState.Sealed; const k = placeBoarder(s, A);
    const due = s.boarders.nextMoveTick[k]!, h0 = s.rng.hazards.s; s.tick = due; boarderSystem(s);
    expect(s.boarders.room[k]).toBe(A); expect(s.rng.hazards.s).toBe(h0); expect(s.boarders.nextMoveTick[k]).toBe(due + BOARDER_MOVE * T);
    const c = calm(1); teleport(c, 0, 2.5, 5.5); c.doors.state[0] = DoorState.Closed; const k2 = placeBoarder(c, room(c, 'A')); c.tick = c.boarders.nextMoveTick[k2]!; boarderSystem(c); expect(c.boarders.room[k2]).toBe(room(c, 'I'));
    const f = calm(1); teleport(f, 0, 2.5, 2.5); const k3 = placeBoarder(f, room(f, 'A')); const due3 = f.boarders.nextMoveTick[k3]!;
    f.tick = due3 + 50; boarderSystem(f); expect(f.boarders.room[k3]).toBe(room(f, 'A')); expect(f.boarders.nextMoveTick[k3]).toBe(f.tick + BOARDER_MOVE * T);
  });
});

describe('boarders: sabotage (A sealed, crew elsewhere)', () => {
  const setup = () => { const s = calm(1); teleport(s, 0, 2.5, 9.5); s.doors.state[0] = DoorState.Sealed; const k = placeBoarder(s, room(s, 'A')); return { s, k }; };
  it('the lowest online console in A fails at exactly aloneSince + 900, once per visit; the clock needs an online console', () => {
    const { s, k } = setup(); boarderSystem(s); const start = s.boarders.aloneSince[k]!; expect(start).toBe(s.tick);
    s.tick = start + BOARDER_SABOTAGE * T - 1; boarderSystem(s); expect(s.stations.failed[0]).toBe(0);
    s.tick += 1; boarderSystem(s); expect(s.stations.failed[0]).toBe(1); expect(s.stations.failed[1]).toBe(0); expect(s.boarders.aloneSince[k]).toBe(ALONE_SABOTAGED);
    for (let n = 0; n < 60 * T; n++) { s.tick++; boarderSystem(s); } expect(s.stations.failed[1]).toBe(0);
    const d = setup(); failStation(d.s, 0); boarderSystem(d.s); d.s.tick += BOARDER_SABOTAGE * T; boarderSystem(d.s); expect(d.s.stations.failed[1]).toBe(1);   // Doors is the lowest online
    const none = setup(); failStation(none.s, 0); failStation(none.s, 1); for (let n = 0; n < 20 * T; n++) { none.s.tick++; boarderSystem(none.s); } expect(none.s.boarders.aloneSince[none.k]).toBe(ALONE_IDLE);
    const flick = setup(); boarderSystem(flick.s); flick.s.tick += 300; boarderSystem(flick.s); expect(flick.s.boarders.aloneSince[flick.k]).toBeGreaterThanOrEqual(0);
    failStation(flick.s, 0); failStation(flick.s, 1); flick.s.tick += 1; boarderSystem(flick.s); expect(flick.s.boarders.aloneSince[flick.k]).toBe(ALONE_IDLE);   // every console offline: the running clock resets
    repairStation(flick.s, 0); flick.s.stations.level[0] = 1; flick.s.tick += 1; boarderSystem(flick.s); expect(flick.s.boarders.aloneSince[flick.k]).toBe(flick.s.tick);                       // repaired and re-allocated one bar (repairStation alone returns a station at level 0, still offline): online again: restarts from now
  });
  it('crew entering resets a running clock, leaving restarts it; -2 survives a visit; moving out and back allows another sabotage', () => {
    const { s, k } = setup(); boarderSystem(s); s.tick += 300; boarderSystem(s); expect(s.boarders.aloneSince[k]).toBeGreaterThanOrEqual(0);
    teleport(s, 0, 2.5, 2.5); boarderSystem(s); expect(s.boarders.aloneSince[k]).toBe(ALONE_IDLE);
    teleport(s, 0, 2.5, 9.5); s.tick += 1; boarderSystem(s); expect(s.boarders.aloneSince[k]).toBe(s.tick);
    s.boarders.aloneSince[k] = ALONE_SABOTAGED; teleport(s, 0, 2.5, 2.5); boarderSystem(s); teleport(s, 0, 2.5, 9.5); boarderSystem(s); expect(s.boarders.aloneSince[k]).toBe(ALONE_SABOTAGED);
    s.doors.state[0] = DoorState.Open; teleport(s, 0, 2.5, 5.5); s.tick = s.boarders.nextMoveTick[k]!; boarderSystem(s); expect(s.boarders.room[k]).toBe(room(s, 'I')); expect(s.boarders.aloneSince[k]).toBe(ALONE_IDLE);
    teleport(s, 0, 2.5, 9.5); sealAllBut(s, [0]);                                          // crew to G, only the I-A door unsealed
    s.tick = s.boarders.nextMoveTick[k]!; boarderSystem(s); expect(s.boarders.room[k]).toBe(room(s, 'A')); expect(s.boarders.aloneSince[k]).toBe(ALONE_IDLE);   // moving does not start the clock
    s.doors.state[0] = DoorState.Sealed; s.tick += 1; boarderSystem(s); const again = s.boarders.aloneSince[k]!; expect(again).toBe(s.tick);
    s.tick = again + BOARDER_SABOTAGE * T; boarderSystem(s); expect(s.stations.failed[0]).toBe(1); expect(s.boarders.aloneSince[k]).toBe(ALONE_SABOTAGED);   // a new visit sabotages again
  });
});

describe('boarders: director and bot', () => {
  it('two boarders alone give rawStress 0.70; a boarder in an empty room is unattended; the hazard count ignores boarders', () => {
    const s = calm(1); teleport(s, 0, 2.5, 9.5); placeBoarder(s, room(s, 'A')); placeBoarder(s, room(s, 'A'));
    expect(rawStress(s)).toBeCloseTo(2 * STRESS_WEIGHTS.boarder, 12); expect(anyUnattended(s)).toBe(true); expect(activeHazardCount(s)).toBe(0);
    teleport(s, 0, 2.5, 2.5); expect(anyUnattended(s)).toBe(false);
  });
  it('the bot walks toward a boarder room (first step toward the door), fights in the room, revives first, repairs its own room first, and ignores a fire elsewhere while boarders are aboard', () => {
    const s = calm(1); teleport(s, 0, 2.5, 2.5); placeBoarder(s, room(s, 'G'));
    const i = botIntent(s, 0); expect(i.moveY).toBeGreaterThan(0); expect(i.interactHeld).toBe(false);                   // toward A's door at (2,4): down
    teleport(s, 0, 2.5, 9.5); expect(botIntent(s, 0).interactHeld).toBe(true);
    const r = calm(2); teleport(r, 0, 2.5, 2.5); teleport(r, 1, 3.5, 2.5); downCrew(r, 1); placeBoarder(r, room(r, 'G')); expect(botIntent(r, 0).interactHeld).toBe(true);
    const f = calm(1); teleport(f, 0, 2.5, 2.5); igniteRoom(f, room(f, 'A')); placeBoarder(f, room(f, 'G')); expect(botIntent(f, 0).interactHeld).toBe(true);
    const g = calm(1); teleport(g, 0, 2.5, 5.5); igniteRoom(g, room(g, 'B')); placeBoarder(g, room(g, 'G'));
    const sl = calm(1); teleport(sl, 0, 2.5, 5.5); sl.doors.state[0] = DoorState.Sealed; placeBoarder(sl, room(sl, 'A')); igniteRoom(sl, room(sl, 'B'));
    const si = botIntent(sl, 0); expect(si.moveX).toBeGreaterThan(0); expect(si.moveY).toBeCloseTo(0, 9);                                         // boarder room sealed off: falls through to the fire in B
    const gi = botIntent(g, 0); expect(gi.moveY).toBeGreaterThan(0); expect(Math.abs(gi.moveX)).toBeLessThan(0.01);         // from I toward G's door at (2,7), not B's at (7,4)
  });
});

describe('combat gate: two Recruits clear a party of two in room G', () => {
  it('both boarders dead by the second kill tick, both crew Conscious, the focused crew member at the derived health', () => {
    const s = calm(2); const G = room(s, 'G'); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5); placeBoarder(s, G); placeBoarder(s, G);
    const pair = Math.ceil(BOARDER_HEALTH / (2 * CREW_MELEE_DPS * DT) - 1e-9);                       // ticks to kill one boarder with two fighters (225 first pass)
    run(s, 2 * pair, () => intents(hold, hold));
    expect(s.telemetry.boardersKilled).toBe(2); expect(activeBoarderCount(s)).toBe(0);
    expect(Life.state[s.crew[0]!]).toBe(LifeState.Conscious); expect(Life.state[s.crew[1]!]).toBe(LifeState.Conscious);
    // pid 0 takes both boarders for pair - 1 ticks, one boarder on the first kill tick, one for pair - 1 more ticks, none on the second kill tick: (3 pair - 2) hits.
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - (3 * pair - 2) * BOARDER_DPS * DT, 6);   // 32.7 with the first-pass values
    expect(Health.cur[s.crew[1]!]).toBe(HEALTH_MAX);
  });
});
