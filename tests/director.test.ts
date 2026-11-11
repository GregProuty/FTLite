import { describe, it, expect } from 'vitest';
import { Phase, HazardType, activeHazardCount, spawnInterval, spawnCap, cycleBudget, rawStress, anyUnattended, updateStress, typeWeights, chooseType, phaseStep, directorSystem } from '../src/renderer/src/sim/director';
import { burningRoomCount, igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activeBreachCount, activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { failedStationCount, sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { activeDebrisCount } from '../src/renderer/src/sim/debris';
import { Seated, Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { createSimState } from '../src/renderer/src/sim/state';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { ShipLayout } from '../src/renderer/src/sim/ship/schema';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { createRng, nextFloat } from '../src/shared/rng';
import { TICK_HZ, SPAWN_FIRST, SPAWN_INTERVAL, SPAWN_JITTER, SPAWN_CAP, SPAWN_INTERVAL_MIN, SPAWN_CAP_MAX, STRESS_WEIGHTS, STRESS_PERIOD, PEAK_LEVEL, RELAX_LEVEL, SUSTAIN_SECONDS, FADE_TIMEOUT, RELAX_MIN, RELAX_MAX, STALL_SECONDS, SINCE_CAP, HULL_MAX, HEALTH_MAX, PRODUCTIVE_WINDOW_TICKS, HAZARD_EVERY } from '../src/renderer/src/sim/tuning';
import { botIntent } from './helpers/bot';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { step } from '../src/renderer/src/sim/step';
import { roomAt } from '../src/renderer/src/sim/grid';
import { makeState, run, intents, seconds, placeDebris, teleport, room, quiet, armSpawn } from './helpers/sim';

/** The starter layout minus its Doors console (a synthetic layout that bypasses the seven-station schema rule, for the missing-console fixtures). */
const withoutDoors = (): ShipLayout => { const base = parseShip(starter); return { ...base, stations: base.stations.filter((st) => st.id !== 'doors') }; };

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const T = TICK_HZ;

describe('escalation helpers', () => {
  it('spawnInterval shrinks with minutes, floors at 10 s from minute 20, and is 1.5 x for a solo crew', () => {
    expect(spawnInterval(0, 2)).toBe(30); expect(spawnInterval(5, 2)).toBeCloseTo(20); expect(spawnInterval(10, 2)).toBeCloseTo(15);
    expect(spawnInterval(20, 2)).toBe(SPAWN_INTERVAL_MIN); expect(spawnInterval(30, 2)).toBe(SPAWN_INTERVAL_MIN);   // 30 / 4 = 7.5 would be below the floor
    expect(spawnInterval(0, 1)).toBe(45); expect(spawnInterval(0, 4)).toBe(30);
  });
  it('spawnCap grows every 4 minutes to 6, adds one at 4 players and drops one for a solo crew, never below 1', () => {
    expect(spawnCap(0, 2)).toBe(SPAWN_CAP); expect(spawnCap(4, 2)).toBe(4); expect(spawnCap(8, 2)).toBe(5); expect(spawnCap(40, 2)).toBe(SPAWN_CAP_MAX);
    expect(spawnCap(0, 3)).toBe(3); expect(spawnCap(0, 4)).toBe(4); expect(spawnCap(40, 4)).toBe(SPAWN_CAP_MAX);
    expect(spawnCap(0, 1)).toBe(2); expect(spawnCap(0, 0)).toBe(3);
  });
  it('cycleBudget scales with minutes and players', () => {
    expect(cycleBudget(0, 1)).toBe(1); expect(cycleBudget(0, 2)).toBe(3); expect(cycleBudget(0, 3)).toBe(4); expect(cycleBudget(0, 4)).toBe(6);
    expect(cycleBudget(4, 1)).toBe(2); expect(cycleBudget(4, 2)).toBe(5); expect(cycleBudget(4, 3)).toBe(7); expect(cycleBudget(4, 4)).toBe(10);
  });
  it('typeWeights: base [4,2,2,4], demanding types grow every 4 minutes, the last type is halved to a minimum of 1', () => {
    const s = makeState(2);
    expect(typeWeights(s)).toEqual([4, 2, 2, 4]);
    s.tick = 4 * 60 * T; expect(typeWeights(s)).toEqual([4, 2, 4, 6]);
    s.tick = 10 * 60 * T; expect(typeWeights(s)).toEqual([4, 2, 6, 8]);
    s.tick = 0; s.director.lastType = HazardType.Fire; expect(typeWeights(s)).toEqual([2, 2, 2, 4]);
    s.director.lastType = HazardType.Breach; expect(typeWeights(s)).toEqual([4, 1, 2, 4]);
  });
  it('chooseType maps a unit roll onto the weight intervals in type order', () => {
    const w = [4, 2, 2, 4];
    for (const u of [0, 0.1, 0.333]) expect(chooseType(w, u)).toBe(HazardType.Fire);
    for (const u of [0.334, 0.4, 0.499]) expect(chooseType(w, u)).toBe(HazardType.Breach);
    for (const u of [0.5, 0.6, 0.666]) expect(chooseType(w, u)).toBe(HazardType.Power);
    for (const u of [0.667, 0.9, 0.999]) expect(chooseType(w, u)).toBe(HazardType.Debris);
    expect(chooseType([0, 0, 0, 5], 0.2)).toBe(HazardType.Debris);
  });
});

describe('stress', () => {
  it('each contribution alone, then the clamp at 1', () => {
    const s = makeState(2); quiet(s);
    expect(rawStress(s)).toBe(0);
    igniteRoom(s, room(s, 'G')); expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.fire); s.rooms.fire.fill(0);
    activateBreach(s, 0); expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.breach); s.breaches.active.fill(0);
    failStation(s, idx(s, StationKind.Doors)); expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.power); s.stations.failed.fill(0);
    placeDebris(s, room(s, 'A'), 600); expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.debris); s.debris.active.fill(0);
    Life.state[s.crew[1]!] = LifeState.Downed; expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.downed); Life.state[s.crew[1]!] = LifeState.Conscious;
    for (let r = 0; r < s.rooms.fire.length; r++) s.rooms.fire[r] = 1;
    expect(rawStress(s)).toBe(1);
  });
  it('anyUnattended per category, Downed or Dead neighbours do not attend, in-flight debris never counts', () => {
    const s = makeState(2); quiet(s);
    teleport(s, 0, 20.5, 5.5); teleport(s, 1, 20.5, 5.5);                                           // both in the corridor, far from everything
    expect(anyUnattended(s)).toBe(false);
    igniteRoom(s, room(s, 'G')); expect(anyUnattended(s)).toBe(true);
    teleport(s, 0, 2.5, 9.5); expect(anyUnattended(s)).toBe(false);                                 // inside the burning room
    Life.state[s.crew[0]!] = LifeState.Downed;                                                      // Downed inside the fire; crew 1 attends the Downed member from outside the room
    teleport(s, 1, 2.5, 7.9); expect(roomAt(s, 2.5, 7.9)).not.toBe(room(s, 'G'));
    expect(anyUnattended(s)).toBe(true);                                                             // the fire still has no Conscious crew member inside
    teleport(s, 1, 20.5, 5.5);                                                                       // back to the corridor
    Life.state[s.crew[0]!] = LifeState.Conscious; s.rooms.fire.fill(0);
    activateBreach(s, 6);                                                                             // G bottom wall at (2,11)
    teleport(s, 0, 2.5, 10.5); expect(anyUnattended(s)).toBe(false);
    teleport(s, 0, 2.5, 8.5); expect(anyUnattended(s)).toBe(true);                                  // out of REACH
    s.breaches.active.fill(0);
    const eng = idx(s, StationKind.Engineering); failStation(s, eng);
    teleport(s, 0, 18.5, 9.5); expect(anyUnattended(s)).toBe(false);
    teleport(s, 0, 16.4, 9.5); expect(anyUnattended(s)).toBe(true);                                // 1.6 tiles from the console tile: just out of REACH (the boundary itself is in reach)
    s.stations.failed.fill(0);
    Life.state[s.crew[1]!] = LifeState.Downed; expect(anyUnattended(s)).toBe(true);                 // nobody near the Downed teammate
    teleport(s, 0, 20.5, 5.5); expect(anyUnattended(s)).toBe(false);
    Life.state[s.crew[0]!] = LifeState.Dead; expect(anyUnattended(s)).toBe(true);                   // a Dead neighbour does not attend
    Life.state[s.crew[0]!] = LifeState.Conscious; Life.state[s.crew[1]!] = LifeState.Conscious;
    placeDebris(s, room(s, 'A'), 600, 1); expect(anyUnattended(s)).toBe(false);
  });
  it('smoothing rises by 0.5 of the gap, falls by 0.15, and by 0.075 while unattended; recomputes exactly every STRESS_PERIOD', () => {
    const s = makeState(2); quiet(s);
    s.director.stress = 0; igniteRoom(s, room(s, 'G')); teleport(s, 0, 2.5, 9.5);                   // attended fire: raw 0.25
    updateStress(s); expect(s.director.stress).toBeCloseTo(0.125);
    updateStress(s); expect(s.director.stress).toBeCloseTo(0.1875);
    s.rooms.fire.fill(0); s.director.stress = 0.4;
    updateStress(s); expect(s.director.stress).toBeCloseTo(0.4 - 0.15 * 0.4);                         // falling, attended (nothing active)
    igniteRoom(s, room(s, 'A')); s.director.stress = 0.8; teleport(s, 0, 20.5, 5.5);                // unattended fire: raw 0.25, falling at half rate
    updateStress(s); expect(s.director.stress).toBeCloseTo(0.8 - 0.075 * (0.8 - 0.25));
    const t = makeState(2); quiet(t); igniteRoom(t, room(t, 'G'));
    run(t, STRESS_PERIOD * T - 1); expect(t.director.stress).toBe(0);                                // ticks 0..298: the first recompute is due at tick 300
    run(t, 2); expect(t.director.stress).toBeGreaterThan(0);                                          // ticks 299 and 300: the recompute at 300 sees the fire
    const after = t.director.stress; run(t, STRESS_PERIOD * T - 1); expect(t.director.stress).toBe(after);
  });
});

