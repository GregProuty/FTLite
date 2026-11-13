import { describe, it, expect } from 'vitest';
import { warnedTargets, nextTarget, cycleTarget } from '../src/renderer/src/sim/debrisTargets';
import { spawnDebris, removeDebris, scienceLead, evades, debrisSystem, activeDebrisCount, spawnFieldRock, ObjectKind } from '../src/renderer/src/sim/debris';
import { isTarget } from '../src/renderer/src/sim/debrisTargets';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { Dir } from '../src/renderer/src/sim/dir';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { failStation } from '../src/renderer/src/sim/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { EndReason } from '../src/renderer/src/sim/crew';
import { DEBRIS_SLOTS, DEBRIS_FLIGHT, DEBRIS_FLIGHT_JITTER, SCIENCE_LEAD_UNMANNED, DEBRIS_HULL_DAMAGE, DEBRIS_CREW_DAMAGE, TICK_HZ, TORP_START, FIELD_ROCK_HULL, FIELD_ROCK_CREW, ROCK_BREACH_FIRST } from '../src/renderer/src/sim/tuning';
import { makeState, placeDebris, placeShot, room, run, teleport, seconds, intents } from './helpers/sim';
import { createRng, nextFloat } from '../src/shared/rng';
import { EVADE_CAP } from '../src/renderer/src/sim/tuning';

describe('debris slots and target order', () => {
  it('a fresh state has empty slots, no impacts and no charge', () => {
    const s = makeState(1);
    expect(s.debris.active).toHaveLength(DEBRIS_SLOTS);
    expect(Array.from(s.debris.active).every((a) => a === 0)).toBe(true);
    expect(Array.from(s.rooms.impactTick).every((t) => t === -1)).toBe(true);
    expect(s.weapons.charge).toBe(0);
  });
  it('warnedTargets lists warned active slots in ascending stableId, not slot order', () => {
    const s = makeState(1), A = room(s, 'A');
    placeDebris(s, A, 600, 1, 30);          // slot 0, id 30
    placeDebris(s, A, 600, 1, 10);          // slot 1, id 10
    placeDebris(s, A, 600, 0, 20);          // slot 2, id 20, unwarned
    expect(warnedTargets(s)).toEqual([1, 0]);
  });
  it('nextTarget picks the smallest stableId above the given one, wraps, excludes a slot and returns -1 when empty', () => {
    const s = makeState(1), A = room(s, 'A');
    placeDebris(s, A, 600, 1, 20); placeDebris(s, A, 600, 1, 30); placeDebris(s, A, 600, 1, 10);   // slots 0, 1, 2
    expect(nextTarget(s, 20)).toBe(1);
    expect(nextTarget(s, 30)).toBe(2);
    expect(nextTarget(s, 20, 1)).toBe(2);                 // 30 excluded: wraps to 10
    s.debris.warned.fill(0);
    expect(nextTarget(s, 10)).toBe(-1);
  });
});

const sci = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Science]!;
const nav = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Navigation]!;
/** The starter ship has one breach site per room; this is the site in `r`. */
const siteOf = (s: ReturnType<typeof makeState>, r: number) => Array.from(s.derived.siteRoom).indexOf(r);

