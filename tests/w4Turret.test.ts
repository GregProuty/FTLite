// W-4 spec §3.1, §3.2, §13.1: the turret state (two signed offsets and a mode flag per gun (W-4 amendment §2.1), 0 / false at the start, bounded by
// the slot's own class), and the slew law: toward the wanted offset (clampAim's signed difference, clamped to the arc) by
// at most the rate, never past it; integers in and out; the wrap across 0 / 65535.
import { describe, expect, it } from 'vitest';
import { autoSolution, slewTurret, slewTurrets, turretOffset, turretWorldAim } from '../src/renderer/src/sim/tactical/turret';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { AUTO_FIRE_TOLERANCE, AUTOCANNON_ARC_STEPS, PEW_ARC_STEPS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { gunAimFine, gunLead, tickGun } from '../src/renderer/src/sim/tactical/gun';
import { aimDir, firePewTrigger, pewAimFine, pewLead } from '../src/renderer/src/sim/tactical/pew';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { houndWeapons } from './helpers/crewWeapons';
import { mover } from './helpers/rockArena';

const PEW = PEW_ARC_STEPS, GUN = AUTOCANNON_ARC_STEPS;   // 10922, 5461

describe('the slew law (W-4 spec §3.2)', () => {
  it('turretOffset is the signed fine difference from the nose, wrapping', () => {
    expect([turretOffset(0, 1000), turretOffset(0, 65000), turretOffset(255, 100), turretOffset(64, 64 * 256)]).toEqual([1000, -536, 356, 0]);
  });
  it('moves toward the wanted offset by at most the rate, and stops on it', () => {
    expect(slewTurret(0, 0, 1000, 364, PEW)).toBe(364);
    expect(slewTurret(728, 0, 1000, 364, PEW)).toBe(1000);
    expect(slewTurret(1000, 0, 1000, 364, PEW)).toBe(1000);
    expect(slewTurret(0, 0, 65000, 364, PEW)).toBe(-364);
    expect(slewTurret(-400, 0, 65000, 364, PEW)).toBe(-536);
  });
  it('clamps the wanted offset to the arc, both ways', () => {
    let t = 0;
    for (let k = 0; k < 60; k++) t = slewTurret(t, 0, 20000, 455, PEW);
    expect(t).toBe(PEW);
    for (let k = 0; k < 60; k++) t = slewTurret(t, 0, 65536 - 20000, 341, GUN);
    expect(t).toBe(-GUN);
  });
  it('a turning ship carries the turret: the same offset is a new world aim', () => {
    expect(turretWorldAim(0, 1000)).toBe(1000);
    expect(turretWorldAim(10, 1000)).toBe(10 * 256 + 1000);
    expect(turretWorldAim(0, -364)).toBe(65536 - 364);
    expect(turretWorldAim(255, 400)).toBe((255 * 256 + 400) % 65536);
  });
  it('integers in, an integer out, for every heading and a sweep of aims', () => {
    for (let h = 0; h < 256; h += 17) for (let a = 0; a < 65536; a += 4099) for (const t of [-PEW, -1, 0, 7, PEW]) {
      const v = slewTurret(t, h, a, 455, PEW);
      expect(Number.isInteger(v) && Math.abs(v) <= PEW && Math.abs(v - t) <= 455).toBe(true);
    }
  });
});

describe('the turret state (W-4 spec §3.1, §13.1)', () => {
  it('starts 0 / false on every slot and class', () => {
    for (const cls of [ShipClass.Cutter, ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) for (const s of createTacticalState(5, 2, cls).systems)
      expect([s.pewTurret, s.gunTurret, s.pewManual, s.gunManual]).toEqual([0, 0, false, false]);   // W-4 amendment §2.1: a mode per gun
  });
  it('round-trips mid-slew through flatten and unflatten', () => {
    const st = createTacticalState(5), s = st.systems[0]!;
    Object.assign(s, { pewTurret: -2911, gunTurret: 4000, pewManual: true, gunManual: false });
    const back = createTacticalState(5);
    unflattenTactical(back, flattenTactical(st));
    expect([back.systems[0]!.pewTurret, back.systems[0]!.gunTurret, back.systems[0]!.pewManual, back.systems[0]!.gunManual]).toEqual([-2911, 4000, true, false]);   // the two flags are separate values
    expect(() => validateTacticalValues(st, flattenTactical(st))).not.toThrow();
  });
  it('bounds each turret by its slot\'s class: the Hound\'s ±arc, 0 elsewhere; each gun\'s mode only on the crew slot of a class whose weapon in that slot has a turret', () => {
    const bad = (cls: number, f: (st: ReturnType<typeof createTacticalState>) => void): string => {
      const st = createTacticalState(5, 2, cls); f(st);
      try { validateTacticalValues(st, flattenTactical(st)); return 'ok'; } catch (e) { return String((e as Error).message); }
    };
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewTurret = PEW; st.systems[0]!.gunTurret = -GUN; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewTurret = PEW + 1; })).toMatch(/pewTurret/);
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.gunTurret = GUN + 1; })).toMatch(/gunTurret/);
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.pewTurret = 1; })).toMatch(/pewTurret/);   // the Hunter: no turret
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.gunTurret = 1; })).toMatch(/gunTurret/);   // the Valkyrn's gun: no turret
    // W-4 amendment §2.1: each flag is checked against its own weapon's turret.
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.gunManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[0]!.pewManual = true; st.systems[0]!.gunManual = true; })).toBe('ok');
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.pewManual = true; })).toMatch(/pewManual/);   // the Hunter: its pew has no turret
    expect(bad(ShipClass.Cutter, (st) => { st.systems[1]!.gunManual = true; })).toMatch(/gunManual/);   // and it has no gun
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.gunManual = true; })).toMatch(/gunManual/);   // the Valkyrn's gun: no turret
    expect(bad(ShipClass.Valkyrn, (st) => { st.systems[0]!.pewManual = true; })).toMatch(/pewManual/);   // no pew at all
    expect(bad(ShipClass.ValkyrnLaser, (st) => { st.systems[0]!.pewManual = true; })).toMatch(/pewManual/);
    expect(bad(ShipClass.ValkyrnLaser, (st) => { st.systems[0]!.gunManual = true; })).toMatch(/gunManual/);
  });
});

