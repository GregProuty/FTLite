// Valkyrn spec §5.1, §6.2 (review R1-F1, R1-F3): the Flight map's pointer sends a bearing only over the open map, never
// over the console blocks or the shown contact window, and the right button launches only when no weapon is picked up.
import { describe, expect, it } from 'vitest';
import { flightPointer, onFlightMap, torpedoSteer } from '../src/renderer/src/app/duel/flightPointer';
import { CONTACT, FLIGHT, OWN_SHIP, SIDE, STATION, stationTop, TABS } from '../src/renderer/src/render/duel/consoleLayout';
import { headingOf } from '../src/renderer/src/render/tactical/tacticalModel';

const ship = { x: 640, y: 360 }, open = { x: 640, y: 200 };
const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const at = (pointer: { x: number; y: number } | null, contactShown = false, press = false, aimed = false) =>
  flightPointer({ pointer, ship, zoom: 0.5, contactShown, press, aimed });

describe('the Flight pointer (Valkyrn spec §6.2)', () => {
  it('a pointer on the open map steers toward it', () => {
    expect(onFlightMap(open, true)).toBe(true);
    expect(at(open).steer).toBe(headingOf(open.x - ship.x, open.y - ship.y));
    expect(at(open, true).steer).toBe(headingOf(open.x - ship.x, open.y - ship.y));
  });
  it('a pointer inside FLIGHT, the Helm block, the tab strip or the side column sends no steer', () => {
    for (const p of [mid(FLIGHT), { x: STATION.x + 20, y: stationTop('helm') + 20 }, { x: TABS.x + 10, y: TABS.y + 10 }, { x: SIDE.x + 10, y: SIDE.y + 10 }]) {
      expect(onFlightMap(p, false), JSON.stringify(p)).toBe(false);
      expect(at(p).steer).toBeNull();
    }
  });
  it('a pointer inside CONTACT sends no steer while the window is shown, and steers when it is not', () => {
    const p = mid(CONTACT);
    expect(at(p, true).steer).toBeNull();
    expect(at(p, false).steer).toBe(headingOf(p.x - ship.x, p.y - ship.y));
  });
  it('own ship window spec §3: a pointer inside OWN_SHIP sends no steer, shown contact or not', () => {
    const p = mid(OWN_SHIP);
    expect(onFlightMap(p, false)).toBe(false); expect(onFlightMap(p, true)).toBe(false);
    expect(at(p).steer).toBeNull();
  });
  it('no pointer, off the screen or on the ship: no steer', () => {
    expect(at(null).steer).toBeNull();
    expect(at({ x: -5, y: 100 }).steer).toBeNull();
    expect(at({ x: ship.x + 1, y: ship.y }).steer).toBeNull();
  });
});

describe('the Flight right button (Valkyrn spec §5.1)', () => {
  it('launches on a press with nothing picked up; with a weapon picked up it only cancels', () => {
    expect(at(open, false, true, false).launch).toBe(true);
    expect(at(open, false, true, true).launch).toBe(false);
    expect(at(open, false, false, false).launch).toBe(false);
  });
});

describe('torpedoSteer (W-4 spec §7)', () => {
  it('the bearing from the torpedo\'s marker to the pointer on the open Weapons map; null on the marker, off the map or over a block', () => {
    const torpedo = { x: 640, y: 300 };
    expect(torpedoSteer({ pointer: { x: 740, y: 300 }, torpedo, zoom: 1, contactShown: false })).toBe(64);   // east
    expect(torpedoSteer({ pointer: { x: 640, y: 200 }, torpedo, zoom: 1, contactShown: false })).toBe(0);    // north
    expect(torpedoSteer({ pointer: torpedo, torpedo, zoom: 1, contactShown: false })).toBeNull();            // on it: the last bearing stands
    expect(torpedoSteer({ pointer: null, torpedo, zoom: 1, contactShown: false })).toBeNull();
    expect(torpedoSteer({ pointer: { x: -5, y: 300 }, torpedo, zoom: 1, contactShown: false })).toBeNull();
    expect(torpedoSteer({ pointer: { x: STATION.x + 20, y: stationTop('weapons') + 10 }, torpedo, zoom: 1, contactShown: false })).toBeNull();   // over the Weapons block
  });
});
