// Sci-1 (spec 2026-11-17-science-scans §7.1, §7.2): the console map's contact marks (an unknown contact is a plain `?`,
// the scan ring, Science's designation, the derelict's wreck mark and label, the salvage ring, Science's rotating ring
// on the laser's target), pickContact, and the lock marker hidden on an unknown enemy; the layer draws them in the
// amber ramp only and allocates nothing per frame.
import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics } from 'pixi.js';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { pickContact, tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel } from '../src/renderer/src/render/tactical/weaponsModel';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState, Loot, NO_AXES, type TacticalState } from '../src/renderer/src/sim/tactical/state';

const vp = { w: 1280, h: 720 };
/** The camera on the enemy at zoom 0.5 (the enemy at the screen centre), the duel's contact marks on. */
const input = (st: TacticalState, over: Partial<TacticalModelInput> = {}): TacticalModelInput => ({
  state: st, prev: [], alpha: 1, camera: createCamera(st.ships[1].x, st.ships[1].y, 0.5), viewport: vp, console: 'weapons', axes: NO_AXES,
  ships: [0, 1], paused: false, reserveRight: 0, contacts: true, ...over
});
const onDerelict = (st: TacticalState): Partial<TacticalModelInput> => { const p = derelictPos(st); return { camera: createCamera(p.x, p.y, 0.5) }; };
const onCrew = (st: TacticalState): Partial<TacticalModelInput> => ({ camera: createCamera(st.ships[0].x, st.ships[0].y, 0.5) });
const mark = (st: TacticalState, contact: 0 | 1, over: Partial<TacticalModelInput> = {}) => tacticalModel(input(st, over)).marks!.find((m) => m.contact === contact);

describe('the enemy on the map (spec §7.1)', () => {
  it('unknown: no silhouette, a plain ? mark; at Level 1 the silhouette and a bare mark; without the duel flag, as before', () => {
    const st = createTacticalState(4);
    expect(tacticalModel(input(st)).ships.map((s) => s.index)).not.toContain(1);
    expect(mark(st, 0)).toMatchObject({ contact: 0, x: 640, y: 360, unknown: true, wreck: false, label: null, alert: null, scan: null, designated: false });
    st.known[0] = 1;
    expect(tacticalModel(input(st)).ships.map((s) => s.index)).toContain(1);
    expect(mark(st, 0)).toMatchObject({ unknown: false });
    st.known[0] = 0;
    const plain = tacticalModel(input(st, { contacts: false }));
    expect(plain.ships.map((s) => s.index)).toContain(1);
    expect(plain.marks).toBeUndefined();
  });
  it('the scan ring is the scanner\'s progress on that contact; the designation marks the designated contact', () => {
    const st = createTacticalState(4);
    st.scan = { contact: 0, level: 1, progress: 450, rate: 5, by: 3 };
    expect(mark(st, 0)!.scan).toBeCloseTo(0.5, 9);
    st.designated = 0;
    expect(mark(st, 0)!.designated).toBe(true);
    st.scan = { contact: 1, level: 1, progress: 225, rate: 5, by: 3 }; st.designated = 1;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ scan: 0.25, designated: true });
    expect(mark(st, 0)).toMatchObject({ scan: null, designated: false });
  });
  it('the map lock marker is hidden while the enemy is unknown (duel flag), shown at Level 1', () => {
    const st = createTacticalState(4), combat = (s: TacticalState) => combatModel({ ...input(s), missilePrev: [null, null], fx: createFx() });
    expect(combat(st).lock).toBeNull();
    st.known[0] = 1;
    expect(combat(st).lock).not.toBeNull();
  });
  it('Science\'s slow ring sits on the laser\'s target; no other console draws it', () => {
    const st = createTacticalState(4);
    const ring = tacticalModel(input(st, { console: 'science' })).lockRing!;
    expect([ring.x, ring.y]).toEqual([640, 360]); expect(ring.r).toBeGreaterThan(10);
    expect(tacticalModel(input(st)).lockRing).toBeNull();
  });
});

