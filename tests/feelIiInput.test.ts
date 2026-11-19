// Feel-ii (spec 2026-11-18-feel-ii-design §1.1, §1.4, §2.5-§2.8): the input and the sound. The right button's heading aim
// (and the Helm's camera not panning by it), the middle-click ping, Shift+W, the Single player runtime sending `heading`
// from the Helm only and naming refusals, the torpedo lock tone, the enemy launch chirp, and the ping on the wire: its
// codec, its own input stream and the authority's one-a-second relay.
import { describe, expect, it, vi } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelKeyboard, createPointerSource, emptyPresses, PING_CLICK_PX, type EventSource, type KeyAction, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { createCameraInput, createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import type { ContactRequests } from '../src/renderer/src/app/duel/contactController';
import { torpedoTone } from '../src/renderer/src/app/duel/scene';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { duelStateSounds, LAUNCH_CHIRP, LOCK_BEEP, LOCK_BEEP_FAR_S, LOCK_BEEP_NEAR_S, LOCK_REARM_U, LOCK_STEADY, lockBeepGap, lockTone, type LockWatch } from '../src/renderer/src/audio/duelSounds';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { duelCodec, encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import { modeInputIdentity } from '../src/network/modes/streamBinding';
import type { ClientMessage } from '../src/renderer/src/net/contracts';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { runReplay } from '../src/renderer/src/authority/replay';
import { LAYOUT, makeState } from './helpers/sim';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { seatDuelCrew } from './helpers/duelSeat';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

function fakeTarget() {
  const listeners = new Map<string, ((e: never) => void)[]>();
  const target: EventSource & { fire(type: string, e: object): void } = {
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    fire(type, e) { for (const fn of listeners.get(type) ?? []) fn(e as never); }
  };
  return target;
}
const ptr = (clientX: number, clientY: number, button: number, buttons: number) => ({ clientX, clientY, button, buttons, preventDefault: vi.fn() });
const same = (x: number, y: number) => ({ x, y });

describe('the pointer (Feel-ii §1.1, §2.7)', () => {
  it('reports the right button\'s press, drag and release, and the part of the drag it made', () => {
    const t = fakeTarget(), p = createPointerSource(t, same);
    expect(p.takeAim()).toBeNull();
    t.fire('pointerdown', ptr(100, 100, 2, 2));
    expect(p.takeAim()).toEqual({ x: 100, y: 100, press: true, release: false, held: true });
    t.fire('pointermove', ptr(130, 90, -1, 2));
    expect(p.takeAim()).toEqual({ x: 130, y: 90, press: false, release: false, held: true });
    expect(p.sample()).toMatchObject({ dragX: 30, dragY: -10, rightX: 30, rightY: -10 });
    t.fire('pointerup', ptr(130, 90, 2, 0));
    expect(p.takeAim()).toEqual({ x: 130, y: 90, press: false, release: true, held: false });
    expect(p.takeAim()).toBeNull();
    t.fire('pointerdown', ptr(0, 0, 1, 4)); t.fire('pointermove', ptr(40, 0, -1, 4));   // a middle drag pans, and is no right drag
    expect(p.sample()).toMatchObject({ dragX: 40, rightX: 0 });
  });
  it('a middle click is a ping only within PING_CLICK_PX of its press; a middle drag is a pan', () => {
    const t = fakeTarget(), p = createPointerSource(t, same);
    t.fire('pointerdown', ptr(50, 50, 1, 4)); t.fire('pointerup', ptr(50 + PING_CLICK_PX - 1, 50, 1, 0));
    expect(p.takeMiddleClick()).toEqual({ x: 50 + PING_CLICK_PX - 1, y: 50 });
    expect(p.takeMiddleClick()).toBeNull();
    t.fire('pointerdown', ptr(50, 50, 1, 4)); t.fire('pointermove', ptr(90, 50, -1, 4)); t.fire('pointerup', ptr(90, 50, 1, 0));
    expect(p.takeMiddleClick()).toBeNull();
  });
  it('the Helm\'s camera pans by the middle drag only; other consoles pan by both', () => {
    const input = createCameraInput(() => 0, { w: 1280, h: 720 }), k: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const s: PointerSample = { x: null, y: null, wheel: 0, dragX: 50, dragY: 0, rightX: 30, rightY: 0 };
    const a = createCamera(0, 0, 1), b = createCamera(0, 0, 1);
    input.apply(a, k, s, true); input.apply(b, k, s, false);
    expect(a.centreX).toBeCloseTo(-20, 6); expect(b.centreX).toBeCloseTo(-50, 6);
  });
});

describe('Shift+W (Feel-ii §1.4)', () => {
  it('asks for full burn instead of a notch up', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', { code: 'KeyW', repeat: false, shiftKey: true, preventDefault: vi.fn() });
    const s = kb.sample();
    expect([s.throttleTo, s.presses.throttleUp]).toEqual([4, 0]);
    t.fire('keyup', { code: 'KeyW', repeat: false, preventDefault: vi.fn() });
    t.fire('keydown', { code: 'KeyW', repeat: false, shiftKey: false, preventDefault: vi.fn() });
    const n = kb.sample();
    expect([n.throttleTo, n.presses.throttleUp]).toEqual([null, 1]);
  });
});

/** A seated Single player runtime on a fake clock, the active player at the Helm. */
function rig() {
  let now = 0, seq = 0;
  const tasks: { at: number; seq: number; cb: () => void }[] = [];
  const scheduler = { schedule(delay: number, cb: () => void) { const t = { at: now + delay, seq: seq++, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } };
  const advance = (ms: number): void => { const end = now + ms; for (;;) { tasks.sort((a, b) => a.at - b.at || a.seq - b.seq); const t = tasks[0]; if (!t || t.at > end) break; tasks.shift(); now = Math.max(now, t.at); t.cb(); } now = end; };
  let keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const requests = createMapRequests();
  const IDLE_POINTER: PointerSample = { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 };
  let pointer = IDLE_POINTER, contactReq: ContactRequests | null = null;
  const rt = createDuelRuntime({ now: () => now, scheduler, seed: 5, viewport: { w: 1280, h: 720 }, layout: parseShip(cutter),
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses(), throttleTo: null }; return k; },
    samplePointer: () => { const s = pointer; pointer = IDLE_POINTER; return s; }, takeHeading: () => requests.takeHeading(), cls: ShipClass.Valkyrn,   // playtest2feedback Decision 17: A/D turns only the Valkyrn class
    takeContactRequests: () => { const c = contactReq ?? { designate: null, scan: null }; contactReq = null; return c; } });
  seatDuelCrew(rt.duel);
  const tick = (): void => { rt.frame(1 / 60); advance(1000 / 60); rt.frame(1 / 60); };
  const press = (...a: KeyAction[]): void => { const p = { ...keys.presses }; for (const x of a) p[x]++; keys = { ...keys, presses: p }; };
  return { rt, requests, tick, press, contact: (c: Partial<ContactRequests>) => { contactReq = { designate: null, scan: null, ...c }; }, hold: (h: Partial<KeySample>) => { keys = { ...keys, ...h }; }, point: (p: Partial<PointerSample>) => { pointer = { ...IDLE_POINTER, ...p }; } };
}

