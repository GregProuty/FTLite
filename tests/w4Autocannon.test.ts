// W-4 spec §2, §5: the autocannon is the Valkyrn's gun on the Hound: its interval by bars (AUTO 10 / 8 / 6 / 5; 0 bars
// fires nothing), the Valkyrn's heat and lock (Weapons damage halving the cooling), rounds along its aim (the nose until
// W-4b's turret) with the ship's velocity added, the twin muzzles alternating, and gunHit's room level after 6 hits.
import { describe, expect, it } from 'vitest';
import { gunAimFine, gunInterval, stepRounds, tickGun } from '../src/renderer/src/sim/tactical/gun';
import { AUTOCANNON } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { HEADING_COUNT } from '../src/renderer/src/sim/tactical/tuning';
import { houndWeapons } from './helpers/crewWeapons';

const TRIGGER: ShipInput = { ...IDLE_INPUT, gunHeld: true };
/** The Hound at (0, 1500), nose `heading`, moving (vx, vy); the Hunter far off; the autocannon on `bars`. */
function hound(bars: number, heading = 0, vx = 0, vy = 0): TacticalState {
  const st = houndWeapons(createTacticalState(5), [1, bars, 1]);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx, vy, heading, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 });
  st.events = [];
  return st;
}
/** The ticks between successive gunFire events over `ticks` ticks of a held trigger. */
function gaps(st: TacticalState, ticks: number): number[] {
  const at: number[] = [];
  for (let k = 0; k < ticks; k++) { st.events = []; tickGun(st, 0, TRIGGER); if (st.events.some((e) => e.kind === 'gunFire')) at.push(k); }
  return at.slice(1).map((t, j) => t - at[j]!);
}

describe('the autocannon (W-4 spec §2, §5)', () => {
  it('fires every 10 / 8 / 6 / 5 ticks at 1 / 2 / 3 / 4 bars (AUTO row; W-4b adds MAN), nothing at 0', () => {
    for (const [bars, interval] of [[1, 10], [2, 8], [3, 6], [4, 5]] as const) {
      const st = hound(bars); st.systems[0]!.bars[1] = 10;   // the overdrive bar (effective Weapons > 9) allows a 4th
      expect(gunInterval(st, 0), `${bars} bars`).toBe(interval);
      const g = gaps(st, 60);
      expect(g.length, `${bars} bars`).toBeGreaterThan(3);
      expect(new Set(g), `${bars} bars`).toEqual(new Set([interval]));
    }
    const off = hound(0);
    expect(gunInterval(off, 0)).toBe(0);
    for (let k = 0; k < 60; k++) tickGun(off, 0, TRIGGER);
    expect(off.systems[0]!.gunShots).toBe(0);
  });
  it('heats and locks as the Valkyrn gun, unlocks at 0; Weapons damage halves the cooling', () => {
    const st = hound(3), s = st.systems[0]!;
    let k = 0;
    for (; k < 2000 && !s.gunLocked; k++) tickGun(st, 0, TRIGGER);
    expect(s.gunLocked).toBe(true);
    expect(s.gunHeat).toBe(AUTOCANNON.heatMax);
    const shots = s.gunShots;
    tickGun(st, 0, TRIGGER);
    expect(s.gunShots).toBe(shots);   // locked: no round
    expect(s.gunHeat).toBe(AUTOCANNON.heatMax - AUTOCANNON.coolLocked);
    const hurt = hound(3); hurt.systems[0]!.rooms[Room.Weapons] = 1; hurt.systems[0]!.gunHeat = 100;
    tickGun(hurt, 0, IDLE_INPUT);
    expect(hurt.systems[0]!.gunHeat).toBe(100 - AUTOCANNON.cool / 2);
  });
  it('a round leaves along the aim (the nose in W-4a) at GUN speed plus the ship velocity, from alternating muzzles', () => {
    const st = hound(3, 64, 30, -10), s = st.systems[0]!;
    expect(gunAimFine(st, 0)).toBe(64 * HEADING_COUNT);
    tickGun(st, 0, TRIGGER);
    const r = st.rounds.find((e) => e.active)!;
    expect(r.vx).toBeCloseTo(30 + hx(64) * AUTOCANNON.speed, 9);
    expect(r.vy).toBeCloseTo(-10 + hy(64) * AUTOCANNON.speed, 9);
    const muzzles: number[] = [];
    for (let k = 0; k < 30; k++) { st.events = []; tickGun(st, 0, TRIGGER); for (const e of st.events) if (e.kind === 'gunFire') muzzles.push(e.muzzle); }
    expect(muzzles.length).toBeGreaterThanOrEqual(4);
    expect(muzzles.every((m, j) => j === 0 || m !== muzzles[j - 1])).toBe(true);   // the twin muzzles alternate
    expect(s.gunShots).toBe(muzzles.length + 1);
  });
  it('the cooldown is the interval of the moment: a bar taken mid-cooldown applies from the next round', () => {
    const st = hound(1), s = st.systems[0]!;
    tickGun(st, 0, TRIGGER);
    expect(s.gunCooldown).toBe(10);
    s.weaponPower = [1, 3, 1]; s.bars[1] = 5;
    for (let k = 0; k < 10; k++) tickGun(st, 0, TRIGGER);
    expect(s.gunCooldown).toBe(6);   // the round that left at the end of the 10 restarted the clock at 3 bars' 6
  });
  it('six unshielded hits raise a room a level (gunHit as the Valkyrn\'s)', () => {
    const st = hound(3);
    Object.assign(st.ships[1], { x: 0, y: 1500 - 120, vx: 0, vy: 0, heading: 128, headingAcc: 0 });
    st.systems[1]!.shields = 0;
    let levelled = false;
    for (let k = 0; k < 200 && !levelled; k++) {
      st.events = []; tickGun(st, 0, TRIGGER); stepRounds(st);
      levelled = st.events.some((e) => e.kind === 'gunHit' && e.level);
    }
    expect(levelled).toBe(true);
    expect(st.systems[0]!.gunHits).toBe(6);
  });
});
