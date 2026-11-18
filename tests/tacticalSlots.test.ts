// N-ship space (engine refactor spec §5, R-2): ship slots with active flags, the missile pool with owners, weapons that
// fire at the locked target, and ship classes and weapons as definitions. Storage only: an extra inactive slot changes
// nothing about the duel's two, and today's numbers are the cutter's and hunter's entries.
import { describe, expect, it } from 'vitest';
import { CUTTER_CLASS, DUEL_CLASSES, HUNTER_CLASS, LASER, MISSILE, SHIP_CLASSES, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { hunterSlot, stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { launchMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { flattenTactical, TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { CUTTER, passiveInput } from './helpers/scriptedDuel';
import { makeHostile } from './helpers/hostile';
import { classOf, createTacticalState, emptyMissile, missileOf, placeMissile, removeMissile, shipBody, targetOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import {
  ENGINE_FACTOR, LASER_CHARGE_UNITS, LASER_HULL, LASER_RANGE, MAGAZINE, MISSILE_HULL, MISSILE_LIFE_TICKS, SHIELD_LAYERS, SHIP_HULL, SHIP_RADIUS, THRUST, TURN_STEPS_PER_TICK
} from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';

/** The duel's two slots as plain values (the graceUntil bodies a third slot adds are left out). */
function duelPart(s: TacticalState): unknown {
  const bodies = s.map.asteroids.length + 2;
  return {
    tick: s.tick, rng: s.rng.s, outcome: s.outcome, hunter: { ...s.hunter, trail: Array.from(s.hunter.trail) }, events: s.events,
    ships: s.ships.slice(0, 2).map((b) => ({ ...b, graceUntil: Array.from(b.graceUntil.subarray(0, bodies)) })),
    systems: s.systems.slice(0, 2), missiles: [0, 1].map((i) => { const m = missileOf(s, i); return m ? { ...m } : null; })
  };
}
const quiet = (s: TacticalState): void => { Object.assign(s.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 }); };

describe('ship classes and weapons as definitions (spec §5)', () => {
  it('today\'s numbers are the cutter and hunter entries and the laser and missile weapons', () => {
    expect(SHIP_CLASSES).toEqual([CUTTER_CLASS, HUNTER_CLASS]);
    expect(DUEL_CLASSES).toEqual([ShipClass.Cutter, ShipClass.Hunter]);
    for (const c of SHIP_CLASSES) {
      expect(c).toMatchObject({ hull: SHIP_HULL, radius: SHIP_RADIUS, thrust: THRUST, turnStepsPerTick: TURN_STEPS_PER_TICK, engineFactor: ENGINE_FACTOR, power: null });
      expect(c.shields.layers).toBe(SHIELD_LAYERS);
      expect(c.slots).toEqual({ laser: LASER, missile: MISSILE });
    }
    expect([CUTTER_CLASS.ai, HUNTER_CLASS.ai]).toEqual(['crew', 'hunter']);
    expect(LASER).toMatchObject({ range: LASER_RANGE, chargeUnits: LASER_CHARGE_UNITS, hull: LASER_HULL });
    expect(MISSILE).toMatchObject({ magazine: MAGAZINE, lifeTicks: MISSILE_LIFE_TICKS, hull: MISSILE_HULL });
    expect(Object.isFrozen(CUTTER_CLASS) && Object.isFrozen(LASER) && Object.isFrozen(MISSILE)).toBe(true);
  });
  it('the duel fills slot 0 with the crew\'s Cutter and slot 1 with the hunter, each locked on the other', () => {
    const st = createTacticalState(4);
    expect([classOf(st, 0), classOf(st, 1)]).toEqual([CUTTER_CLASS, HUNTER_CLASS]);
    expect([targetOf(st, 0), targetOf(st, 1)]).toEqual([1, 0]);
    expect(hunterSlot(st)).toBe(1);
    expect(st.systems.map((y) => [y.hull, y.shields, y.magazine])).toEqual([[SHIP_HULL, SHIELD_LAYERS, MAGAZINE], [SHIP_HULL, SHIELD_LAYERS, MAGAZINE]]);   // full shields while holding (owner decision 2026-11-17)
  });
});

describe('ship slots (spec §5 "arrays, not pairs")', () => {
  it('an extra inactive slot holds zeros and changes nothing about the duel\'s two slots, tick for tick', () => {
    for (const seed of [1, 4]) {
      const two = createTacticalState(seed), three = createTacticalState(seed, 3);
      expect(three.ships[2]!.active).toBe(false);
      expect(three.ships[0]!.graceUntil.length).toBe(two.ships[0]!.graceUntil.length + 1);
      for (let t = 0; t < 3600 && two.outcome === 0; t++) {
        stepDuel(two, IDLE_INPUT); stepDuel(three, IDLE_INPUT);
        expect(duelPart(three), `seed ${seed} tick ${t}`).toEqual(duelPart(two));
      }
      expect(three.ships[2]).toMatchObject({ active: false, x: 0, y: 0, vx: 0, vy: 0, planetHits: 0, shipHits: 0 });
      expect(Array.from(three.ships[2]!.graceUntil).every((v) => v === 0)).toBe(true);
      expect(three.systems[2]).toMatchObject({ hull: 0, shots: 0, missilesLaunched: 0, rooms: [0, 0, 0] });
      expect(three.missiles[2]).toEqual(emptyMissile());
      expect([0, 1].map((i) => three.ships[i]!.graceUntil[shipBody(three.map, i, 2)])).toEqual([0, 0]);   // no contact with the empty slot
    }
  }, 60_000);
  it('contacts and the laser work across any pair of active slots, by the locked target', () => {
    const st = makeHostile(createTacticalState(5, 3));
    quiet(st);
    Object.assign(st.ships[2]!, { active: true, x: 500, y: -1800, vx: 0, vy: 0, heading: 192 });   // a third ship, west-facing
    Object.assign(st.systems[2]!, { ...st.systems[1], rooms: [0, 0, 0], target: 0 });
    Object.assign(st.ships[0], { x: 465, y: -1800, vx: 100, vy: 0, heading: 64 });               // overlapping it by 5, closing
    stepFlight(st, [{ turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }], { gravity: false, edge: false, drag: 0, stabilise: 0 });
    expect([st.ships[0].shipHits, st.ships[2]!.shipHits, st.ships[1].shipHits]).toEqual([1, 1, 0]);
    expect([st.systems[0].hull, st.systems[2]!.hull]).toEqual([SHIP_HULL - 1, SHIP_HULL - 1]);
    expect(st.ships[0].graceUntil[shipBody(st.map, 0, 2)]).toBeGreaterThan(0);
    expect(st.ships[2]!.graceUntil[shipBody(st.map, 2, 0)]).toBeGreaterThan(0);
    const before = { ...st.systems[1] };
    Object.assign(st.ships[2]!, { x: st.ships[0].x + hx(64) * 300, y: st.ships[0].y + hy(64) * 300 });   // 300 dead ahead of the crew
    st.systems[0].target = 2; st.systems[0].fireHeld = true; st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, laserCharge: false });
    expect(st.systems[2]!.shields).toBe(SHIELD_LAYERS - 1);
    expect(st.systems[1]).toEqual(before);
    expect(st.events.at(-1)).toMatchObject({ kind: 'laser', ship: 0, hit: true, stripped: true, x2: st.ships[2]!.x, y2: st.ships[2]!.y });
  });
});

describe('the missile pool (spec §5: at most one in flight per ship)', () => {
  it('a missile takes the first free entry, is found by its owner, and its entry is zeroed and freed when it goes', () => {
    const st = createTacticalState(5);
    launchMissile(st, 1);
    expect(st.missiles[0]).toMatchObject({ active: true, owner: 1 });   // the enemy launched first: entry 0
    launchMissile(st, 0);
    expect(st.missiles[1]).toMatchObject({ active: true, owner: 0 });
    expect([missileOf(st, 0), missileOf(st, 1)]).toEqual([st.missiles[1], st.missiles[0]]);
    placeMissile(st, 0, { x: 1, y: 2, vx: 0, vy: 0, heading: 3, headingAcc: 0, age: 4 });   // a second placement reuses ship 0's entry
    expect(st.missiles[1]).toMatchObject({ active: true, owner: 0, x: 1, age: 4 });
    removeMissile(st, 1);
    expect(st.missiles[0]).toEqual(emptyMissile());
    expect(missileOf(st, 1)).toBeNull();
    launchMissile(st, 1);
    expect(st.missiles[0]).toMatchObject({ active: true, owner: 1 });
    expect(() => placeMissile(st, 2, { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 })).toThrow(/no free missile pool entry/);
  });
  it('resolves missiles in owner order, whatever entry they sit in: two expiring on one tick end in owner order', () => {
    const st = createTacticalState(5);
    launchMissile(st, 1); launchMissile(st, 0);                           // ship 1's missile in entry 0, ship 0's in entry 1
    expect(st.missiles.map((m) => m.owner)).toEqual([1, 0]);
    Object.assign(missileOf(st, 1)!, { x: -300, y: 600, vx: 0, vy: 0, age: MISSILE_LIFE_TICKS });   // open space, both at the end of their life
    Object.assign(missileOf(st, 0)!, { x: -300, y: 700, vx: 0, vy: 0, age: MISSILE_LIFE_TICKS });
    st.events = [];
    resolveMissiles(st);
    expect(st.events.map((e) => (e.kind === 'missileEnd' ? [e.ship, e.cause] : null))).toEqual([[0, 'expired'], [1, 'expired']]);
    expect(st.missiles.every((m) => !m.active)).toBe(true);
  });
  it('two touching missiles end each other in owner order, whatever entry they sit in, and both entries are freed', () => {
    const st = createTacticalState(5);
    launchMissile(st, 1); launchMissile(st, 0);
    Object.assign(missileOf(st, 1)!, { x: -300, y: 600, vx: 0, vy: 0, age: 100 });
    Object.assign(missileOf(st, 0)!, { x: -295, y: 600, vx: 0, vy: 0, age: 100 });   // 5 apart: inside two missile radii
    st.events = [];
    resolveMissiles(st);
    expect(st.events.map((e) => (e.kind === 'missileEnd' ? [e.ship, e.cause] : null))).toEqual([[0, 'missile'], [1, 'missile']]);
    expect(st.missiles).toEqual([emptyMissile(), emptyMissile()]);
  });
});

describe('the declared-added fields (new in the R-2 alias table)', () => {
  // The same run kinds ORACLE_RUNS uses: the scripted pair (seed 1 in full, the golden) and a passive crew (capped).
  const cases: { crew: 'scripted' | 'passive'; seed: number; cap: number }[] = [
    { crew: 'scripted', seed: 1, cap: Infinity }, { crew: 'passive', seed: 1, cap: 3000 }, { crew: 'passive', seed: 7, cap: 3000 }
  ];
  it.each(cases)('hold the duel values at every tick of a $crew run, seed $seed: two slots, both active, the Cutter and the hunter, each on the other', ({ crew, seed, cap }) => {
    const d = createSeatedDuel(CUTTER, seed), pair = createScriptedPair(seed), at = new Map<string, number>();
    let offset = 0;
    for (const m of TACTICAL_MODULES) for (const f of m.fields(d.tactical)) { at.set(f.name, offset); offset += f.count; }
    const names = ['ships.length', 'ships.0.active', 'ships.1.active', 'systems.0.cls', 'systems.1.cls', 'systems.0.target', 'systems.1.target'];
    let ticks = 0, wrong = 0;
    try {
      while (d.tactical.outcome === 0 && ticks < cap) {
        stepDuelTick(d, crew === 'scripted' ? scriptedInput(pair, d) : passiveInput(d));
        const v = flattenTactical(d.tactical);
        if (names.map((n) => v[at.get(n)!]).join() !== '2,1,1,0,1,1,0') wrong++;
        ticks++;
      }
    } finally { disposeDuel(d); }
    expect(ticks).toBeGreaterThan(0);
    expect(wrong).toBe(0);
    if (crew === 'scripted') expect(ticks).toBe(9724);   // seed 1's scripted Cutter duel (10320 before homing torpedoes, SIM_VERSION 46; 16268 before the Hunter's grace, SIM_VERSION 45; 15772 before duel fire)
  }, 60_000);
});
