// Engineering spike §10.4: the fog of war is view state. A contact (the enemy, the derelict, the enemy's torpedo) is seen
// inside the sensor range; once unseen it leaves a ghost at its last seen place and heading, fading over 10 s, then gone.
// The map hides an unseen derelict's mark, draws the range ring and the ghosts; the contact window says CONTACT LOST.
import { describe, expect, it } from 'vitest';
import { createTacticalState, Contact, placeMissile } from '../src/renderer/src/sim/tactical/state';
import { derelictPos, sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createFog, GHOST_SECONDS, stepFog } from '../src/renderer/src/render/tactical/fogModel';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { contactModel } from '../src/renderer/src/render/duel/contactModel';
import { pickContact } from '../src/renderer/src/render/tactical/tacticalModel';
import { laserSituation } from '../src/renderer/src/render/duel/situationModel';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { initRocks } from '../src/renderer/src/sim/tactical/rocks';
import { Container } from 'pixi.js';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { seatDuelCrew } from './helpers/duelSeat';

const vp = { w: 1280, h: 720 };
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};

describe('stepFog (spec §10.4)', () => {
  it('the enemy inside the range is seen; moved out it is a ghost at its last place, fading over 10 s, then gone', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r / 2; e.y = own.y; e.active = true;
    let v = stepFog(f, t, 100, 0);
    expect(v.range).toBe(r); expect(v.seen.enemy).toBe(true); expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
    const at = { x: e.x, y: e.y, h: e.heading + e.headingAcc };
    e.x = own.x + r * 2;
    v = stepFog(f, t, 101, 0);
    expect(v.seen.enemy).toBe(false);
    expect(v.ghosts.find((g) => g.kind === 'enemy')).toEqual({ kind: 'enemy', ...at, alpha: 1 - 1 / GHOST_SECONDS });
    expect(stepFog(f, t, 100 + GHOST_SECONDS, 0).ghosts.find((g) => g.kind === 'enemy')).toBeUndefined();
  });
  it('a destroyed enemy leaves no ghost; a new round clears every ghost; never seen, never a ghost', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r * 3; e.y = own.y; e.active = true;   // on the crew ship's line, so the r / 2 step below is inside the range
    expect(stepFog(f, t, 0, 0).ghosts).toEqual(expect.not.arrayContaining([expect.objectContaining({ kind: 'enemy' })]));   // never seen
    e.x = own.x + r / 2; stepFog(f, t, 1, 0);
    e.x = own.x + r * 3; expect(stepFog(f, t, 2, 0).ghosts.some((g) => g.kind === 'enemy')).toBe(true);
    expect(stepFog(f, t, 2.5, 1).ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // a new round
    e.x = own.x + r / 2; stepFog(f, t, 3, 1); e.active = false;
    expect(stepFog(f, t, 4, 1).ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // destroyed: no ghost
  });
  it('the enemy torpedo is seen by distance; gone while seen, it leaves no ghost', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, r = sensorRange(t.systems[0]!);
    const m = placeMissile(t, 1, { x: own.x + r / 2, y: own.y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 0 });
    expect(stepFog(f, t, 0, 0).seen.missile).toBe(true);
    m.x = own.x + r * 2;   // the entry placeMissile filled (the first free one, state.ts placeMissile)
    const v = stepFog(f, t, 1, 0);
    expect(v.seen.missile).toBe(false);
    expect(v.ghosts.find((g) => g.kind === 'missile')).toMatchObject({ x: own.x + r / 2, h: 64 });
  });
});

describe('the fog on the map and the window (spec §10.4)', () => {
  const input = (t: ReturnType<typeof createTacticalState>, over: Partial<TacticalModelInput>): TacticalModelInput => ({
    state: t, prev: [], alpha: 1, camera: createCamera(t.ships[0].x, t.ships[0].y, 0.5), viewport: vp, console: 'weapons', axes: { turn: 0, thrust: 0 },
    ships: [0], paused: false, reserveRight: 0, contacts: true, ...over });
  it('the range ring about the crew ship, the ghosts on screen, and no derelict mark while it is unseen', () => {
    const t = createTacticalState(5), w = derelictPos(t);
    const cam = createCamera(w.x, w.y, 0.5);
    const seen = tacticalModel(input(t, { camera: cam, fog: { range: 900, seen: { enemy: false, derelict: true, missile: false }, ghosts: [] } }));
    expect(seen.marks!.some((m) => m.contact === Contact.Derelict)).toBe(true);
    const fogged = tacticalModel(input(t, { camera: cam, fog: { range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [{ kind: 'enemy', x: w.x, y: w.y, h: 0, alpha: 0.5 }] } }));
    expect(fogged.marks!.some((m) => m.contact === Contact.Derelict)).toBe(false);
    expect(fogged.ghosts).toEqual([{ kind: 'enemy', x: vp.w / 2, y: vp.h / 2, angle: 0, alpha: 0.5 }]);
    const own = tacticalModel(input(t, { fog: { range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [] } }));
    expect(own.sensor).toEqual({ x: vp.w / 2, y: vp.h / 2, r: 900 * 0.5 });
    expect(tacticalModel(input(t, {})).sensor).toBeUndefined();   // no fog given (the flight view): no ring
  });
  it('the contact window on an unseen contact: CONTACT LOST, no drawing, no weapons', () => {
    const t = createTacticalState(5);
    const v = contactModel({ state: t, contact: 0, aim: true, station: 'weapons', t: 0, weapons: null, seen: false })!;
    expect(v).toMatchObject({ title: 'CONTACT LOST', outline: [], rooms: [], weapons: null, aim: false });
    expect(v.lines.map((l) => l.text)).toEqual(['OUT OF SENSOR RANGE']);
  });
});

