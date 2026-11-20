// UI round spec §1.1, §1.2: the Hunter's hull and the Valkyrn's thrust. Every game ship flies with drag, so its top
// speed is the fixed point of v' = (v + a·dt)(1 − drag·dt): v* = a(1 − drag·dt)/drag. MAX_SPEED only caps drag 0.
import { describe, expect, it } from 'vitest';
import { CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { flyShip } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import { DRAG, DT, HUNTER_HULL, MAX_SPEED, THRUST, VALKYRN_THRUST, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';

const FLAT: FlightTuning = { gravity: false, edge: false, drag: DRAG, stabilise: 0 };
const ship = (): Ship => ({ ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
function topSpeed(cls: typeof VALKYRN_CLASS): number {
  const s = ship();
  for (let k = 0; k < 20000; k++) flyShip(s, { turn: 0, thrust: 1 }, FLAT, 0, cls);
  return Math.hypot(s.vx, s.vy);
}

describe('UI round balance (spec §1.1, §1.2)', () => {
  it('the Hunter has 95 hull; the crew ships keep theirs', () => {
    expect(HUNTER_HULL).toBe(95);
    expect(HUNTER_CLASS.hull).toBe(95);
    expect(CUTTER_CLASS.hull).toBe(70);
  });
  it('the Valkyrn thrusts 200 (both fits); the Hound and the Hunter keep 120; MAX_SPEED stays 400', () => {
    expect(VALKYRN_THRUST).toBe(200);
    expect([VALKYRN_CLASS.thrust, VALKYRN_LASER_CLASS.thrust, CUTTER_CLASS.thrust, HUNTER_CLASS.thrust]).toEqual([200, 200, THRUST, THRUST]);
    expect(MAX_SPEED).toBe(400);
  });
  it('top speed is thrust over drag: the Valkyrn about 1330 u/s, a standard ship about 798 u/s', () => {
    const fixed = (a: number): number => (a * (1 - DRAG * DT)) / DRAG;
    expect(topSpeed(VALKYRN_CLASS)).toBeCloseTo(fixed(200), 3);
    expect(topSpeed(HUNTER_CLASS)).toBeCloseTo(fixed(120), 3);
    expect(topSpeed(VALKYRN_CLASS) / topSpeed(HUNTER_CLASS)).toBeCloseTo(200 / 120, 6);
  });
});
