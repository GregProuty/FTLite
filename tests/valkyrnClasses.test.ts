// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §6.1, §7.1, §10 Class and Null laser): the Valkyrn's two ship
// classes appended to SHIP_CLASSES (the gun Valkyrn and its laser fit), the gun's definition, the crew slot's class in
// createTacticalState, and a null laser slot: no charge, no target, no laser event, and the hash validator's laser
// maxima taken over the classes that have one, so a Hound snapshot and checkpoint still validate.
import { describe, expect, it } from 'vitest';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { classIndexById, CUTTER_CLASS, GUN, HUNTER_CLASS, LASER, MISSILE, SHIP_CLASSES, ShipClass, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { flattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState, Outcome, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DT, GUN_POOL, HEADING_COUNT, SHIP_RADIUS, VALKYRN_HULL, VALKYRN_THRUST, VALKYRN_TURN_DEG_PER_S } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT, laserEligible, laserFull } from '../src/renderer/src/sim/tactical/weapons';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { makeHostile } from './helpers/hostile';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { liveDuel } from './helpers/liveDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** The crew ship of class `cls` at (−600, −300) facing east at the enemy 300 units away (facing west at it), hostile,
 *  no asteroids: inside the Cutter laser's arc and range. */
function facing(cls: number): TacticalState {
  const st = todaysCrewWeapons(makeHostile(createTacticalState(5, 2, cls)));   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
  st.map = { ...st.map, asteroids: [] }; st.grid = buildGrid([], st.map.rMap);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}

describe('the Valkyrn classes (spec §6.1)', () => {
  it('appends the gun Valkyrn and its laser fit, so the Cutter and Hunter indices do not move', () => {
    expect(SHIP_CLASSES).toEqual([CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS]);
    expect(ShipClass).toEqual({ Cutter: 0, Hunter: 1, Valkyrn: 2, ValkyrnLaser: 3 });
    expect(SHIP_CLASSES.map((c) => c.id)).toEqual(['cutter', 'hunter', 'valkyrn', 'valkyrnLaser']);
    expect(['cutter', 'hunter', 'valkyrn', 'valkyrnLaser'].map(classIndexById)).toEqual([0, 1, 2, 3]);
    expect(() => classIndexById('skiff')).toThrow(/unknown ship class skiff/);
  });
  it('the Valkyrn: hull 53, thrust 160, 200°/s, the gun and the torpedo, no laser; the laser fit has the Cutter\'s laser and no gun', () => {
    expect([VALKYRN_HULL, VALKYRN_THRUST, VALKYRN_TURN_DEG_PER_S]).toEqual([53, 160, 200]);   // W-1: duel hull ×1.75 to hold the 180 s floor with the pew (30 before)
    expect(VALKYRN_CLASS).toMatchObject({ id: 'valkyrn', ai: 'crew', hull: 53, thrust: 160, radius: SHIP_RADIUS, turnStepsPerTick: (VALKYRN_TURN_DEG_PER_S / 360) * HEADING_COUNT * DT });
    expect(VALKYRN_CLASS.slots).toEqual({ laser: null, gun: GUN, pew: null, missile: MISSILE });
    expect(VALKYRN_LASER_CLASS).toMatchObject({ id: 'valkyrnLaser', ai: 'crew', hull: 53, thrust: 160, turnStepsPerTick: VALKYRN_CLASS.turnStepsPerTick });
    expect(VALKYRN_LASER_CLASS.slots).toEqual({ laser: LASER, gun: null, pew: null, missile: MISSILE });
    expect([CUTTER_CLASS.slots.gun, HUNTER_CLASS.slots.gun]).toEqual([null, null]);
    expect(VALKYRN_CLASS.shields).toEqual(CUTTER_CLASS.shields);
    for (const c of SHIP_CLASSES) expect(c.turnStepsPerTick, c.id).toBeLessThan(3);   // spec §6.2: the aim band is three indices
  });
  it('the gun\'s numbers are the tuning constants', () => {
    expect(GUN).toEqual({ kind: 'gun', intervalTicks: 6, speed: 700, lifeTicks: 52, muzzleForward: SHIP_RADIUS + 1, muzzleLateral: 12,
      heatPerShot: 50, cool: 4, coolLocked: 8, heatMax: 1000, hitsPerLayer: 8, hitsPerHull: 12, hitsPerLevel: 6 });   // hitsPerHull 3 → 12 by the Valkyrn gate (spec §12)
    expect(GUN_POOL).toBe(64);
  });
});