describe('no fog leaks (spec §10.4)', () => {
  it('a click (or a ping) on an unseen enemy or derelict picks nothing', () => {
    const t = createTacticalState(5), e = t.ships[1]!, cam = createCamera(e.x, e.y, 0.5), at = { state: t, prev: [], alpha: 1, camera: cam, viewport: vp };
    const fog = (enemy: boolean, derelict: boolean) => ({ range: 900, seen: { enemy, derelict, missile: false }, ghosts: [] });
    expect(pickContact(at, { x: vp.w / 2, y: vp.h / 2 })).toBe(Contact.Enemy);   // no fog given: as today
    expect(pickContact({ ...at, fog: fog(true, true) }, { x: vp.w / 2, y: vp.h / 2 })).toBe(Contact.Enemy);
    expect(pickContact({ ...at, fog: fog(false, true) }, { x: vp.w / 2, y: vp.h / 2 })).toBeNull();
    const w = derelictPos(t), dc = { ...at, camera: createCamera(w.x, w.y, 0.5) };
    expect(pickContact({ ...dc, fog: fog(false, true) }, { x: vp.w / 2, y: vp.h / 2 })).toBe(Contact.Derelict);
    expect(pickContact({ ...dc, fog: fog(false, false) }, { x: vp.w / 2, y: vp.h / 2 })).toBeNull();
  });
  it('the laser\'s words say nothing of an unseen enemy (no OUT OF RANGE n/450)', () => {
    const t = createTacticalState(5), sys = t.systems[0], me = t.ships[0]!, e = t.ships[1]!;
    t.map = { ...t.map, asteroids: [] }; t.grid = buildGrid([], t.map.rMap); t.rocks = initRocks(t.map);   // a clear line
    sys.bars[1] = 4; sys.weaponPower.splice(0, 3, 0, 2, 2);   // the beam powered
    e.x = me.x + hx(me.heading) * 1200; e.y = me.y + hy(me.heading) * 1200; e.active = true;   // ahead, beyond the 900 start range
    expect(laserSituation(t).kind).toBe('none');
    e.x = me.x + hx(me.heading) * 600; e.y = me.y + hy(me.heading) * 600;   // seen, beyond the laser's 450
    expect(laserSituation(t)).toMatchObject({ kind: 'range' });
  });
  it('sitting at the Helm frames the enemy only when it is seen', () => {
    let now = 0;
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({ now: () => now, seed: 5, viewport: vp, layout: parseShip(hound), scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {} });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store) });
    try {
      rt.frame(1 / 60); scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      const z0 = rt.cameras.helm.targetZoom;   // zoomTo sets targetZoom; zoom only eases in updateCamera (camera.ts:61-65, :90-91)
      seatDuelCrew(rt.duel); rt.frame(1 / 60); now += 1000 / 60;
      scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });   // the sit: the Hunter is far beyond 900
      expect(rt.cameras.helm.targetZoom).toBe(z0);
    } finally { scene.dispose(); rt.dispose(); }
  });
  it('sitting at the Helm frames a seen enemy (the converse of the fog gate)', () => {
    let now = 0;
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({ now: () => now, seed: 5, viewport: vp, layout: parseShip(hound), scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {} });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store) });
    try {
      const t = rt.duel.tactical, own = t.ships[0]!;
      Object.assign(t.ships[1]!, { x: own.x + 600, y: own.y });   // inside the start range of 900
      rt.frame(1 / 60); scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      const z0 = rt.cameras.helm.targetZoom;
      seatDuelCrew(rt.duel); rt.frame(1 / 60); now += 1000 / 60;
      scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      expect(rt.cameras.helm.targetZoom).not.toBe(z0);
    } finally { scene.dispose(); rt.dispose(); }
  });
});
