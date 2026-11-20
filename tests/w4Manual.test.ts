// W-4 spec §3.4, §4.1, §4.4, amendment §2.2, §2.3: gunMode {slot, manual} (Weapons seat only; malformed for a slot other
// than 0 or 1 or a non-boolean; unavailable without a turret in that slot; a noop per slot), set at once, two slots in one
// tick both applying; hand control (that gun's own switch on MAN, and selected: owner 2026-11-19); the gun in hand's fire
// rate: the pew's gain 7 / 10 / 14 / 18 units a tick and the autocannon's interval 8 / 7 / 5 / 4.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { gunInterval, tickGun } from '../src/renderer/src/sim/tactical/gun';
import { pewGain } from '../src/renderer/src/sim/tactical/pew';
import { createTacticalState, handControl } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { createSeatedDuel } from './helpers/duelSeat';
import { houndWeapons } from './helpers/crewWeapons';

const CUTTER = parseShip(cutter);
const env = (d: DuelState, player: number, command: DuelCommand, seq: number) => ({ runId: 'duel', id: { player, sequence: seq }, requestedTick: d.interior.tick, command });

describe('gunMode (W-4 spec §4.1, amendment §2.2)', () => {
  it("Weapons seat only; one gun's mode, set at once; a repeat is a noop, per slot; a bad slot or a non-boolean is malformed", () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 1), env(d, d.helmPlayer, { kind: 'gunMode', slot: 0, manual: false }, 1)] });
      // stepDuelTick sorts its results by player, then sequence (step.ts, its last line); the Helm is player 0 here.
      expect(d.helmPlayer).toBe(0);
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual([['rejected', 'not-at-weapons'], ['applied', null]]);
      expect([s.pewManual, s.gunManual]).toEqual([true, false]);   // the autocannon's switch is its own
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 2)] })[0]).toMatchObject({ status: 'noop' });
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 1, manual: false }, 3)] })[0]).toMatchObject({ status: 'noop' });   // slot 1 is still AUTO
      const malformed = [{ kind: 'gunMode', slot: 0, manual: 1 }, { kind: 'gunMode', slot: 2, manual: true }, { kind: 'gunMode', slot: -1, manual: true }, { kind: 'gunMode', slot: 0.5, manual: true }, { kind: 'gunMode', manual: true }];
      malformed.forEach((c, k) => expect(stepDuelTick(d, { held: [], commands: [env(d, g, c as never, 4 + k)] })[0], JSON.stringify(c)).toMatchObject({ status: 'rejected', reason: 'malformed' }));
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: false }, 9)] });
      expect([s.pewManual, s.gunManual]).toEqual([false, false]);
    } finally { disposeDuel(d); }
  });
  it('two gunMode commands for different slots in one tick both apply; a second for the same slot is judged against the mode the first set', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', slot: 0, manual: true }, 1), env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 2), env(d, g, { kind: 'gunMode', slot: 1, manual: true }, 3), env(d, g, { kind: 'gunMode', slot: 0, manual: false }, 4)] });
      expect(r.map((x) => x.status)).toEqual(['applied', 'applied', 'noop', 'applied']);   // one player's results, in sequence order
      expect([s.pewManual, s.gunManual]).toEqual([false, true]);
    } finally { disposeDuel(d); }
  });
  it('is unavailable on the Valkyrn and on its laser fit, for either slot (no turret); malformed is judged first', () => {
    for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) for (const slot of [0, 1] as const) {
      const v = createSeatedDuel(CUTTER, 5, 0, 2, cls), g = 1 - v.helmPlayer;
      try {
        expect(stepDuelTick(v, { held: [], commands: [env(v, g, { kind: 'gunMode', slot, manual: true }, 1)] })[0], `class ${cls} slot ${slot}`).toMatchObject({ status: 'rejected', reason: 'unavailable' });
        expect(stepDuelTick(v, { held: [], commands: [env(v, g, { kind: 'gunMode', slot: 2, manual: true } as never, 2)] })[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
        expect([v.tactical.systems[0].pewManual, v.tactical.systems[0].gunManual]).toEqual([false, false]);
      } finally { disposeDuel(v); }
    }
  });
});

