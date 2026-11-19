// W-1 pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §4, §5): the pew's definition, the charge in thirds, the cone
// clamp in fine heading units, a round fired from the nose, and the new state in the hash, the clone and the validator.
import { describe, expect, it } from 'vitest';
import { CUTTER_CLASS, HUNTER_CLASS, HUNTER_PEW, PEW, ShipClass, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';
import { flattenTactical, hashTactical, TACTICAL_MODULES, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { aimDir, clampAim, firePew, pewReady, validAim } from '../src/renderer/src/sim/tactical/pew';
import { cloneTactical, createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, HEADING_COUNT, HUNTER_PEW_GAP, HUNTER_PEW_RECHARGE_TICKS, PEW_ARC, PEW_ARC_STEPS, PEW_HULL, PEW_LIFE, PEW_POOL, PEW_RANGE, PEW_RECHARGE_TICKS, PEW_SHOTS, PEW_SPEED, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';

const FULL = PEW_SHOTS * PEW_RECHARGE_TICKS;
/** One duel tick with the crew firing the pew straight along its nose, or not. Returns whether a crew round went out. */
function tick(st: TacticalState, fire: boolean): boolean {
  const before = st.systems[0].pewShots;
  stepDuel(st, { ...IDLE_INPUT, pewAim: fire ? st.ships[0].heading * HEADING_COUNT : -1 });
  return st.systems[0].pewShots > before;
}
/** The offset of a tactical field in flattenTactical's values. */
const offsetOf = (s: TacticalState, name: string): number => {
  let at = 0;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(s)) { if (f.name === name) return at; at += f.count; }
  throw new Error(`no tactical field ${name}`);
};

describe('the pew definition (spec §1)', () => {
  it('has the spec numbers, on the Cutter and the Hunter only', () => {
    expect(PEW).toEqual({ kind: 'pew', shots: 3, rechargeTicks: 60, speed: 900, lifeTicks: 30, hull: 1, arcSteps: PEW_ARC_STEPS, muzzleForward: SHIP_RADIUS + 1 });
    expect([PEW_SHOTS, PEW_RECHARGE_TICKS, PEW_POOL, PEW_SPEED, PEW_LIFE, PEW_HULL, PEW_ARC]).toEqual([3, 60, 16, 900, 30, 1, 60]);
    expect(AIM_STEPS).toBe(65536);
    expect(PEW_ARC_STEPS).toBe(10922);   // 60° of 65536, rounded down so the cone never exceeds 60°
    expect(PEW_RANGE).toBeCloseTo(450, 9);
    expect([CUTTER_CLASS.slots.pew, HUNTER_CLASS.slots.pew, VALKYRN_CLASS.slots.pew, VALKYRN_LASER_CLASS.slots.pew]).toEqual([PEW, HUNTER_PEW, null, null]);
    expect(HUNTER_PEW).toEqual({ ...PEW, rechargeTicks: HUNTER_PEW_RECHARGE_TICKS });   // W-1 Task 6: the Hunter's own recharge
  });
});

describe('the charge (spec §1, §5)', () => {
  it('both duel ships start full; a class without the pew holds zero', () => {
    const st = createTacticalState(5);
    expect([st.systems[0].pewCharge, st.systems[1].pewCharge]).toEqual([FULL, PEW_SHOTS * HUNTER_PEW_RECHARGE_TICKS]);
    expect(createTacticalState(5, 2, ShipClass.Valkyrn).systems[0].pewCharge).toBe(0);
  });
  it('three rapid fires succeed and the fourth is refused', () => {
    const st = createTacticalState(5);
    expect([tick(st, true), tick(st, true), tick(st, true), tick(st, true)]).toEqual([true, true, true, false]);
    expect(st.systems[0].pewShots).toBe(3);
  });
  it('from empty: one shot after 60 ticks, three after 180; the partial third is kept', () => {
    const st = createTacticalState(5);
    st.systems[0].pewCharge = 0;
    for (let k = 0; k < 59; k++) tick(st, false);
    expect(pewReady(st, 0)).toBe(false);
    tick(st, false);
    expect(st.systems[0].pewCharge).toBe(60); expect(pewReady(st, 0)).toBe(true);
    const full = createTacticalState(5);
    full.systems[0].pewCharge = 0;
    for (let k = 0; k < 180; k++) tick(full, false);
    expect(full.systems[0].pewCharge).toBe(FULL);
    expect([tick(full, true), tick(full, true), tick(full, true), tick(full, true)]).toEqual([true, true, true, false]);
    const part = createTacticalState(5);
    part.systems[0].pewCharge = 90;
    expect(tick(part, true)).toBe(true);
    expect(part.systems[0].pewCharge).toBe(31);   // 90 − 60, then the tick's recharge
  });
  it('mashing every tick fires exactly once per 60 ticks after the first three', () => {
    const st = createTacticalState(5), fired: number[] = [];
    for (let k = 0; k < 600; k++) if (tick(st, true)) fired.push(k);
    expect(fired).toEqual([0, 1, 2, ...Array.from({ length: 9 }, (_, n) => 60 * (n + 1))]);
  });
  it('the crew refills one third per PEW_RECHARGE_TICKS (60), the Hunter one per HUNTER_PEW_RECHARGE_TICKS (Task 6)', () => {
    const st = createTacticalState(5);
    st.systems[0].pewCharge = 0; st.systems[1].pewCharge = 0;
    const most = Math.max(PEW_RECHARGE_TICKS, HUNTER_PEW_RECHARGE_TICKS), crewAt: number[] = [], hunterAt: number[] = [];
    for (let k = 1; k <= most; k++) {
      tick(st, false);   // the Hunter holds fire before it turns hostile, so its charge only refills
      if (crewAt.length === 0 && pewReady(st, 0)) crewAt.push(k);
      if (hunterAt.length === 0 && pewReady(st, 1)) hunterAt.push(k);
    }
    expect(crewAt).toEqual([60]);
    expect(hunterAt).toEqual([HUNTER_PEW_RECHARGE_TICKS]);
  });
  it('recharge does not change with Weapons damage, and a full charge stays full', () => {
    const st = createTacticalState(5);
    st.systems[0].pewCharge = 0; st.systems[0].rooms[Room.Weapons] = 2;
    for (let k = 0; k < 60; k++) tick(st, false);
    expect(st.systems[0].pewCharge).toBe(60);
    const full = createTacticalState(5);
    for (let k = 0; k < 10; k++) tick(full, false);
    expect(full.systems[0].pewCharge).toBe(FULL);
  });
});

describe('the aim (spec §1, §4)', () => {
  it('accepts a heading index and its fraction, integers 0..255 each', () => {
    expect([validAim(0, 0), validAim(255, 255), validAim(12, 200)]).toEqual([true, true, true]);
    expect([validAim(256, 0), validAim(-1, 0), validAim(0, 256), validAim(0, -1), validAim(1.5, 0), validAim(0, Number.NaN), validAim('1', 0)]).toEqual([false, false, false, false, false, false, false]);
  });
  it('clamps an aim outside ±60° to the cone edge, in fine heading units, across the wrap', () => {
    expect(clampAim(0, 128 * HEADING_COUNT, PEW_ARC_STEPS)).toBe(AIM_STEPS - PEW_ARC_STEPS);   // dead astern: the anticlockwise edge
    expect(clampAim(0, 64 * HEADING_COUNT, PEW_ARC_STEPS)).toBe(PEW_ARC_STEPS);                // 90° right: the clockwise edge
    expect(clampAim(10, 10 * HEADING_COUNT + 100, PEW_ARC_STEPS)).toBe(10 * HEADING_COUNT + 100);   // inside: unchanged
    expect(clampAim(250, 5 * HEADING_COUNT, PEW_ARC_STEPS)).toBe(5 * HEADING_COUNT);            // 11 steps clockwise across north
    expect(clampAim(250, 100 * HEADING_COUNT, PEW_ARC_STEPS)).toBe(250 * HEADING_COUNT + PEW_ARC_STEPS - AIM_STEPS);
  });
  it('turns a fine aim into a unit direction from the heading table', () => {
    const [nx, ny] = aimDir(0), [ex, ey] = aimDir(64 * HEADING_COUNT);
    expect(nx).toBeCloseTo(0, 12); expect(ny).toBeCloseTo(-1, 12);
    expect(ex).toBeCloseTo(1, 12); expect(ey).toBeCloseTo(0, 12);
  });
});

describe('a round fired (spec §1)', () => {
  it('leaves the nose along the clamped aim at the round speed, ignoring the ship velocity; spends a third; pushes pewFire', () => {
    const st = createTacticalState(5), s = st.ships[0];
    Object.assign(s, { x: 100, y: 200, vx: 50, vy: -30, heading: 0, headingAcc: 0 });
    st.events = [];
    expect(firePew(st, 0, 64 * HEADING_COUNT)).toBe(true);   // 90° right, clamped to the cone's edge
    const r = st.pew.find((e) => e.active)!, [ux, uy] = aimDir(PEW_ARC_STEPS);
    expect([r.x, r.y, r.age, r.owner]).toEqual([100, 200 - (SHIP_RADIUS + 1), 0, 0]);
    expect(r.vx).toBeCloseTo(ux * PEW_SPEED, 9); expect(r.vy).toBeCloseTo(uy * PEW_SPEED, 9);
    expect(st.systems[0].pewCharge).toBe(FULL - PEW_RECHARGE_TICKS);
    expect(st.events).toEqual([{ kind: 'pewFire', ship: 0, x: 100, y: 200 - (SHIP_RADIUS + 1) }]);
    expect(st.rounds.every((e) => !e.active)).toBe(true);   // the gun's pool is untouched
  });
  it('refuses with less than a third, a bad aim, or a class without the pew', () => {
    const st = createTacticalState(5);
    st.systems[0].pewCharge = 59;
    expect(firePew(st, 0, 0)).toBe(false);
    st.systems[0].pewCharge = 60;
    expect([firePew(st, 0, -1), firePew(st, 0, AIM_STEPS), firePew(st, 0, 0.5)]).toEqual([false, false, false]);
    expect(firePew(createTacticalState(5, 2, ShipClass.Valkyrn), 0, 0)).toBe(false);
    expect(st.pew.every((e) => !e.active)).toBe(true);
  });
  it('the pool holds PEW_POOL rounds shared by both ships, and a full pool reuses the oldest', () => {
    const st = createTacticalState(5);
    expect(st.pew).toHaveLength(PEW_POOL);
    st.pew.forEach((e, k) => Object.assign(e, { x: k, y: 0, vx: 0, vy: -900, age: [3, 9, 1, 9][k % 4]!, owner: k % 2, active: true }));
    placeRound(st, { x: 7, y: 7, vx: 0, vy: 0, age: 0, owner: 1 }, st.pew);
    expect([st.pew[1]!.x, st.pew[1]!.age, st.pew[1]!.owner]).toEqual([7, 0, 1]);   // the first of the oldest (age 9)
  });
});

describe('the pew state in the modules (spec §4)', () => {
  it('moves the hash, is copied by the clone, and is bounded by the validator', () => {
    const st = createTacticalState(5), shape = createTacticalState(5), base = hashTactical(st);
    st.systems[0].pewCharge--; expect(hashTactical(st)).not.toBe(base); st.systems[0].pewCharge++;
    st.hunter.pewClock = 3; expect(hashTactical(st)).not.toBe(base); st.hunter.pewClock = 0;
    expect(hashTactical(st)).toBe(base);
    firePew(st, 0, st.ships[0].heading * HEADING_COUNT);
    const copy = cloneTactical(st);
    expect(flattenTactical(copy)).toEqual(flattenTactical(st));
    copy.pew.find((e) => e.active)!.x += 5;
    expect(flattenTactical(copy)).not.toEqual(flattenTactical(st));
    Object.assign(st.hunter, { pewBurst: 2, pewClock: HUNTER_PEW_GAP });
    Object.assign(st.systems[1], { pewShots: 4, pewHits: 2 });
    const values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const bad = (name: string, k: number, v: number, why: RegExp): void => {
      const x = [...values]; x[offsetOf(st, name) + k] = v;
      expect(() => validateTacticalValues(shape, x), `${name}[${k}] = ${v}`).toThrow(why);
    };
    const flying = st.pew.findIndex((e) => e.active), free = st.pew.findIndex((e) => !e.active);
    // Task 6 review: the bound is the slot's own class's full pew (it was the fullest class's).
    bad('systems.0.pewCharge', 0, FULL + 1, /out of range/);   // the Cutter: 181 refused
    bad('systems.1.pewCharge', 0, PEW_SHOTS * HUNTER_PEW_RECHARGE_TICKS + 1, /out of range/);
    const hunterFull = [...values]; hunterFull[offsetOf(st, 'systems.1.pewCharge')] = PEW_SHOTS * HUNTER_PEW_RECHARGE_TICKS;
    expect(validateTacticalValues(shape, hunterFull)).toBe(values.length);   // the Hunter: its full 360 accepted
    bad('systems.1.pewCharge', 0, -1, /out of range/);
    bad('systems.0.pewShots', 0, -1, /out of range/);
    bad('systems.1.pewHits', 0, 0.5, /out of range/);
    bad('hunter.pewBurst', 0, PEW_SHOTS + 1, /out of range/);
    bad('hunter.pewClock', 0, HUNTER_PEW_GAP + 1, /out of range/);
    bad(`pew.${flying}.flight`, 4, PEW_LIFE + 1, /age out of range/);
    bad(`pew.${flying}.owner`, 0, 2, /owner is not an active ship slot/);
    bad(`pew.${free}.flight`, 0, 5, /a free entry holds values/);
    bad(`pew.${free}.active`, 0, 2, /not 0 or 1/);
  });
  it('a class without the pew holds no charge: the Valkyrn slot is bounded at 0 (Task 6 review)', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), shape = createTacticalState(5, 2, ShipClass.Valkyrn), values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const x = [...values]; x[offsetOf(st, 'systems.0.pewCharge')] = 1;
    expect(() => validateTacticalValues(shape, x)).toThrow(/systems\.0\.pewCharge: out of range/);
  });
});
