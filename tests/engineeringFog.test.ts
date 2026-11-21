// Engineering spike §10.4: the fog of war is view state. A contact (the enemy, the derelict, the enemy torpedo) is seen
// inside the sensor range; once unseen it leaves a ghost at its last seen place and heading, fading over 10 s, then gone.
// The map hides an unseen derelict's mark, draws the range ring and the ghosts; the contact window says CONTACT LOST.
// Sensors blip spec §2.1 (2026-11-19) amends it: the enemy ship leaves no ghost; unseen, it is a blip (tests/sensorsBlip*.test.ts).
import { describe, expect, it } from 'vitest';
import { createTacticalState, Contact, placeMissile } from '../src/renderer/src/sim/tactical/state';
import { derelictPos, sensorRange } from '../src/renderer/src/sim/tactical/science';
import { BLIP_GROW, BLIP_R_MIN, createFog, GHOST_SECONDS, stepFog } from '../src/renderer/src/render/tactical/fogModel';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { contactModel } from '../src/renderer/src/render/duel/contactModel';
import { pickContact } from '../src/renderer/src/render/tactical/tacticalModel';
import { laserSituation } from '../src/renderer/src/render/duel/situationModel';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
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
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { evadeDir, flightAlert } from '../src/renderer/src/render/duel/situationModel';
import { fogEvents, fogPan, pushMapEffects, torpedoTone } from '../src/renderer/src/app/duel/scene';
import { createFx, type ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { arena, mover } from './helpers/rockArena';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';

const vp = { w: 1280, h: 720 };
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};

