import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CREW_SLOT, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HEADING_COUNT } from '../src/renderer/src/sim/tactical/tuning';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { ellipsePoint } from '../src/renderer/src/render/shieldFx';
import { TILE_PX } from '../src/shared/resolution';
import { createShots, FLIGHT_S, interiorFrame, pushShots, readHits, shotDraw, stepShots, type InteriorFrame } from '../src/renderer/src/render/duel/enemyShots';

const layout = parseShip(cutter);
const fake = (heading = 0, ex = 0, ey = -100): TacticalState => ({
  ships: [{ x: 0, y: 0, heading, headingAcc: 0 }, { x: ex, y: ey, heading: 0, headingAcc: 0 }],
  systems: [{ target: 1 }, { target: 0 }]
}) as unknown as TacticalState;
const laser = (o: Partial<Extract<ViewEvent, { kind: 'laser' }>>): ViewEvent => ({ kind: 'laser', ship: 1, hit: true, stripped: false, room: 1, x1: 0, y1: -100, x2: 0, y2: 0, ...o });

describe('readHits', () => {
  it('classifies a laser: stopped, through, miss, rock ignored', () => {
    const s = fake();
    expect(readHits(s, [laser({ stripped: true, room: -1 })])).toEqual([{ target: 0, a: 0, kind: 'laser', stopped: true, drop: true, room: -1, miss: false }]);
    expect(readHits(s, [laser({ room: 2 })])).toEqual([{ target: 0, a: 0, kind: 'laser', stopped: false, drop: false, room: 2, miss: false }]);
    expect(readHits(s, [laser({ hit: false, room: -1 })])[0]).toMatchObject({ miss: true, stopped: false, drop: false });
    expect(readHits(s, [laser({ hit: false, room: -1, rock: 3 })])).toEqual([]);
  });
  it('a crew laser hits the crew target', () => {
    const r = readHits(fake(), [laser({ ship: CREW_SLOT, x1: 0, y1: 0 })]);
    expect(r[0]!.target).toBe(1);
  });
  it('pewHit and missileEnd', () => {
    const s = fake();
    const pew = { kind: 'pewHit', ship: 0, owner: 1, stripped: true, hull: false, room: -1, x: 0, y: -50 } as unknown as ViewEvent;
    expect(readHits(s, [pew])[0]).toMatchObject({ target: 0, kind: 'pew', stopped: true, drop: true });
    const pew2 = { kind: 'pewHit', ship: 0, owner: 1, stripped: false, hull: true, room: 2, x: 0, y: -50 } as unknown as ViewEvent;
    expect(readHits(s, [pew2])[0]).toMatchObject({ kind: 'pew', stopped: false, room: 2 });
    const t: ViewEvent = { kind: 'missileEnd', ship: 1, cause: 'ship', target: 0, room: 1, x: 0, y: -50 };
    expect(readHits(s, [t])[0]).toMatchObject({ target: 0, kind: 'torpedo', stopped: false, drop: false, room: 1 });
    expect(readHits(s, [{ ...t, cause: 'planet' } as ViewEvent])).toEqual([]);
    expect(readHits(s, [{ ...t, ship: 0, target: 1 } as ViewEvent])[0]!.target).toBe(1);
  });
  it('the fog: an unseen shooter gives the impact bearing for a hit and no read for a miss', () => {
    const s = fake(0);   // crew at the origin, nose north; the shooter is due east (x1 100), the beam lands at the north (x2 0, y2 -10)
    const unseen = (_x: number, _y: number) => false, seen = () => true;
    const e = laser({ x1: 100, y1: 0, x2: 0, y2: -10 });
    expect(readHits(s, [e], seen)[0]!.a).toBeCloseTo(Math.PI / 2);
    expect(readHits(s, [e], unseen)[0]!.a).toBeCloseTo(0);   // from the impact point, not the shooter
    expect(readHits(s, [laser({ hit: false, room: -1, x1: 100, y1: 0 })], unseen)).toEqual([]);
    expect(readHits(s, [laser({ hit: false, room: -1, x1: 100, y1: 0 })], seen)).toHaveLength(1);
    // the crew's own laser is never fogged
    expect(readHits(s, [laser({ ship: CREW_SLOT, x1: 0, y1: 0 })], unseen)).toHaveLength(1);
  });
  it('gunHit: stripped stops and drops, a hull or room hit goes through, kind pew', () => {
    const s = fake();
    const g = (o: object) => ({ kind: 'gunHit', ship: 1, room: -1, stripped: false, hull: false, level: false, x: 0, y: -100, ...o }) as unknown as ViewEvent;
    expect(readHits(s, [g({ stripped: true })])[0]).toMatchObject({ target: 1, kind: 'pew', stopped: true, drop: true });
    expect(readHits(s, [g({ room: 2 })])[0]).toMatchObject({ kind: 'pew', stopped: false, room: 2 });
    expect(readHits(s, [g({ hull: true })])[0]).toMatchObject({ kind: 'pew', stopped: false, room: -1 });
    expect(readHits(s, [g({})])).toEqual([]);   // wear only
  });
  it('bearing: dead ahead 0; quarter-turned ship follows the map convention', () => {
    expect(readHits(fake(0), [laser({})])[0]!.a).toBeCloseTo(0);
    // heading quarter: nose points east (+x); a shooter due north is to port: -PI/2
    expect(readHits(fake(HEADING_COUNT / 4), [laser({})])[0]!.a).toBeCloseTo(-Math.PI / 2);
    expect(readHits(fake(HEADING_COUNT / 4), [laser({ x1: 100, y1: 0 })])[0]!.a).toBeCloseTo(0);
    expect(readHits(fake(0), [laser({ x1: 100, y1: 0 })])[0]!.a).toBeCloseTo(Math.PI / 2);
  });
});

