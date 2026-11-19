// Enemy ship window spec §6.5, §8 (the scene test): the duel scene takes a map click over the enemy at the Weapons
// console and hands the UI a contact view; a click while the console is hidden opens nothing; a pause clears an open
// window on that frame. The real runtime, scene and tactical layer in node, as interiorZoomScene.test.ts does.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { screenToWorld, worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { fineHeadingOf, interpolatedShip } from '../src/renderer/src/render/tactical/tacticalModel';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { seatDuelCrew } from './helpers/duelSeat';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { resetSits } from '../src/renderer/src/render/duel/sitModel';
import { CONTACT, STATION, stationTop, TABS } from '../src/renderer/src/render/duel/consoleLayout';

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
const PAUSED = { banner: 'PAUSED', layerPaused: true, end: null };

function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
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
  const store = createUiStore({ onlineAvailable: false } as never), contact = createContactController(), clicks: { x: number; y: number }[] = [], requests = createMapRequests();
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, requests, takeClick: () => clicks.shift() ?? null });
  // The old seated start (createDuel now leaves both standing): player 0 at the Helm, player 1 at Weapons; Tab takes the gunner.
  seatDuelCrew(rt.duel);
  press('switch'); tick(); tick();
  const enemyOnScreen = () => { const b = interpolatedShip(rt.duel.tactical, rt.prev, rt.alpha(), 1); return worldToScreen(rt.cameras.weapons, vp, b.x, b.y); };
  const view = () => store.getState().duel?.contact;
  return { rt, store, contact, clicks, requests, press, tick, scene, enemyOnScreen, view };
}

