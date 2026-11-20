// W-4 spec §10 (W-4b): on the Hound's Weapons map the selected gun's arc about the nose (dim), each gun's muzzle line along
// its turret (the selected one mid, the other dim; the pew to PEW_RANGE, the autocannon to 600), the reticle at the pointer,
// and a bracket on the enemy while an AUTO-driven gun is on solution, tested one slew ahead within the tolerance (hot once
// hostile, dim in the hold; never for the gun in hand); no W-1 cone or aim line; on the Helm map the muzzle lines only,
// dim, and no reticle.
import { describe, expect, it } from 'vitest';
import { createCamera, worldToScreen, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { headingAngle, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { autoSolution, slewTurrets } from '../src/renderer/src/sim/tactical/turret';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { AIM_STEPS, AUTOCANNON_ARC_STEPS, AUTOCANNON_AUTO_RANGE, PEW_ARC_STEPS, PEW_RANGE } from '../src/renderer/src/sim/tactical/tuning';

const vp = { w: 1280, h: 720 }, Z = 0.5;
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons', over: Partial<CombatModelInput> = {}): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx: createFx(), ...over };
}
/** The Hound at (0, 1500) nose north, still, the Hunter 300 u ahead on `bearing`; pew 1, autocannon 1. */
function scene(bearing = 0, cls?: number): { st: TacticalState; cam: Camera } {
  const st = createTacticalState(5, 2, cls), s = st.systems[0]!;
  s.bars[1] = 3; s.weaponPower = [1, 1, 1];
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: hx(bearing) * 300, y: 1500 + hy(bearing) * 300, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.rocks.fill(0); st.hostileAt = 0;
  return { st, cam: createCamera(0, 1500, Z) };
}
const angleOf = (m: { x1: number; y1: number; x2: number; y2: number }): number => Math.atan2(m.x2 - m.x1, -(m.y2 - m.y1));

describe("the Hound's Weapons map (W-4 spec §10)", () => {
  it("the selected arc is the selected gun's; none with the torpedo selected; no W-1 cone or aim line", () => {
    const { st, cam } = scene();
    const c0 = combatModel(input(st, cam, 'weapons', { weaponSel: 0 })), c1 = combatModel(input(st, cam, 'weapons', { weaponSel: 1 })), c2 = combatModel(input(st, cam, 'weapons', { weaponSel: 2 }));
    expect(c0.turretArc!.half).toBeCloseTo((PEW_ARC_STEPS / AIM_STEPS) * 2 * Math.PI, 12);
    expect(c1.turretArc!.half).toBeCloseTo((AUTOCANNON_ARC_STEPS / AIM_STEPS) * 2 * Math.PI, 12);
    expect(c2.turretArc ?? null).toBeNull();
    expect([c0.pewCone ?? null, c0.pewAim ?? null]).toEqual([null, null]);
  });
  it('the muzzle lines follow the turrets (input.turrets wins over the state) and the selection', () => {
    const { st, cam } = scene();
    const c = combatModel(input(st, cam, 'weapons', { weaponSel: 0, turrets: { pew: 2731, gun: -2731 } }));
    expect(c.muzzles!.map((m) => m.selected)).toEqual([true, false]);
    const [p, g] = c.muzzles!;
    expect(angleOf(p!)).toBeCloseTo(headingAngle(0) + (2731 / AIM_STEPS) * 2 * Math.PI, 9);
    expect(angleOf(g!)).toBeCloseTo(headingAngle(0) - (2731 / AIM_STEPS) * 2 * Math.PI, 9);
    expect(Math.hypot(p!.x2 - p!.x1, p!.y2 - p!.y1)).toBeCloseTo(PEW_RANGE * Z, 9);
    expect(Math.hypot(g!.x2 - g!.x1, g!.y2 - g!.y1)).toBeCloseTo(AUTOCANNON_AUTO_RANGE * Z, 9);
  });
  it('the reticle is the pointer on the Weapons map only', () => {
    const { st, cam } = scene(), at = { x: 700, y: 300 };
    expect(combatModel(input(st, cam, 'weapons', { reticle: at })).reticle).toEqual(at);
    expect(combatModel(input(st, cam, 'helm', { reticle: at })).reticle ?? null).toBeNull();
  });
  it('the AUTO bracket: when the next AUTO slew lands within the tolerance, live when hostile, dim in the hold; the gun in hand gets none, the gun out of hand in MAN does', () => {
    const { st, cam } = scene(6), s = st.systems[0]!, e = worldToScreen(cam, vp, st.ships[1].x, st.ships[1].y);
    expect(combatModel(input(st, cam, 'weapons')).bracket ?? null).toBeNull();   // turrets at 0, the solutions 1536 away: more than a slew and the tolerance
    s.pewTurret = autoSolution(st, 0, 'pew')!;
    expect(combatModel(input(st, cam, 'weapons')).bracket).toMatchObject({ x: e.x, y: e.y, live: true });
    st.hostileAt = -1;
    expect(combatModel(input(st, cam, 'weapons')).bracket).toMatchObject({ live: false });
    st.hostileAt = 0; s.pewManual = true; s.gunManual = true;   // both switches on MAN: the selected gun is the one in hand
    expect(combatModel(input(st, cam, 'weapons', { weaponSel: 0 })).bracket ?? null).toBeNull();   // the pew is in hand; the autocannon (at 0) is off its solution
    s.gunTurret = autoSolution(st, 0, 'gun')!;
    expect(combatModel(input(st, cam, 'weapons', { weaponSel: 0 })).bracket).toMatchObject({ live: true });   // owner 2026-11-19: the autocannon fights on AUTO in MAN
    expect(combatModel(input(st, cam, 'weapons', { weaponSel: 1 })).bracket).toMatchObject({ live: true });   // the pew, now out of hand, sits on its solution
  });
  it('the bracket does not flicker: a turret one slew behind its lead still shows it; one beyond a slew and the tolerance does not (Decision 10)', () => {
    const { st, cam } = scene(6), s = st.systems[0]!, sol = autoSolution(st, 0, 'pew')!;
    s.pewTurret = sol - 364 - 182;   // the next slew (364) ends 182 short: on solution
    expect(combatModel(input(st, cam, 'weapons')).bracket ?? null).not.toBeNull();
    s.pewTurret = sol - 364 - 183;
    expect(combatModel(input(st, cam, 'weapons')).bracket ?? null).toBeNull();
  });
  it('the bracket stays on, frame after frame, while the moving Hound keeps its pew tracking a drifting lead (Decision 10)', () => {
    const { st, cam } = scene(0), own = st.ships[0];
    own.vx = 240;   // crossing under the Hunter 300 u ahead: the lead's whole-index bearing drifts every few ticks
    const shown: boolean[] = [];
    for (let k = 0; k < 60; k++) {
      slewTurrets(st, 0, IDLE_INPUT);   // the sim's AUTO slew, on the pre-move position
      own.x += own.vx / 60;   // then the ship moves, as the tick does
      if (k >= 10) shown.push((combatModel(input(st, cam, 'weapons')).bracket ?? null) !== null);   // the replica after the tick
    }
    expect(shown.every(Boolean)).toBe(true);
  });
  it('on the Helm map: two dim muzzle lines, no arc, no reticle, no bracket', () => {
    const { st, cam } = scene(6);
    st.systems[0]!.pewTurret = autoSolution(st, 0, 'pew')!;
    const c = combatModel(input(st, cam, 'helm', { reticle: { x: 1, y: 1 } }));
    expect(c.muzzles!.map((m) => m.selected)).toEqual([false, false]);
    expect([c.turretArc ?? null, c.reticle ?? null, c.bracket ?? null]).toEqual([null, null, null]);
  });
  it("the laser fit's Weapons map draws no muzzle lines (no turret)", () => {
    const { st, cam } = scene(0, ShipClass.ValkyrnLaser);
    expect(combatModel(input(st, cam, 'weapons')).muzzles ?? []).toEqual([]);
  });
});
