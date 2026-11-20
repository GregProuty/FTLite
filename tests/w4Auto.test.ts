// W-4 spec §4.2, §4.3: AUTO fires only at a seen, hostile enemy ship in range, arc and line of sight, on solution, attended
// and powered: the pew one round each time a third has charged, never a burst (Decision 4), the autocannon at its interval until 80 % heat (it never
// locks; it settles at the cooling rate); in the hold (hostileAt −1) both track and fire nothing, and the first AUTO round
// comes the tick after a crew shot or the clock ends the hold; a torpedo crossing a round aimed at the ship is still hit.
import { describe, expect, it } from 'vitest';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { pewAutoReady, pewGain, stepPew } from '../src/renderer/src/sim/tactical/pew';
import { pewThird } from '../src/renderer/src/sim/tactical/defs';
import { classOf, createTacticalState, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { hostilityStep } from '../src/renderer/src/sim/tactical/science';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { AUTOCANNON } from '../src/renderer/src/sim/tactical/defs';
import { GUN_AUTO_HEAT_STOP, PEW_RECHARGE_TICKS } from '../src/renderer/src/sim/tactical/tuning';
import { houndWeapons } from './helpers/crewWeapons';
import { mover } from './helpers/rockArena';

/** The Hound at (0, 1500) nose north, still; the Hunter `ahead` u along heading `bearing`; no rocks; hostile unless `hold`. */
function scene(bars: readonly [number, number, number], bearing = 0, ahead = 300, hold = false): TacticalState {
  const st = houndWeapons(createTacticalState(5), bars);
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: hx(bearing) * ahead, y: 1500 + hy(bearing) * ahead, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.hostileAt = hold ? -1 : 0;
  st.events = [];
  return st;
}
/** One weapons tick of the crew (applyWeaponsInput then tickWeapons); returns the gunFire / pewFire events of the tick. */
function tick(st: TacticalState, input: ShipInput = IDLE_INPUT): { gun: number; pew: number } {
  st.events = []; applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input);
  return { gun: st.events.filter((e) => e.kind === 'gunFire').length, pew: st.events.filter((e) => e.kind === 'pewFire').length };
}

describe('AUTO firing (W-4 spec §4.3)', () => {
  it('the pew: one round from full, then one round per charged third (60 ticks at 1 bar); never a burst (Decision 4)', () => {
    const st = scene([1, 0, 1]), at: number[] = [];
    for (let k = 0; k < 400; k++) if (tick(st).pew) at.push(k);
    expect(at.length).toBeGreaterThanOrEqual(6);
    expect(at[1]! - at[0]!).toBe(PEW_RECHARGE_TICKS);   // no second round on the next tick from the stored thirds
    expect(new Set(at.slice(1).map((t, j) => t - at[j]!))).toEqual(new Set([PEW_RECHARGE_TICKS]));   // 1 bar: a third every 60 ticks
  });
  it('pewAutoReady: full, or a third just completed; not mid-third', () => {
    const st = scene([1, 0, 1]), s = st.systems[0]!, def = classOf(st, 0).slots.pew!;
    expect(pewAutoReady(st, 0)).toBe(true);   // full
    s.pewCharge = 2 * pewThird(def) + pewGain(st, 0); expect(pewAutoReady(st, 0)).toBe(false);   // mid-third, two stored
    s.pewCharge = 2 * pewThird(def); expect(pewAutoReady(st, 0)).toBe(true);   // a third just completed
    s.pewCharge = pewGain(st, 0) - 1; expect(pewAutoReady(st, 0)).toBe(false);   // under a third: pewReady fails
  });
  it('the autocannon: every 10 ticks at 1 bar on solution; it stops at 80 % heat and never locks over 3000 ticks; it settles near one round per 12.5 ticks', () => {
    const one = scene([0, 1, 1]), at: number[] = [];
    for (let k = 0; k < 120; k++) if (tick(one).gun) at.push(k);
    expect(new Set(at.slice(1).map((t, j) => t - at[j]!))).toEqual(new Set([10]));
    const hot = scene([0, 3, 0]), s = hot.systems[0]!;
    let maxHeat = 0, shots = 0;
    for (let k = 0; k < 3000; k++) { shots += tick(hot).gun; maxHeat = Math.max(maxHeat, s.gunHeat); expect(s.gunLocked).toBe(false); if (k === 1999) shots = 0; }
    expect(maxHeat).toBeLessThanOrEqual(GUN_AUTO_HEAT_STOP + AUTOCANNON.heatPerShot);
    expect(shots).toBeGreaterThanOrEqual(78); expect(shots).toBeLessThanOrEqual(82);   // 1000 ticks / 12.5
  });
  it('no AUTO fire on an unseen enemy, behind a rock, out of the arc, unattended or unpowered', () => {
    const fired = (st: TacticalState, input: ShipInput = IDLE_INPUT): number => { let n = 0; for (let k = 0; k < 200; k++) { const f = tick(st, input); n += f.gun + f.pew; } return n; };
    const unseen = scene([1, 1, 1], 0, 400); unseen.systems[0]!.bars[3] = 0;   // sensor range 300
    expect(fired(unseen)).toBe(0);
    const rock = scene([1, 1, 1]); mover(rock, 0, 0, 1500 + hy(0) * 150, 0, 0, 20);
    expect(fired(rock)).toBe(0);
    expect(fired(scene([1, 1, 1], 64))).toBe(0);   // 90° right: outside both arcs
    expect(fired(scene([1, 1, 1]), { ...IDLE_INPUT, weapons: false })).toBe(0);
    expect(fired(scene([0, 0, 1]))).toBe(0);
  });
  it('AUTO pew aims only at the ship: an inbound torpedo within 300 is never its target, but one crossing a round aimed at the ship is hit', () => {
    const st = scene([1, 0, 1], 64);   // the Hunter out of the arc
    placeMissile(st, 1, { x: 0, y: 1500 + hy(0) * 200, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });
    for (let k = 0; k < 120; k++) tick(st);
    expect(st.systems[0]!.pewShots).toBe(0);   // no point defence
    const cross = scene([1, 0, 1]);
    placeMissile(cross, 1, { x: 0, y: 1500 + hy(0) * 60, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });
    for (let k = 0; k < 20 && cross.missiles.some((m) => m.active); k++) { tick(cross); stepPew(cross); }
    expect(cross.missiles.some((m) => m.active && m.owner === 1)).toBe(false);   // W-1's sweep shot it down
  });
});