describe('phase machine', () => {
  const at = (s: ReturnType<typeof makeState>, phase: number, phaseTick: number, stress: number, budget = 2) => {
    const d = s.director; d.phase = phase; d.phaseTick = phaseTick; d.stress = stress; d.budgetLeft = budget; d.lastSpawnTick = phaseTick; d.nextStressTick = 1e9; d.nextSpawnTick = 1e9;
  };
  it('Build Up -> Sustain Peak on stress >= 0.7', () => {
    const s = makeState(2); at(s, Phase.BuildUp, 0, PEAK_LEVEL - 0.01); s.tick = 100;
    phaseStep(s); expect(s.director.phase).toBe(Phase.BuildUp);
    s.director.stress = PEAK_LEVEL; phaseStep(s); expect(s.director.phase).toBe(Phase.SustainPeak); expect(s.director.phaseTick).toBe(100);
  });
  it('Build Up -> Sustain Peak on the stall timer, from the last spawn or the phase start, including the initial -1', () => {
    const s = makeState(2); at(s, Phase.BuildUp, 1000, 0.3); s.director.lastSpawnTick = 2000;
    s.tick = 2000 + STALL_SECONDS * T - 1; phaseStep(s); expect(s.director.phase).toBe(Phase.BuildUp);
    s.tick = 2000 + STALL_SECONDS * T; phaseStep(s); expect(s.director.phase).toBe(Phase.SustainPeak);
    const t = makeState(2); at(t, Phase.BuildUp, 500, 0.3); t.director.lastSpawnTick = -1;
    t.tick = 500 + STALL_SECONDS * T - 1; phaseStep(t); expect(t.director.phase).toBe(Phase.BuildUp);
    t.tick = 500 + STALL_SECONDS * T; phaseStep(t); expect(t.director.phase).toBe(Phase.SustainPeak);
  });
  it('Build Up -> Sustain Peak when a real due spawn exhausts the budget, on that tick', () => {
    const s = makeState(0); armSpawn(s); s.director.budgetLeft = 1;
    directorSystem(s);
    expect(activeHazardCount(s)).toBe(1); expect(s.director.budgetLeft).toBe(0); expect(s.director.phase).toBe(Phase.SustainPeak); expect(s.director.lastSpawnTick).toBe(s.tick);
  });
  it('Sustain Peak -> Peak Fade at exactly 10 s', () => {
    const s = makeState(2); at(s, Phase.SustainPeak, 300, 0.9);
    s.tick = 300 + SUSTAIN_SECONDS * T - 1; phaseStep(s); expect(s.director.phase).toBe(Phase.SustainPeak);
    s.tick = 300 + SUSTAIN_SECONDS * T; phaseStep(s); expect(s.director.phase).toBe(Phase.PeakFade);
  });
  it('Peak Fade -> Relax on stress <= 0.25, or at the 30 s timeout with stress high', () => {
    const s = makeState(2); at(s, Phase.PeakFade, 300, RELAX_LEVEL + 0.01); s.tick = 400;
    phaseStep(s); expect(s.director.phase).toBe(Phase.PeakFade);
    s.director.stress = RELAX_LEVEL; phaseStep(s); expect(s.director.phase).toBe(Phase.Relax);
    const t = makeState(2); at(t, Phase.PeakFade, 300, 0.9);
    t.tick = 300 + FADE_TIMEOUT * T - 1; phaseStep(t); expect(t.director.phase).toBe(Phase.PeakFade);
    t.tick = 300 + FADE_TIMEOUT * T; phaseStep(t); expect(t.director.phase).toBe(Phase.Relax);
  });
  it('Relax -> Build Up after 30 s with low stress, not before; at 60 s regardless; re-entry re-arms budget and timer with one draw', () => {
    const s = makeState(2); at(s, Phase.Relax, 600, 0);
    s.tick = 600 + RELAX_MIN * T - 1; phaseStep(s); expect(s.director.phase).toBe(Phase.Relax);
    s.tick = 600 + RELAX_MIN * T; s.director.nextSpawnTick = 0;
    const one = createRng(s.rng.director.s); const u = nextFloat(one);
    phaseStep(s);
    expect(s.director.phase).toBe(Phase.BuildUp); expect(s.director.phaseTick).toBe(s.tick); expect(s.director.budgetLeft).toBe(cycleBudget(s.tick / 3600, 2));
    expect(s.rng.director.s).toBe(one.s);
    expect(s.director.nextSpawnTick).toBe(s.tick + Math.round(spawnInterval(s.tick / 3600, 2) * T * (1 + SPAWN_JITTER * (2 * u - 1))));   // the escalated interval at this minute, with the drawn jitter
    const t = makeState(2); at(t, Phase.Relax, 600, 0.5);
    t.tick = 600 + RELAX_MIN * T; phaseStep(t); expect(t.director.phase).toBe(Phase.Relax);                 // stress too high
    t.tick = 600 + RELAX_MAX * T - 1; phaseStep(t); expect(t.director.phase).toBe(Phase.Relax);
    t.director.stress = 0.9; t.tick = 600 + RELAX_MAX * T; phaseStep(t); expect(t.director.phase).toBe(Phase.BuildUp);   // hard maximum
    const w = makeState(2); at(w, Phase.Relax, 600, 0); w.director.nextSpawnTick = 1e9; w.tick = 600 + RELAX_MIN * T; phaseStep(w);
    expect(w.director.nextSpawnTick).toBe(1e9);                                                            // re-arming never pulls a later timer earlier
  });
  it('no spawn outside Build Up even with a due timer; a peak reached on a due-spawn tick spawns nothing and draws nothing; one transition per tick', () => {
    for (const phase of [Phase.SustainPeak, Phase.PeakFade, Phase.Relax]) {
      const s = makeState(0); at(s, phase, s.tick, 0.5, 5); s.director.nextSpawnTick = s.tick;
      const r = s.rng.director.s; directorSystem(s);
      expect(activeHazardCount(s)).toBe(0); expect(s.rng.director.s).toBe(r);
    }
    const p = makeState(0); armSpawn(p); p.director.stress = PEAK_LEVEL; const r = p.rng.director.s;
    directorSystem(p);
    expect(p.director.phase).toBe(Phase.SustainPeak); expect(activeHazardCount(p)).toBe(0); expect(p.rng.director.s).toBe(r);
    const q = makeState(2); at(q, Phase.SustainPeak, 0, 0); q.tick = 100 * T;                          // long past both the sustain and fade windows
    phaseStep(q); expect(q.director.phase).toBe(Phase.PeakFade);                                        // only one step per call
  });
});