describe('the derelict on the map (spec §7.1)', () => {
  it('unknown at Level 0; at Level 1 a wreck with DERELICT and its loot, TRAPPED when trapped, SALVAGED once done', () => {
    const st = createTacticalState(4);
    Object.assign(st.derelict, { loot: Loot.Shield, trapped: true, salvaged: false });
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ x: 640, y: 360, unknown: true, wreck: false, label: null, alert: null });
    st.known[1] = 1;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ unknown: false, wreck: true, label: 'DERELICT SHIELD', alert: 'TRAPPED' });
    st.derelict.trapped = false; st.derelict.loot = Loot.Missiles;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ label: 'DERELICT MISSILES', alert: null });
    st.derelict.salvaged = true;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ label: 'DERELICT SALVAGED', alert: null });
  });
  it('the salvage ring fills round the crew ship while the hold counts, and goes once salvaged', () => {
    const st = createTacticalState(4);
    st.derelict.salvage = 150;
    const s = tacticalModel(input(st, onCrew(st))).salvage!;
    expect([s.x, s.y, s.fill]).toEqual([640, 360, 0.5]);
    st.derelict.salvage = 0;
    expect(tacticalModel(input(st, onCrew(st))).salvage).toBeNull();
    st.derelict.salvage = 150; st.derelict.salvaged = true;
    expect(tacticalModel(input(st, onCrew(st))).salvage).toBeNull();
  });
});

describe('pickContact (spec §7.2)', () => {
  it('the enemy by pickShip, the derelict at derelictPos within the same radius, the nearer of the two, or null', () => {
    const st = createTacticalState(4);
    expect(pickContact(input(st), { x: 640, y: 360 })).toBe(0);
    expect(pickContact(input(st, onDerelict(st)), { x: 640, y: 360 })).toBe(1);
    expect(pickContact(input(st), { x: 640 + 300, y: 360 + 300 })).toBeNull();
    const p = derelictPos(st);
    Object.assign(st.ships[1], { x: p.x + 20, y: p.y });   // 10 px right of the wreck at zoom 0.5
    const both = input(st, onDerelict(st));
    expect(pickContact(both, { x: 641, y: 360 })).toBe(1);
    expect(pickContact(both, { x: 649, y: 360 })).toBe(0);
  });
});

/** Every colour drawn: each Graphics' fill and stroke, and each visible BitmapText's tint (as tests/crtColours.test.ts). */
function colours(root: Container): Set<number> {
  const out = new Set<number>();
  const walk = (o: Container): void => {
    if (o instanceof Graphics) for (const ins of o.context.instructions) if (ins.action === 'fill' || ins.action === 'stroke') out.add(ins.data.style.color);
    if (o instanceof BitmapText && o.visible) out.add(Number(o.tint));
    for (const k of o.children) walk(k as Container);
  };
  walk(root);
  return out;
}
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);

describe('the layer draws the marks in the amber ramp (CRT map spec section 2)', () => {
  it('every mark kind at two blink phases, only ramp colours; 60 frames allocate nothing', () => {
    const st = createTacticalState(4);
    st.known[1] = 1; Object.assign(st.derelict, { trapped: true, salvage: 120 }); st.scan = { contact: 1, level: 1, progress: 300, rate: 5, by: 3 }; st.designated = 1;
    const p = derelictPos(st);
    Object.assign(st.ships[0], { x: p.x + 30, y: p.y }); Object.assign(st.ships[1], { x: p.x - 60, y: p.y + 40 });   // all three on screen
    const d = tacticalModel(input(st, { ...onDerelict(st), console: 'science' }));
    expect([d.marks!.length, d.salvage !== null, d.lockRing !== null]).toEqual([2, true, true]);
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    for (const t of [0, 0.3]) {
      layer.draw(d, null, t);
      for (const colour of colours(layer.container)) expect(CRT_RAMP, `${colour.toString(16)} at ${t}`).toContain(colour);
    }
    const n0 = count(layer.container);
    for (let k = 0; k < 60; k++) layer.draw(d, null, k / 7);
    expect(count(layer.container)).toBe(n0);
  });
});