describe('spawn and removal', () => {
  it('spawnDebris fills the lowest free slot with a fresh StableId, a flight inside the jitter and no warning', () => {
    const s = makeState(1), id0 = s.nextStableId;
    const a = spawnDebris(s);
    expect(a).toBe(0); expect(s.debris.active[0]).toBe(1); expect(s.debris.stableId[0]).toBe(id0); expect(s.debris.warned[0]).toBe(0);
    const flight = (s.debris.impactTick[0]! - s.tick) / TICK_HZ;
    expect(flight).toBeGreaterThanOrEqual(DEBRIS_FLIGHT - DEBRIS_FLIGHT_JITTER - 1 / TICK_HZ); expect(flight).toBeLessThanOrEqual(DEBRIS_FLIGHT + DEBRIS_FLIGHT_JITTER + 1 / TICK_HZ);
    expect(s.debris.room[0]).toBeGreaterThanOrEqual(0); expect(s.debris.room[0]).toBeLessThan(s.derived.volume.length);
    expect(spawnDebris(s)).toBe(1);
    removeDebris(s, 0);
    expect(s.debris.active[0]).toBe(0); expect(s.debris.stableId[0]).toBe(0);
    const c = spawnDebris(s);
    expect(c).toBe(0); expect(s.debris.stableId[0]).toBeGreaterThan(s.debris.stableId[1]!);   // reused slot, newer id
    expect(activeDebrisCount(s)).toBe(2);
  });
  it('a full table skips the spawn and returns -1', () => {
    const s = makeState(1);
    for (let k = 0; k < s.debris.active.length; k++) placeDebris(s, 0, 600);
    expect(spawnDebris(s)).toBe(-1);
  });
  it('removeDebris retargets the Weapons cursor by StableId before clearing the slot', () => {
    const s = makeState(1), wpn = s.derived.stationOfKind[StationKind.Weapons]!, A = room(s, 'A');
    placeDebris(s, A, 600, 1, 10); placeDebris(s, A, 600, 1, 20); placeDebris(s, A, 600, 1, 30);   // slots 0, 1, 2
    s.stations.cursor[wpn] = 1;
    removeDebris(s, 1);
    expect(s.stations.cursor[wpn]).toBe(2);                 // 20 -> 30
    removeDebris(s, 2);
    expect(s.stations.cursor[wpn]).toBe(0);                 // 30 -> wraps to 10
    removeDebris(s, 0);
    expect(s.stations.cursor[wpn]).toBe(-1);                // nothing left
    placeDebris(s, A, 600, 1);
    s.stations.cursor[wpn] = -1;
    removeDebris(s, 0);
    expect(s.stations.cursor[wpn]).toBe(-1);                // a cursor not on the removed slot is left alone
  });
});

describe('detection', () => {
  it('lead is 4 s unmanned or offline and base + scale x output when seated', () => {
    const s = makeState(1), i = sci(s);
    expect(scienceLead(s)).toBe(SCIENCE_LEAD_UNMANNED);
    sitDown(s, 0, i);
    expect(scienceLead(s)).toBeCloseTo(18);                 // level 1 of 2, skill 0
    s.stations.level[i] = 2;
    expect(scienceLead(s)).toBeCloseTo(24);
    failStation(s, i);                                      // stands the occupant
    expect(scienceLead(s)).toBe(SCIENCE_LEAD_UNMANNED);
  });
  it('unmanned, an object is warned at 4 s remaining and not before; warned is permanent', () => {
    const s = makeState(1), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(5));
    run(s, seconds(1));                                      // ticks 0..59: remaining is still above 4 s at tick 59 (241 ticks)
    expect(s.debris.warned[0]).toBe(0);
    run(s, 1);                                               // tick 60: remaining is exactly 4 s
    expect(s.debris.warned[0]).toBe(1);
  });
  it('a seated operator warns at the seated lead; standing or a failure never un-warns', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9;
    sitDown(s, 0, i);
    placeDebris(s, A, seconds(18) + 2);
    run(s, 1);
    expect(s.debris.warned[0]).toBe(0);
    run(s, 2);
    expect(s.debris.warned[0]).toBe(1);
    run(s, 1, () => intents({ cancelPressed: true }));
    failStation(s, i); run(s, 1);
    expect(s.debris.warned[0]).toBe(1);
  });
  it('flight shorter than or equal to the lead is warned on its spawn tick; longer is not', () => {
    for (const [flightTicks, expected] of [[seconds(23), 1], [seconds(24), 1], [seconds(25), 0]] as const) {
      const s = makeState(1), i = sci(s), A = room(s, 'A');
      s.director.nextSpawnTick = 1e9; s.stations.level[i] = 2; sitDown(s, 0, i);   // lead 24 s
      placeDebris(s, A, flightTicks);
      debrisSystem(s);
      expect(s.debris.warned[0]).toBe(expected);
    }
  });
});