describe('AUTO holds fire during the hold (W-4 spec §4.3, owner 2026-11-19)', () => {
  it('both guns slew onto solution and fire nothing while hostileAt is −1; the first AUTO round comes the tick after the hold ends', () => {
    const st = scene([1, 1, 1], 6, 300, true), s = st.systems[0]!;
    let fired = 0;
    for (let k = 0; k < 120; k++) { const f = tick(st); fired += f.gun + f.pew; }
    expect(fired).toBe(0);
    expect(s.pewTurret).toBe(6 * 256);
    expect(s.gunTurret).toBe(6 * 256);
    s.missilesLaunched = 1; hostilityStep(st, 1);   // a crew launch ends the hold, after the weapons, as duel.ts orders it
    expect(st.hostileAt).toBeGreaterThanOrEqual(0);
    const next = tick(st);
    expect(next.gun + next.pew).toBeGreaterThan(0);
  });
});

describe('AUTO in a sustained Helm turn (W-4 spec §4.2, owner 2026-11-19: the fire tolerance)', () => {
  it('both guns still fire while the nose sweeps across the Hunter at the full unboosted 150°/s (455 fine steps a tick), the autocannon less often than at rest', () => {
    /** 120 ticks with the Hunter 300 u north, the Hound turning clockwise from heading index `start` (or still at 0). */
    const count = (turning: boolean): { gun: number; pew: number } => {
      const st = scene([1, 1, 1]), n = { gun: 0, pew: 0 };
      let fine = turning ? 212 * 256 : 0;   // turning: the Hunter starts 44 heading steps (62°) right of the nose, outside both arcs
      for (let k = 0; k < 120; k++) {
        st.ships[0].heading = Math.floor(fine / 256) % 256;   // the heading index a 150°/s turn reaches each tick (headingAcc's whole part)
        const f = tick(st); n.gun += f.gun; n.pew += f.pew;
        if (turning) fine += 455;
      }
      return n;
    };
    const rest = count(false), turn = count(true);
    expect(turn.gun, 'the autocannon in the turn').toBeGreaterThanOrEqual(1);
    expect(turn.pew, 'the pew in the turn').toBeGreaterThanOrEqual(1);
    expect(turn.gun).toBeLessThan(rest.gun);
  });
});

describe('MAN never costs firepower (W-4 spec §3.4, owner 2026-11-19)', () => {
  it('with pew pew in hand the autocannon fires on its own at the hostile ship; with the torpedo selected both do; the hold still keeps them quiet', () => {
    const run = (st: TacticalState, sel: number): { gun: number; pew: number } => {
      const n = { gun: 0, pew: 0 };
      for (let k = 0; k < 120; k++) { const f = tick(st, { ...IDLE_INPUT, weaponSel: sel, turretAim: -1 }); n.gun += f.gun; n.pew += f.pew; }
      return n;
    };
    const man = scene([1, 1, 1], 6); man.systems[0]!.pewManual = true; man.systems[0]!.gunManual = true;   // both switches on MAN
    const pewInHand = run(man, 0);
    expect(pewInHand.gun).toBeGreaterThan(0);   // the autocannon, out of hand, fights on AUTO
    expect(pewInHand.pew).toBe(0);   // the pew in hand fires only on a pewFire (none here)
    const both = run(man, 2);
    expect([both.gun > 0, both.pew > 0]).toEqual([true, true]);   // the torpedo selected: both AUTO-driven
    const held = scene([1, 1, 1], 6, 300, true); held.systems[0]!.pewManual = true; held.systems[0]!.gunManual = true;
    const quiet = run(held, 0);
    expect(quiet.gun + quiet.pew).toBe(0);   // AUTO's rules: nothing in the hold
  });
  it('a MAN gun that is not selected fights on AUTO, and an AUTO gun that is selected does too (amendment §2.3: the switch matters only while the gun is selected)', () => {
    const run = (st: TacticalState, sel: number): { gun: number; pew: number } => {
      const n = { gun: 0, pew: 0 };
      for (let k = 0; k < 120; k++) { const f = tick(st, { ...IDLE_INPUT, weaponSel: sel, turretAim: -1, gunHeld: true }); n.gun += f.gun; n.pew += f.pew; }
      return n;
    };
    const pewMan = scene([1, 1, 1], 6); pewMan.systems[0]!.pewManual = true;   // pew pew MAN, the autocannon AUTO
    const onGun = run(pewMan, 1);   // the autocannon selected: nothing is in hand, so both fire on AUTO (the held trigger does nothing)
    expect([onGun.gun > 0, onGun.pew > 0]).toEqual([true, true]);
    const gunMan = scene([1, 1, 1], 6); gunMan.systems[0]!.gunManual = true;   // the autocannon MAN, pew pew AUTO
    const onPew = run(gunMan, 0);   // pew pew selected on AUTO: both AUTO-driven
    expect([onPew.gun > 0, onPew.pew > 0]).toEqual([true, true]);
  });
});