describe('the Single player runtime (Feel-ii §1.1, §2.8)', () => {
  it('sends a heading request from the Helm, and none from Weapons', () => {
    const r = rig();
    for (let k = 0; k < 3; k++) r.tick();
    r.requests.heading(77); r.tick(); r.tick();
    expect(r.rt.duel.holdHeading).toBe(77);
    r.press('switch'); for (let k = 0; k < 4; k++) r.tick();   // now the Weapons character
    r.requests.heading(12); r.tick(); r.tick();
    expect(r.rt.duel.holdHeading).toBe(77);
  });
  it('A/D or auto-face held at the Helm clears the heading base: a heading asked for then still goes (the sim clears the hold)', () => {
    const r = rig();
    for (let k = 0; k < 3; k++) r.tick();
    r.requests.heading(77); r.tick(); r.tick();
    expect(r.rt.duel.holdHeading).toBe(77);
    const asked = (h: Partial<KeySample>): number => {
      r.hold(h); r.requests.heading(77);
      let n = 0;
      for (let k = 0; k < 2; k++) { r.tick(); n += r.rt.lastResults().length; }
      r.hold({ moveX: 0, fireHeld: false });
      return n;
    };
    expect(asked({ moveX: 1 })).toBeGreaterThan(0);   // A held: the request is sent against −1, not the held 77
    expect(r.rt.duel.holdHeading).toBe(-1);
    r.requests.heading(77); r.tick(); r.tick();
    expect(r.rt.duel.holdHeading).toBe(77);
    expect(asked({ fireHeld: true })).toBeGreaterThan(0);   // auto-face held the same
  });
  it('a Tab back to the Helm during a right-drag does not pan the Helm camera backwards by it', () => {
    const run = (drag: boolean): number[] => {
      const r = rig();
      for (let k = 0; k < 3; k++) r.tick();
      r.press('switch'); for (let k = 0; k < 4; k++) r.tick();   // now at Weapons
      if (drag) r.point({ dragX: 80, dragY: 30, rightX: 80, rightY: 30 });
      r.press('switch'); r.tick();   // back to the Helm the frame of the drag
      expect(r.rt.view()).toBe('helm');
      return [r.rt.cameras.helm.centreX, r.rt.cameras.helm.centreY];
    };
    expect(run(true)).toEqual(run(false));
  });
  it('names a refused LAUNCH (out of range) and a Helm control with Engines off', () => {
    const r = rig();
    for (let k = 0; k < 3; k++) r.tick();
    r.rt.duel.tactical.systems[0].rooms[Room.Engines] = 2;
    r.hold({ held: { fire: false, left: true, right: false, up: false, down: false } }); r.tick();
    expect(r.rt.takeRefusals()).toEqual([{ control: 'turn', reason: 'ENGINES OFFLINE' }]);
    r.hold({ held: { fire: false, left: false, right: false, up: false, down: false } });
    r.press('switch'); for (let k = 0; k < 4; k++) r.tick(); r.rt.takeRefusals();
    const t = r.rt.duel.tactical; Object.assign(t.ships[1], { x: t.ships[0].x + 3000, y: t.ships[0].y });
    r.press('launch'); r.tick();
    expect(r.rt.takeRefusals()).toEqual([{ control: 'launch', reason: 'OUT OF RANGE' }]);
    expect(r.rt.takeRefusals()).toEqual([]);
  });
  it('Engineering spike §10.4 (final review): E/Q on an unseen enemy say NO CONTACT for the beam and the torpedo; seen, nothing', () => {
    const r = rig();
    for (let k = 0; k < 3; k++) r.tick();
    r.press('switch'); for (let k = 0; k < 4; k++) r.tick(); r.rt.takeRefusals();   // now at Weapons
    const t = r.rt.duel.tactical; Object.assign(t.ships[1], { x: t.ships[0].x + 3000, y: t.ships[0].y, active: true });
    r.press('interact'); r.tick();
    expect(r.rt.takeRefusals()).toEqual([{ control: 'laser', reason: 'NO CONTACT' }]);
    r.press('prevLock'); r.tick();
    expect(r.rt.takeRefusals()).toEqual([{ control: 'laser', reason: 'NO CONTACT' }]);
    r.contact({ torpStep: 1 }); r.tick();
    expect(r.rt.takeRefusals()).toEqual([{ control: 'launch', reason: 'NO CONTACT' }]);
    Object.assign(t.ships[1], { x: t.ships[0].x + 600 });
    r.press('interact'); r.tick(); r.contact({ torpStep: 1 }); r.tick();
    expect(r.rt.takeRefusals()).toEqual([]);
  });
});