describe('the scene and the contact window (spec §6.5)', () => {
  it('T over the enemy at the Weapons console opens the contact view; a pause clears it on that frame', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.rt.duel.tactical.known[0] = 2;   // Sci-1: the full window needs the enemy at Level 2
      r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.view()).toBeNull();
      r.contact.toggle(); r.scene.draw(r.rt, 1 / 60, LIVE);   // W-1: at Weapons the map click is the pew; T opens the window
      expect(r.contact.state()).toEqual({ contact: 0, aim: false });
      expect(r.view()?.title).toBe('ENEMY SHIP');
      expect(r.view()?.weapons?.laser.enabled).toBe(true);
      expect(r.view()?.lockRoom).toBe(1);   // Feel-i: the SHIELDS opener; FTL targeting spec §1: no mark without a target
      r.rt.duel.tactical.systems[0].laserTargeted = false; r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.view()?.lockRoom).toBeNull();
      r.rt.duel.tactical.systems[0].laserTargeted = true; r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.view()?.lockRoom).toBe(r.rt.duel.tactical.systems[0].lock);
      r.scene.draw(r.rt, 1 / 60, LIVE);   // stays open without a click
      expect(r.view()?.title).toBe('ENEMY SHIP');
      r.scene.draw(r.rt, 1 / 60, PAUSED);
      expect(r.view()).toBeNull(); expect(r.contact.state()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('W-1: a left click over the enemy at Weapons asks for the pew at its bearing and opens nothing', () => {
    const r = rig();
    try {
      const e = interpolatedShip(r.rt.duel.tactical, r.rt.prev, r.rt.alpha(), 1), cam = r.rt.cameras.weapons;
      cam.follow = 'free'; cam.centreX = e.x - 100; cam.centreY = e.y;   // the enemy on the open map, off the ship
      r.clicks.push(r.enemyOnScreen()); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toBeNull();
      expect(r.requests.takePew()).not.toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('W-1: a click over the Weapons block (the PEW row, the cards) or the tab strip queues no pew', () => {
    const r = rig();
    try {
      for (const p of [{ x: STATION.x + 20, y: stationTop('weapons') + 10 }, { x: STATION.x + 20, y: stationTop('weapons') + 100 }, { x: TABS.x + 5, y: TABS.y + 5 }]) {
        r.clicks.push(p); r.scene.draw(r.rt, 1 / 60, LIVE);
        expect(r.requests.takePew(), `click at ${p.x},${p.y}`).toBeNull();
      }
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('W-1: with the default follow camera the pew aim is the click bearing from the own ship marker, split into aim and aimAcc', () => {
    const r = rig();
    try {
      const b = interpolatedShip(r.rt.duel.tactical, r.rt.prev, r.rt.alpha(), 0), m = worldToScreen(r.rt.cameras.weapons, vp, b.x, b.y);
      expect(r.rt.cameras.weapons.follow).toBe('ship');
      const at = (dx: number, dy: number) => { r.clicks.push({ x: m.x + dx, y: m.y + dy }); r.scene.draw(r.rt, 1 / 60, LIVE); return r.requests.takePew(); };
      expect(at(0, -100)).toBe(0);                 // straight up: heading 0
      expect(at(100, 0)).toBe(16384);              // east: a quarter turn of 65536
      expect(at(0, 100)).toBe(32768);              // south
      const odd = at(63, -41), want = fineHeadingOf(63, -41);
      expect(odd).toBe(want);
      expect([Math.floor(odd! / 256), odd! % 256]).toEqual([Math.floor(want / 256), want % 256]);
      const w = screenToWorld(r.rt.cameras.weapons, vp, m.x + 63, m.y - 41);
      expect(fineHeadingOf(w.x - b.x, w.y - b.y)).toBe(want);   // the world and screen bearings agree
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('W-1: with a weapon card picked up a map click queues no pew and keeps its old meaning', () => {
    const r = rig();
    try {
      r.contact.pickUp('laser'); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.aimWeapon()).toBe('laser');
      r.clicks.push({ x: 700, y: 250 }); r.scene.draw(r.rt, 1 / 60, LIVE);   // empty map: today's contact.click does nothing
      expect(r.requests.takePew()).toBeNull();
      expect(r.contact.state()).toEqual({ contact: 0, aim: true });
      r.clicks.push(r.enemyOnScreen()); r.scene.draw(r.rt, 1 / 60, LIVE);   // the enemy marker (off screen here, still picked): the old click, no pew
      expect(r.requests.takePew()).toBeNull();
      expect(r.contact.state()).toBeNull();   // the window's own click closed the shown contact, as before
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('W-1: with the contact window open a click inside it queues no pew; one on the open map still does', () => {
    const r = rig();
    try {
      r.contact.toggle(); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).not.toBeNull();
      r.clicks.push({ x: CONTACT.x + 20, y: CONTACT.y + 20 }); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.requests.takePew()).toBeNull();
      r.clicks.push({ x: 700, y: 250 }); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.requests.takePew()).not.toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('W-1: at the Helm a map click over the enemy still opens its window and asks for no pew', () => {
    const r = rig();
    try {
      r.press('switch'); r.tick(); r.tick();
      expect(r.rt.view()).toBe('helm');
      r.scene.draw(r.rt, 1 / 60, LIVE);
      const b = interpolatedShip(r.rt.duel.tactical, r.rt.prev, r.rt.alpha(), 1);
      r.clicks.push(worldToScreen(r.rt.cameras.helm, vp, b.x, b.y)); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toEqual({ contact: 0, aim: false });
      expect(r.requests.takePew()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('with the console hidden a click over the enemy opens nothing and fires nothing, and the click is not kept for later', () => {
    const r = rig();
    try {
      r.clicks.push(r.enemyOnScreen()); r.scene.draw(r.rt, 1 / 60, PAUSED);
      expect(r.contact.state()).toBeNull(); expect(r.view()).toBeNull();
      expect(r.clicks).toHaveLength(0);
      expect(r.requests.takePew()).toBeNull();
      r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('a click on empty space opens nothing', () => {
    const r = rig();
    try {
      const e = r.enemyOnScreen();
      r.clicks.push({ x: e.x + 200, y: e.y + 200 }); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toBeNull(); expect(r.view()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});

describe('Feel-i in the scene (console feel spec §1, §3)', () => {
  it('sitting down frames both ships and shows the card; the kill hides the enemy marker for its break-apart', () => {
    resetSits();
    const r = rig();
    r.scene.draw(r.rt, 1 / 60, LIVE);
    expect(r.store.getState().duel?.sitCard?.seat).toBe('weapons');
    expect(r.rt.cameras.weapons.targetZoom).toBeGreaterThanOrEqual(0.25);
    expect(r.rt.cameras.weapons.targetZoom).toBeLessThanOrEqual(1);
    const t = r.rt.duel.tactical;
    t.systems[1].hull = 0; t.outcome = 1;   // the enemy destroyed this frame (the scene reads it as the online guest would)
    r.scene.draw(r.rt, 1 / 60, LIVE);
    expect(r.store.getState().duel?.sitCard ?? null).toBeNull();   // the console is hidden on a decided round
    r.scene.dispose();
  });
});