describe('spawning', () => {
  it('the first attempt comes at SPAWN_FIRST and counts fires, breaches, failed stations and debris', () => {
    const s = makeState(2);
    run(s, seconds(SPAWN_FIRST) - 1); expect(activeHazardCount(s)).toBe(0);
    run(s, 2); expect(activeHazardCount(s)).toBe(1);
    expect(burningRoomCount(s) + activeBreachCount(s) + failedStationCount(s) + activeDebrisCount(s)).toBe(1);
  });
  it('a blocked attempt (cap full) re-arms the timer with exactly one director draw and no type roll', () => {
    const s = makeState(0); armSpawn(s);
    for (let r = 0; r < SPAWN_CAP; r++) igniteRoom(s, r);
    const one = createRng(s.rng.director.s); nextFloat(one);
    directorSystem(s);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP); expect(s.rng.director.s).toBe(one.s);
    expect(s.director.nextSpawnTick).toBeGreaterThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * T * (1 - SPAWN_JITTER)));
    expect(s.director.nextSpawnTick).toBeLessThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * T * (1 + SPAWN_JITTER)));
  });
  it('explicit director states select fire, breach, power and debris (second draw 0.325, 0.425, 0.625, 0.773 of the unit interval)', () => {
    const spawn = (directorState: number) => {
      const s = makeState(0); armSpawn(s); s.rng.director.s = directorState;
      const two = createRng(directorState); nextFloat(two); nextFloat(two);                          // jitter, then one type roll
      directorSystem(s); expect(s.rng.director.s).toBe(two.s); return s;
    };
    const counts = (s: ReturnType<typeof makeState>) => [burningRoomCount(s), activeBreachCount(s), failedStationCount(s), activeDebrisCount(s)];
    const f = spawn(2), b = spawn(14), p = spawn(8), d = spawn(5);
    expect(counts(f)).toEqual([1, 0, 0, 0]); expect(f.director.lastType).toBe(HazardType.Fire);
    expect(counts(b)).toEqual([0, 1, 0, 0]); expect(b.director.lastType).toBe(HazardType.Breach);
    expect(counts(p)).toEqual([0, 0, 1, 0]); expect(p.director.lastType).toBe(HazardType.Power);
    expect(counts(d)).toEqual([0, 0, 0, 1]); expect(d.debris.warned[0]).toBe(0); expect(d.debris.stableId[0]).toBeGreaterThan(0);
    expect(typeWeights(f)).toEqual([2, 2, 2, 4]); expect(typeWeights(b)).toEqual([4, 1, 2, 4]);         // the last type is halved for the next roll
    expect(f.director.budgetLeft).toBe(98); expect(f.director.lastSpawnTick).toBe(f.tick);
  });
  it('a type with no valid target skips: director advanced twice, hazards untouched, timer re-armed', () => {
    const noSites = JSON.parse(JSON.stringify(starter)) as typeof starter; noSites.breachSites = [];
    const s = createSimState(parseShip(noSites), 0, 1); armSpawn(s); s.rng.director.s = 14;
    const two = createRng(14); nextFloat(two); nextFloat(two); const h = s.rng.hazards.s;
    directorSystem(s);
    expect(activeHazardCount(s)).toBe(0); expect(s.rng.director.s).toBe(two.s); expect(s.rng.hazards.s).toBe(h); expect(s.director.nextSpawnTick).toBeGreaterThan(s.tick);
  });
  it('a failure spawned inside step() stands the occupant in that same tick', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation);
    sitDown(s, 0, nav);
    expect(nav).toBe(0);                                                                                    // Navigation is station index 0 on the starter ship
    armSpawn(s); s.rng.director.s = 8; s.rng.hazards.s = 7;                                                // director rolls power; the hazards target draw 0.012 x 7 candidates picks index 0
    run(s, 1);
    expect(s.stations.failed[nav]).toBe(1); expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[nav]).toBe(-1);
  });
  it('in-flight debris and failed stations count toward the cap; a full cap blocks', () => {
    const s = makeState(0); armSpawn(s);
    for (let k = 0; k < SPAWN_CAP; k++) placeDebris(s, 0, 600);
    directorSystem(s);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP); expect(burningRoomCount(s) + activeBreachCount(s) + failedStationCount(s)).toBe(0);
    const t = makeState(0); armSpawn(t);
    for (let i = 0; i < SPAWN_CAP; i++) failStation(t, i);                                                 // three failed stations fill the cap too
    const r = t.rng.director.s; const one = createRng(r); nextFloat(one);
    directorSystem(t);
    expect(activeHazardCount(t)).toBe(SPAWN_CAP); expect(burningRoomCount(t) + activeBreachCount(t) + activeDebrisCount(t)).toBe(0); expect(t.rng.director.s).toBe(one.s);
  });
  it('sinceProductive follows the Weapons and Life Support stamps: a shot resets Weapons and it counts again after the window; a delivering hazard tick resets Life Support and it counts once the stamp expires', () => {
    const w = makeState(1); quiet(w);
    placeDebris(w, room(w, 'A'), 1e6, 1); sitDown(w, 0, idx(w, StationKind.Weapons)); w.weapons.charge = 1; w.rng.combat.s = 36;
    const W = StationKind.Weapons;
    run(w, 10); expect(w.director.sinceProductive[W]).toBe(10);
    run(w, 1, () => intents({ confirmPressed: true })); expect(w.director.sinceProductive[W]).toBe(0);   // lastShotTick is stamped in consoleSystem, before xpSystem
    run(w, PRODUCTIVE_WINDOW_TICKS);
    expect(w.director.sinceProductive[W]).toBe(1);                                                       // shot tick T: stamp recent through T+299; the counter first counts at T+300 (the last tick run)
    const l = makeState(1); quiet(l);
    const L = StationKind.LifeSupport;
    sitDown(l, 0, idx(l, L)); l.rooms.o2[room(l, 'A')] = 0;
    run(l, 1); expect(l.director.sinceProductive[L]).toBe(1);                                            // tick 0 delivers after xpSystem ran
    run(l, 1); expect(l.director.sinceProductive[L]).toBe(0);                                            // tick 1 sees the stamp from tick 0
    for (let i = 0; i < HAZARD_EVERY; i++) { run(l, 1); expect(l.director.sinceProductive[L]).toBe(0); }
    for (let r = 0; r < l.rooms.o2.length; r++) l.rooms.o2[r] = l.derived.volume[r]! * 1.5;   // full (breathing would otherwise draw a little down and keep delivering); nothing to inject
    run(l, HAZARD_EVERY + 2); expect(l.director.sinceProductive[L]).toBeGreaterThan(0);
  });
  it('sinceProductive counts up, resets only for an online, occupied, Conscious, productive station, and caps', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation), A = room(s, 'A'); quiet(s);
    run(s, 10); expect(s.director.sinceProductive[StationKind.Navigation]).toBe(10);
    placeDebris(s, A, 1e6, 1); run(s, 5); expect(s.director.sinceProductive[StationKind.Navigation]).toBe(15);   // warned but unoccupied: counts
    sitDown(s, 0, nav); run(s, 1); expect(s.director.sinceProductive[StationKind.Navigation]).toBe(0);           // occupied and productive: reset
    s.debris.active.fill(0); run(s, 3); expect(s.director.sinceProductive[StationKind.Navigation]).toBe(3);      // occupied, unproductive: counts
    placeDebris(s, A, 1e6, 1); failStation(s, nav); s.stations.occupant[nav] = 0; run(s, 2);
    expect(s.director.sinceProductive[StationKind.Navigation]).toBe(5);                                            // offline (occupant recorded): counts
    s.director.sinceProductive[StationKind.Doors] = SINCE_CAP; run(s, 1); expect(s.director.sinceProductive[StationKind.Doors]).toBe(SINCE_CAP);
    const t = createSimState(withoutDoors(), 1, 1); quiet(t); run(t, 10); expect(t.director.sinceProductive[StationKind.Doors]).toBe(0);
  });
});