describe('impact', () => {
  it('lowers hull by DEBRIS_HULL_DAMAGE, applies one room effect, records the impact tick and frees the slot', () => {
    const s = makeState(0), A = room(s, 'A');
    s.rng.hazards.s = 7;                                    // first draw 0.012 < 0.5: breach first
    placeDebris(s, A, 0);
    debrisSystem(s);
    expect(s.hull).toBe(100 - DEBRIS_HULL_DAMAGE);
    expect(s.breaches.active[siteOf(s, A)]).toBe(1); expect(s.rooms.fire[A]).toBe(0);
    expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.debris.active[0]).toBe(0);
    const t = makeState(0); t.rng.hazards.s = 1;            // first draw 0.627: fire first
    placeDebris(t, A, 0); debrisSystem(t);
    expect(t.rooms.fire[A]).toBeGreaterThan(0); expect(t.breaches.active[siteOf(t, A)]).toBe(0);
  });
  it('falls back to the other effect when the drawn one is impossible, and to none when both are; the roll is drawn either way', () => {
    const s = makeState(0), A = room(s, 'A');
    s.rng.hazards.s = 7;                                    // breach first, but the site is taken
    s.breaches.active[siteOf(s, A)] = 1;
    placeDebris(s, A, 0); debrisSystem(s);
    expect(s.rooms.fire[A]).toBeGreaterThan(0);
    const t = makeState(0); t.rng.hazards.s = 7;
    t.breaches.active[siteOf(t, A)] = 1; igniteRoom(t, A); const fire = t.rooms.fire[A]!;
    const before = t.rng.hazards.s;
    placeDebris(t, A, 0); debrisSystem(t);
    expect(t.rooms.fire[A]).toBe(fire); expect(t.hull).toBe(100 - DEBRIS_HULL_DAMAGE);
    expect(t.rng.hazards.s).not.toBe(before);
  });
  it('damages Conscious crew in the room by roomAt, downs a lethal hit at once, and a second impact that tick does not hit them again', () => {
    const s = makeState(4), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9;
    const down = s.crew[3]!;
    teleport(s, 3, 2.5, 2.5); Life.state[down] = LifeState.Downed; Life.bleed[down] = 30; Health.cur[down] = 50;   // already Downed in A: the Conscious guard
    teleport(s, 0, 2.5, 2.5);                                // in A
    teleport(s, 1, 2.5, 4.5);                                // A/I door tile: roomAt is -1, not hit
    Health.cur[s.crew[2]!] = DEBRIS_CREW_DAMAGE;             // in G (spawn room), not in A
    s.rng.hazards.s = 1;
    placeDebris(s, A, 0); placeDebris(s, A, 0);              // two impacts on A this tick
    Health.cur[s.crew[0]!] = DEBRIS_CREW_DAMAGE + 5;         // the first impact leaves 5, the second downs
    debrisSystem(s);
    expect(Health.cur[s.crew[0]!]).toBe(0); expect(Life.state[s.crew[0]!]).toBe(LifeState.Downed);
    expect(Health.cur[s.crew[1]!]).toBe(100); expect(Health.cur[s.crew[2]!]).toBe(DEBRIS_CREW_DAMAGE);
    expect(Health.cur[down]).toBe(50); expect(Life.bleed[down]).toBe(30);
    expect(s.hull).toBe(100 - 2 * DEBRIS_HULL_DAMAGE);
    // A seated Navigator killed by the first impact is stood up at once, so the second impact draws no evasion roll: exactly one combat draw.
    const t = makeState(1), n = nav(t);
    sitDown(t, 0, n); Health.cur[t.crew[0]!] = DEBRIS_CREW_DAMAGE; t.rng.combat.s = 4;   // first draw 0.924: not evaded
    const oneDraw = createRng(4); nextFloat(oneDraw);
    placeDebris(t, A, 0); placeDebris(t, A, 0);
    debrisSystem(t);
    expect(Health.cur[t.crew[0]!]).toBe(0); expect(Life.state[t.crew[0]!]).toBe(LifeState.Downed); expect(t.stations.occupant[n]).toBe(-1);
    expect(t.rng.combat.s).toBe(oneDraw.s); expect(t.hull).toBe(100 - 2 * DEBRIS_HULL_DAMAGE);
  });
  it('a lethal impact in the Medbay through step() downs the crew member before the Medbay can heal them', () => {
    const s = makeState(1), F = room(s, 'F');
    s.director.nextSpawnTick = 1e9;
    teleport(s, 0, 17.5, 3.5); Health.cur[s.crew[0]!] = DEBRIS_CREW_DAMAGE;   // standing in the Medbay room (F), online at the starter allocation
    placeDebris(s, F, 1);
    run(s, 2);
    expect(Health.cur[s.crew[0]!]).toBe(0); expect(Life.state[s.crew[0]!]).toBe(LifeState.Downed);
  });
  it('two impacts in one tick on different rooms stamp both rooms', () => {
    const s = makeState(0), A = room(s, 'A'), B = room(s, 'B');
    placeDebris(s, A, 0); placeDebris(s, B, 0);
    debrisSystem(s);
    expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.rooms.impactTick[B]).toBe(s.tick);
  });
  it('hull reaching 0 ends the run with EndReason.Hull through step()', () => {
    const s = makeState(1), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9; s.hull = DEBRIS_HULL_DAMAGE;
    placeDebris(s, A, 1);
    run(s, 2);
    expect(s.hull).toBe(0); expect(s.ended).toBe(1); expect(s.endReason).toBe(EndReason.Hull);
  });
});

