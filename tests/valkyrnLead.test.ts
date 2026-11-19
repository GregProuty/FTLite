// Valkyrn spec §7.4 and §10 (Lead pip): the sim's lead maths (sim/tactical/lead.ts), which the scripted pilot aims with,
// agrees with the view's lead pip (render/duel/leadModel.ts), which the player aims with.
import { describe, expect, it } from 'vitest';
import { leadPip } from '../src/renderer/src/render/duel/leadModel';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { interceptTime, leadOffset, nearestHeading } from '../src/renderer/src/sim/tactical/lead';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { GUN_SPEED, HEADING_COUNT } from '../src/renderer/src/sim/tactical/tuning';

/** A two-ship state, the gun Valkyrn in slot 0, with the given relative pose. */
function pose(rx: number, ry: number, svx: number, svy: number, tvx: number, tvy: number): TacticalState {
  const st = createTacticalState(7, 2, ShipClass.Valkyrn), [s, t] = st.ships;
  s!.x = 100; s!.y = -40; s!.vx = svx; s!.vy = svy;
  t!.x = 100 + rx; t!.y = -40 + ry; t!.vx = tvx; t!.vy = tvy;
  return st;
}

/** The view's pip as an offset from ship 0, or null: Part ii's `leadPip(sx, sy, svx, svy, tx, ty, tvx, tvy, speed)`
 *  returns the target's place in the shooter's frame after the flight, a world point, so the offset is it less ship 0. */
function viewOffset(st: TacticalState): { x: number; y: number } | null {
  const s = st.ships[0]!, e = st.ships[st.systems[0]!.target]!;
  const p = leadPip(s.x, s.y, s.vx, s.vy, e.x, e.y, e.vx, e.vy, GUN.speed);
  return p ? { x: p.x - s.x, y: p.y - s.y } : null;
}

const CASES: [number, number, number, number, number, number][] = [];
for (let k = 0; k < 40; k++) {   // a fixed spread: ranges 60..600, crossing, closing and opening targets, a moving shooter
  const r = 60 + 13.5 * k, h = (k * 37) % HEADING_COUNT, g = (k * 91 + 11) % HEADING_COUNT;
  CASES.push([r * hx(h), r * hy(h), (k % 5) * 12 - 24, (k % 3) * -15, 180 * hx(g), 180 * hy(g)]);
}

describe('the sim lead helper', () => {
  it('interceptTime: a target at rest straight ahead is met at range / speed', () => {
    expect(interceptTime(350, 0, 0, 0, 700)).toBeCloseTo(0.5, 12);
  });
  it('interceptTime: the met point is on the round circle (|r + v t| = speed t)', () => {
    for (const [rx, ry, , , vx, vy] of CASES) {
      const t = interceptTime(rx, ry, vx, vy, GUN_SPEED);
      expect(t).toBeGreaterThan(0);
      const x = rx + vx * t, y = ry + vy * t;
      expect(Math.sqrt(x * x + y * y)).toBeCloseTo(GUN_SPEED * t, 6);
    }
  });
  it('interceptTime: a target running away faster than the round gives −1', () => {
    expect(interceptTime(300, 0, 900, 0, 700)).toBe(-1);
  });
  it('nearestHeading returns every heading index from its own direction, and −1 for no direction', () => {
    for (let h = 0; h < HEADING_COUNT; h++) expect(nearestHeading(5 * hx(h), 5 * hy(h))).toBe(h);
    expect(nearestHeading(0, 0)).toBe(-1);
  });
  it('leadOffset is relative to the shooter and uses the relative velocity (rounds inherit the ship velocity)', () => {
    const st = pose(400, 0, 50, 0, 50, 120), o = leadOffset(st, 0)!, t = interceptTime(400, 0, 0, 120, GUN_SPEED);
    expect(o.x).toBeCloseTo(400, 9); expect(o.y).toBeCloseTo(120 * t, 9);
  });
  it('agrees with the view lead pip (render/duel/leadModel.ts) over the fixed table', () => {
    for (const c of CASES) {
      const st = pose(...c), sim = leadOffset(st, 0), view = viewOffset(st);
      expect(view === null, JSON.stringify(c)).toBe(sim === null);
      if (sim && view) { expect(view.x, JSON.stringify(c)).toBeCloseTo(sim.x, 6); expect(view.y, JSON.stringify(c)).toBeCloseTo(sim.y, 6); }
    }
  });
});