describe('routing (3 or 4 players)', () => {
  const idle = (s: ReturnType<typeof makeState>, kind: number, secondsIdle: number) => { s.director.sinceProductive[kind] = secondsIdle * T; };
  it('the longest-idle responding console gets the bonus; fire and breach tie when Life Support is at least as idle as Doors', () => {
    const s = makeState(3); quiet(s);
    idle(s, StationKind.Doors, 61);
    expect(typeWeights(s)).toEqual([8, 2, 2, 4]);                                 // breach's idle is min(Doors 61, Life Support 0) = 0
    idle(s, StationKind.LifeSupport, 90);
    expect(typeWeights(s)).toEqual([8, 6, 2, 4]);                                 // both at 61: both routed
    s.director.sinceProductive.fill(0); idle(s, StationKind.Engineering, 61);
    expect(typeWeights(s)).toEqual([4, 2, 6, 4]);
    s.director.sinceProductive.fill(0); for (const k of [StationKind.Science, StationKind.Weapons, StationKind.Navigation]) idle(s, k, 61);
    expect(typeWeights(s)).toEqual([4, 2, 2, 8]);
    s.director.sinceProductive.fill(0); idle(s, StationKind.Science, 61);
    expect(typeWeights(s)).toEqual([4, 2, 2, 4]);                                 // Weapons and Navigation at 0: the minimum governs
  });
  it('exactly 60 s gives no bonus, 61 s does; two players never route; halving precedes the bonus', () => {
    const s = makeState(3); quiet(s);
    idle(s, StationKind.Engineering, 60); expect(typeWeights(s)).toEqual([4, 2, 2, 4]);
    idle(s, StationKind.Engineering, 61); expect(typeWeights(s)).toEqual([4, 2, 6, 4]);
    s.director.lastType = HazardType.Power; expect(typeWeights(s)).toEqual([4, 2, 5, 4]);   // 2 halved to 1, then +4
    const two = makeState(2); quiet(two); idle(two, StationKind.Engineering, 300);
    expect(typeWeights(two)).toEqual([4, 2, 2, 4]);
  });
  it('a console not on the ship has idle 0 and never attracts routing', () => {
    const s = createSimState(withoutDoors(), 3, 1); quiet(s);
    s.director.sinceProductive[StationKind.Doors] = 1000 * T;                      // stale value for a missing console
    expect(typeWeights(s)).toEqual([4, 2, 2, 4]);
  });
});

