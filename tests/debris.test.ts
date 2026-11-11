import { describe, it, expect } from 'vitest';
import { warnedTargets, nextTarget } from '../src/renderer/src/sim/debrisTargets';
import { spawnDebris, removeDebris, scienceLead, evades, debrisSystem, activeDebrisCount } from '../src/renderer/src/sim/debris';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { failStation } from '../src/renderer/src/sim/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { EndReason } from '../src/renderer/src/sim/crew';
import { DEBRIS_SLOTS, DEBRIS_FLIGHT, DEBRIS_FLIGHT_JITTER, SCIENCE_LEAD_UNMANNED, DEBRIS_HULL_DAMAGE, DEBRIS_CREW_DAMAGE, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { makeState, placeDebris, room, run, teleport, seconds, intents } from './helpers/sim';

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
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(5));
    run(s, seconds(1));                                      // ticks 0..59: remaining is still above 4 s at tick 59 (241 ticks)
    expect(s.debris.warned[0]).toBe(0);
    run(s, 1);                                               // tick 60: remaining is exactly 4 s
    expect(s.debris.warned[0]).toBe(1);
  });
  it('a seated operator warns at the seated lead; standing or a failure never un-warns', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
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
      s.spawner.nextSpawnTick = 1e9; s.stations.level[i] = 2; sitDown(s, 0, i);   // lead 24 s
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
    s.spawner.nextSpawnTick = 1e9;
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
    const t = makeState(1), B = room(t, 'B');
    teleport(t, 0, 7.5, 2.5); Health.cur[t.crew[0]!] = DEBRIS_CREW_DAMAGE;
    placeDebris(t, B, 0); placeDebris(t, B, 0);
    debrisSystem(t);
    expect(Health.cur[t.crew[0]!]).toBe(0); expect(Life.state[t.crew[0]!]).toBe(LifeState.Downed);   // downed by the first, untouched by the second
  });
  it('two impacts in one tick on different rooms stamp both rooms', () => {
    const s = makeState(0), A = room(s, 'A'), B = room(s, 'B');
    placeDebris(s, A, 0); placeDebris(s, B, 0);
    debrisSystem(s);
    expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.rooms.impactTick[B]).toBe(s.tick);
  });
  it('hull reaching 0 ends the run with EndReason.Hull through step()', () => {
    const s = makeState(1), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; s.hull = DEBRIS_HULL_DAMAGE;
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
