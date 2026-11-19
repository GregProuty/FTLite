// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §4a, §5, §6): Single player's crew Helm: the keys
// (W/S held, A/D Q/E and the arrows as thrusters, 1 and 2 as power), the held frame (moveX 0, the three fields, the
// steer's aim only while the left button is held), helmPower presses, no throttle commands, the NO PRESSURE and steer
// refusals, the predicted axes, the Helm map's steer bearing, and the state's axes for an unattended crew Helm.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelKeyboard, crewHelmHeld, emptyPresses, type EventSource, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { helmSteer, onHelmMap } from '../src/renderer/src/app/duel/flightPointer';
import { OWN_SHIP } from '../src/renderer/src/render/duel/consoleLayout';
import { refusal, stateAxes } from '../src/renderer/src/render/duel/situationModel';
import { crewAxes } from '../src/renderer/src/sim/duel/step';
import { crewThrust } from '../src/renderer/src/sim/duel/helmFlight';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { seatDuelCrew, createSeatedDuel, standAtStation } from './helpers/duelSeat';

const layout = parseShip(cutter);
const TICK_MS = 1000 / 60;
const NONE = { moveX: 0, moveY: 0, interactHeld: false };

function fakeTarget() {
  const fns = new Map<string, ((e: never) => void)[]>();
  const target: EventSource & { fire(type: string, e: object): void } = {
    addEventListener(type: string, fn: (e: never) => void) { fns.set(type, [...(fns.get(type) ?? []), fn]); },
    removeEventListener() {},
    fire(type, e) { for (const f of fns.get(type) ?? []) f(e as never); }
  };
  return target;
}
const key = (code: string) => ({ code, repeat: false, preventDefault() {} });

describe('the crew Helm\'s keys (spec §3, §4, §5)', () => {
  it('W/S hold the throttle; A Q ← and D E → push port and starboard; ↑ ↓ fore and aft; opposite keys cancel; 1 and 2 are power', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    const sample = (codes: string[]): KeySample => { for (const c of codes) t.fire('keydown', key(c)); const s = kb.sample(); for (const c of codes) t.fire('keyup', key(c)); return s; };
    expect([sample(['KeyW']).throttleHeld, sample(['KeyS']).throttleHeld, sample(['KeyW', 'KeyS']).throttleHeld, sample([]).throttleHeld]).toEqual([1, -1, 0, 0]);
    for (const c of ['KeyA', 'KeyQ', 'ArrowLeft']) expect(sample([c]).rcsX, c).toBe(-1);
    for (const c of ['KeyD', 'KeyE', 'ArrowRight']) expect(sample([c]).rcsX, c).toBe(1);
    expect([sample(['KeyA', 'KeyD']).rcsX, sample(['ArrowUp']).rcsY, sample(['ArrowDown']).rcsY, sample(['ArrowUp', 'ArrowDown']).rcsY]).toEqual([0, 1, -1, 0]);
    expect([sample(['Digit1']).power, sample(['Digit2']).power, sample(['Digit1', 'Digit1']).power]).toEqual([1, -1, 1]);   // the same key held twice is one press
    kb.ui.helmPower?.(-1); kb.ui.helmPower?.(-1);
    expect(kb.sample().power).toBe(-2);
    expect(kb.sample().power).toBe(0);
  });
  it('crewHelmHeld leaves every zero field out and sends the steer as aim', () => {
    expect(crewHelmHeld({ throttleHeld: 1, rcsX: -1, rcsY: 0 }, 64)).toEqual({ throttleHeld: 1, rcsX: -1, aim: 64 });
    expect(crewHelmHeld({}, -1)).toEqual({});
  });
});

describe('the Helm map\'s steer (spec §4a)', () => {
  it('is the bearing from the ship to the pointer on the open map, and nothing on the ship or over a console block', () => {
    const ship = { x: 640, y: 360 };
    expect(helmSteer({ pointer: { x: 640, y: 160 }, ship, zoom: 1, contactShown: false })).toBe(0);
    expect(helmSteer({ pointer: { x: 840, y: 360 }, ship, zoom: 1, contactShown: false })).toBe(64);
    expect(helmSteer({ pointer: { x: 642, y: 361 }, ship, zoom: 1, contactShown: false })).toBeNull();
    expect(helmSteer({ pointer: null, ship, zoom: 1, contactShown: false })).toBeNull();
    expect(onHelmMap({ x: 30, y: 700 }, false)).toBe(false);   // the Helm block, bottom left
    expect(onHelmMap({ x: 640, y: 360 }, false)).toBe(true);
  });
  it('the left button over the own ship window (drawn on the crew Helm map) does not steer', () => {
    const mid = { x: OWN_SHIP.x + OWN_SHIP.w / 2, y: OWN_SHIP.y + OWN_SHIP.h / 2 };
    expect(onHelmMap(mid, false)).toBe(false);
    expect(helmSteer({ pointer: mid, ship: { x: 640, y: 360 }, zoom: 1, contactShown: false })).toBeNull();
    expect(onHelmMap({ x: OWN_SHIP.x + OWN_SHIP.w + 4, y: mid.y }, false)).toBe(true);   // just right of it is open map
  });
});

