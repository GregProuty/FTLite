// Sci-1 (spec 2026-11-17-science-scans §7.2, §7.3, §7.4): keys 1/2/3 and the console's frequency buttons, the pointer's
// position, the local runtime turning the contact controller's requests and the frequency into commands, and the scene
// at Science (the window always shown, the hover readout, a map click on the wreck designating it).
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { createDuelKeyboard, createPointerSource, emptyPresses, frequencyRequest, type EventSource, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { sitDown } from '../src/renderer/src/sim/stations';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
const LIVE = { banner: null, layerPaused: false, end: null };
function fakeTarget() {
  const l = new Map<string, ((e: never) => void)[]>();
  return {
    addEventListener(t: string, fn: (e: never) => void) { l.set(t, [...(l.get(t) ?? []), fn]); },
    removeEventListener() {},
    fire(t: string, e: object) { for (const fn of l.get(t) ?? []) fn(e as never); }
  };
}
const key = (code: string, repeat = false) => ({ code, repeat, preventDefault() {} });

describe('the frequency keys and buttons (spec §7.4)', () => {
  it('1, 2 and 3 ask for A, B and C once per sample; repeats do not; the console button asks too; clear and clearUi drop it', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t as unknown as EventSource);
    t.fire('keydown', key('Digit2'));
    expect(kb.sample().freqTo).toBe(1); expect(kb.sample().freqTo).toBeNull();
    t.fire('keydown', key('Digit3', true)); expect(kb.sample().freqTo).toBeNull();
    t.fire('keydown', key('Digit1')); t.fire('keydown', key('Digit3')); expect(kb.sample().freqTo).toBe(2);
    kb.ui.frequency(0); expect(kb.sample().freqTo).toBe(0);
    kb.ui.frequency(1); kb.clearUi(); expect(kb.sample().freqTo).toBeNull();
    t.fire('keydown', key('Digit1')); kb.clear(); expect(kb.sample().freqTo).toBeNull();
    kb.destroy();
  });
  it('frequencyRequest: a whole 0..2 that differs from the base, else null', () => {
    expect([frequencyRequest(0, 2), frequencyRequest(2, 2), frequencyRequest(0, null), frequencyRequest(0, undefined), frequencyRequest(0, 3), frequencyRequest(0, 1.5), frequencyRequest(1, 0)])
      .toEqual([2, null, null, null, null, null, 0]);
  });
});

describe('the pointer position (spec §7.3)', () => {
  it('is the last pointer position in internal px, null before any, and a sample does not clear it', () => {
    const t = fakeTarget(), p = createPointerSource(t as unknown as EventSource, (cx, cy) => ({ x: cx / 2, y: cy / 2 }));
    expect(p.position()).toBeNull();
    t.fire('pointermove', { clientX: 100, clientY: 50, button: 0, buttons: 0, preventDefault() {} });
    expect(p.position()).toEqual({ x: 50, y: 25 });
    p.sample(); expect(p.position()).toEqual({ x: 50, y: 25 });
    p.destroy();
  });
});

/** The local runtime on a fake clock with a contact controller, as tests/duelRuntime.test.ts drives it. */
function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [], contact = createContactController();
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses(), freqTo: null }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeContactRequests: () => contact.takeRequests()
  });
  /** A frame, one tick of wall time, a frame: requests drained by the first frame go out on exactly that tick. */
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  const freq = (f: number): void => { keys = { ...keys, freqTo: f }; };
  const at = (station: 'helm' | 'weapons' | 'science') => contact.sync({ shown: true, station, target: 1, active: () => true, epoch: 0, enemyKnown: rt.duel.tactical.known[0] });
  const kinds = (): string[] => rt.lastResults().map((r) => `${r.status}`);
  tick();   // the solo start: player 1 goes away on tick 0
  return { rt, contact, tick, freq, at, kinds };
}

