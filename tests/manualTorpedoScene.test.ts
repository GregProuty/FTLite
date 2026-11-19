// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §5): the scene turns the Weapons seat's right button into
// the MANUAL torpedo's held heading. A press or a drag on the open map, while the crew's MANUAL torpedo flies, asks for the
// bearing from the torpedo's drawn marker to the pointer (on the torpedo itself: −1, clear). Over a console block, with an
// AUTO torpedo or none, it asks nothing. In Single player the Weapons camera follows the MANUAL torpedo.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { emptyPresses, type AimSample, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { seatDuelCrew } from './helpers/duelSeat';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { STATION, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { missileOf, placeMissile, removeMissile } from '../src/renderer/src/sim/tactical/state';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const vp = { w: 1280, h: 720 };
const LIVE = { banner: null, layerPaused: false, end: null };

/** The real runtime, scene and tactical layer in node (as manualLaserScene.test.ts), with a right button the test drives. */
function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }, aimNow: AimSample | null = null;
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; }
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  const stage = new Container();
  const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
  const store = createUiStore({ onlineAvailable: false } as never), contact = createContactController(), requests = createMapRequests();
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, requests, takeClick: () => null, pointer: () => null,
    takeAim: () => { const a = aimNow; aimNow = null; return a; } });
  seatDuelCrew(rt.duel);   // player 0 at the Helm, player 1 at Weapons; Tab takes the gunner
  press('switch'); tick(); tick();
  /** One drawn frame with the right button held at p (a press), or none. */
  const aim = (p: { x: number; y: number } | null): void => { aimNow = p ? { x: p.x, y: p.y, press: true, release: false, held: true } : null; scene.draw(rt, 1 / 60, LIVE); };
  /** The crew's torpedo 40 north of the ship, MANUAL by default, past its boost; its drawn marker on the Weapons map. */
  const launch = (manual = true) => {
    const s = rt.duel.tactical.ships[0];
    placeMissile(rt.duel.tactical, 0, { x: s.x, y: s.y - 40, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, manual);
  };
  const marker = () => { const m = missileOf(rt.duel.tactical, 0)!; return worldToScreen(rt.cameras.weapons, vp, m.x, m.y); };
  return { rt, scene, requests, contact, aim, launch, marker, tick };
}

describe('the right button while a MANUAL torpedo flies (spec §3)', () => {
  it('asks for the bearing from the torpedo\'s marker; on the torpedo, a clear; over a console block, nothing', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.aim(null);   // a first frame: the sit framing settles
      r.launch();
      const m = r.marker();
      r.aim({ x: m.x + 100, y: m.y });
      expect(r.requests.takeTorpHeading()).toBe(64);   // east of the torpedo
      expect(r.requests.takeTorpHeading()).toBeNull();   // drained
      r.aim({ x: m.x, y: m.y - 100 });
      expect(r.requests.takeTorpHeading()).toBe(0);
      r.aim({ x: m.x, y: m.y });
      expect(r.requests.takeTorpHeading()).toBe(-1);   // on the torpedo: clear the hold
      r.aim({ x: STATION.x + 20, y: stationTop('weapons') + 10 });   // over the Weapons block: not the map
      expect(r.requests.takeTorpHeading()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('asks nothing while a weapon is picked up, nor on the right press that cancels the pick-up; the next press asks', () => {
    const r = rig();
    try {
      r.aim(null);
      r.launch();
      const m = r.marker(), east = { x: m.x + 100, y: m.y };
      r.contact.pickUp('laser');
      r.aim(null);   // a drawn frame with the laser picked up: lastAimed is 'laser'
      expect(r.contact.aimWeapon()).toBe('laser');
      r.aim(east);   // a right press while it is picked up: nothing
      expect(r.requests.takeTorpHeading()).toBeNull();
      r.contact.close();   // the targeting line's own listener drops the pick-up and the window before the scene draws
      expect(r.contact.aimWeapon()).toBeNull();
      r.aim(east);   // the press that cancelled it: aimWeapon() is already null, but the last frame's pick-up counts
      expect(r.requests.takeTorpHeading()).toBeNull();
      r.aim(east);   // the next press steers the torpedo
      expect(r.requests.takeTorpHeading()).toBe(64);
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('asks nothing with an AUTO torpedo or none flying', () => {
    const r = rig();
    try {
      r.aim(null);
      const s = worldToScreen(r.rt.cameras.weapons, vp, r.rt.duel.tactical.ships[0].x, r.rt.duel.tactical.ships[0].y);
      r.aim({ x: s.x + 100, y: s.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
      r.launch(false);
      r.aim({ x: s.x + 100, y: s.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});

describe('the Weapons camera in Single player (spec §3)', () => {
  it('follows a MANUAL torpedo while it flies and goes back to the ship when it ends; not an AUTO one', () => {
    const r = rig();
    try {
      expect(r.rt.cameras.weapons.follow).toBe('ship');
      r.launch(false);
      r.tick();
      expect(r.rt.cameras.weapons.follow).toBe('ship');
      removeMissile(r.rt.duel.tactical, 0);
      r.launch(true);
      r.tick();
      expect(r.rt.cameras.weapons.follow).toBe('missile');
      removeMissile(r.rt.duel.tactical, 0);
      r.tick();
      expect(r.rt.cameras.weapons.follow).toBe('ship');
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});

describe('the map requests (spec §3)', () => {
  it('keep the latest torpedo heading until taken', () => {
    const q = createMapRequests();
    expect(q.takeTorpHeading()).toBeNull();
    q.torpHeading(10); q.torpHeading(-1);
    expect([q.takeTorpHeading(), q.takeTorpHeading()]).toEqual([-1, null]);
  });
});