describe('interior frame and shots', () => {
  const frame: InteriorFrame = { nose: { x: 1, y: 0 }, star: { x: 0, y: 1 }, ellipse: { cx: 100, cy: 50, rx: 40, ry: 20 }, rooms: [{ x: 90, y: 50 }, { x: 100, y: 50 }, { x: 110, y: 50 }] };
  it('interiorFrame on a real duel', () => {
    const d = createSeatedDuel(layout, 5);
    const f = interiorFrame(d, { x: 2, y: 1, w: 10, h: 5 });
    expect(f.rooms).toHaveLength(3);
    expect(Math.hypot(f.nose.x, f.nose.y)).toBeCloseTo(1);
    expect(f.star).toEqual({ x: -f.nose.y, y: f.nose.x });
    expect(f.ellipse).toEqual({ cx: 7 * TILE_PX, cy: 3.5 * TILE_PX, rx: 0.56 * 10 * TILE_PX, ry: 0.56 * 5 * TILE_PX });
    const w = d.interior.derived.width;
    for (let r = 0; r < 3; r++) {   // each room's landing point is the centre of that room's point tile
      const t = d.points.find((q) => q.tacticalRoom === r)!.tile;
      expect(f.rooms[r]).toEqual({ x: (t % w + 0.5) * TILE_PX, y: (Math.floor(t / w) + 0.5) * TILE_PX });
    }
    const eng = f.rooms[Room.Engines]!, wpn = f.rooms[Room.Weapons]!;   // the nose points from Engines toward Weapons
    expect(f.nose.x * (wpn.x - eng.x) + f.nose.y * (wpn.y - eng.y)).toBeGreaterThan(0);
    disposeDuel(d);
  });
  it('a stopped shot ends on the ellipse, a through shot at its room, a miss crosses', () => {
    const s = createShots();
    const base = { target: 0, a: 0, kind: 'laser' as const, stopped: false, drop: false, room: 1, miss: false };
    pushShots(s, [{ ...base, stopped: true, drop: true, room: -1 }, base, { ...base, miss: true, room: -1 }, { ...base, target: 1 }], frame, 200);
    expect(s.shots).toHaveLength(3);
    const e = ellipsePoint(frame.ellipse, 0, frame.nose, frame.star);
    expect(s.shots[0]!.to).toEqual(e);
    expect(s.shots[0]!.stopped).toBe(true);
    expect(s.shots[0]!.from.x).toBeCloseTo(300);
    expect(s.shots[1]!.to).toEqual(frame.rooms[1]);
    expect(s.shots[2]!.to.x).toBeCloseTo(-100);
    expect(s.shots[0]!.life).toBe(FLIGHT_S.laser);
  });
  it('stepShots holds at 0, lands, and goes after life + 0.2', () => {
    const s = createShots();
    pushShots(s, [{ target: 0, a: 0, kind: 'torpedo', stopped: false, drop: false, room: 1, miss: false }], frame, 100);
    stepShots(s, 0);
    expect(s.shots[0]!.age).toBe(0);
    stepShots(s, FLIGHT_S.torpedo + 0.01);
    expect(s.shots[0]!.landed).toBe(true);
    expect(shotDraw(s.shots[0]!).burst).toBeGreaterThan(0);
    stepShots(s, 0.2 - 0.05);   // age is now life + 0.16: the shot is still there
    expect(s.shots).toHaveLength(1);
    stepShots(s, 0.05);         // life + 0.21: gone
    expect(s.shots).toHaveLength(0);
  });
  it('a missed shot flies out with no burst', () => {
    const s = createShots();
    pushShots(s, [{ target: 0, a: 0, kind: 'laser', stopped: false, drop: false, room: -1, miss: true }], frame, 100);
    expect(s.shots[0]!.miss).toBe(true);
    stepShots(s, FLIGHT_S.laser + 0.05);
    expect(s.shots[0]!.landed).toBe(true);
    expect(shotDraw(s.shots[0]!).burst).toBe(0);
  });
  it('torpedo trail has 4 points, laser none', () => {
    const s = createShots();
    const h = { target: 0, a: 0, stopped: false, drop: false, room: 1, miss: false };
    pushShots(s, [{ ...h, kind: 'torpedo' }, { ...h, kind: 'laser' }], frame, 100);
    stepShots(s, 0.2);
    expect(shotDraw(s.shots[0]!).trail).toHaveLength(4);
    expect(shotDraw(s.shots[1]!).trail).toEqual([]);
  });
});