function fakeTime() {
  let now = 0, seq = 0;
  const tasks: { at: number; seq: number; cb: () => void }[] = [];
  return {
    now: () => now,
    scheduler: { schedule(delay: number, cb: () => void) { const t = { at: now + delay, seq: seq++, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    advance(ms: number) {
      const end = now + ms;
      for (;;) { tasks.sort((a, b) => a.at - b.at || a.seq - b.seq); const t = tasks[0]; if (!t || t.at > end) break; tasks.shift(); now = Math.max(now, t.at); t.cb(); }
      now = end;
    }
  };
}
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
function rig() {
  const time = fakeTime();
  let keys = idle(), steer: number | null = null, holding = false;
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed: 5, viewport: { w: 1280, h: 720 }, layout,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses(), power: 0 }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeSteer: () => { const s = steer; steer = null; return s; }, steerHeld: () => holding
  });
  seatDuelCrew(rt.duel);
  return {
    rt,
    set(k: Partial<KeySample>) { keys = { ...keys, ...k }; },
    steer(h: number | null) { steer = h; }, hold(on: boolean) { holding = on; },
    tick() { time.advance(TICK_MS); rt.frame(1 / 60); }
  };
}

describe('Single player at the crew Helm (spec §3, §4, §4a, §5)', () => {
  it('sends moveX 0 and the three held fields; W/S presses send no throttle command', () => {
    const r = rig();
    r.tick();
    r.set({ moveX: -1, moveY: -1, throttleHeld: 1, rcsX: -1, presses: { ...emptyPresses(), throttleUp: 1 } });
    r.tick(); r.tick();
    expect(r.rt.held()[0]).toMatchObject({ moveX: 0, throttleHeld: 1, rcsX: -1 });
    expect(r.rt.lastResults().length).toBe(0);
    expect(r.rt.duel.thrMille).toBeGreaterThan(0);
    expect(r.rt.thrMille()).toBe(r.rt.duel.thrMille);
    r.rt.dispose();
  });
  it('1 and 2 send helmPower', () => {
    const r = rig();
    r.tick();
    r.set({ power: 1 }); r.tick(); r.tick();
    expect(r.rt.duel.compressor).toBe(0);
    r.set({ power: -2 }); r.tick(); r.tick();
    expect(r.rt.duel.compressor).toBe(2);
    r.rt.dispose();
  });
  it('steers by the held left button only: the steer is the held aim, and let go there is none', () => {
    const r = rig();
    r.tick();
    r.hold(true); r.steer(64); r.tick(); r.tick();   // the held frame goes out a tick after it is sampled
    expect(r.rt.held()[0]!.aim).toBe(64);
    r.tick();
    expect(r.rt.held()[0]!.aim).toBe(64);   // the last bearing holds while the pointer is over a block
    r.hold(false); r.tick(); r.tick();
    expect(r.rt.held()[0]!.aim).toBeUndefined();
    expect(r.rt.duel.holdHeading).toBe(64);   // the sim holds the last aim as the held heading
    r.rt.dispose();
  });
  it('a thruster press with under a tick\'s gas says NO PRESSURE; a steer with the Engines off says ENGINES OFFLINE', () => {
    const r = rig();
    r.tick();
    Object.assign(r.rt.duel, { rcsGas: 0, compressor: 0 });
    r.set({ rcsX: 1 }); r.tick();
    expect(r.rt.takeRefusals()).toContainEqual({ control: 'thrusters', reason: 'NO PRESSURE' });
    r.rt.duel.tactical.systems[0].rooms[Room.Engines] = 2;
    r.hold(true); r.steer(64); r.tick();
    expect(r.rt.takeRefusals()).toContainEqual({ control: 'turn', reason: 'ENGINES OFFLINE' });
    r.rt.dispose();
  });
  it('the predicted axes are the sim\'s crewAxes for the held input', () => {
    const r = rig();
    r.tick();
    r.set({ throttleHeld: 1, rcsY: 1 }); r.tick();
    expect(r.rt.axes()).toEqual(crewAxes(r.rt.duel, r.rt.held()[0]!));
    r.rt.dispose();
  });
});

