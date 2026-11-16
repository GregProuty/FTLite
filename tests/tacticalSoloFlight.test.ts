import { describe, expect, it } from 'vitest';
import { hitStatics } from '../src/renderer/src/sim/tactical/contacts';
import { stepFlight, stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { cloneShip, createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import { PLANET_CONTACT_HULL, PLANET_RADIUS, SHIP_HULL, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

const plain = (s: Ship) => ({ ...s, graceUntil: [...s.graceUntil] });

describe('stepSoloFlight (H-1 spec §9)', () => {
  it('flies ship 0 and advances the tick; ship 1 never moves', () => {
    const st = createTacticalState(7), before = plain(cloneShip(st.ships[1])), beforeSystems = structuredClone(st.systems[1]);
    const x0 = st.ships[0].x, y0 = st.ships[0].y;
    for (let t = 0; t < 120; t++) stepSoloFlight(st, { turn: 0, thrust: 1 });
    expect(st.tick).toBe(120);
    expect(Math.hypot(st.ships[0].x - x0, st.ships[0].y - y0)).toBeGreaterThan(100);
    expect(plain(st.ships[1])).toEqual(before);
    expect(st.systems[1]).toEqual(beforeSystems);
  });

  it('never resolves ship-to-ship contact: ship 0 flies straight through ship 1', () => {
    const st = createTacticalState(7);
    Object.assign(st.ships[0], { x: -600, y: -300, vx: 200, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -560, y: -300, vx: 0, vy: 0, heading: 192 });
    const before = plain(cloneShip(st.ships[1])), beforeSystems = structuredClone(st.systems[1]);
    for (let t = 0; t < 60; t++) stepSoloFlight(st, { turn: 0, thrust: 0 });
    expect(st.ships[0].shipHits).toBe(0);
    expect(st.systems[0].hull).toBe(SHIP_HULL);
    expect(st.ships[0].x).toBeGreaterThan(-500);
    expect(plain(st.ships[1])).toEqual(before);
    expect(st.systems[1]).toEqual(beforeSystems);
  });

  it('matches stepFlight for ship 0 when the ships are far apart', () => {
    const a = createTacticalState(11), b = createTacticalState(11);
    for (let t = 0; t < 300; t++) {
      const axes = { turn: t < 100 ? 1 : 0, thrust: t % 3 === 0 ? 0 : 1 };
      stepSoloFlight(a, axes); stepFlight(b, [axes, { turn: 0, thrust: 0 }]);
    }
    expect(plain(a.ships[0])).toEqual(plain(b.ships[0]));
    expect(a.systems[0]).toEqual(b.systems[0]);
  });

  it('ship 0 hits the planet: pushed out, bounced, hull cost, one hit counted', () => {
    const st = createTacticalState(3);
    Object.assign(st.ships[0], { x: 0, y: -(PLANET_RADIUS + SHIP_RADIUS + 5), vx: 0, vy: 300, heading: 128 });
    for (let t = 0; t < 10; t++) stepSoloFlight(st, { turn: 0, thrust: 0 });
    const s = st.ships[0];
    expect(s.planetHits).toBe(1);
    expect(st.systems[0].hull).toBe(SHIP_HULL - PLANET_CONTACT_HULL);
    expect(Math.hypot(s.x, s.y)).toBeGreaterThanOrEqual(PLANET_RADIUS + SHIP_RADIUS - 1e-9);
  });

  it('exports the per-ship static pass: hitStatics leaves the other ship alone', () => {
    const st = createTacticalState(3);
    Object.assign(st.ships[0], { x: 0, y: -80, vx: 0, vy: 0 });
    Object.assign(st.ships[1], { x: 0, y: 80, vx: 0, vy: 0 });
    hitStatics(st, 0);
    expect(st.ships[0].planetHits).toBe(1);
    expect(st.ships[1].planetHits).toBe(0);
    expect(st.ships[1].y).toBe(80);
  });
});