describe('the torpedo lock tone and the launch chirp (Feel-ii §2.5, §2.6)', () => {
  it('beeps faster as the enemy nears the range, a steady tone once there, nothing unlocked', () => {
    expect(lockBeepGap(360 * 3, 360)).toBeCloseTo(LOCK_BEEP_FAR_S, 9);
    expect(lockBeepGap(360, 360)).toBeCloseTo(LOCK_BEEP_NEAR_S, 9);
    expect(lockBeepGap(700, 360)).toBeLessThan(lockBeepGap(900, 360));
    let w: LockWatch | null = null, beeps = 0;
    const run = (distance: number, seconds: number, from: number): number => {
      let n = 0;
      for (let t = 0; t < seconds; t += 1 / 60) { const r = lockTone(w, { locked: true, distance, range: 360 }, false, from + t); w = r.watch; n += r.sounds.filter((s) => s === LOCK_BEEP).length; }
      return n;
    };
    beeps = run(1000, 3, 0);
    const near = run(400, 3, 3);
    expect(near).toBeGreaterThan(beeps);
    const steady = lockTone(w, { locked: true, distance: 350, range: 360 }, false, 6);
    expect(steady.sounds).toEqual([LOCK_STEADY]);
    expect(lockTone(steady.watch, { locked: true, distance: 340, range: 360 }, false, 6.1).sounds).toEqual([]);
    expect(lockTone(null, { locked: false, distance: 340, range: 360 }, false, 0).sounds).toEqual([]);
  });
  it('the steady tone plays once for an enemy hovering at the range edge; it re-arms 40 u out, or on a new lock or target', () => {
    const steadies = (w: LockWatch | null, frames: { distance: number; target?: number; locked?: boolean }[]): [number, LockWatch | null] => {
      let n = 0;
      frames.forEach((f, k) => { const r = lockTone(w, { locked: f.locked ?? true, distance: f.distance, range: 360, target: f.target ?? 3 }, false, k / 60); w = r.watch; n += r.sounds.filter((s) => s === LOCK_STEADY).length; });
      return [n, w];
    };
    const [hover, w] = steadies(null, [350, 365, 355, 370, 358, 399, 359].map((distance) => ({ distance })));
    expect(LOCK_REARM_U).toBe(40);
    expect(hover).toBe(1);   // in and out of range by less than 40 u: one steady tone
    expect(steadies(w, [{ distance: 401 }, { distance: 359 }])[0]).toBe(1);   // more than 40 u beyond: re-armed
    expect(steadies(w, [{ distance: 359, target: 5 }])[0]).toBe(1);   // a new target
    expect(steadies(w, [{ distance: 380, locked: false }, { distance: 359 }])[0]).toBe(1);   // the lock lost and back
    expect(lockTone(w, { locked: true, distance: 380, range: 360, target: 3 }, false, 9).sounds).toEqual([]);   // silent in the band
  });
  it('the torpedo that launches the tick it comes in range still gets its steady tone', () => {
    const a = lockTone(null, { locked: true, distance: 380, range: 360 }, false, 0);
    expect(lockTone(a.watch, { locked: false, distance: 350, range: 360 }, true, 0.02).sounds).toEqual([LOCK_STEADY]);
  });
  it('an enemy torpedo\'s launch chirps; the crew\'s whooshes only', () => {
    const pan = () => 0, view = (missiles: { active: boolean; x: number; y: number; owner?: number }[], tick = 10) => ({ tick, round: 0, outcome: 0, missiles });
    const base = duelStateSounds(null, view([{ active: false, x: 0, y: 0 }, { active: false, x: 0, y: 0 }]), pan).watch;
    const enemy = duelStateSounds(base, view([{ active: false, x: 0, y: 0 }, { active: true, x: 0, y: 0, owner: 1 }], 11), pan).sounds;
    expect(enemy.map((s) => s.key)).toEqual(['thruster', LAUNCH_CHIRP.key]);
    const crew = duelStateSounds(base, view([{ active: true, x: 0, y: 0, owner: 0 }, { active: false, x: 0, y: 0 }], 11), pan).sounds;
    expect(crew.map((s) => s.key)).toEqual(['thruster']);
  });
  it('the scene\'s tone data: locked only with a target and a torpedo ready', () => {
    const r = rig(), d = r.rt.duel, sys = d.tactical.systems[0], [own, hunter] = d.tactical.ships;
    Object.assign(hunter!, { x: own!.x + 600, y: own!.y });   // Engineering spike §10.4: inside the start sensor range (an unseen enemy is never locked)
    expect(torpedoTone(d).locked).toBe(false);
    sys.torpLock = Room.Shields;
    expect(torpedoTone(d)).toMatchObject({ locked: true, range: 360, target: Room.Shields });
    sys.magazine = 0; expect(torpedoTone(d).locked).toBe(false); sys.magazine = 2;
    sys.rooms[Room.Weapons] = 2; expect(torpedoTone(d).locked).toBe(false); sys.rooms[Room.Weapons] = 0;
    // Engineering spike §10.4 (final review): the torpedo's own bars, as canLaunch: no tone while it stands on none
    sys.weaponPower.splice(0, 3, 2, 0, 0); expect(torpedoTone(d).locked).toBe(false);
    sys.weaponPower.splice(0, 3, 1, 0, 1); expect(torpedoTone(d).locked).toBe(true);
  });
});