describe('held keys do not carry onto the crew Helm (final review I1)', () => {
  it('the keyboard: a key held when staleHeld runs counts for no crew field until it is released and pressed again', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('KeyE')); t.fire('keydown', key('KeyW'));
    kb.staleHeld();
    let s = kb.sample();
    expect([s.rcsX, s.throttleHeld, s.interactHeld, s.held?.up]).toEqual([0, 0, true, true]);   // only the crew fields go stale
    t.fire('keydown', { ...key('KeyE'), repeat: true }); expect(kb.sample().rcsX).toBe(0);   // an OS repeat is no new press
    t.fire('keyup', key('KeyE')); t.fire('keydown', key('KeyE'));
    s = kb.sample(); expect([s.rcsX, s.throttleHeld]).toEqual([1, 0]);
    t.fire('keyup', key('KeyW')); t.fire('keydown', key('KeyW'));
    expect(kb.sample().throttleHeld).toBe(1);
    kb.ui.hold('KeyW', true); kb.staleHeld(); t.fire('keyup', key('KeyW'));
    expect(kb.sample().throttleHeld).toBe(1);   // a console button's hold is never stale
  });
  function seatRig() {
    const time = fakeTime(), t = fakeTarget(), kb = createDuelKeyboard(t);
    const rt = createDuelRuntime({
      now: time.now, scheduler: time.scheduler, seed: 5, viewport: { w: 1280, h: 720 }, layout,
      sampleKeys: () => kb.sample(), samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
      clearKeys: () => kb.clear(), staleKeys: () => kb.staleHeld()
    });
    standAtStation(rt.duel, rt.active(), rt.duel.nav);
    return { rt, down: (c: string) => t.fire('keydown', key(c)), up: (c: string) => t.fire('keyup', key(c)), tick() { time.advance(TICK_MS); rt.frame(1 / 60); } };
  }
  it('Single player: E sits and stays held, so no starboard thruster or vent until E is released and pressed again', () => {
    const r = seatRig();
    r.tick(); r.tick();
    r.down('KeyE');
    for (let k = 0; k < 6; k++) r.tick();
    expect(r.rt.view()).toBe('helm');
    expect([r.rt.held()[r.rt.active()]!.rcsX, r.rt.duel.helmVent.x]).toEqual([undefined, 0]);
    r.up('KeyE'); r.down('KeyE'); r.tick(); r.tick();
    expect([r.rt.held()[r.rt.active()]!.rcsX, r.rt.duel.helmVent.x]).toEqual([1, 1]);
    r.rt.dispose();
  });
  it('Single player: W held from the walk does not hold the throttle until it is pressed again', () => {
    const r = seatRig();
    r.tick(); r.tick();
    r.down('KeyW'); r.down('KeyE'); r.tick(); r.up('KeyE');
    for (let k = 0; k < 6; k++) r.tick();
    expect(r.rt.view()).toBe('helm');
    expect([r.rt.held()[r.rt.active()]!.throttleHeld, r.rt.duel.thrMille]).toEqual([undefined, 0]);
    r.up('KeyW'); r.down('KeyW'); r.tick(); r.tick();
    expect(r.rt.held()[r.rt.active()]!.throttleHeld).toBe(1);
    expect(r.rt.duel.thrMille).toBeGreaterThan(0);
    r.rt.dispose();
  });
});

describe('the duel state alone (spec §3)', () => {
  it('stateAxes flies an unattended crew Helm: the throttle\'s return and the held heading', () => {
    const d = createSeatedDuel(layout, 5);
    try {
      Object.assign(d, { thrMille: 400, holdHeading: 100 });
      expect(stateAxes(d)).toEqual(crewAxes(d, NONE));
      expect(stateAxes(d).thrust).toBe(crewThrust(400));
      expect(refusal(d, 'thrusters')).toBeNull();
      d.rcsGas = 7; expect(refusal(d, 'thrusters')).toBe('NO PRESSURE');
    } finally { disposeDuel(d); }
  });
});
