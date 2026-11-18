// Valkyrn spec §7.4, §10: the lead pip is the constant-velocity intercept in the shooter's frame. Checked pure, then against a
// sim fly-out: a round fired by tickGun along the pip's bearing, flying straight as stepRounds flies it, while the Hunter
// flies under the sim's flySlot, with flight forces off, then with the default flight far from the planet.
import { describe, expect, it } from 'vitest';
import { leadPip, leadPipFor, onTarget } from '../src/renderer/src/render/duel/leadModel';
import { createTacticalState, NO_AXES, classOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { tickGun } from '../src/renderer/src/sim/tactical/gun';
import { flySlot } from '../src/renderer/src/sim/tactical/physics';
import { UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { DEFAULT_FLIGHT, DT } from '../src/renderer/src/sim/tactical/tuning';
import { headingOf } from '../src/renderer/src/render/tactical/tacticalModel';

const segDist = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(ax + dx * k - px, ay + dy * k - py);
};

describe('leadPip (pure)', () => {
  it('a target at rest relative to the shooter: the pip is the target, t its range over the speed', () => {
    const l = leadPip(0, 0, 50, 0, 300, 400, 50, 0, 700)!;
    expect(l.x).toBeCloseTo(300, 9); expect(l.y).toBeCloseTo(400, 9); expect(l.t).toBeCloseTo(500 / 700, 9);
  });
  it('the pip is speed·t from the shooter, along the target\'s relative track', () => {
    for (const [tx, ty, vx, vy] of [[300, 0, 0, 100], [-200, 250, 80, -60], [0, -500, -150, 0]] as const) {
      const l = leadPip(10, 20, 30, -5, tx, ty, vx, vy, 700)!;
      expect(Math.hypot(l.x - 10, l.y - 20)).toBeCloseTo(700 * l.t, 6);
      expect(l.x).toBeCloseTo(tx + (vx - 30) * l.t, 6); expect(l.y).toBeCloseTo(ty + (vy + 5) * l.t, 6);
    }
  });
  it('no pip when the target outruns the round or sits on the shooter', () => {
    expect(leadPip(0, 0, 0, 0, 100, 0, 800, 0, 700)).toBeNull();
    expect(leadPip(0, 0, 0, 0, 0, 0, 10, 0, 700)).toBeNull();
  });
  it('leadPipFor reads ship i and its target from the state: the nine-number pip on the gun class, null without a gun', () => {
    const st = createTacticalState(7, 2, ShipClass.Valkyrn), s = st.ships[0]!, t = st.ships[1]!;
    s.x = 100; s.y = -40; s.vx = 20; s.vy = 0; t.x = 400; t.y = 60; t.vx = -30; t.vy = 50;
    expect(leadPipFor(st, 0)).toEqual(leadPip(100, -40, 20, 0, 400, 60, -30, 50, GUN.speed));
    expect(leadPipFor(createTacticalState(7, 2), 0)).toBeNull();   // the Cutter has no gun
  });
  it('onTarget: forward along the heading only, within the radius', () => {
    expect(onTarget(0, 0, 64, 300, 15, 20)).toBe(true);     // heading 64 points +x (east)
    expect(onTarget(0, 0, 64, 300, 25, 20)).toBe(false);
    expect(onTarget(0, 0, 64, -300, 0, 20)).toBe(false);    // behind
  });
});

/** The crew Valkyrn at (1800, 300) and the Hunter at (2050, 150) coasting along its nose: both ≥ 1500 u from the planet. */
function setup(): { t: TacticalState; j: number } {
  const t = createTacticalState(3, undefined, ShipClass.Valkyrn), j = t.systems[0].target;
  t.ships.forEach((s, i) => { if (i !== 0 && i !== j) s.active = false; });
  Object.assign(t.ships[0], { x: 1800, y: 300, vx: 30, vy: -10, headingAcc: 0 });
  Object.assign(t.ships[j]!, { x: 2050, y: 150, vx: 60, vy: 80, heading: headingOf(60, 80), headingAcc: 0, released: false, skidBudget: 0, skidSign: 0 });
  return { t, j };
}
/** Fire one round from heading h with tickGun; its spawn point and velocity (u/s, as ships). */
function fire(t: TacticalState, h: number): { x: number; y: number; vx: number; vy: number } {
  t.ships[0].heading = h;
  const before = t.rounds.map((r) => r.active);
  tickGun(t, 0, { ...UNCREWED_INPUT, weapons: true, gunHeld: true });
  const k = t.rounds.findIndex((r, i) => r.active && !before[i]);
  expect(k).toBeGreaterThanOrEqual(0);
  const r = t.rounds[k]!;
  expect(Math.hypot(r.vx - t.ships[0].vx, r.vy - t.ships[0].vy)).toBeCloseTo(GUN.speed, 2);   // muzzle speed along the nose (the heading table's unit vector), plus the ship's
  return { x: r.x, y: r.y, vx: r.vx, vy: r.vy };
}

describe('the pip against the sim (Valkyrn spec §10)', () => {
  it('flight forces off, the Hunter coasting: a round fired along the pip\'s bearing passes within the Hunter\'s radius', () => {
    const NONE = { gravity: false, edge: false, drag: 0, stabilise: 0 };
    const { t, j } = setup(), s = t.ships[0], e = t.ships[j]!;
    const lead = leadPip(s.x, s.y, s.vx, s.vy, e.x, e.y, e.vx, e.vy, GUN.speed)!;
    const r = fire(t, headingOf(lead.x - s.x, lead.y - s.y));
    let px = r.x, py = r.y, best = Infinity;
    for (let k = 0; k < GUN.lifeTicks; k++) {
      flySlot(t, j, NO_AXES, NONE);
      const nx = px + r.vx * DT, ny = py + r.vy * DT;
      best = Math.min(best, segDist(px, py, nx, ny, e.x, e.y));
      px = nx; py = ny;
    }
    expect(best).toBeLessThanOrEqual(classOf(t, j).radius);
  });
  it('default flight, ≥ 1500 u from the planet: the round passes within 10 u of the predicted point, and the Hunter arrives there', () => {
    const a = setup(), s0 = a.t.ships[0], e0 = a.t.ships[a.j]!;
    const centre = leadPip(s0.x, s0.y, s0.vx, s0.vy, e0.x, e0.y, e0.vx, e0.vy, GUN.speed)!;
    const probe = fire(setup().t, headingOf(centre.x - s0.x, centre.y - s0.y));   // where a round leaves the muzzle at that heading
    const lead = leadPip(probe.x, probe.y, s0.vx, s0.vy, e0.x, e0.y, e0.vx, e0.vy, GUN.speed)!;
    const P = { x: e0.x + e0.vx * lead.t, y: e0.y + e0.vy * lead.t };   // the predicted point: where the Hunter will be
    const { t, j } = setup(), e = t.ships[j]!, r = fire(t, headingOf(lead.x - probe.x, lead.y - probe.y));
    let px = r.x, py = r.y, best = Infinity, hunterAt = Infinity;
    for (let k = 0; k < GUN.lifeTicks; k++) {
      flySlot(t, j, NO_AXES, DEFAULT_FLIGHT);
      const nx = px + r.vx * DT, ny = py + r.vy * DT, dist = segDist(px, py, nx, ny, P.x, P.y);
      if (dist < best) { best = dist; hunterAt = Math.hypot(e.x - P.x, e.y - P.y); }
      px = nx; py = ny;
    }
    expect(best).toBeLessThanOrEqual(10);
    expect(hunterAt).toBeLessThanOrEqual(10);
  });
});