describe('evasion', () => {
  it('evades thresholds at Navigation levels 1 and 2', () => {
    expect(evades(0.34, 0.375)).toBe(true); expect(evades(0.36, 0.375)).toBe(false);     // level 1 threshold 0.35
    expect(evades(0.49, 0.75)).toBe(true); expect(evades(0.51, 0.75)).toBe(false);       // level 2 threshold 0.50
  });
  it('rolls only when Navigation is seated and online; success removes the object with no hull change', () => {
    const s = makeState(1), A = room(s, 'A');
    const combat = s.rng.combat.s;
    placeDebris(s, A, 0); debrisSystem(s);
    expect(s.rng.combat.s).toBe(combat); expect(s.hull).toBe(100 - DEBRIS_HULL_DAMAGE);    // unmanned: no roll
    const t = makeState(1), n = nav(t);
    sitDown(t, 0, n); t.rng.combat.s = 7;                   // first draw 0.012 < 0.35: evaded
    placeDebris(t, A, 0); debrisSystem(t);
    expect(t.hull).toBe(100); expect(t.debris.active[0]).toBe(0); expect(t.rooms.impactTick[A]).toBe(-1); expect(t.rng.combat.s).not.toBe(7);
    const u = makeState(1); sitDown(u, 0, nav(u)); u.rng.combat.s = 4;                      // first draw 0.924: not evaded
    placeDebris(u, A, 0); debrisSystem(u);
    expect(u.hull).toBe(100 - DEBRIS_HULL_DAMAGE);
    const v = makeState(1); sitDown(v, 0, nav(v)); failStation(v, nav(v)); const c2 = v.rng.combat.s;   // offline: stood, no roll
    placeDebris(v, A, 0); debrisSystem(v);
    expect(v.rng.combat.s).toBe(c2);
  });
});

describe('impact markers the projectile layer relies on (spec Demo-vii amendments 8 and 9)', () => {
  it('a Shot that hits sets rooms.impactTick of its room to the tick', () => {
    const s = makeState(1), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9; teleport(s, 0, 12.5, 9.5);
    placeShot(s, A, 3);
    const due = s.tick + 3;
    run(s, 4);
    expect(s.debris.active.every((v) => v === 0)).toBe(true);
    expect(s.rooms.impactTick[A]).toBe(due);
  });
  it('an evaded Debris object leaves rooms.impactTick unchanged', () => {
    const s = makeState(1), A = room(s, 'A'), n = s.derived.stationOfKind[StationKind.Navigation]!;
    s.director.nextSpawnTick = 1e9;
    sitDown(s, 0, n); s.rng.combat.s = 7;                                // first draw 0.012 < 0.35: evaded
    placeDebris(s, A, 3);
    run(s, 4);
    expect(s.telemetry.evasions).toBe(1);
    expect(s.rooms.impactTick[A]).toBe(-1);
  });
});