/** The Hound at (0, 1500) nose `heading`, still, no rocks; the Hunter at `ahead` u along heading `bearing` from it, still;
 *  bars pew / autocannon / torpedo. */
function scene(bars: readonly [number, number, number], heading = 0, bearing = 0, ahead = 300): ReturnType<typeof createTacticalState> {
  const st = houndWeapons(createTacticalState(5), bars);
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading, headingAcc: 0 });
  Object.assign(st.ships[1], { x: hx(bearing) * ahead, y: 1500 + hy(bearing) * ahead, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
const tick = (st: ReturnType<typeof createTacticalState>, input: ShipInput) => slewTurrets(st, 0, input);

describe('when a turret slews (W-4 spec §3.4)', () => {
  it('MAN: the gun in hand follows the reticle at 455 / 341 a tick; the other gun is AUTO-driven (no target: back to the nose at 364 / 273); the torpedo selected, both are; no reticle, the gun in hand holds', () => {
    const st = scene([1, 1, 1], 0, 0, 5000), s = st.systems[0]!; s.pewManual = true; s.gunManual = true;   // both switches on MAN; the Hunter 5000 u off: no AUTO solution
    tick(st, { ...IDLE_INPUT, weaponSel: 0, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455, 0]);
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([455 - 364, 341]);   // owner 2026-11-19: the pew, out of hand, slews on AUTO
    tick(st, { ...IDLE_INPUT, weaponSel: 2, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 341 - 273]);   // the torpedo selected: both AUTO-driven
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: -1 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 68]);   // the autocannon in hand with no reticle holds
  });
  it('each gun reads its own switch (amendment §2.3): pew pew on MAN and the autocannon on AUTO with the autocannon selected, neither follows the reticle; the autocannon on MAN alone and selected, only it does', () => {
    const st = scene([1, 1, 1], 0, 0, 5000), s = st.systems[0]!; s.pewManual = true;   // no AUTO solution: an AUTO-driven turret stays on the nose
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 0]);   // pew pew is MAN but not selected; the selected autocannon is on AUTO
    s.pewManual = false; s.gunManual = true;
    tick(st, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 341]);   // the autocannon in hand, at its MAN traverse
    tick(st, { ...IDLE_INPUT, weaponSel: 0, turretAim: 4000 });
    expect([s.pewTurret, s.gunTurret]).toEqual([0, 341 - 273]);   // pew pew selected on AUTO: nothing in hand, and the autocannon goes back toward the nose at its AUTO traverse
  });
  it('MAN: the gun out of hand fights on AUTO: it slews onto its own lead at its AUTO traverse and reports on solution; the gun in hand never reports (owner 2026-11-19)', () => {
    const st = scene([1, 1, 1], 0, 6), s = st.systems[0]!; s.pewManual = true; s.gunManual = true;
    const pewSol = autoSolution(st, 0, 'pew')!, gunSol = autoSolution(st, 0, 'gun')!;
    const pewInHand = { ...IDLE_INPUT, weaponSel: 0, turretAim: 60000 };   // the reticle 5536 steps left of the nose
    let on = tick(st, pewInHand);
    expect([s.pewTurret, s.gunTurret, on.pew, on.gun]).toEqual([-455, 273, false, false]);
    for (let k = 0; k < 10; k++) on = tick(st, pewInHand);
    expect([s.gunTurret, on.gun, on.pew]).toEqual([gunSol, true, false]);
    for (let k = 0; k < 30; k++) on = tick(st, { ...IDLE_INPUT, weaponSel: 2, turretAim: 60000 });
    expect([s.pewTurret, on.pew, on.gun]).toEqual([pewSol, true, true]);   // the torpedo selected: both on AUTO
  });
  it('AUTO is on solution within AUTO_FIRE_TOLERANCE (182 fine steps) of its lead, both sides, and not at 183 (owner 2026-11-19)', () => {
    expect(AUTO_FIRE_TOLERANCE).toBe(182);
    const sol = 6 * 256;   // the Hunter 6 heading steps right, still: the lead is the bearing (the AUTO case below)
    const from = (start: number): boolean => { const st = scene([1, 0, 1], 0, 6); st.systems[0]!.pewTurret = start; return tick(st, IDLE_INPUT).pew; };
    expect([from(sol - 364 - 182), from(sol - 364 - 183), from(sol + 364 + 182), from(sol + 364 + 183)]).toEqual([true, false, true, false]);
  });
  it('AUTO: each powered gun slews onto its lead at 364 / 273 a tick and reports on solution once it sits there', () => {
    const st = scene([1, 1, 1], 0, 6), s = st.systems[0]!;   // the Hunter 6 heading steps (8.4°) right of the nose
    const pewSol = autoSolution(st, 0, 'pew')!, gunSol = autoSolution(st, 0, 'gun')!;
    expect([pewSol, gunSol]).toEqual([6 * 256, 6 * 256]);   // still target, still shooter: the lead is the bearing
    const first = tick(st, IDLE_INPUT);
    expect([s.pewTurret, s.gunTurret, first.pew, first.gun]).toEqual([364, 273, false, false]);
    let on = first;
    for (let k = 0; k < 10; k++) on = tick(st, IDLE_INPUT);
    expect([s.pewTurret, s.gunTurret, on.pew, on.gun]).toEqual([pewSol, gunSol, true, true]);
  });
  it('AUTO: no solution (unseen, out of range, behind a rock, outside the arc) and the turret goes back to the nose', () => {
    const st = scene([1, 1, 1], 0, 6), s = st.systems[0]!;
    for (let k = 0; k < 10; k++) tick(st, IDLE_INPUT);
    s.bars[3] = 0;   // Sensors 0: sensor range 600 (doubled, owner 2026-11-20; was 300 with the Hunter at 400): unseen at 700, which is also beyond every weapon's range now
    Object.assign(st.ships[1], { x: hx(6) * 700, y: 1500 + hy(6) * 700 });
    expect([autoSolution(st, 0, 'pew'), autoSolution(st, 0, 'gun')]).toEqual([null, null]);   // unseen
    s.bars[3] = 1;
    Object.assign(st.ships[1], { x: hx(6) * 700, y: 1500 + hy(6) * 700 });
    expect([autoSolution(st, 0, 'pew'), autoSolution(st, 0, 'gun')]).toEqual([null, null]);   // beyond 450 and 600
    Object.assign(st.ships[1], { x: hx(6) * 300, y: 1500 + hy(6) * 300 });
    mover(st, 0, hx(6) * 150, 1500 + hy(6) * 150, 0, 0, 20);
    expect([autoSolution(st, 0, 'pew'), autoSolution(st, 0, 'gun')]).toEqual([null, null]);   // a rock in the line
    st.rocks.fill(0);
    Object.assign(st.ships[1], { x: hx(40) * 300, y: 1500 + hy(40) * 300 });   // 56° right: inside the pew's ±60°, outside the autocannon's ±30°
    const e = st.ships[1]!;
    expect(autoSolution(st, 0, 'pew')).toBe(turretOffset(0, pewLead(st, 0, e.x, e.y, 0, 0)));   // 42 × 256: the lead is from the muzzle, 21 u ahead, so bearing 40 from the centre is 42.46 steps from it
    expect(autoSolution(st, 0, 'gun')).toBeNull();
    for (let k = 0; k < 30; k++) tick(st, IDLE_INPUT);
    expect(s.gunTurret).toBe(0);   // no solution: back to the nose
  });
  it('no power, no slew; unattended, both hold; a turning ship carries the turret', () => {
    const st = scene([1, 0, 1], 0, 6), s = st.systems[0]!;
    for (let k = 0; k < 10; k++) tick(st, IDLE_INPUT);
    expect(s.gunTurret).toBe(0);   // the autocannon on 0 bars holds
    const held = s.pewTurret;
    st.ships[0].heading = 20;
    tick(st, { ...IDLE_INPUT, weapons: false });
    expect(s.pewTurret).toBe(held);   // unattended: the offset holds, so the world aim turned with the nose
    expect(pewAimFine(st, 0)).toBe(turretWorldAim(20, held));
  });
  it('the Valkyrn and the laser fit never slew', () => {
    for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) {
      const st = createTacticalState(5, 2, cls), s = st.systems[0]!;
      expect(slewTurrets(st, 0, { ...IDLE_INPUT, weaponSel: 1, turretAim: 4000 })).toEqual({ pew: false, gun: false });
      expect([s.pewTurret, s.gunTurret]).toEqual([0, 0]);
    }
  });
});

