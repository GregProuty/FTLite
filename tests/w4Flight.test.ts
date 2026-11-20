// W-4 spec §3.4, §6, §7 (W-4c): while the crew's MANUAL torpedo flies, no gun is in hand: nothing slews toward the reticle,
// the held trigger fires no round, and pewFire is refused missile-in-flight (after the AUTO refusal, before the noop); every
// powered gun, a MAN one included, slews and fires on AUTO (owner 2026-11-19); gunMode still sets each gun's switch (W-4
// amendment §2.6: R and Shift+R still work during a flight). An AUTO torpedo in
// flight changes nothing. The Valkyrn's trigger is unchanged (it never flies a MANUAL torpedo, and its gun is no turret).
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { pewGain } from '../src/renderer/src/sim/tactical/pew';
import { placeMissile, removeMissile } from '../src/renderer/src/sim/tactical/state';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { createSeatedDuel } from './helpers/duelSeat';

const CUTTER = parseShip(cutter), N: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const env = (d: DuelState, player: number, command: DuelCommand, seq: number) => ({ runId: 'duel', id: { player, sequence: seq }, requestedTick: d.interior.tick, command });
/** A seated Hound duel: Weapons 3 bars on pew 1 / autocannon 1 / torpedo 1, the enemy far off (no AUTO solution unless placed). */
function hound(): { d: DuelState; g: number } {
  const d = createSeatedDuel(CUTTER, 5), s = d.tactical.systems[0]!;
  s.bars[1] = 3; s.weaponPower = [1, 1, 1];
  Object.assign(d.tactical.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(d.tactical.ships[1], { x: 3000, y: -3000, vx: 0, vy: 0 });
  return { d, g: 1 - d.helmPlayer };
}
/** The crew's torpedo in flight, past its boost, far from anything. */
const fly = (d: DuelState, manual: boolean): void => { placeMissile(d.tactical, 0, { x: -2000, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, manual); };
const held = (d: DuelState, g: number, h: Partial<HeldInput>): HeldInput[] => { const out = [N, N]; out[g] = { ...N, ...h }; return out; };
/** The enemy where tests/w4Auto.test.ts puts its "fires on solution" target: 300 ahead on coarse bearing 6 (about 8° to
 *  starboard), inside the autocannon's ±30° arc with its muzzle offset and pew pew's ±60°. */
const starboard = (d: DuelState): void => { Object.assign(d.tactical.ships[1], { x: hx(6) * 300, y: 1500 + hy(6) * 300, vx: 0, vy: 0, heading: 0, headingAcc: 0 }); };

describe('the guns during a MANUAL flight (W-4 spec §7)', () => {
  it('MAN: the reticle slews nothing and the trigger fires nothing while it flies (with no target the AUTO-driven gun stays on the nose); both work again once it ends', () => {
    const { d, g } = hound();
    try {
      const s = d.tactical.systems[0]!;
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 1)] });   // the autocannon's own switch
      expect(s.gunManual).toBe(true);
      fly(d, true);
      const east = 16384;   // a fine aim due east (a quarter turn)
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 1, gunHeld: true, turretAim: east }), commands: [] });
      expect([s.gunTurret, s.gunShots]).toEqual([0, 0]);
      removeMissile(d.tactical, 0);
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 1, gunHeld: true, turretAim: east }), commands: [] });
      expect(s.gunTurret).toBeGreaterThan(0);
      expect(s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
  it('pewFire is refused missile-in-flight in MAN, after the AUTO refusal and before the noop; gunMode is still admitted', () => {
    const { d, g } = hound();
    try {
      const s = d.tactical.systems[0]!;
      fly(d, true);
      let r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 1)] });
      expect([r[0]!.status, r[0]!.reason]).toEqual(['rejected', 'unavailable']);   // AUTO first (W-4b)
      r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 2)] });
      expect([r[0]!.status, s.pewManual]).toEqual(['applied', true]);   // R works during a flight (pew pew's own switch)
      r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 3), env(d, g, { kind: 'pewFire' }, 4)] });
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual([['rejected', 'missile-in-flight'], ['rejected', 'missile-in-flight']]);
      expect(s.pewShots).toBe(0);
      removeMissile(d.tactical, 0);
      r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 5)] });
      expect(r[0]!.status).toBe('applied');
    } finally { disposeDuel(d); }
  });
  it('an AUTO torpedo in flight leaves MAN aim and fire alone', () => {
    const { d, g } = hound();
    try {
      const s = d.tactical.systems[0]!;
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 1)] });
      fly(d, false);
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 1, gunHeld: true, turretAim: 16384 }), commands: [] });
      expect(s.gunTurret).toBeGreaterThan(0);
      expect(s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
  it('AUTO guns keep slewing and firing at a hostile ship in range while a MANUAL torpedo flies', () => {
    const { d, g } = hound();
    try {
      const t = d.tactical, s = t.systems[0]!;
      t.hostileAt = 0;   // past the hold (W-4 spec §4.3): AUTO may fire
      starboard(d);   // seen, in range, off the nose to starboard, inside both arcs
      fly(d, true);
      for (let k = 0; k < 120; k++) stepDuelTick(d, { held: held(d, g, {}), commands: [] });
      expect(s.gunTurret).not.toBe(0);
      expect(s.pewShots + s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
  it('a MAN gun, selected and triggered, fights on AUTO while a MANUAL torpedo flies: it slews to the ship, not the reticle, and fires (owner 2026-11-19)', () => {
    const { d, g } = hound();
    try {
      const t = d.tactical, s = t.systems[0]!;
      t.hostileAt = 0;
      starboard(d);   // as the AUTO case: inside both arcs, to starboard
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 1)] });
      fly(d, true);
      const west = 49152;   // a reticle due west: a gun in hand would slew to its −30° stop
      for (let k = 0; k < 120; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 1, gunHeld: true, turretAim: west }), commands: [] });
      expect(s.gunManual).toBe(true);
      expect(s.gunTurret).toBeGreaterThan(0);   // toward the ship to starboard, not the reticle to port
      expect(s.gunShots).toBeGreaterThan(0);   // the trigger is dropped in flight, so every round is AUTO's
    } finally { disposeDuel(d); }
  });
  it('pew pew on MAN and selected fights on AUTO too while a MANUAL torpedo flies: it slews to the ship, fires with no pewFire sent, and charges at AUTO\'s rate (W-4 amendment §2.3)', () => {
    const { d, g } = hound();
    try {
      const t = d.tactical, s = t.systems[0]!;
      t.hostileAt = 0;
      starboard(d);   // as the AUTO case: inside both arcs, to starboard
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 1)] });   // pew pew's own switch
      fly(d, true);
      const west = 49152;   // a reticle due west: a pew in hand would slew to port
      for (let k = 0; k < 120; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 0, turretAim: west }), commands: [] });
      expect(s.pewManual).toBe(true);
      expect(s.pewTurret).toBeGreaterThan(0);   // toward the ship to starboard, not the reticle to port
      expect(s.pewShots).toBeGreaterThan(0);   // no pewFire was sent, so every round is AUTO's
      s.pewCharge = 0;   // below full, so one tick's gain shows
      stepDuelTick(d, { held: held(d, g, { weaponSel: 0, turretAim: west }), commands: [] });
      expect(s.pewCharge).toBe(pewGain(t, 0, false));   // tickPew reads handControl: AUTO's gain, not MAN's, during the flight
    } finally { disposeDuel(d); }
  });
  it('the Valkyrn\'s trigger is today\'s: it fires with a MANUAL torpedo of its own in flight (no turret, no flight gate)', () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn), g = 1 - v.helmPlayer;
    try {
      fly(v, true);
      for (let k = 0; k < 20; k++) stepDuelTick(v, { held: held(v, g, { gunHeld: true }), commands: [] });
      expect(v.tactical.systems[0]!.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(v); }
  });
});
