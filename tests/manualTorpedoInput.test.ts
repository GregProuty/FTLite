// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §4, §5) in Single player:
// - V (and the TORPEDO card's tag, a torpMode press) toggles the torpedo mode from the latest queued one.
// - In MANUAL, F launches with no lock and out of range, and NO TORPEDOES is the only magazine refusal.
// - While the crew's MANUAL torpedo flies, the Weapons seat's A/D are its torpTurn, and the map's held heading is its
//   torpHeading until A or D clears it.
// - The Settings list names V.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { emptyPresses, PRESS_CODES, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { refusal } from '../src/renderer/src/render/duel/situationModel';
import { missileOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
function rig(torp: { at: number | null } = { at: null }) {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; },
    takeTorpHeading: () => { const h = torp.at; torp.at = null; return h; }
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const hold = (moveX: number): void => { keys = { ...keys, moveX }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  seatDuelCrew(rt.duel);
  press('switch'); tick(); tick();   // Tab takes the gunner (player 1, at Weapons)
  return { rt, tick, press, hold, gunner: () => rt.held()[1]! };
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
    const { rt, tick, press } = rig();
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
    const { rt, tick, press } = rig();
    try {
      apart(rt.duel.tactical);
      expect(torpedoInRange(rt.duel.tactical, 0)).toBe(false);
      rt.takeRefusals();
      press('launch'); tick();
      expect(missileOf(rt.duel.tactical, 0)).toBeNull();
      expect(rt.takeRefusals()).toEqual([{ control: 'launch', reason: 'OUT OF RANGE' }]);
      const magazine = rt.duel.tactical.systems[0].magazine;
      press('torpMode'); press('launch'); tick();   // V and F in one frame: the launch is judged in the new mode
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
  it('A/D are the flying MANUAL torpedo\'s torpTurn and turn it; with none flying they send nothing', () => {
    const { rt, tick, press, hold, gunner } = rig();
    try {
      apart(rt.duel.tactical);
      hold(1); tick();
      expect('torpTurn' in gunner()).toBe(false);
      hold(0);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      const m = missileOf(rt.duel.tactical, 0)!;
      hold(1);
      for (let k = 0; k < 30; k++) tick();
      expect(gunner()).toMatchObject({ torpTurn: 1 });
      expect(m.heading).not.toBe(64);
    } finally { rt.dispose(); }
  });
  it('the map\'s held heading is torpHeading until A or D clears it, or the flight ends', () => {
    const torp = { at: null as number | null }, { rt, tick, press, hold, gunner } = rig(torp);
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      torp.at = 100; tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });
      expect('torpTurn' in gunner()).toBe(false);
      tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });   // held: the client re-sends it
      hold(-1); tick();
      expect(gunner()).toMatchObject({ torpTurn: -1 });
      expect('torpHeading' in gunner()).toBe(false);
      hold(0); tick();
      expect(['torpTurn' in gunner(), 'torpHeading' in gunner()]).toEqual([false, false]);
      torp.at = 30; tick();
      expect(gunner()).toMatchObject({ torpHeading: 30 });
      torp.at = -1; tick();   // a right click on the torpedo clears it
      expect('torpHeading' in gunner()).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('the Settings controls list (spec §5)', () => {
  it('names V at Weapons, and the torpedo\'s A/D and right button', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'V')?.action).toMatch(/Weapons.*torpedo.*AUTO.*MANUAL/);
    expect(rows.find((r) => r.keys === 'W A S D')?.action).toMatch(/MANUAL torpedo/);
    expect(rows.find((r) => r.keys === 'Right click or drag')?.action).toMatch(/MANUAL torpedo/);
  });
});
