// W-4 spec §3.1, §3.2, §13.1: the turret state (two signed offsets and a mode flag per gun (W-4 amendment §2.1), 0 / false at the start, bounded by
// the slot's own class), and the slew law: toward the wanted offset (clampAim's signed difference, clamped to the arc) by
// at most the rate, never past it; integers in and out; the wrap across 0 / 65535.
import { describe, expect, it } from 'vitest';
import { slewTurret, turretOffset, turretWorldAim } from '../src/renderer/src/sim/tactical/turret';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { AUTOCANNON_ARC_STEPS, PEW_ARC_STEPS } from '../src/renderer/src/sim/tactical/tuning';

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
