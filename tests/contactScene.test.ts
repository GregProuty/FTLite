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
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { interpolatedShip } from '../src/renderer/src/render/tactical/tacticalModel';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { seatDuelCrew } from './helpers/duelSeat';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { RockKind, rockSlots, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { resetSits } from '../src/renderer/src/render/duel/sitModel';

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
  const store = createUiStore({ onlineAvailable: false } as never), contact = createContactController(), clicks: { x: number; y: number }[] = [];
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, takeClick: () => clicks.shift() ?? null });
  // The old seated start (createDuel now leaves both standing): player 0 at the Helm, player 1 at Weapons; Tab takes the gunner.
  seatDuelCrew(rt.duel);
  const sh = rt.duel.tactical.ships; sh[1]!.x = sh[0]!.x + 600; sh[1]!.y = sh[0]!.y;   // Engineering spike §10.4: inside the 900 start range
  press('switch'); tick(); tick();
  const enemyOnScreen = () => { const b = interpolatedShip(rt.duel.tactical, rt.prev, rt.alpha(), 1); return worldToScreen(rt.cameras.weapons, vp, b.x, b.y); };
  const view = () => store.getState().duel?.contact;
  return { rt, store, contact, clicks, scene, enemyOnScreen, view };
}

describe('the scene and the contact window (spec §6.5)', () => {
  it('a click over the enemy at the Weapons console opens the contact view; a pause clears it on that frame', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.rt.duel.tactical.known[0] = 2;   // Sci-1: the full window needs the enemy at Level 2
      r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.view()).toBeNull();
      r.clicks.push(r.enemyOnScreen()); r.scene.draw(r.rt, 1 / 60, LIVE);
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
  it('with the console hidden a click over the enemy opens nothing, and the click is not kept for later', () => {
    const r = rig();
    try {
      r.clicks.push(r.enemyOnScreen()); r.scene.draw(r.rt, 1 / 60, PAUSED);
      expect(r.contact.state()).toBeNull(); expect(r.view()).toBeNull();
      expect(r.clicks).toHaveLength(0);
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
  it('spike ii §6.5: with a weapon picked up, a click on a rock (no ship under it) drops it there: a rockLock request, the window closes', () => {
    const r = rig();
    try {
      const t = r.rt.duel.tactical, me = t.ships[0], slot = rockSlots(t) - 1;
      writeRock(t, slot, RockKind.Moving, me.x + 150, me.y, 0, 0, 25, 3);
      r.contact.pickUp('laser'); r.scene.draw(r.rt, 1 / 60, LIVE);
      r.clicks.push(worldToScreen(r.rt.cameras.weapons, vp, me.x + 150, me.y)); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.takeRequests().rockLock).toEqual({ weapon: 'laser', rock: slot });
      expect(r.contact.state()).toBeNull();
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