describe('the ping on the wire (Feel-ii §2.7)', () => {
  it('round-trips the duel codec on its own reliable input stream, and refuses a bad point', () => {
    const codec = duelCodec(2), ping: ClientMessage = { kind: 'ping', runId: 'r', player: 1, sequence: 3, x: -120.5, y: 900, target: true };
    expect(codec.decodeMessage(codec.encodeMessage(ping))).toEqual(ping);
    expect(modeInputIdentity(codec, 'duel', codec.encodeMessage(ping), 'reliable-ordered')).toEqual({ stream: 'ping', channel: 'reliable-ordered' });
    for (const bad of [{ ...ping, x: Infinity }, { ...ping, y: 2e6 }, { ...ping, target: 1 }]) expect(() => codec.encodeMessage(bad as ClientMessage)).toThrow();
  });
  it('the authority relays a ping to every seat as an event, at most one a second a player (pings are never journalled: core.ts)', () => {
    const state = makeState(2), runId = 'pings', contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
    const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
    const pair = transport.connectLocal(), client = createClientRun(pair.clientLink, [0], { runId, resolveLayout: () => LAYOUT });
    let now = 0;
    const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest, resolveLayout: () => LAYOUT, onCrash(r) { throw Error(r.error); },
      init: { runId, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest, seed: 1, playerCount: 2, characters: [], unlocked: [] } }, state);
    authority.attach(pair.authorityLink, [0]); transport.drain();
    const send = (sequence: number, x: number, player = 0) => pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'ping', runId, player, sequence, x, y: 5, target: false }));
    const pump = (at: number) => { now = at; transport.drain(); authority.pump(); transport.drain(); };
    try {
      send(1, 10); send(2, 20); send(2, 30, 1); pump(0);   // the second is inside the second; player 1 is not this binding's
      expect(client.takeEvents().map((e) => e.payload)).toEqual([{ kind: 'ping', player: 0, x: 10, y: 5, target: false }]);
      send(3, 40); pump(999); expect(client.takeEvents()).toEqual([]);
      send(4, 50); pump(1000); expect(client.takeEvents().map((e) => e.payload)).toEqual([{ kind: 'ping', player: 0, x: 50, y: 5, target: false }]);
      send(4, 60); pump(5000); expect(client.takeEvents()).toEqual([]);   // a stale sequence
      expect(decodeMessage(encodeMessage({ kind: 'ping', runId, player: 0, sequence: 9, x: 1, y: 2, target: true }))).toMatchObject({ kind: 'ping', target: true });
    } finally { authority.dispose(); client.dispose(); pair.host.close('done'); pair.client.close('done'); }
  });
  it('a ping in the same batch as a journalled held frame stays out of that admission frame, so a gateless replay agrees', () => {
    const state = makeState(2), runId = 'ping-replay', contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
    const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
    const pair = transport.connectLocal(), client = createClientRun(pair.clientLink, [0], { runId, resolveLayout: () => LAYOUT });
    let now = 0;
    const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, contentDigest, resolveLayout: () => LAYOUT, onCrash(r) { throw Error(r.error); },
      init: { runId, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest, seed: 1, playerCount: 2, characters: [], unlocked: [] } }, state);
    authority.attach(pair.authorityLink, [0]); transport.drain();
    const pump = (at: number) => { now = at; transport.drain(); authority.pump(); transport.drain(); };
    try {
      pump(0);
      pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'held', frame: { runId, player: 0, tick: state.tick, sequence: 1, held: { moveX: 1, moveY: 0, interactHeld: false } } }));
      pair.clientLink.send('reliable-ordered', encodeMessage({ kind: 'ping', runId, player: 0, sequence: 1, x: 10, y: 5, target: false }));
      pump(20);
      expect(client.takeEvents().map((e) => e.payload)).toContainEqual({ kind: 'ping', player: 0, x: 10, y: 5, target: false });
      for (let k = 2; k <= 10; k++) pump(k * 20);
      const replay = authority.replay();
      expect(replay.frames.some((f) => f.action.kind === 'admission')).toBe(true);
      expect(() => runReplay(LAYOUT, replay, contentDigest)).not.toThrow();
    } finally { authority.dispose(); client.dispose(); pair.host.close('done'); pair.client.close('done'); }
  });
});
