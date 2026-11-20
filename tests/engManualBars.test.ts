// Engineering spike spec §10.3, merge decisions 1b and 1c: W-2's MANUAL laser is the beam (slot 1) and W-3's MANUAL
// torpedo is slot 2, so the bars gate them as they gate AUTO. A MANUAL beam fires only with a beam bar, its burst and its
// charge rate follow BEAM_SHOTS_BY_BARS and BEAM_RATE_BY_BARS; a MANUAL torpedo launches only with a torpedo bar, reloads
// by TORPEDO_RELOAD_BY_BARS and hits 2 Room levels at 3 bars. Neither MANUAL weapon is fog-gated (firing blind along an aim
// is allowed, as Decision 18's ungated manual missileLaunch).
import { describe, expect, it } from 'vitest';
import { BEAM_RATE_BY_BARS, DuelSystem, MAGAZINE_REGEN_UNITS, TORPEDO_RELOAD_BY_BARS } from '../src/renderer/src/sim/tactical/bars';
import { resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { shipSeen } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, missileOf, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HEADING_COUNT, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, canLaunch, IDLE_INPUT, manualLaserReady, tickWeapons } from '../src/renderer/src/sim/tactical/weapons';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { CUTTER } from './helpers/scriptedDuel';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

/** A tactical state whose crew Weapons holds 10 bars split as `power`, the laser and torpedo MANUAL, the Hunter far off. */
function manualAt(power: number[]): TacticalState {
  const st = createTacticalState(5, 2, ShipClass.ValkyrnLaser), sys = st.systems[0];   // W-4 spec §14.1: the beam's rule, on the laser fit
  sys.bars[DuelSystem.Weapons] = 10; sys.weaponPower = power;
  sys.laserManual = true; sys.torpManual = true;
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 2000, y: 2000, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
const NORTH = 0;

describe('the MANUAL beam by its bars (merge decision 1b)', () => {
  it('0 beam bars: not ready even full, and a laserFire input fires nothing', () => {
    const st = manualAt([1, 0, 1]);
    st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    expect(manualLaserReady(st, 0)).toBe(false);
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, laserFire: NORTH });
    expect(st.systems[0].shots).toBe(0);
  });
  it('the burst follows BEAM_SHOTS_BY_BARS: 1 bar one shot (nothing queued), 2 and 3 bars a second shot queued', () => {
    for (const [bars, queued] of [[1, 0], [2, 1], [3, 1], [4, 1]] as const) {
      const st = manualAt([0, bars, 0]);
      st.systems[0].laserCharge = LASER_CHARGE_UNITS;
      applyWeaponsInput(st, 0, { ...IDLE_INPUT, laserFire: NORTH });
      expect([st.systems[0].shots, st.systems[0].laserBurst], `beam ${bars}`).toEqual([1, queued]);
    }
  });
  it('the MANUAL charge rate follows BEAM_RATE_BY_BARS, as AUTO', () => {
    for (const bars of [1, 2, 3, 4]) {
      const st = manualAt([0, bars, 0]);
      st.systems[0].laserCharge = 0;
      tickWeapons(st, 0, IDLE_INPUT);
      expect(st.systems[0].laserCharge, `beam ${bars}`).toBe(BEAM_RATE_BY_BARS[bars]);
    }
  });
  it('fires at an unseen enemy: no sight test in MANUAL', () => {
    const st = manualAt([0, 2, 0]);
    st.systems[0].bars[DuelSystem.Sensors] = 0;   // sensor range 300: the Hunter far off is unseen
    st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    expect(shipSeen(st, 1)).toBe(false);
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, laserFire: 40 * HEADING_COUNT });
    expect(st.systems[0].shots).toBe(1);
  });
});

describe('the MANUAL torpedo by its bars (merge decision 1c)', () => {
  it('launches only with a torpedo bar; no range or sight test in MANUAL', () => {
    expect(canLaunch(manualAt([1, 1, 0]), 0)).toBe(false);
    const st = manualAt([0, 0, 1]);
    st.systems[0].bars[DuelSystem.Sensors] = 0;
    expect(shipSeen(st, 1)).toBe(false);
    expect(canLaunch(st, 0)).toBe(true);
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, missileLaunch: true });
    expect(missileOf(st, 0)?.manual).toBe(true);
  });
  it('reloads by TORPEDO_RELOAD_BY_BARS in MANUAL; 0 bars holds the clock', () => {
    for (const bars of [0, 1, 2, 3, 4]) {
      const st = manualAt([0, 0, bars]);
      st.systems[0].magazine = 0; st.systems[0].magazineClock = 0;
      tickWeapons(st, 0, IDLE_INPUT);
      expect(st.systems[0].magazineClock, `torpedo ${bars}`).toBe(TORPEDO_RELOAD_BY_BARS[bars]);
    }
    expect(MAGAZINE_REGEN_UNITS / TORPEDO_RELOAD_BY_BARS[1]!).toBe(2700);
  });
  it('a MANUAL hit at 3 torpedo bars adds 2 levels to the room under it, at 1 bar 1', () => {
    for (const [bars, levels] of [[1, 1], [3, 2]] as const) {
      const st = manualAt([0, 0, bars]), def = classOf(st, 0).slots.missile;
      Object.assign(st.ships[1], { x: 0, y: 1300, heading: 0 });   // nose north: its stern (Engines) faces the crew
      st.systems[1].shields = 0;
      placeMissile(st, 0, { x: 0, y: 1300 + classOf(st, 1).radius + def.radius - 1, vx: 0, vy: -100, heading: 0, headingAcc: 0, age: 100 }, true);
      resolveMissiles(st);
      expect(st.systems[1].rooms[Room.Engines], `torpedo ${bars}`).toBe(levels);
    }
  });
});

describe('through the duel step', () => {
  const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
  let seq = 0;
  const cmd = (d: DuelState, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player: 1, sequence: ++seq }, requestedTick: d.interior.tick, command });
  const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands }).map((x) => x.reason ?? x.status);
  it('MANUAL laserFire with 0 beam bars and a MANUAL launch with 0 torpedo bars are unavailable; with a bar, applied', () => {
    const d = createDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      sitDown(d.interior, 1, d.weapons);
      const sys = d.tactical.systems[0];
      sys.laserManual = true; sys.torpManual = true; sys.laserCharge = LASER_CHARGE_UNITS;
      sys.bars[DuelSystem.Weapons] = 2; sys.weaponPower = [2, 0, 0];
      expect(step(d, [cmd(d, { kind: 'laserFire', aim: 0, aimAcc: 0 })])).toEqual(['unavailable']);
      expect(step(d, [cmd(d, { kind: 'missileLaunch' })])).toEqual(['unavailable']);
      sys.weaponPower = [0, 1, 1]; sys.laserCharge = LASER_CHARGE_UNITS;
      expect(step(d, [cmd(d, { kind: 'laserFire', aim: 0, aimAcc: 0 })])).toEqual(['applied']);
      expect(sys.shots).toBe(1);
      expect(step(d, [cmd(d, { kind: 'missileLaunch' })])).toEqual(['applied']);
      expect(missileOf(d.tactical, 0)?.manual).toBe(true);
    } finally { disposeDuel(d); }
  });
});