describe('soak', () => {
  it('20 sim minutes with an unkillable bot crew: every phase twice, no stall past 60 s, no Relax past 60 s, stress within 0..1', { timeout: 60_000 }, () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS);
    const seen = [0, 0, 0, 0]; let last = s.director.phase; seen[last]!++;
    for (let t = 0; t < 72_000; t++) {
      step(s, [botIntent(s, 0), botIntent(s, 1)]);
      s.hull = HULL_MAX; for (const eid of s.crew) if (Life.state[eid] === LifeState.Conscious) Health.cur[eid] = HEALTH_MAX;   // harness cheat: the run must not end
      const d = s.director;
      if (d.phase !== last) { seen[d.phase]!++; last = d.phase; }
      if (d.phase === Phase.BuildUp) expect(s.tick - Math.max(d.lastSpawnTick, d.phaseTick)).toBeLessThanOrEqual(STALL_SECONDS * T + 1);
      if (d.phase === Phase.Relax) expect(s.tick - d.phaseTick).toBeLessThanOrEqual(RELAX_MAX * T + 1);
      expect(d.stress).toBeGreaterThanOrEqual(0); expect(d.stress).toBeLessThanOrEqual(1);
    }
    expect(s.tick).toBe(72_000); expect(s.ended).toBe(0);
    for (const n of seen) expect(n).toBeGreaterThanOrEqual(2);
  });
});