describe('frequency and shared cursors (2b-ii)', () => {
  it('spawn draws a frequency in 1..FREQ_COUNT as the third hazards draw; pinned seeds give each value', () => {
    for (const [seed, freq, rm] of [[2, 1, 6], [1, 2, 5], [7, 3, 0]] as const) {
      const s = makeState(1); s.rng.hazards.s = seed;
      const three = createRng(seed); nextFloat(three); nextFloat(three); nextFloat(three);
      const slot = spawnDebris(s);
      expect(s.debris.frequency[slot]).toBe(freq); expect(s.debris.room[slot]).toBe(rm);
      expect(s.debris.scanned[slot]).toBe(0); expect(s.debris.scan[slot]).toBe(0);
      expect(s.rng.hazards.s).toBe(three.s);                                 // room, flight, frequency: exactly three draws
    }
  });
  it('a fresh state starts with selector 0, TORP_START stock and every other new field at 0', () => {
    const s = makeState(2);
    expect(s.weapons).toEqual({ charge: 0, selector: 0, torpedoStock: TORP_START, torpedoLoaded: 0, torpedoLoad: 0, torpedoRegen: 0, lastShotTick: -1, lastShotTarget: -1, lastShotResult: 0, lastShotKind: 0, torpedoFed: 0, torpedoDropTick: -1, slot: new Uint8Array(2), charge2: new Float64Array(2), cargo: 0 });   // Loop-iii adds the extra slots, their charges and the cargo
    expect(s.science).toEqual({ scanning: 0 });
    expect(Array.from(s.debris.frequency).every((v) => v === 0)).toBe(true);
    expect(Array.from(s.debris.scanned).every((v) => v === 0)).toBe(true);
    expect(Array.from(s.debris.scan).every((v) => v === 0)).toBe(true);
  });
  it('removeDebris clears frequency, scanned and scan, and retargets the Science cursor like the Weapons cursor', () => {
    const s = makeState(2), A = room(s, 'A'), wpn = s.derived.stationOfKind[StationKind.Weapons]!, sci = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 600, 1, 10, 2); placeDebris(s, A, 600, 1, 20, 3); placeDebris(s, A, 600, 1, 30, 1);   // slots 0, 1, 2
    s.debris.scanned[1] = 1; s.debris.scan[1] = 1;
    sitDown(s, 0, wpn); sitDown(s, 1, sci);
    expect(s.stations.cursor[wpn]).toBe(0); expect(s.stations.cursor[sci]).toBe(0);         // smallest StableId on sit, both consoles
    s.stations.cursor[wpn] = 1; s.stations.cursor[sci] = 1;
    removeDebris(s, 1);
    expect(s.stations.cursor[wpn]).toBe(2); expect(s.stations.cursor[sci]).toBe(2);         // next StableId (30) for both
    expect(s.debris.frequency[1]).toBe(0); expect(s.debris.scanned[1]).toBe(0); expect(s.debris.scan[1]).toBe(0);
  });
  it('the first warning auto-selects for a seated Science operator at -1; cycleTarget cycles and wraps for either console', () => {
    const s = makeState(1), A = room(s, 'A'), sci = s.derived.stationOfKind[StationKind.Science]!;
    s.director.nextSpawnTick = 1e9;
    sitDown(s, 0, sci);
    expect(s.stations.cursor[sci]).toBe(-1);
    placeDebris(s, A, 60, 0);                                                                // inside the seated lead: warned next tick
    run(s, 1);
    expect(s.debris.warned[0]).toBe(1); expect(s.stations.cursor[sci]).toBe(0);
    placeDebris(s, A, 600, 1, 50); placeDebris(s, A, 600, 1, 40);                           // slots 1 (id 50), 2 (id 40)
    cycleTarget(s, sci, Dir.Down); expect(s.stations.cursor[sci]).toBe(2);
    cycleTarget(s, sci, Dir.Down); expect(s.stations.cursor[sci]).toBe(1);
    cycleTarget(s, sci, Dir.Down); expect(s.stations.cursor[sci]).toBe(0);                  // wraps
    cycleTarget(s, sci, Dir.Up); expect(s.stations.cursor[sci]).toBe(1);                    // wraps backwards
    cycleTarget(s, sci, Dir.Left); expect(s.stations.cursor[sci]).toBe(1);                  // left/right do not move the target
  });
  it('standUp from Science clears scanning; from any other seat it does not', () => {
    const s = makeState(2), sci = s.derived.stationOfKind[StationKind.Science]!, nav = s.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(s, 0, sci); sitDown(s, 1, nav); s.science.scanning = 1;
    standUp(s, 1);
    expect(s.science.scanning).toBe(1);
    standUp(s, 0);
    expect(s.science.scanning).toBe(0);
  });
});