describe('hand control (W-4 spec §3.4, amendment §2.3, owner 2026-11-19)', () => {
  it("a gun is in hand only when its own switch is MAN and it is selected: every row of the amendment's table; the Hunter never", () => {
    const st = createTacticalState(5), s = st.systems[0]!;
    /** [pew pew in hand, the autocannon in hand] with these switches and this selection. */
    const hands = (pew: boolean, gun: boolean, sel: number): [boolean, boolean] => { s.pewManual = pew; s.gunManual = gun; return [handControl(st, 0, sel, WeaponSlot.Pew), handControl(st, 0, sel, WeaponSlot.Autocannon)]; };
    for (const sel of [-1, 0, 1, 2]) expect(hands(false, false, sel), `AUTO / AUTO, selected ${sel}`).toEqual([false, false]);
    expect(hands(true, false, WeaponSlot.Pew)).toEqual([true, false]);           // MAN / AUTO, pew pew selected: pew pew in hand
    expect(hands(true, false, WeaponSlot.Autocannon)).toEqual([false, false]);   // MAN / AUTO, the autocannon selected: both AUTO-driven (the left button does nothing)
    expect(hands(false, true, WeaponSlot.Autocannon)).toEqual([false, true]);    // AUTO / MAN, the autocannon selected: it is in hand
    expect(hands(false, true, WeaponSlot.Pew)).toEqual([false, false]);
    expect(hands(true, true, WeaponSlot.Pew)).toEqual([true, false]);            // MAN / MAN: only the selected gun
    expect(hands(true, true, WeaponSlot.Autocannon)).toEqual([false, true]);
    expect(hands(true, true, WeaponSlot.Torpedo)).toEqual([false, false]);       // MAN / MAN, the torpedo selected: both AUTO-driven
    expect(hands(true, true, -1)).toEqual([false, false]);                       // nothing selected (an unattended seat)
    expect([handControl(st, 1, WeaponSlot.Pew, WeaponSlot.Pew), handControl(st, 0, WeaponSlot.Torpedo, WeaponSlot.Torpedo)]).toEqual([false, false]);   // the Hunter is never MAN; the torpedo is no gun
  });
});

describe("the gun in hand's fire rate (W-4 spec §4.4)", () => {
  it('the pew gains 7 / 10 / 14 / 18 units a tick in hand and keeps 6 / 8 / 12 / 15 otherwise, MAN or not', () => {
    for (const [bars, man, auto] of [[1, 7, 6], [2, 10, 8], [3, 14, 12], [4, 18, 15]] as const) {
      const st = houndWeapons(createTacticalState(5), [bars, 0, 0]); st.systems[0]!.bars[1] = 10;   // the overdrive bar allows a 4th
      expect(pewGain(st, 0), `${bars} bars AUTO`).toBe(auto);
      st.systems[0]!.pewManual = true;
      expect(pewGain(st, 0, handControl(st, 0, WeaponSlot.Autocannon, WeaponSlot.Pew)), `${bars} bars MAN, not in hand`).toBe(auto);   // owner 2026-11-19: an AUTO-driven gun keeps AUTO's rate
      expect(pewGain(st, 0, handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Pew)), `${bars} bars in hand`).toBe(man);
      st.systems[0]!.pewManual = false; st.systems[0]!.gunManual = true;
      expect(pewGain(st, 0, handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Pew)), `${bars} bars, only the autocannon on MAN`).toBe(auto);   // amendment §2.3: the bonus is the gun in hand's only
    }
    const hunter = createTacticalState(5);
    expect([pewGain(hunter, 1), pewGain(hunter, 1, true)]).toEqual([6, 6]);   // the Hunter's rate is its class's (720 / 120), unchanged
  });
  it('the autocannon in hand fires every 8 / 7 / 5 / 4 ticks, measured between gunFire events; MAN with it unselected keeps AUTO\'s row', () => {
    for (const [bars, interval] of [[1, 8], [2, 7], [3, 5], [4, 4]] as const) {
      const st = houndWeapons(createTacticalState(5), [0, bars, 0]), s = st.systems[0]!; s.bars[1] = 10; s.gunManual = true;
      expect([gunInterval(st, 0), gunInterval(st, 0, true)], `${bars} bars`).toEqual([[0, 10, 8, 6, 5][bars], interval]);
      expect(gunInterval(st, 0, handControl(st, 0, WeaponSlot.Pew, WeaponSlot.Autocannon)), `${bars} bars, pew pew selected`).toBe([0, 10, 8, 6, 5][bars]);   // MAN but not selected: AUTO's row
      const at: number[] = [];
      for (let k = 0; k < 80; k++) { st.events = []; tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true, weaponSel: WeaponSlot.Autocannon }); if (st.events.some((e) => e.kind === 'gunFire')) at.push(k); }
      expect(new Set(at.slice(1).map((t, j) => t - at[j]!)), `${bars} bars`).toEqual(new Set([interval]));
    }
  });
});