describe('stepFog (spec §10.4)', () => {
  it('the enemy inside the range is seen and has no blip; moved out it leaves no ghost but a blip, at once and past the old 10 s fade (sensors blip spec §2.1)', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r / 2; e.y = own.y; e.active = true;
    let v = stepFog(f, t, 100, 0);
    expect(v.range).toBe(r); expect(v.seen.enemy).toBe(true); expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]); expect(v.blip ?? null).toBeNull();
    e.x = own.x + r * 2;
    v = stepFog(f, t, 101, 0);
    expect(v.seen.enemy).toBe(false);
    expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
    expect(v.blip!.r).toBeCloseTo(BLIP_R_MIN + BLIP_GROW * r, 6); expect(v.blip!.age).toBe(0);   // r beyond the range
    v = stepFog(f, t, 100 + GHOST_SECONDS, 0);
    expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]); expect(v.blip ?? null).not.toBeNull();   // it never fades away for good
  });
  it('never seen, a blip from the first frame and no ghost; a new round makes a new ping; a destroyed enemy has neither (sensors blip spec §2.1, §2.3)', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r * 3; e.y = own.y; e.active = true;   // on the crew ship's line, so the r / 2 step below is inside the range
    const first = stepFog(f, t, 0, 0);
    expect(first.ghosts.some((g) => g.kind === 'enemy')).toBe(false); expect(first.blip).toMatchObject({ age: 0 });   // never seen: a blip at once
    e.x = own.x + r / 2; expect(stepFog(f, t, 1, 0).blip ?? null).toBeNull();   // seen: no blip
    e.x = own.x + r * 3;
    const again = stepFog(f, t, 2, 0);
    expect(again.ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // unseen again: still no ghost
    expect(again.blip).toEqual(first.blip);   // the same round and ping index: the same ping
    const next = stepFog(f, t, 2.5, 1).blip!;   // a new round
    expect([next.x, next.y]).not.toEqual([first.blip!.x, first.blip!.y]);
    e.active = false;
    const gone = stepFog(f, t, 4, 1);
    expect(gone.blip ?? null).toBeNull(); expect(gone.ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // destroyed: neither
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
    const fogged = tacticalModel(input(t, { camera: cam, fog: { range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [{ kind: 'derelict', x: w.x, y: w.y, h: 0, alpha: 0.5 }] } }));
    expect(fogged.marks!.some((m) => m.contact === Contact.Derelict)).toBe(false);
    expect(fogged.ghosts).toEqual([{ kind: 'derelict', x: vp.w / 2, y: vp.h / 2, angle: 0, alpha: 0.5 }]);   // sensors blip spec §2.1: no enemy ghost exists
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
    const t = createTacticalState(5, 2, ShipClass.ValkyrnLaser), sys = t.systems[0], me = t.ships[0]!, e = t.ships[1]!;   // W-4 spec §14.1: the beam's rule, on the laser fit
    t.map = { ...t.map, asteroids: [] }; t.rocks = initRocks(t.map);   // a clear line
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

describe('no fog leaks, review round 1 (spec §10.4)', () => {
  it('the torpedo lock tone: an unseen enemy is never locked (no beep tracks its distance)', () => {
    const d = createDuel(parseShip(cutter), 5), [crew, enemy] = d.tactical.ships, r = sensorRange(d.tactical.systems[0]!);
    try {
      d.tactical.systems[0]!.torpLock = Room.Shields;
      Object.assign(enemy!, { x: crew!.x + r * 2, y: crew!.y, active: true });
      expect(torpedoTone(d).locked).toBe(false);
      Object.assign(enemy!, { x: crew!.x + r / 2 });
      expect(torpedoTone(d).locked).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('an unseen enemy torpedo: TORPEDO INBOUND stays (a warning receiver), the EVADE arrow is gone; seen, the arrow is back', () => {
    const t = createTacticalState(5), own = t.ships[0]!, r = sensorRange(t.systems[0]!);
    const m = placeMissile(t, 1, { x: own.x + r * 2, y: own.y, vx: -50, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    expect(flightAlert(t, { turn: 0, thrust: 0 })).toEqual({ kind: 'torpedo' });
    expect(evadeDir(t)).toBeNull();
    m.x = own.x + r / 2;
    expect(evadeDir(t)).not.toBeNull();
  });
  it('a sound at an unseen point plays centred; at a seen point it keeps its pan', () => {
    const t = createTacticalState(5), own = t.ships[0]!, r = sensorRange(t.systems[0]!), pan = fogPan(t, () => 0.8);
    expect(pan(own.x + r * 2, own.y)).toBe(0);
    expect(pan(own.x + r / 2, own.y)).toBe(0.8);
  });
  it('the contact window on an unseen contact has no SCAN button', () => {
    const t = createTacticalState(5);
    for (const contact of [0, 1] as const) expect(contactModel({ state: t, contact, aim: false, station: 'science', t: 0, weapons: null, seen: false })!.scan).toBeNull();
    expect(contactModel({ state: t, contact: 0, aim: false, station: 'science', t: 0, weapons: null, seen: true })!.scan).not.toBeNull();
  });
});

describe('no fog leaks through the map effects, final review (spec §10.4)', () => {
  const setup = (seen: boolean) => {
    const t = createTacticalState(5), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    Object.assign(e, { x: own.x + (seen ? r / 2 : r * 2), y: own.y, active: true });
    return { t, own, e };
  };
  const kinds = (events: ViewEvent[], t: ReturnType<typeof createTacticalState>) => { const fx = createFx(); pushMapEffects(fx, events, t); return { kinds: fx.items.map((i) => i.kind), shake: fx.shake }; };
  it("an unseen enemy's rock or planet bump draws no spark; a seen one does; the crew's own always does", () => {
    for (const seen of [false, true]) {
      const { t, own, e } = setup(seen);
      expect(kinds([{ kind: 'contact', ship: 1, body: 'asteroid', x: e.x, y: e.y }], t).kinds).toEqual(seen ? ['spark'] : []);
      expect(kinds([{ kind: 'contact', ship: 0, body: 'planet', x: own.x, y: own.y }], t).kinds).toEqual(['spark']);
    }
  });
  it("an unseen enemy's laser draws no beam but still shakes the crew it hit; a seen one draws its beam; the crew's beam always", () => {
    for (const seen of [false, true]) {
      const { t, own, e } = setup(seen);
      const enemyShot: ViewEvent = { kind: 'laser', ship: 1, hit: true, stripped: false, room: 0, x1: e.x, y1: e.y, x2: own.x, y2: own.y };
      const got = kinds([enemyShot], t);
      expect(got.kinds).toEqual(seen ? ['beam'] : []);
      expect(got.shake).toBeGreaterThan(0);   // the hit on the crew is felt either way
      expect(fogEvents(t, [enemyShot])).toEqual(seen ? [enemyShot] : []);
      const crewShot: ViewEvent = { kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: own.x, y1: own.y, x2: e.x, y2: e.y };
      expect(kinds([crewShot], t).kinds).toEqual(['beam']);
    }
  });
  it("an unseen enemy's laser miss does not shake: only a hit on the crew does", () => {
    const { t, own, e } = setup(false);
    expect(kinds([{ kind: 'laser', ship: 1, hit: false, stripped: false, room: -1, x1: e.x, y1: e.y, x2: own.x + 50, y2: own.y }], t)).toEqual({ kinds: [], shake: 0 });
  });
  it("an enemy torpedo ending at an unseen point draws no burst; at a seen point it does; the crew's own always", () => {
    for (const seen of [false, true]) {
      const { t, e } = setup(seen);
      expect(kinds([{ kind: 'missileEnd', ship: 1, cause: 'expired', target: -1, room: -1, x: e.x, y: e.y }], t).kinds).toEqual(seen ? ['burst'] : []);
      expect(kinds([{ kind: 'missileEnd', ship: 0, cause: 'expired', target: -1, room: -1, x: e.x, y: e.y }], t).kinds).toEqual(['burst']);
    }
  });
});

// Merge decision 1d: W-1's pew rounds and W-2's / W-3's MANUAL weapons under the Part ii fog rules: an enemy round at an
// unseen point is hidden (its fire flash and its hit spark too); the crew's own are always shown, MANUAL or not.
describe('the fog on pew rounds and the MANUAL weapons (merge decision 1d)', () => {
  const vpc = { w: 1280, h: 720 };
  const FOG = { range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [] };
  const combatIn = (st: ReturnType<typeof createTacticalState>, fog: typeof FOG | null): CombatModelInput => ({
    state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc })), alpha: 1, camera: createCamera(st.ships[0]!.x, st.ships[0]!.y, 0.25), viewport: vpc,
    console: 'weapons', axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx: createFx(), ...(fog ? { fog } : {}) });
  it('an enemy pew round at an unseen point is not drawn; at a seen point it is; the crew\'s own always; no fog draws all', () => {
    const t = createTacticalState(5), own = t.ships[0]!, r = sensorRange(t.systems[0]!);
    placeRound(t, { x: own.x + r * 2, y: own.y, vx: -900, vy: 0, age: 0, owner: 1 }, t.pew);    // the Hunter's, unseen
    placeRound(t, { x: own.x + r / 2, y: own.y, vx: -900, vy: 0, age: 0, owner: 1 }, t.pew);    // the Hunter's, seen
    placeRound(t, { x: own.x + r * 2, y: own.y + 50, vx: 900, vy: 0, age: 0, owner: 0 }, t.pew);   // the crew's, past the range
    const cam = createCamera(own.x, own.y, 0.25), tipX = (x: number, y: number) => worldToScreen(cam, vpc, x, y).x;
    expect(combatModel(combatIn(t, FOG)).pewRounds!.map((s) => s.x2)).toEqual([tipX(own.x + r / 2, own.y), tipX(own.x + r * 2, own.y + 50)]);
    expect(combatModel(combatIn(t, null)).pewRounds).toHaveLength(3);   // the flight view: no fog
  });
  it('an enemy pew fire or hit at an unseen point is dropped from the map effects; the crew\'s and a hit on the crew stay', () => {
    for (const seen of [false, true]) {
      const t = createTacticalState(5), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
      Object.assign(e, { x: own.x + (seen ? r / 2 : r * 2), y: own.y, active: true });
      const enemyFire: ViewEvent = { kind: 'pewFire', ship: 1, x: e.x, y: e.y }, crewFire: ViewEvent = { kind: 'pewFire', ship: 0, x: own.x, y: own.y };
      const crewHitsEnemy: ViewEvent = { kind: 'pewHit', ship: 1, owner: 0, stripped: false, hull: true, room: -1, level: false, x: e.x, y: e.y };
      const enemyHitsCrew: ViewEvent = { kind: 'pewHit', ship: 0, owner: 1, stripped: true, hull: false, room: -1, level: false, x: own.x, y: own.y };
      expect(fogEvents(t, [enemyFire, crewFire, crewHitsEnemy, enemyHitsCrew])).toEqual(seen ? [enemyFire, crewFire, crewHitsEnemy, enemyHitsCrew] : [crewFire, crewHitsEnemy, enemyHitsCrew]);
    }
  });
  it('the crew\'s MANUAL beam and MANUAL torpedo are always shown, at an unseen point too', () => {
    const t = createTacticalState(5), own = t.ships[0]!, r = sensorRange(t.systems[0]!);
    t.systems[0].laserManual = true; t.systems[0].torpManual = true;
    const beam: ViewEvent = { kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: own.x, y1: own.y, x2: own.x + r * 2, y2: own.y };
    const blast: ViewEvent = { kind: 'missileEnd', ship: 0, cause: 'expired', target: -1, room: -1, x: own.x + r * 2, y: own.y };
    expect(fogEvents(t, [beam, blast])).toEqual([beam, blast]);
    placeMissile(t, 0, { x: own.x + r * 2, y: own.y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 40 }, true);
    expect(combatModel(combatIn(t, FOG)).missiles.filter((m) => m.crew)).toHaveLength(1);
  });
});