describe('field rocks (spec Demo-viii amendment A1)', () => {
  it('spawnFieldRock makes a Rock with the debris draws; Rock is a weaker debris impact with the same draws', () => {
    expect([ObjectKind.Rock, FIELD_ROCK_HULL, FIELD_ROCK_CREW]).toEqual([2, 3, Math.floor(DEBRIS_CREW_DAMAGE / 2)]);
    const a = makeState(0), b = makeState(0); const ka = spawnFieldRock(a), kb = spawnDebris(b);
    expect(a.debris.kind[ka]).toBe(ObjectKind.Rock); expect(a.rng.hazards.s).toBe(b.rng.hazards.s); expect(a.debris.room[ka]).toBe(b.debris.room[kb]);
    expect(ROCK_BREACH_FIRST).toBe(0.75);
    const rb = makeState(0), RA = room(rb, 'A'); rb.rng.hazards.s = 1;   // first draw 0.627: fire first for debris, breach first for a rock
    const kr = placeDebris(rb, RA, 0); rb.debris.kind[kr] = ObjectKind.Rock; debrisSystem(rb);
    expect(Array.from(rb.breaches.active).some(Boolean)).toBe(true); expect(rb.rooms.fire[RA]).toBe(0);
    for (const seed of [7]) {
      const r = makeState(0), d = makeState(0), A = room(r, 'A');
      r.rng.hazards.s = seed; d.rng.hazards.s = seed;
      const k = placeDebris(r, A, 0); r.debris.kind[k] = ObjectKind.Rock; placeDebris(d, A, 0);
      debrisSystem(r); debrisSystem(d);
      expect(r.hull).toBe(100 - FIELD_ROCK_HULL);
      expect([Array.from(r.breaches.active), r.rooms.fire[A]! > 0, r.rng.hazards.s, r.rooms.impactTick[A]]).toEqual([Array.from(d.breaches.active), d.rooms.fire[A]! > 0, d.rng.hazards.s, d.rooms.impactTick[A]]);
    }
  });
  it('a Rock deals half the debris crew damage, and is a target once warned', () => {
    const s = makeState(2), A = room(s, 'A'); const eid = s.crew[0]!;
    const tile = s.derived.roomTiles[A]![0]!, w = s.derived.width; teleport(s, 0, (tile % w) + 0.5, Math.floor(tile / w) + 0.5);
    const k = placeDebris(s, A, 0, 1); s.debris.kind[k] = ObjectKind.Rock;
    expect(isTarget(s, k)).toBe(true);
    debrisSystem(s); expect(Health.cur[eid]).toBe(100 - FIELD_ROCK_CREW);
  });
});

describe('the evasive manoeuvre at the impact (spec Coop-ii amendments D1-D3)', () => {
  /** A combat stream state whose first draw falls in [lo, hi). */
  const stateFor = (lo: number, hi: number): number => { for (let k = 1; ; k++) { const r = { s: k }; const u = nextFloat(r); if (u >= lo && u < hi) return k; } };
  const setup = (level: number, inWindow: boolean, u: [number, number]) => {
    const s = makeState(1), A = room(s, 'A'), n = nav(s); sitDown(s, 0, n); s.stations.level[n] = level;
    s.run.evadeUntilTick = inWindow ? s.tick + 1 : s.tick;   // the window covers ticks < evadeUntilTick
    s.rng.combat.s = stateFor(u[0], u[1]); const ref = { s: s.rng.combat.s }; nextFloat(ref);
    placeDebris(s, A, 0); debrisSystem(s);
    return { s, ref };
  };
  it('inside the window the chance doubles (level 1: 0.35 -> 0.70), with the same single draw', () => {
    const { s, ref } = setup(1, true, [0.40, 0.65]);
    expect([s.hull, s.telemetry.evadeRolls, s.telemetry.evasions, s.telemetry.timedRolls, s.telemetry.timedEvades]).toEqual([100, 1, 1, 1, 1]);
    expect(s.rng.combat.s).toBe(ref.s);
  });
  it('outside the window the same draw is today\'s chance', () => {
    const { s, ref } = setup(1, false, [0.40, 0.65]);
    expect([s.hull, s.telemetry.evadeRolls, s.telemetry.evasions, s.telemetry.timedRolls, s.telemetry.timedEvades]).toEqual([100 - DEBRIS_HULL_DAMAGE, 1, 0, 0, 0]);
    expect(s.rng.combat.s).toBe(ref.s);
  });
  it('the cap applies after doubling (level 2: 0.50 -> 1.00, capped at 0.80); a timed roll that fails counts only as a roll', () => {
    const won = setup(2, true, [0.6, 0.79]).s; expect([won.hull, won.telemetry.timedRolls, won.telemetry.timedEvades]).toEqual([100, 1, 1]);
    const lost = setup(2, true, [0.81, 1]).s; expect([lost.hull, lost.telemetry.timedRolls, lost.telemetry.timedEvades]).toEqual([100 - DEBRIS_HULL_DAMAGE, 1, 0]);
    expect(EVADE_CAP).toBe(0.8);
  });
  it('the window needs Navigation seated and online at the impact, as today: no roll, no timed roll', () => {
    const s = makeState(1), A = room(s, 'A'); s.run.evadeUntilTick = s.tick + 60; const c = s.rng.combat.s;
    placeDebris(s, A, 0); debrisSystem(s);
    expect([s.rng.combat.s, s.telemetry.timedRolls]).toEqual([c, 0]);
  });
});
