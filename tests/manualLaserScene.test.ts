// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the scene keeps the laser's aim. While the pointer is
// on the open Weapons map, the aim is its fine bearing from the own ship's drawn marker; over a console block or with no
// pointer the last aim stands. The map requests keep the latest aim (peeked, not drained) until a new round.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { interpolatedShip } from '../src/renderer/src/render/tactical/tacticalModel';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { seatDuelCrew } from './helpers/duelSeat';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { STATION, stationTop } from '../src/renderer/src/render/duel/consoleLayout';

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

/** The real runtime, scene and tactical layer in node (as contactScene.test.ts), with a pointer the test moves. */
function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }, pointerAt: { x: number; y: number } | null = null;
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
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, requests, takeClick: () => null, pointer: () => pointerAt });
  seatDuelCrew(rt.duel);   // player 0 at the Helm, player 1 at Weapons; Tab takes the gunner
  press('switch'); tick(); tick();
  let round = 0;   // the scene's epoch: bumping it is a new round
  const source = Object.create(rt, { epoch: { value: () => round } });
  const point = (p: { x: number; y: number } | null): void => { pointerAt = p; scene.draw(source, 1 / 60, LIVE); };
  const marker = () => { const b = interpolatedShip(rt.duel.tactical, rt.prev, rt.alpha(), 0); return worldToScreen(rt.cameras.weapons, vp, b.x, b.y); };
  return { rt, scene, requests, point, marker, newRound: () => { round++; } };
}

describe('the map requests (spec §2)', () => {
  it('keep the latest laser aim, peeked and not drained, until reset', () => {
    const r = createMapRequests();
    expect(r.laserAim()).toBeNull();
    r.aimLaser(100); r.aimLaser(200);
    expect([r.laserAim(), r.laserAim()]).toEqual([200, 200]);
    r.resetLaserAim();
    expect(r.laserAim()).toBeNull();
  });
});

describe('the scene keeps the laser\'s aim (spec §2)', () => {
  it('follows the pointer on the open Weapons map as a fine bearing from the own marker; off the map the last aim stands', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.point(null);   // a first frame: the sit framing settles
      expect(r.requests.laserAim()).toBeNull();
      const m = r.marker();
      r.point({ x: m.x + 100, y: m.y });
      expect(r.requests.laserAim()).toBe(16384);   // east: a quarter turn of 65536
      r.point({ x: STATION.x + 20, y: stationTop('weapons') + 10 });   // over the Weapons block: not the map
      expect(r.requests.laserAim()).toBe(16384);
      r.point(null);
      expect(r.requests.laserAim()).toBe(16384);
      r.point({ x: m.x, y: m.y - 100 });
      expect(r.requests.laserAim()).toBe(0);   // north
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});

describe('a new round clears the aim (spec §2, plan Decision 10)', () => {
  it('an epoch change in the scene resets the kept aim to none', () => {
    const r = rig();
    try {
      r.point(null);
      const m = r.marker();
      r.point({ x: m.x + 100, y: m.y });
      expect(r.requests.laserAim()).toBe(16384);
      r.newRound();
      r.point(null);   // the draw that sees the new epoch; no pointer to give a fresh aim
      expect(r.requests.laserAim()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});
