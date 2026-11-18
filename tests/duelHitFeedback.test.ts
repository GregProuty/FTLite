// Duel polish i spec §A, §B: the enemy's shot telegraph (enemyCharge, the ring in the combat draw) and what the crew's
// hits did (hitCallouts, their ageing and stacking, the contact window's struck-room flash). Pure models, plus one
// layer frame to check the new drawing stays on the amber ramp and pooled.
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { classOf, createTacticalState, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { createCamera, worldToScreen, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx, resetFx, stepFx } from '../src/renderer/src/render/tactical/fxModel';
import {
  CALLOUT_COLOUR, CALLOUT_MAX, CALLOUT_RISE_PX, CALLOUT_S, CALLOUT_STACK_PX, calloutDraws, CHARGE_RING_MIN_PX, chargePulse, enemyCharge,
  FLASH_ALPHA, FLASH_S, flashesFor, hitCallouts, pushHits
} from '../src/renderer/src/render/tactical/hitModel';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { drawnScale, tacticalModel, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { CRT, CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { contactModel } from '../src/renderer/src/render/duel/contactModel';

const vp = { w: 1280, h: 720 };
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
const input = (st: TacticalState, cam: Camera, fx = createFx(), t = 0): CombatModelInput =>
  ({ state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx, t });
const units = (st: TacticalState): number => classOf(st, 1).slots.laser.chargeUnits;
const laser = (p: Partial<Extract<DuelEvent, { kind: 'laser' }>>): DuelEvent => ({ kind: 'laser', ship: 0, hit: true, stripped: false, room: -1, x1: 0, y1: 0, x2: 1, y2: 0, ...p });
const missile = (p: Partial<Extract<DuelEvent, { kind: 'missileEnd' }>>): DuelEvent => ({ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: -1, x: 0, y: 0, ...p });

describe('enemyCharge (spec §A)', () => {
  it('null while the Hunter holds no charge', () => {
    const st = createTacticalState(3); st.systems[1].laserCharge = 100;
    expect(enemyCharge(st)).toBeNull();
  });
  it('the fill while held, full at the class charge', () => {
    const st = createTacticalState(3), s = st.systems[1];
    s.fireHeld = true; s.laserCharge = units(st) / 4;
    expect(enemyCharge(st)).toEqual({ fill: 0.25, full: false });
    s.laserCharge = units(st);
    expect(enemyCharge(st)).toEqual({ fill: 1, full: true });
  });
  it('null while its Weapons are at 2 (the laser is off) or the ship is gone', () => {
    const st = createTacticalState(3), s = st.systems[1];
    s.fireHeld = true; s.laserCharge = units(st); s.rooms[Room.Weapons] = 2;
    expect(enemyCharge(st)).toBeNull();
    s.rooms[Room.Weapons] = 1;
    expect(enemyCharge(st)).not.toBeNull();
    st.ships[1]!.active = false;
    expect(enemyCharge(st)).toBeNull();
  });
  it('the full charge pulses between 0.45 and 1 at 4 Hz', () => {
    expect(chargePulse(0)).toBeCloseTo(1, 9);
    expect(chargePulse(0.125)).toBeCloseTo(0.45, 9);
    expect(chargePulse(0.25)).toBeCloseTo(1, 9);
    for (let t = 0; t < 1; t += 0.01) { expect(chargePulse(t)).toBeGreaterThanOrEqual(0.45 - 1e-9); expect(chargePulse(t)).toBeLessThanOrEqual(1 + 1e-9); }
  });
});

describe('the charge ring in the combat draw (spec §A)', () => {
  it('about the enemy\'s drawn position, 2.2 ship radii, CHARGING then FIRING with the pulse', () => {
    const st = createTacticalState(3), e = st.ships[1]!, cam = createCamera(e.x, e.y, 1);
    expect(combatModel(input(st, cam)).charge).toBeNull();
    st.systems[1].fireHeld = true; st.systems[1].laserCharge = units(st) / 2;
    const c = combatModel(input(st, cam)).charge!, p = worldToScreen(cam, vp, e.x, e.y);
    expect(c).toMatchObject({ x: p.x, y: p.y, fill: 0.5, full: false, alpha: 1, colour: CRT.hot });
    expect(c.r).toBeCloseTo(Math.max(18, 2.2 * SHIP_RADIUS * drawnScale(1)), 9);
    expect(c.label.text).toBe('CHARGING');
    expect(c.label.y).toBeLessThan(p.y - c.r);
    st.systems[1].laserCharge = units(st);
    const f = combatModel(input(st, cam, createFx(), 0.125)).charge!;
    expect(f.label.text).toBe('FIRING');
    expect(f.full).toBe(true);
    expect(f.alpha).toBeCloseTo(0.45, 9);
  });
  it('off screen: a small ring about the enemy edge arrow, with the label and the callouts inward of it; none without an arrow', () => {
    const st = createTacticalState(3), e = st.ships[1]!, cam = createCamera(e.x + 100000, e.y, 1), fx = createFx();
    st.systems[1].fireHeld = true; st.systems[1].laserCharge = units(st) / 4;
    pushHits(fx, [laser({ room: 0 })], st);
    expect(combatModel(input(st, cam, fx)).charge).toBeNull();
    expect(combatModel(input(st, cam, fx)).callouts).toEqual([]);
    const arrow = { x: 8, y: 360 }, c = combatModel({ ...input(st, cam, fx), enemyArrow: arrow });
    expect(c.charge).toMatchObject({ x: 8, y: 360, r: CHARGE_RING_MIN_PX, fill: 0.25 });
    expect(c.charge!.label).toMatchObject({ text: 'CHARGING', x: 128, y: 360 });   // 120 px toward the screen's centre, clear of the arrow's own label
    expect(c.callouts![0]).toMatchObject({ text: 'WEAPONS HIT', x: 128, y: 344 });
  });
  it('an enemy under a console panel has an edge arrow: the ring follows the arrow, not the hidden marker (review)', () => {
    const st = createTacticalState(3), e = st.ships[1]!, cam = createCamera(e.x, e.y, 1);
    st.systems[1].fireHeld = true;
    expect(combatModel({ ...input(st, cam), enemyArrow: { x: 280, y: 300 } }).charge).toMatchObject({ x: 280, y: 300, r: CHARGE_RING_MIN_PX });
  });
  it('never below 18 screen px (the chevron zooms)', () => {
    const st = createTacticalState(3), e = st.ships[1]!;
    st.systems[1].fireHeld = true;
    expect(combatModel(input(st, createCamera(e.x, e.y, 0.05))).charge!.r).toBe(CHARGE_RING_MIN_PX);
  });
  it('the ring follows the interpolated marker (alpha < 1)', () => {
    const st = createTacticalState(3), e = st.ships[1]!, cam = createCamera(e.x, e.y, 1);
    st.systems[1].fireHeld = true;
    const prev = prevOf(st); prev[1] = { x: e.x - 100, y: e.y, h: prev[1]!.h };
    const c = combatModel({ ...input(st, cam), prev, alpha: 0.5 }).charge!;
    expect(c.x).toBeCloseTo(worldToScreen(cam, vp, e.x - 50, e.y).x, 9);
  });
});

describe('hitCallouts (spec §B)', () => {
  it('the laser: SHIELD DOWN, a room HIT, OFFLINE at 2, SHIELDS DMG 2, MISS', () => {
    const st = createTacticalState(3); st.systems[1].rooms = [1, 2, 2];
    const out = hitCallouts([
      laser({ stripped: true }), laser({ room: Room.Weapons }), laser({ room: Room.Engines }), laser({ room: Room.Shields }), laser({ hit: false })
    ], st);
    expect(out.map((c) => c.text)).toEqual(['SHIELD DOWN', 'WEAPONS HIT', 'ENGINES OFFLINE', 'SHIELDS DMG 2', 'MISS']);
    expect(out.map((c) => c.colour)).toEqual([CALLOUT_COLOUR.shield, CALLOUT_COLOUR.hit, CALLOUT_COLOUR.offline, CALLOUT_COLOUR.offline, CALLOUT_COLOUR.miss]);
    expect(out.map((c) => c.kind)).toEqual(['shield', 'hit', 'offline', 'offline', 'miss']);
  });
  it('the torpedo on the enemy\'s room: TORPEDO: <ROOM> HIT / OFFLINE (homing torpedo spec §3); elsewhere nothing', () => {
    const st = createTacticalState(3); st.systems[1].rooms = [0, 0, 2];
    const out = hitCallouts([missile({ room: Room.Shields }), missile({ room: Room.Engines }), missile({ room: -1 }), missile({ target: -1, cause: 'planet' }), missile({ ship: 1, target: 0, room: 0 })], st);
    expect(out.map((c) => c.text)).toEqual(['TORPEDO: SHIELDS HIT', 'TORPEDO: ENGINES OFFLINE']);
  });
  it('the enemy\'s shots and contacts give none', () => {
    const st = createTacticalState(3);
    expect(hitCallouts([laser({ ship: 1, room: 0 }), laser({ ship: 1, hit: false }), { kind: 'contact', ship: 0, body: 'planet', x: 0, y: 0 }], st)).toEqual([]);
  });
  it('every colour is on the amber ramp', () => {
    for (const c of Object.values(CALLOUT_COLOUR)) expect(CRT_RAMP).toContain(c);
  });
});

describe('the callouts\' ageing and stacking (spec §B)', () => {
  it('same-frame callouts stack 14 px apart and rise 24 px over 1.5 s, fading', () => {
    const st = createTacticalState(3), fx = createFx();
    pushHits(fx, [laser({ stripped: true }), laser({ hit: false })], st);
    let d = calloutDraws(fx.callouts, { x: 100, y: 200 });
    expect(d.map((c) => [c.text, c.y, c.alpha])).toEqual([['SHIELD DOWN', 200, 1], ['MISS', 200 - CALLOUT_STACK_PX, 1]]);
    stepFx(fx, CALLOUT_S / 2);
    d = calloutDraws(fx.callouts, { x: 100, y: 200 });
    expect(d[0]!.y).toBeCloseTo(200 - CALLOUT_RISE_PX / 2, 9);
    expect(d[0]!.alpha).toBeCloseTo(0.5, 9);
    stepFx(fx, CALLOUT_S / 2);
    expect(fx.callouts).toHaveLength(0);
  });
  it('at most 4 at once, the oldest goes first; a later frame starts its own stack', () => {
    const st = createTacticalState(3), fx = createFx();
    pushHits(fx, [laser({ hit: false }), laser({ hit: false }), laser({ hit: false })], st);
    stepFx(fx, 0.1);
    pushHits(fx, [laser({ stripped: true }), laser({ stripped: true })], st);
    expect(fx.callouts).toHaveLength(CALLOUT_MAX);
    expect(fx.callouts.map((c) => [c.text, c.stack])).toEqual([['MISS', 1], ['MISS', 2], ['SHIELD DOWN', 0], ['SHIELD DOWN', 1]]);
  });
  it('a pause (dt 0) holds them; a restart clears them', () => {
    const st = createTacticalState(3), fx = createFx();
    pushHits(fx, [laser({ hit: false }), laser({ room: 0 })], st);
    stepFx(fx, 0);
    expect(fx.callouts.every((c) => c.age === 0)).toBe(true);
    expect(fx.struck).toHaveLength(1);
    resetFx(fx);
    expect(fx.callouts).toHaveLength(0);
    expect(fx.struck).toHaveLength(0);
  });
  it('the combat draw places them over the enemy, above the ring\'s label', () => {
    const st = createTacticalState(3), e = st.ships[1]!, cam = createCamera(e.x, e.y, 1), fx = createFx();
    pushHits(fx, [laser({ room: 0 })], st);
    const c = combatModel(input(st, cam, fx)), p = worldToScreen(cam, vp, e.x, e.y);
    expect(c.callouts).toHaveLength(1);
    expect(c.callouts![0]).toMatchObject({ text: 'WEAPONS HIT', x: p.x, colour: CALLOUT_COLOUR.hit, alpha: 1 });
    expect(c.callouts![0]!.y).toBeLessThan(p.y - Math.max(18, 2.2 * SHIP_RADIUS * drawnScale(1)) - 12);
  });
});

describe('the struck-room flash (spec §B)', () => {
  it('a crew laser hit and a crew missile on the enemy flash their rooms, 0.6 to 0 over 0.6 s; a re-hit restarts it', () => {
    const st = createTacticalState(3), fx = createFx();
    pushHits(fx, [laser({ room: Room.Shields }), missile({ room: Room.Engines }), laser({ stripped: true }), laser({ hit: false }), laser({ ship: 1, room: 0 })], st);
    expect(flashesFor(fx.struck, 1)).toEqual([{ room: Room.Shields, alpha: FLASH_ALPHA }, { room: Room.Engines, alpha: FLASH_ALPHA }]);
    expect(flashesFor(fx.struck, 2)).toEqual([]);
    stepFx(fx, FLASH_S / 2);
    expect(flashesFor(fx.struck, 1)[0]!.alpha).toBeCloseTo(FLASH_ALPHA / 2, 9);
    pushHits(fx, [laser({ room: Room.Shields })], st);
    expect(fx.struck).toHaveLength(2);
    expect(flashesFor(fx.struck, 1)[0]!.alpha).toBe(FLASH_ALPHA);
    stepFx(fx, FLASH_S);
    expect(fx.struck).toHaveLength(0);
  });
  it('the contact view carries each flash with its room polygon', () => {
    const st = createTacticalState(3);
    const v = contactModel({ state: st, ship: 1, aim: false, station: 'helm', t: 0, weapons: null, flashes: [{ room: 1, alpha: 0.3 }, { room: 7, alpha: 0.5 }] })!;
    expect(v.flash).toEqual([{ room: 1, points: v.rooms[1]!.points, alpha: 0.3 }]);
    expect(contactModel({ state: st, ship: 1, aim: false, station: 'helm', t: 0, weapons: null })!.flash).toEqual([]);
  });
});

describe('the layer draws the ring and callouts on the ramp, pooled (spec §A, §B; CRT map spec section 2)', () => {
  const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
  it('a charging and a full frame with four callouts', () => {
    const st = createTacticalState(3), e = st.ships[1]!, cam = createCamera(e.x, e.y, 1), fx = createFx();
    st.systems[1].fireHeld = true; st.systems[1].laserCharge = units(st) / 3;
    pushHits(fx, [laser({ stripped: true }), laser({ room: 0 }), laser({ hit: false }), missile({ room: 2 })], st);
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), inp = input(st, cam, fx);
    layer.draw(tacticalModel(inp), combatModel(inp), 0);
    const n0 = count(layer.container);
    st.systems[1].laserCharge = units(st);
    for (let k = 0; k < 10; k++) layer.draw(tacticalModel(inp), combatModel({ ...inp, t: k / 9 }), k / 9);
    expect(count(layer.container)).toBe(n0);
  });
});
