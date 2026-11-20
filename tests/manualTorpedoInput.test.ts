// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §4, §5) in Single player:
// - V (and the TORPEDO card's tag, a torpMode press) toggles the torpedo mode from the latest queued one. W-4 amendment
//   §2.4: on the laser fit; at the Hound's Weapons seat R with the torpedo selected does it.
// - In MANUAL, F launches with no lock and out of range, and NO TORPEDOES is the only magazine refusal.
// - While the crew's MANUAL torpedo flies, the map's held heading (the LMB steer) is its torpHeading until the flight
//   ends; A/D no longer steer it (W-4 spec §7).
// - The Settings list names V.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { emptyPresses, PRESS_CODES, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { refusal } from '../src/renderer/src/render/duel/situationModel';
import { missileOf, removeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { seatDuelCrew } from './helpers/duelSeat';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
function rig(torp: { at: number | null } = { at: null }, cls?: number) {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout, ...(cls !== undefined ? { cls } : {}),   // W-4 amendment §2.4: V is the laser fit's
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; },
    takeTorpHeading: () => { const h = torp.at; torp.at = null; return h; }
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const hold = (moveX: number): void => { keys = { ...keys, moveX }; };
  const select = (slot: number): void => { keys = { ...keys, selectTo: slot }; };   // W-4 spec §9: the Hound's selection (kept until changed)
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  seatDuelCrew(rt.duel);
  press('switch'); tick(); tick();   // Tab takes the gunner (player 1, at Weapons)
  return { rt, tick, press, hold, select, gunner: () => rt.held()[1]! };
}
/** The crew at (0, 1500) nose east and still, the enemy far beyond torpedo range at (0, −1500). */
function apart(t: TacticalState): void {
  Object.assign(t.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 64, headingAcc: 0 });
  Object.assign(t.ships[1], { x: 0, y: -1500, vx: 0, vy: 0 });
}

describe('V (spec §3)', () => {
  it('is bound, and toggles the torpedo mode from the latest queued one', () => {
    expect(PRESS_CODES.KeyV).toBe('torpMode');
    expect(PRESS_CODES.KeyX).toBe('stand');   // X stays Stand
    const { rt, tick, press } = rig(undefined, ShipClass.ValkyrnLaser);   // W-4 amendment §2.4 (kind (a)): V is not read at the Hound's Weapons seat; it stays the laser fit's
    try {
      expect(rt.view()).toBe('weapons');
      press('torpMode'); tick();
      expect(rt.duel.tactical.systems[0].torpManual).toBe(true);
      press('torpMode'); tick();
      expect(rt.duel.tactical.systems[0].torpManual).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('F in MANUAL (spec §3, §5)', () => {
  it('launches with no lock and out of range; in AUTO the same press says OUT OF RANGE', () => {
    const { rt, tick, press, select } = rig();
    try {
      apart(rt.duel.tactical);
      expect(torpedoInRange(rt.duel.tactical, 0)).toBe(false);
      rt.takeRefusals();
      press('launch'); tick();
      expect(missileOf(rt.duel.tactical, 0)).toBeNull();
      expect(rt.takeRefusals()).toEqual([{ control: 'launch', reason: 'OUT OF RANGE' }]);
      const magazine = rt.duel.tactical.systems[0].magazine;
      select(2); press('weaponMode'); press('launch'); tick();   // the torpedo selected, R and F in one frame: the launch is judged in the new mode (W-4 amendment §2.4, kind (a): V is not read at the Hound's seat)
      expect(missileOf(rt.duel.tactical, 0)?.manual).toBe(true);
      expect(rt.duel.tactical.systems[0].magazine).toBe(magazine - 1);
      expect(rt.takeRefusals()).toEqual([]);
    } finally { rt.dispose(); }
  });
  it('with an empty magazine says NO TORPEDOES; a MANUAL launch never says OUT OF RANGE', () => {
    const { rt, tick, press } = rig();
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      expect([refusal(rt.duel, 'launch'), refusal(rt.duel, 'launch', false)]).toEqual([null, 'OUT OF RANGE']);
      rt.duel.tactical.systems[0].magazine = 0;
      rt.takeRefusals();
      press('launch'); tick();
      expect(rt.takeRefusals()).toEqual([{ control: 'launch', reason: 'NO TORPEDOES' }]);
      expect(missileOf(rt.duel.tactical, 0)).toBeNull();
    } finally { rt.dispose(); }
  });
});

describe('the steering at Weapons (spec §3)', () => {
  it('A/D no longer turn the flying MANUAL torpedo: no torpTurn goes out, its heading holds (W-4 spec §7)', () => {
    const { rt, tick, press, hold, gunner } = rig();
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      const m = missileOf(rt.duel.tactical, 0)!;
      for (let k = 0; k < 30; k++) tick();   // past the boost
      const h0 = m.heading;
      hold(1);
      for (let k = 0; k < 30; k++) tick();
      expect('torpTurn' in gunner()).toBe(false);
      expect(m.heading).toBe(h0);
    } finally { rt.dispose(); }
  });
  it('the map\'s steer is torpHeading, re-sent every frame and kept after the button is let go, until the flight ends (W-4 spec §7)', () => {
    const torp = { at: null as number | null }, { rt, tick, press, gunner } = rig(torp);
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      torp.at = 100; tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });
      tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });   // let go (no new bearing): the client re-sends the last one
      torp.at = 30; tick();
      expect(gunner()).toMatchObject({ torpHeading: 30 });
      removeMissile(rt.duel.tactical, 0); tick();   // the flight ends
      expect('torpHeading' in gunner()).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('the Settings controls list (W-4 spec §9)', () => {
  it("names R at Weapons for the selected weapon, the torpedo included (V is the laser fit's); the left mouse flies a MANUAL torpedo; A/D and the right button no longer do", () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'R')?.action).toMatch(/^At Weapons, switch the selected weapon between AUTO and MAN.*torpedo on MANUAL.*left mouse flies it/);   // W-4 amendment §2.4: R with the torpedo selected
    expect(rows.find((r) => r.keys === 'V')?.action).toMatch(/^With the laser fit at Weapons.*torpedo.*AUTO.*MANUAL.*left mouse/);
    expect(rows.find((r) => r.keys === 'V')?.action).not.toMatch(/A\/D|right mouse/);
    expect(rows.filter((r) => r.keys === 'Hold left mouse').map((r) => r.action)).toContainEqual(expect.stringMatching(/^At Weapons, with a MANUAL torpedo flying: steer it/));   // the Helm's row comes first and stays
    expect(rows.find((r) => r.keys === 'W A S D')?.action).not.toMatch(/MANUAL torpedo/);
    expect(rows.find((r) => r.keys === 'Right click or drag')?.action).not.toMatch(/torpedo/);
    expect(rows.find((r) => r.keys === 'Right click or drag')?.action).toMatch(/elsewhere pan/);
  });
});