describe('rounds along the turrets, and the leads (W-4 spec §3.2, §4.2, §5, §6)', () => {
  it('pewAimFine and gunAimFine are turretWorldAim of their turrets; a pew round and an autocannon round leave along them', () => {
    const st = scene([1, 1, 1], 10), s = st.systems[0]!; s.pewTurret = -2000; s.gunTurret = 3000;
    expect([pewAimFine(st, 0), gunAimFine(st, 0)]).toEqual([turretWorldAim(10, -2000), turretWorldAim(10, 3000)]);
    firePewTrigger(st, 0);
    const p = st.pew.find((r) => r.active)!, [px, py] = aimDir(turretWorldAim(10, -2000)), pn = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    expect(p.vx / pn).toBeCloseTo(px, 9); expect(p.vy / pn).toBeCloseTo(py, 9);
    tickGun(st, 0, IDLE_INPUT, true);   // W-4 spec §4.3 (W-4b): AUTO on solution; a held trigger does nothing on AUTO
    const g = st.rounds.find((r) => r.active)!, [gx, gy] = aimDir(turretWorldAim(10, 3000));
    expect(g.vx).toBeCloseTo(gx * 700, 9); expect(g.vy).toBeCloseTo(gy * 700, 9);   // still ship: GUN_SPEED along the turret
  });
  it('gunLead uses the velocity relative to the Hound (rounds inherit it); pewLead the target\'s own', () => {
    const st = scene([1, 1, 1], 0, 0, 400);
    Object.assign(st.ships[0], { vx: 200, vy: 0 });
    Object.assign(st.ships[1], { vx: 200, vy: 0 });   // flying in formation: the gun's lead is straight at it
    const e = st.ships[1]!;
    expect(gunLead(st, 0, e.x, e.y, e.vx, e.vy)).toBe(0);
    expect(pewLead(st, 0, e.x, e.y, e.vx, e.vy)).toBeGreaterThan(0);   // the pew leads the target's own motion
  });
  it("gunLead gives none for an intercept past the round's life (W-4 spec §4.2)", () => {
    const st = scene([1, 1, 1], 0, 0, 1000), e = st.ships[1]!;   // 1000 u dead ahead, still: about 1.4 s at GUN_SPEED, past a round's life (its reach is about 607 u)
    expect(gunLead(st, 0, e.x, e.y, 0, 0)).toBe(-1);
    Object.assign(e, { y: 1500 + hy(0) * 400 });   // 400 u: inside its reach
    expect(gunLead(st, 0, e.x, e.y, 0, 0)).toBe(0);
  });
});