describe('the requests to commands (spec §5, §7.2, §7.3)', () => {
  it('Science: a selection sends designate once; S sends contactScan at Science\'s rate; a repeat of the held value is not sent', () => {
    const r = rig(), d = r.rt.duel;
    try {
      sitDown(d.interior, 0, d.science); r.at('science');
      r.contact.click(1); r.tick();
      expect([d.tactical.designated, r.kinds()]).toEqual([1, ['applied']]);
      r.contact.click(1); r.tick();
      expect(r.kinds()).toEqual([]);
      expect(r.contact.intercept('KeyS')).toBe(true); r.tick();
      expect(r.kinds()).toEqual(['applied']);
      expect(d.tactical.scan).toMatchObject({ contact: 1, level: 1, rate: 5, by: d.science });
      r.contact.toggle(); r.tick();   // derelict → none
      expect(d.tactical.designated).toBe(-1);
    } finally { r.rt.dispose(); }
  });
  it('the selection and the designation stay in step: a contact carried to Science is designated, an enemy closed as gone undesignated', () => {
    const r = rig(), d = r.rt.duel;
    try {
      sitDown(d.interior, 0, d.nav); r.at('helm'); r.contact.click(1); r.tick();   // the Helm opens the wreck: no designation
      expect(d.tactical.designated).toBe(-1);
      sitDown(d.interior, 0, d.science); r.at('science'); r.tick();   // to Science with the wreck still open
      expect([r.contact.state(), d.tactical.designated]).toEqual([{ contact: 1, aim: false }, 1]);
      r.contact.click(0); r.tick();
      expect(d.tactical.designated).toBe(0);
      r.contact.sync({ shown: true, station: 'science', target: 1, active: () => false, epoch: 0 }); r.tick();   // the enemy's slot inactive
      expect([r.contact.state(), d.tactical.designated]).toEqual([null, -1]);
    } finally { r.rt.dispose(); }
  });
  it('the Helm: the window\'s SCAN sends a slow scan; standing, a SCAN request is dropped', () => {
    const r = rig(), d = r.rt.duel;
    try {
      r.at('helm'); r.contact.click(0); r.contact.scan(); r.tick();   // standing
      expect(r.kinds()).toEqual([]);
      sitDown(d.interior, 0, d.nav); r.at('helm');
      r.contact.scan(); r.tick();
      expect(d.tactical.scan).toMatchObject({ contact: 0, level: 1, rate: 2, by: d.nav });
    } finally { r.rt.dispose(); }
  });
  it('Weapons: 1/2/3 (or a button) send laserFrequency only when it changes the tuned frequency', () => {
    const r = rig(), d = r.rt.duel;
    try {
      sitDown(d.interior, 0, d.weapons);
      r.freq(2); r.tick();
      expect([d.tactical.systems[0].freq, r.kinds()]).toEqual([2, ['applied']]);
      r.freq(2); r.tick();
      expect(r.kinds()).toEqual([]);
    } finally { r.rt.dispose(); }
  });
});

describe('the scene at Science (spec §7.2, §7.3)', () => {
  it('shows the window with nothing selected and the hover readout; a click on the wreck selects and designates it', () => {
    const r = rig(), d = r.rt.duel, clicks: { x: number; y: number }[] = [];
    const assets: GameAssets = { has: () => false, texture: (n) => { throw new Error(`no texture ${n}`); }, animation: (n) => { throw new Error(`no animation ${n}`); },
      nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }, missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7' };
    const renderer = { app: { stage: new Container() }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const store = createUiStore({ onlineAvailable: false } as never);
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact: r.contact, takeClick: () => clicks.shift() ?? null, pointer: () => ({ x: 900, y: 300 }) });
    try {
      sitDown(d.interior, 0, d.science); r.tick();
      const cam = r.rt.cameras.science; cam.zoom = cam.targetZoom = cam.zoomFrom = 0.12;
      scene.draw(r.rt, 1 / 60, LIVE);
      const v = store.getState().duel!;
      expect([v.console?.station, v.contact?.title]).toEqual(['science', 'NO CONTACT SELECTED']);
      expect(v.console?.science?.hover).toMatch(/^BRG \d{3} RNG \d+$/);
      const w = derelictPos(d.tactical);
      clicks.push(worldToScreen(cam, vp, w.x, w.y)); scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toEqual({ contact: 1, aim: false });
      expect(store.getState().duel?.contact?.title).toBe('UNKNOWN CONTACT');
      r.tick();
      expect(d.tactical.designated).toBe(1);
    } finally { scene.dispose(); r.rt.dispose(); }
  });
});
