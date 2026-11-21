// Hacking spike (spec §3.2, §3.3, §6 R1-8; plan R1-7): the hacked looks. The contact window's hacked room (HACK n, the
// short's arcs) and the room being hacked (its hold), at every scan level; the map's ShipDraw and the "?" mark carry the
// hack; the arcs are the same within one re-seed and change across them.
import { describe, expect, it } from 'vitest';
import { contactModel } from '../src/renderer/src/render/duel/contactModel';
import { shortArcs, SHORT_HZ, sparkSegments } from '../src/renderer/src/render/duel/hackFx';
import { Contact, createTacticalState, NO_AXES, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';

const HUNTER = 1;
const view = (st: TacticalState, t = 0) => contactModel({ state: st, contact: Contact.Enemy, aim: false, station: 'science', t, weapons: null })!;

describe('the contact window\'s hacked rooms (§3.2, R1-8)', () => {
  for (const level of [0, 1, 2] as const) it(`shows HACK n and the arcs on a hacked room, and the hold on the room being hacked, at scan level ${level}`, () => {
    const st = createTacticalState(4);
    st.known[Contact.Enemy] = level;
    st.systems[HUNTER].hacked[Room.Engines] = 1500; st.hackRoom = Room.Weapons; st.hackTicks = 210;
    const rooms = view(st).rooms;
    expect(rooms[Room.Engines]!.label).toBe('HACK 25');
    expect(rooms[Room.Engines]!.hacked!.seconds).toBe(25);
    expect(rooms[Room.Engines]!.hacked!.arcs.length).toBe(2 * 5 * 4);
    expect(rooms[Room.Weapons]!.hacking).toBe(0.5);
    expect(rooms[Room.Shields]!.hacked ?? null).toBeNull();
    expect(rooms[Room.Shields]!.hacking ?? null).toBeNull();
  });
  it('re-seeds the arcs SHORT_HZ times a second, stable within one seed', () => {
    const poly = [0, 0, 40, 0, 40, 20, 0, 20];
    expect(shortArcs(poly, 0.01, 2)).toEqual(shortArcs(poly, 0.02, 2));
    expect(shortArcs(poly, 0.01, 2)).not.toEqual(shortArcs(poly, 0.01 + 1 / SHORT_HZ, 2));
    for (const v of shortArcs(poly, 0.3, 1)) expect(v).toBeGreaterThanOrEqual(0);
    expect(sparkSegments(10, 10, 5, 0, 0, 4).length).toBe(4 * 8);
  });
});

describe('the map carries the hack (§3.3, plan R1-7)', () => {
  const input = (st: TacticalState): TacticalModelInput => ({
    state: st, prev: [], alpha: 1, camera: createCamera(st.ships[1].x, st.ships[1].y, 0.5), viewport: { w: 1280, h: 720 }, console: 'science', axes: NO_AXES,
    ships: [0, 1], paused: false, reserveRight: 0, contacts: true });
  it('a hacked enemy\'s ShipDraw (scanned) and its "?" mark (unscanned) say so; not before the hack', () => {
    const st = createTacticalState(4);
    st.known[Contact.Enemy] = 1;
    expect(tacticalModel(input(st)).ships.find((s) => s.index === HUNTER)!.hacked).toBeUndefined();
    st.systems[HUNTER].hacked[Room.Weapons] = 30;
    expect(tacticalModel(input(st)).ships.find((s) => s.index === HUNTER)!.hacked).toBe(true);
    st.known[Contact.Enemy] = 0;
    expect(tacticalModel(input(st)).marks!.find((m) => m.contact === Contact.Enemy)!.hacked).toBe(true);
  });
});