describe('the crew slot\'s class (spec §6.1)', () => {
  it('createTacticalState takes it (default the Cutter); the Hunter\'s slot is unchanged; it must be a crew class', () => {
    const cutter = createTacticalState(5), valkyrn = createTacticalState(5, 2, ShipClass.Valkyrn), fit = createTacticalState(5, 2, ShipClass.ValkyrnLaser);
    expect([cutter.systems[0].cls, valkyrn.systems[0].cls, fit.systems[0].cls]).toEqual([0, 2, 3]);
    expect([valkyrn.systems[1].cls, valkyrn.systems[1].hull]).toEqual([ShipClass.Hunter, HUNTER_CLASS.hull]);
    expect(valkyrn.systems[0]).toMatchObject({ hull: VALKYRN_HULL, laserCharge: 0, laserTargeted: false, shields: 1, magazine: MISSILE.magazine });   // Engineering spike spec §2 and Decision 5: every crew class starts at 1 layer (2 Shields bars)
    expect(fit.systems[0]).toMatchObject({ hull: VALKYRN_HULL, laserCharge: LASER.chargeUnits, laserTargeted: true });   // Feel-i: the crew laser starts full and targeted
    expect(Array.from(flattenTactical(valkyrn))).not.toEqual(Array.from(flattenTactical(cutter)));
    for (const bad of [ShipClass.Hunter, 4, -1, 1.5]) expect(() => createTacticalState(5, 2, bad), `class ${bad}`).toThrow(/invalid crew ship class/);
  });
});

describe('a null laser (spec §6.1)', () => {
  it('never charges, targets or fires: no crew laser event from the gun Valkyrn in arc and range; the laser fit fires at once', () => {
    const st = facing(ShipClass.Valkyrn), fit = facing(ShipClass.ValkyrnLaser);
    expect([laserFull(st, 0), laserEligible(st, 0, 1), laserEligible(fit, 0, 1)]).toEqual([false, false, true]);
    let crewLasers = 0;
    for (let k = 0; k < 600 && st.outcome === Outcome.Running; k++) { stepDuel(st, IDLE_INPUT); crewLasers += st.events.filter((e) => e.kind === 'laser' && e.ship === 0).length; }
    expect(crewLasers).toBe(0);
    expect([st.systems[0].laserCharge, st.systems[0].laserTargeted, st.systems[0].shots, st.systems[0].laserBurst]).toEqual([0, false, 0, 0]);
    stepDuel(fit, IDLE_INPUT);
    expect(fit.events.some((e) => e.kind === 'laser' && e.ship === 0)).toBe(true);
  });
  it('the validator takes the laser maxima over the classes that have one: a Valkyrn state, a Hound snapshot and a Hound checkpoint validate', () => {
    const v = flattenTactical(createTacticalState(5, 2, ShipClass.Valkyrn));
    expect(validateTacticalValues(createTacticalState(5), v)).toBe(v.length);
    const d = createDuel(DUEL_LAYOUT, 5);
    try {
      const r = loadDuelSnapshot(DUEL_LAYOUT, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try { expect(hashDuel(r)).toBe(hashDuel(d)); } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
    const live = liveDuel(duelInit(5, 'null-laser', 0, DUEL_LAYOUT));
    live.tick(30);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
  });
  it('online, the checkpoint snapshot\'s crew class must be the layout\'s own (spec §8: the laser fit is local only)', () => {
    const live = liveDuel(duelInit(5, 'crew-class', 0, DUEL_LAYOUT));
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    const swapped = (cls: number): DuelCheckpoint => {
      const d = createDuel(DUEL_LAYOUT, cp.snapshot.header.seed, 0, 2, cls);
      try { return { ...cp, snapshot: JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))) }; } finally { disposeDuel(d); }
    };
    expect(cp.snapshot.header.tick).toBe(0);
    expect(() => validateDuelCheckpoint(swapped(ShipClass.Cutter), DIGEST, resolveCutter)).not.toThrow();   // the swap itself is a valid checkpoint
    expect(() => validateDuelCheckpoint(swapped(ShipClass.ValkyrnLaser), DIGEST, resolveCutter)).toThrow(/crew class/);
    // Locally the snapshot keeps the class free: the laser fit round-trips on the Hound's layout.
    const fit = createDuel(DUEL_LAYOUT, 5, 0, 2, ShipClass.ValkyrnLaser);
    try { const r = loadDuelSnapshot(DUEL_LAYOUT, JSON.parse(JSON.stringify(saveDuelSnapshot(fit, DIGEST))), DIGEST); try { expect(r.crewClass).toBe(ShipClass.ValkyrnLaser); } finally { disposeDuel(r); } } finally { disposeDuel(fit); }
  });
});
