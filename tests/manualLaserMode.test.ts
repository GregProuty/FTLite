// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4, §5): the crew laser's mode. Every round starts AUTO, the
// Hunter always; in MANUAL the laser charges as today but never fires by itself (neither the auto-fire on its target nor
// the AUTO press). The mode and a MANUAL burst's aim are hashed, cloned and bounded: only the crew is ever MANUAL, and an
// aim waits only while a burst is pending.
import { describe, expect, it } from 'vitest';
import { flattenTactical, hashTactical, TACTICAL_MODULES, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { beginRockTick } from '../src/renderer/src/sim/tactical/rocks';
import { cloneTactical, createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, LASER_ARC_STEPS, LASER_CHARGE_UNITS, PEW_ARC_STEPS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT, manualLaserReady, tickWeapons } from '../src/renderer/src/sim/tactical/weapons';

/** The crew at (0, 1500) nose north and still, no rocks, the Hunter at `enemyAt` (default far off, out of laser range),
 *  still, a fresh tick's rock masks, no events. */
function open(enemyAt = { x: 2000, y: 2000 }): TacticalState {
  const st = createTacticalState(5);
  st.rocks.fill(0);   // every seeded rock gone (the seeded grid ignores empty slots)
  beginRockTick(st);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: enemyAt.x, y: enemyAt.y, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
/** One weapons tick of the crew: its commands, then its clocks (stepDuel's two weapon calls, nothing else). */
function weaponsTick(st: TacticalState, input = IDLE_INPUT): void { applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input); }
/** The offset of a tactical field in flattenTactical's values. */
const offsetOf = (s: TacticalState, name: string): number => {
  let at = 0;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(s)) { if (f.name === name) return at; at += f.count; }
  throw new Error(`no tactical field ${name}`);
};

describe('the laser mode (spec §2)', () => {
  it('every slot starts AUTO with no burst aim; the arc in fine units is the pew cone\'s 60°', () => {
    const st = createTacticalState(5);
    expect([st.systems[0].laserManual, st.systems[1].laserManual, st.systems[0].laserAim, st.systems[1].laserAim]).toEqual([false, false, -1, -1]);
    expect(LASER_ARC_STEPS).toBe(10922);
    expect(LASER_ARC_STEPS).toBe(PEW_ARC_STEPS);   // the laser's existing ±60° (LASER_ARC_COS 0.5)
  });
  it('AUTO fires at its target when full and eligible, as today; MANUAL holds the same full charge and never fires', () => {
    const auto = open({ x: 0, y: 1300 });
    weaponsTick(auto);
    expect(auto.systems[0].shots).toBe(1);
    const manual = open({ x: 0, y: 1300 });
    manual.systems[0].laserManual = true;
    for (let k = 0; k < 120; k++) weaponsTick(manual);
    expect(manual.systems[0].shots).toBe(0);
    expect(manual.systems[0].laserCharge).toBe(LASER_CHARGE_UNITS);
  });
  it('in MANUAL the AUTO press (laserCharge) fires nothing', () => {
    const st = open({ x: 0, y: 1300 });
    st.systems[0].laserManual = true;
    weaponsTick(st, { ...IDLE_INPUT, laserCharge: true });
    expect(st.systems[0].shots).toBe(0);
  });
  it('MANUAL charges as today: from empty, the same charge tick for tick as AUTO', () => {
    const a = open(), m = open();
    m.systems[0].laserManual = true;
    a.systems[0].laserCharge = 0; m.systems[0].laserCharge = 0;
    for (let k = 0; k < 60; k++) { weaponsTick(a); weaponsTick(m); expect(m.systems[0].laserCharge).toBe(a.systems[0].laserCharge); }
    expect(m.systems[0].laserCharge).toBeGreaterThan(0);
  });
  it('manualLaserReady: a full charge, no burst pending, Weapons below level 2', () => {
    const st = open();
    expect(manualLaserReady(st, 0)).toBe(true);
    st.systems[0].laserCharge = LASER_CHARGE_UNITS - 1;
    expect(manualLaserReady(st, 0)).toBe(false);
    st.systems[0].laserCharge = LASER_CHARGE_UNITS; st.systems[0].laserBurst = 1;
    expect(manualLaserReady(st, 0)).toBe(false);
    st.systems[0].laserBurst = 0; st.systems[0].rooms[Room.Weapons] = 2;
    expect(manualLaserReady(st, 0)).toBe(false);
  });
});

describe('the mode in the modules (spec §4)', () => {
  it('moves the hash, is copied by the clone, and is bounded by the validator', () => {
    const st = createTacticalState(5), shape = createTacticalState(5), base = hashTactical(st);
    st.systems[0].laserManual = true;
    expect(hashTactical(st)).not.toBe(base);
    const copy = cloneTactical(st);
    expect(copy.systems[0].laserManual).toBe(true);
    expect(flattenTactical(copy)).toEqual(flattenTactical(st));
    st.systems[0].laserManual = false;
    expect(hashTactical(st)).toBe(base);
    Object.assign(st.systems[0], { laserManual: true, laserBurst: 1, laserBurstClock: 5, laserAim: 300 });
    expect(hashTactical(st)).not.toBe(base);
    const values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const bad = (name: string, v: number, why: RegExp): void => {
      const x = [...values]; x[offsetOf(st, name)] = v;
      expect(() => validateTacticalValues(shape, x), `${name} = ${v}`).toThrow(why);
    };
    bad('systems.0.laserManual', 2, /out of range/);
    bad('systems.1.laserManual', 1, /only the crew laser has a manual mode/);   // the Hunter is always AUTO
    bad('systems.0.laserAim', AIM_STEPS, /out of range/);
    bad('systems.0.laserAim', -2, /out of range/);
    bad('systems.0.laserAim', 0.5, /out of range/);
    bad('systems.1.laserAim', 7, /a manual aim with no burst pending/);   // the Hunter's laserBurst is 0
  });
});
