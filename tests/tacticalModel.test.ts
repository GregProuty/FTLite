import { describe, expect, it } from 'vitest';
import { createCamera, pan, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFeelTracker, feelReadout, feelRows, FEEL_WINDOW_TICKS, recordFeel } from '../src/renderer/src/render/tactical/feelModel';
import {
  asteroidShape, BEARING_RING_PX, STAR_PARALLAX, starOffset, columnName, contourRadius, GRID_EXTENT, interpolatedShip, pathSeconds, pickRadius, pickShip, ringCrossesRect,
  aroundAvoid, WELL_PAD, shipScale, SHIP_MIN_PX_PER_UNIT, spreadArrows, tacticalModel, type ArrowDraw, type PrevBody, type TacticalModelInput
} from '../src/renderer/src/render/tactical/tacticalModel';
import { OWN_SHIP } from '../src/renderer/src/render/duel/consoleLayout';
import { HULLS } from '../src/renderer/src/render/tactical/hullModel';
import { DENT_FULL_R, DENT_PULL_MAX, DENT_SUM_MAX, dentEase, dentOf, WELL_MAX_SHIFT, WELL_PULL, wellScale } from '../src/renderer/src/render/tactical/mapGrid';
import { RockKind, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { gravityAccel, stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';

const vp = { w: 1280, h: 720 };
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, over: Partial<TacticalModelInput> = {}): TacticalModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0, ...over };
}
const pull = (r: number) => Math.hypot(...gravityAccel(r, 0));

describe('gravity contours (H-1 spec §7 item 3)', () => {
  it('inverts gravityAccel: the pull at each radius is the contour value', () => {
    for (const a of [40, 10, 3]) expect(pull(contourRadius(a))).toBeCloseTo(a, 6);
    expect(contourRadius(40)).toBeLessThan(contourRadius(10));
  });
  it('a ring is drawn only when it crosses the screen', () => {
    expect(ringCrossesRect(640, 360, 100, 1280, 720)).toBe(true);
    expect(ringCrossesRect(640, 360, 2000, 1280, 720)).toBe(false);    // encloses the screen
    expect(ringCrossesRect(-500, 360, 100, 1280, 720)).toBe(false);    // wholly off to the left
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.12);
    expect(tacticalModel(input(st, cam)).contours.map((c) => c.accel)).toEqual([40, 10, 3]);
    const far = createCamera(2400, 0, 1.2);
    expect(tacticalModel(input(st, far)).contours).toEqual([]);
  });
});

describe('the gravity grid (owner 2026-11-19)', () => {
  // The planet's well alone: no rocks and no ships drawn, so nothing else dents the grid.
  const empty = (): TacticalState => { const s = createTacticalState(4); s.rocks.fill(0); return s; };
  const st = empty(), well = { mapGrid: 'gravity', ships: [] } as const;
  const drawn = (r: number) => r * wellScale(r * r);
  it('pulls points toward the planet, most at its centre, never past each other, and fades far out', () => {
    expect(wellScale(0)).toBeCloseTo(1 - WELL_PULL, 12);
    let last = -1, most = 0;
    for (let r = 0; r <= 3000; r += 5) { expect(drawn(r)).toBeGreaterThan(last); last = drawn(r); most = Math.max(most, r - drawn(r)); }
    expect(most).toBeLessThanOrEqual(WELL_MAX_SHIFT); expect(most).toBeGreaterThan(WELL_MAX_SHIFT * 0.99);
    expect(3000 - drawn(3000)).toBeLessThan(20);   // the map's edge barely moves
  });
  it('draws two lines for each of the square grid, each a polyline: bent beside the planet, straight through it', () => {
    const cam = createCamera(0, 0, 0.12), g = tacticalModel(input(st, cam, well)).grid, square = tacticalModel(input(st, cam, { ships: [] })).grid;
    expect(g.lines).toEqual([]); expect(square.curves).toBeUndefined();
    expect(g.curves!.length).toBe(2 * (2 * GRID_EXTENT / 250 + 1)); expect(g.curves!.filter((c) => c.major).length).toBe(square.lines.length);
    expect(g.columns.map((c) => c.text)).toEqual(square.columns.map((c) => c.text));   // the squares keep their names
    const vertical = g.curves!.slice(0, g.curves!.length / 2), at = (k: number) => vertical[k]!;   // x = −3000, −2750 … 3000
    expect(at(12).pts.length).toBe(4); expect(at(12).pts[0]).toBeCloseTo(640, 9); expect(at(12).pts[2]).toBeCloseTo(640, 9);   // through the planet
    expect(at(14).major).toBe(true); expect(at(13).major).toBe(false);
    const near = at(14).pts, xs = near.filter((_, i) => i % 2 === 0);   // x = 500
    expect(near.length).toBeGreaterThan(4);
    const flat = 640 + 500 * 0.12;
    expect(Math.min(...xs)).toBeCloseTo(640 + drawn(500) * 0.12, 1);   // closest beside the planet
    expect(Math.max(...xs)).toBeLessThanOrEqual(flat); expect(Math.max(...xs)).toBeGreaterThan(flat - 1);   // square again far along the line
    expect(g.curves!.every((c) => c.pts.every(Number.isFinite))).toBe(true);
  });
  it('keeps to the lines near the screen and adds the minor lines past zoom 0.6', () => {
    const g = tacticalModel(input(st, createCamera(1500, 1500, 1.2), well)).grid;
    expect(g.spacing).toBe(250); expect(g.curves!.some((c) => !c.major)).toBe(true);
    expect(g.curves!.length).toBeLessThan(30);   // ±533 by ±300 units of view plus the well's reach, a line every 125 units
    const reach = (WELL_PAD + WELL_MAX_SHIFT) * 1.2 + 1;   // a line is kept WELL_PAD past the view, and the well moves it at most its own shift more
    for (const c of g.curves!) for (let i = 0; i < c.pts.length; i += 2) { expect(c.pts[i]).toBeGreaterThan(-reach); expect(c.pts[i]).toBeLessThan(1280 + reach); }
  });
});

describe('the gravity grid’s dents (owner 2026-11-19: ships and rocks, by size)', () => {
  const empty = (): TacticalState => { const s = createTacticalState(4); s.rocks.fill(0); return s; };
  const cam = createCamera(2000, 2000, 0.5);   // far from the planet: x and y lines every 250 units, 1750 … 2250 in view
  const lines = (s: TacticalState, ships: number[] = []) => tacticalModel(input(s, cam, { mapGrid: 'gravity', ships })).grid.curves!;
  const farthest = (a: { pts: number[] }[], b: { pts: number[] }[]) => Math.max(...a.flatMap((c, k) => c.pts.map((p, i) => Math.abs(p - b[k]!.pts[i]!))));
  it('a bigger body dents deeper and wider, up to the full pull', () => {
    const small = dentOf(0, 0, 15), big = dentOf(0, 0, 45), huge = dentOf(0, 0, 90);
    expect(big.shift).toBeGreaterThan(3 * small.shift); expect(big.reach).toBe(3 * small.reach); expect(big.pull).toBeGreaterThan(small.pull);
    expect(big.pull).toBe(DENT_PULL_MAX); expect(huge.pull).toBe(DENT_PULL_MAX); expect(DENT_FULL_R).toBe(45);
    expect(DENT_PULL_MAX).toBeLessThan(1);   // a lone dent never folds the grid
  });
  it('a rock pulls the lines beside it toward itself, more for a bigger rock, and leaves far lines alone', () => {
    const none = lines(empty());
    const withRock = (r: number) => { const s = empty(); writeRock(s, 0, RockKind.Free, 2060, 2000, 0, 0, r, 10); return lines(s); };
    const big = withRock(45), small = withRock(20);
    expect(big.length).toBe(none.length);
    const at2000 = none.findIndex((c) => Math.abs(c.pts[0]! - (640 + (2000 * wellScale(2000 * 2000 + 1500 * 1500) - 2000) * 0.5)) < 6);   // the x = 2000 line
    const xs = (c: { pts: number[] }) => c.pts.filter((_, i) => i % 2 === 0);
    const pull = (set: { pts: number[] }[]) => Math.max(...xs(set[at2000]!).map((x, i) => x - xs(none[at2000]!)[i]!));   // toward the rock: east, +x
    expect(pull(big)).toBeGreaterThan(8); expect(pull(small)).toBeGreaterThan(1); expect(pull(big)).toBeGreaterThan(2 * pull(small));
    const reach = dentOf(2060, 2000, 45);
    expect(farthest(big, none)).toBeLessThanOrEqual(reach.shift * 0.5 + 1e-9);   // never more than the dent's deepest, in pixels
    const s = empty(); writeRock(s, 0, RockKind.Free, 2000 + 1280 + reach.reach + 50, 2000, 0, 0, 45, 10);   // its whole reach is off screen
    expect(lines(s)).toEqual(none);
    const dead = empty(); writeRock(dead, 0, RockKind.Gone, 2060, 2000, 0, 0, 45, 0);
    expect(lines(dead)).toEqual(none);
  });
  it('a dimple sits on its body even deep in the planet’s well: every point it moves goes toward the drawn rock', () => {
    const near = createCamera(500, 300, 0.5), at = (s: TacticalState) => tacticalModel(input(s, near, { mapGrid: 'gravity', ships: [] })).grid.curves!;
    const s = empty(); writeRock(s, 0, RockKind.Free, 560, 340, 0, 0, 45, 10);
    const none = at(empty()), dented = at(s), rock = { x: 640 + 60 * 0.5, y: 360 + 40 * 0.5 };   // the rock's place on screen
    let moved = 0;
    dented.forEach((c, k) => { for (let i = 0; i < c.pts.length; i += 2) {
      if (none[k]!.pts.length !== c.pts.length) return;   // the two lines through the planet: two points without a dent, so not comparable point by point
      const was = Math.hypot(none[k]!.pts[i]! - rock.x, none[k]!.pts[i + 1]! - rock.y), now = Math.hypot(c.pts[i]! - rock.x, c.pts[i + 1]! - rock.y);
      expect(now).toBeLessThanOrEqual(was + 1e-9); if (was - now > 1) moved++;
    } });
    expect(moved).toBeGreaterThan(20);
  });
  it('overlapping dents are eased so a pile of debris never folds the grid', () => {
    expect(dentEase(0.01)).toBeCloseTo(1, 6); expect(dentEase(DENT_PULL_MAX)).toBeGreaterThan(0.85);   // a lone dent keeps nearly all its pull
    let last = 0;
    for (let sum = 0.05; sum < 12; sum += 0.05) { const eased = sum * dentEase(sum); expect(eased).toBeGreaterThan(last); expect(eased).toBeLessThan(DENT_SUM_MAX); last = eased; }
    const s = empty();   // twelve rocks within 70 units: their plain pulls sum to several times 1
    for (let k = 0; k < 12; k++) writeRock(s, k, RockKind.Free, 2000 + 70 * Math.cos(k * 2.4) * (k / 12), 2000 + 70 * Math.sin(k * 2.4) * (k / 12), 0, 0, 20 + 2 * k, 5);
    const g = tacticalModel(input(s, createCamera(2000, 2000, 1.2), { mapGrid: 'gravity', ships: [] })).grid.curves!;
    const upright = (c: { pts: number[] }) => Math.abs(c.pts[c.pts.length - 1]! - c.pts[1]!) > Math.abs(c.pts[c.pts.length - 2]! - c.pts[0]!);
    const vertical = g.filter(upright), horizontal = g.filter((c) => !upright(c));
    expect(vertical.length).toBeGreaterThan(8); expect(horizontal.length).toBeGreaterThan(5);
    for (const c of vertical) for (let i = 3; i < c.pts.length; i += 2) expect(c.pts[i]!).toBeGreaterThan(c.pts[i - 2]!);   // each line still runs one way
    for (const c of horizontal) for (let i = 2; i < c.pts.length; i += 2) expect(c.pts[i]!).toBeGreaterThan(c.pts[i - 2]!);
    for (let k = 1; k < vertical.length; k++) for (let i = 0; i < vertical[k]!.pts.length; i += 2) expect(vertical[k]!.pts[i]!).toBeGreaterThan(vertical[k - 1]!.pts[i]!);   // and neighbours never cross
    for (let k = 1; k < horizontal.length; k++) for (let i = 1; i < horizontal[k]!.pts.length; i += 2) expect(horizontal[k]!.pts[i]!).toBeGreaterThan(horizontal[k - 1]!.pts[i]!);
  });
  it('a drawn ship carries a small dent with it; a ship left out of the view (unseen) dents nothing', () => {
    const s = empty(); Object.assign(s.ships[0]!, { x: 2060, y: 2000 });
    const none = lines(s), there = lines(s, [0]);
    expect(farthest(there, none)).toBeGreaterThan(1); expect(farthest(there, none)).toBeLessThan(6);
    Object.assign(s.ships[0]!, { x: 2060, y: 2100 });
    expect(lines(s, [0])).not.toEqual(there);
    expect(lines(s)).toEqual(none);
  });
});

describe('the lettered grid (H-1 spec §7 item 2)', () => {
  it('names columns A.. from the west and rows 1.. from the north, 500-unit squares', () => {
    expect(columnName(0)).toBe('A'); expect(columnName(11)).toBe('L'); expect(columnName(26)).toBe('AA');
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.12);
    const g = tacticalModel(input(st, cam)).grid;
    expect(g.spacing).toBe(500);
    expect(g.columns.map((c) => c.text)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    expect(g.rows.map((r) => r.text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    expect(g.lines.length).toBe(2 * (2 * GRID_EXTENT / 500 + 1));
  });
  it('labels sit on the visible top and left edges and name the square under them', () => {
    const st = createTacticalState(4), cam = createCamera(-2750, -2750, 1.0);   // the north-west corner: square A1
    const g = tacticalModel(input(st, cam)).grid;
    expect(g.columns[0]!.text).toBe('A'); expect(g.rows[0]!.text).toBe('1');
    for (const c of g.columns) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThanOrEqual(1280); }
    expect(g.columns[0]!.y).toBeGreaterThan(4);   // the grid's top edge is on screen, so the labels sit just under it
  });
  it('switches to 250-unit lines past zoom 0.6 and culls lines off screen', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.2);
    const g = tacticalModel(input(st, cam)).grid;
    expect(g.spacing).toBe(250);
    expect(g.lines.every((l) => l.x1 >= 0 && l.x1 <= 1280 && l.y1 >= 0 && l.y1 <= 720 || l.y1 === l.y2 && l.y1 >= 0 && l.y1 <= 720)).toBe(true);
    expect(g.lines.some((l) => !l.major)).toBe(true);
    expect(g.columns.map((c) => c.text)).toEqual(['E', 'F', 'G', 'H']);   // ±533 units: F and G whole, 33-unit slivers of E and H (40 px)
  });
});

describe('bodies and ships (H-1 spec §7 items 4 to 6)', () => {
  it('culls asteroids off screen, dots below 2 px, skips none above 0.5 px', () => {
    const st = createTacticalState(4);
    const wide = tacticalModel(input(st, createCamera(0, 0, 0.12)));
    expect(wide.asteroids.length).toBe(st.map.asteroids.length);   // every radius ≥ 15 is ≥ 1.8 px at 0.12
    expect(wide.asteroids.filter((a) => a.dot).every((a) => a.r < 2)).toBe(true);
    expect(wide.asteroids.some((a) => a.dot)).toBe(true);
    const close = tacticalModel(input(st, createCamera(0, 0, 1.2)));
    expect(close.asteroids.length).toBe(0);   // the belt is 1100+ out; the screen shows ±533
    expect(close.planet).toEqual({ x: 640, y: 360, r: 70 * 1.2 });
    expect(wide.edge!.r).toBeCloseTo(2800 * 0.12, 9);
  });
  it('a ship is a silhouette at 10 px across and up, a chevron below', () => {
    const st = createTacticalState(4), s = st.ships[0];
    const at = (z: number) => tacticalModel(input(st, createCamera(s.x, s.y, z))).ships[0]!;
    expect(at(0.25).chevron).toBe(false);   // 40 units × 0.25 = 10 px
    expect(at(0.24).chevron).toBe(true);
    expect(at(0.5)).toMatchObject({ index: 0, x: 640, y: 360, crew: true, scale: 0.8, shields: 1 });   // the minimum, 16 px per unit; Engineering spike spec §2: the crew's shields start at 1 layer
    expect(at(1.2).scale).toBe(1.2);
    expect(at(0.2).scale).toBeCloseTo(0.2, 9);   // a chevron: the true zoom
    const helmAt = (z: number) => tacticalModel(input(st, createCamera(s.x, s.y, z))).helm!;
    const from = (z: number) => Math.hypot(helmAt(z).headingFrom.x - 640, helmAt(z).headingFrom.y - 360);
    expect(from(0.2)).toBeCloseTo(20 * 1.3 * 0.2 + 4, 6);   // the heading line starts at the chevron, not the minimum scale
    expect(from(0.5)).toBeCloseTo(20 * 1.3 * 0.8 + 4, 6);
    expect(at(0.25).hull).toBe('hound');
  });
  it('a silhouette is never drawn below 16 px per ship unit; above that it follows the zoom', () => {
    expect(SHIP_MIN_PX_PER_UNIT).toBe(16);
    expect(shipScale(0.25)).toBeCloseTo(0.8, 9); expect(shipScale(0.5)).toBeCloseTo(0.8, 9);
    expect(shipScale(0.8)).toBeCloseTo(0.8, 9); expect(shipScale(1.2)).toBe(1.2);
  });
  it('every ship carries its hull: the crew the Hound, the enemy the scout (hull silhouettes spec section 2)', () => {
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y, 0.5);
    st.ships[1].x = st.ships[0].x + 100; st.ships[1].y = st.ships[0].y;
    const d = tacticalModel(input(st, cam, { ships: [0, 1] }));
    expect(d.ships.map((s) => [s.index, s.hull])).toEqual([[0, 'hound'], [1, 'scout']]);
  });
  it('the flight view draws only ship 0', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.12);
    expect(tacticalModel(input(st, cam)).ships.map((s) => s.index)).toEqual([0]);
    expect(tacticalModel(input(st, cam, { ships: [0, 1] })).ships.map((s) => s.index)).toEqual([0, 1]);
  });
  it('interpolates position by alpha and heading the short way round', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: 100, y: 0, heading: 1, headingAcc: 0 });
    const prev = [{ x: 0, y: 0, h: 255 }, { x: 0, y: 0, h: 0 }];
    const b = interpolatedShip(st, prev, 0.5, 0);
    expect(b.x).toBe(50); expect(b.h).toBe(256);
  });
});

describe('correction smoothing offsets on the own ship (Net-4a §3.8)', () => {
  /** A screen point rotated clockwise (y down) by `steps` heading steps about c. */
  const rot = (p: { x: number; y: number }, c: { x: number; y: number }, steps: number) => {
    const a = (steps / 256) * 2 * Math.PI, dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  it('the Helm path and its contact move and turn with the own ship: rotated by oh about the ship, then shifted by (ox, oy)', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: 0, y: -400, vx: 0, vy: 0, heading: 128 });   // nose south, toward the planet: the path ends at a contact
    const cam = createCamera(0, -400, 0.12), z = cam.zoom, axes = { turn: 0, thrust: 1 };
    const bare = tacticalModel(input(st, cam, { axes })).helm!;
    const prev = prevOf(st); prev[0] = { ...prev[0]!, ox: 30, oy: -10, oh: 64 };
    const moved = tacticalModel(input(st, cam, { axes, prev })).helm!;
    const c = { x: vp.w / 2 + (s.x - cam.centreX) * z, y: vp.h / 2 + (s.y - cam.centreY) * z };
    expect(bare.collision).not.toBeNull();
    const want = (q: { x: number; y: number }) => { const r = rot(q, c, 64); return { x: r.x + 30 * z, y: r.y - 10 * z }; };
    bare.path.forEach((q, k) => { const w = want(q); expect(moved.path[k]!.x).toBeCloseTo(w.x, 6); expect(moved.path[k]!.y).toBeCloseTo(w.y, 6); });
    const wc = want(bare.collision!);
    expect(moved.collision!.x).toBeCloseTo(wc.x, 6); expect(moved.collision!.y).toBeCloseTo(wc.y, 6);
    expect(moved.origin.x).toBeCloseTo(c.x + 30 * z, 6);   // the marker it starts from carries the same offset
  });
  it("the own torpedo's edge arrow carries the missile's offset", () => {
    const st = createTacticalState(4), s = st.ships[0], cam = createCamera(s.x, s.y, 1.0);
    placeMissile(st, 0, { x: s.x + 3000, y: s.y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 0 });
    const arrowOf = (missilePrev?: (PrevBody | null)[]) => tacticalModel(input(st, cam, missilePrev ? { missilePrev } : {})).arrows.find((a) => a.target === 'missile')!;
    expect(arrowOf().distance).toBe(3000);
    expect(arrowOf([{ x: s.x + 3000, y: s.y, h: 64, ox: -500, oy: 0, oh: 0 }, null]).distance).toBe(2500);
    expect(arrowOf([{ x: s.x + 3000, y: s.y, h: 64 }, null]).distance).toBe(3000);   // no offset: unchanged
  });
});

describe('the Helm layer (H-1 spec §7 item 7)', () => {
  it('predicts 2 s at zoom 0.6 and up, rising to 8 s at 0.12, a point every 4 ticks', () => {
    expect(pathSeconds(1.2)).toBe(2); expect(pathSeconds(0.6)).toBe(2); expect(pathSeconds(0.12)).toBe(8);
    expect(pathSeconds(0.36)).toBeCloseTo(5, 12);
    const st = createTacticalState(4), s = st.ships[0];
    const near = tacticalModel(input(st, createCamera(s.x, s.y, 1.0))).helm!;
    const far = tacticalModel(input(st, createCamera(s.x, s.y, 0.12))).helm!;
    expect(near.path.length).toBe(30);    // 120 ticks / 4
    expect(far.path.length).toBe(120);    // 480 ticks / 4
  });
  it('the path follows the current axes and ends at a solid contact', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: 0, y: -400, vx: 0, vy: 0, heading: 128 });   // nose south, at the planet
    const cam = createCamera(0, -400, 0.12);
    const coast = tacticalModel(input(st, cam)).helm!.path, burn = tacticalModel(input(st, cam, { axes: { turn: 0, thrust: 1 } })).helm!;
    expect(burn.path.length).toBeLessThan(coast.length);
    expect(burn.thrust).toBe(1); expect(burn.turn).toBe(0);
    const quarter = tacticalModel(input(st, cam, { axes: { turn: 0, thrust: 0.25 } })).helm!, rev = tacticalModel(input(st, cam, { axes: { turn: 0, thrust: -0.25 } })).helm!, nan = tacticalModel(input(st, cam, { axes: { turn: 0, thrust: NaN } })).helm!;
    expect(quarter.thrust).toBe(0.25); expect(rev.thrust).toBe(-0.25); expect(nan.thrust).toBe(0);   // the flame scales with the throttle
  });
  it('draws the bearing ring at zoom 0.3 and up: 36 ticks, labels every 30 degrees, north up', () => {
    const st = createTacticalState(4), s = st.ships[0];
    const ring = tacticalModel(input(st, createCamera(s.x, s.y, 0.3))).helm!.ring!;
    expect(ring.ticks.length).toBe(36);
    expect(ring.labels.map((l) => l.text)).toEqual(['0', '30', '60', '90', '120', '150', '180', '210', '240', '270', '300', '330']);
    expect(ring.labels[0]!.x).toBeCloseTo(640, 9); expect(ring.labels[0]!.y).toBeLessThan(360 - BEARING_RING_PX);
    expect(ring.labels[3]!.x).toBeGreaterThan(640 + BEARING_RING_PX);   // 90 is east
    expect(tacticalModel(input(st, createCamera(s.x, s.y, 0.29))).helm!.ring).toBeNull();
  });
  it('the weapons console has no Helm layer', () => {
    const st = createTacticalState(4);
    expect(tacticalModel(input(st, createCamera(0, 0), { console: 'weapons' })).helm).toBeNull();
  });
});

describe('the overlay (H-1 spec §7 item 9)', () => {
  it('points off-screen arrows at the own ship and the planet, with distances, clear of the readout', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: 1500, y: 0 });
    const cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);   // free, about at the planet
    const view = tacticalModel(input(st, cam, { reserveRight: 230 }));
    const ship = view.arrows.find((a) => a.target === 'ship')!;
    expect(ship.x).toBeCloseTo(1280 - 230 - 28, 9); expect(ship.angle).toBeCloseTo(Math.PI / 2, 2);
    expect(ship.label).toMatch(/^SHIP 150\d$/);
    expect(view.arrows.find((a) => a.target === 'planet')).toBeUndefined();   // on screen
    expect(view.overlay.snapHint).toBe(true);
    const followed = tacticalModel(input(st, createCamera(1500, 0, 1.0)));
    expect(followed.arrows.map((a) => [a.target, a.distance])).toEqual([['planet', 1500]]);
    expect(followed.overlay.snapHint).toBe(false);
  });
  it('keeps off-screen arrows clear of a left reserve (the console status table)', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: -1500, y: 0 });
    const cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);
    const view = tacticalModel(input(st, cam, { reserveLeft: 228, reserveRight: 156 }));
    const ship = view.arrows.find((a) => a.target === 'ship')!;
    expect(ship.x).toBeGreaterThanOrEqual(228 + 28 - 1e-9);   // ARROW_MARGIN is 28
  });
  it('shows the zoom and a scale bar no wider than 160 px', () => {
    const st = createTacticalState(4);
    const o = tacticalModel(input(st, createCamera(0, 0, 0.5))).overlay;
    expect(o.zoomText).toBe('ZOOM 0.50');
    expect(o.scaleBar).toEqual({ px: 125, units: 250 });
    expect(tacticalModel(input(st, createCamera(0, 0, 0.12))).overlay.scaleBar.units).toBe(1000);
  });
});

describe('the parallax star field (parent §10b layer 1)', () => {
  it('moves the stars against the camera at STAR_PARALLAX px per unit, at any zoom, wrapped into one tile', () => {
    expect(STAR_PARALLAX).toBe(0.02);
    expect(starOffset(0, 0, vp)).toEqual({ x: 0, y: 0 });
    expect(starOffset(1000, 0, vp)).toEqual({ x: 1280 - 20, y: 0 });       // the camera moves east 1000: the stars 20 px west
    expect(starOffset(0, -2000, vp)).toEqual({ x: 0, y: 40 });             // north 2000: 40 px down
    expect(starOffset(-64000 - 500, 0, vp).x).toBeCloseTo(10, 9);          // 1290 px wraps to 10
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.5);
    const a = tacticalModel(input(st, cam)).stars;
    pan(cam, -100, 0);                                                     // drag 100 px left: the centre moves 200 units east
    const b = tacticalModel(input(st, cam)).stars;
    expect(a).toEqual({ x: 0, y: 0 }); expect(b.x).toBeCloseTo(1280 - 4, 9); expect(b.y).toBe(0);
    const zoomed = tacticalModel(input(st, createCamera(200, 0, 1.2))).stars;
    expect(zoomed.x).toBeCloseTo(b.x, 9);                                  // independent of zoom
  });
});

describe('shapes', () => {
  it('both hulls have three rooms and asteroids have stable outlines', () => {
    expect([HULLS.hound.rooms.length, HULLS.scout.rooms.length]).toEqual([3, 3]);
    expect(asteroidShape(5)).toBe(asteroidShape(5));
    expect(asteroidShape(5)).not.toEqual(asteroidShape(6));
    expect(asteroidShape(9).every((k) => k >= 0.72 && k <= 1.08)).toBe(true);
  });
});

describe('the feel panel (H-1 spec §9)', () => {
  it('reads speed, skid, turn rate, gravity and the planet distance', () => {
    const st = createTacticalState(4), s = st.ships[0], t = createFeelTracker();
    Object.assign(s, { x: 0, y: -1000, vx: 30, vy: -40, heading: 0, headingAcc: 0 });   // nose north: 30 u/s to the right is skid
    recordFeel(t, s, st.map.planet);
    const r = feelReadout(t, s, st.map.planet);
    expect(r.speed).toBeCloseTo(50, 9); expect(r.skid).toBeCloseTo(30, 9);
    expect(r.gravity).toBeCloseTo(pull(1000), 9); expect(r.planet).toBeCloseTo(1000, 9);
    expect(feelRows(r).map(([k]) => k)).toEqual(['SPEED', 'SKID', 'TURN', 'GRAVITY', 'PLANET r', 'MIN r 10s']);
  });
  it('a full turn reads 150 deg/s', () => {
    const st = createTacticalState(4), t = createFeelTracker();
    for (let k = 0; k < 30; k++) { stepSoloFlight(st, { turn: 1, thrust: 0 }); recordFeel(t, st.ships[0], st.map.planet); }
    expect(feelReadout(t, st.ships[0], st.map.planet).turnRate).toBeCloseTo(150, 6);
  });
  it('keeps the least planet distance over the last 10 s only', () => {
    const st = createTacticalState(4), s = st.ships[0], t = createFeelTracker();
    s.x = 0; s.y = -200; recordFeel(t, s, st.map.planet);
    s.y = -900;
    for (let k = 1; k < FEEL_WINDOW_TICKS; k++) recordFeel(t, s, st.map.planet);
    expect(feelReadout(t, s, st.map.planet).minPlanet).toBeCloseTo(200, 9);
    recordFeel(t, s, st.map.planet);   // the 200 sample falls out of the window
    expect(feelReadout(t, s, st.map.planet).minPlanet).toBeCloseTo(900, 9);
  });
});

describe('pickShip (enemy ship window spec §3, §6.2)', () => {
  const at = (st: TacticalState, cam: Camera, x: number, y: number) => pickShip(input(st, cam), { x, y });
  it('hits inside the radius and misses outside it at zoom 0.2 (the 16 px floor), 0.5 and 1.2', () => {
    for (const [z, r] of [[0.2, 16], [0.5, 30.4], [1.2, 48]] as const) {
      const st = createTacticalState(4), en = st.ships[1], cam = createCamera(en.x, en.y, z);   // the enemy at the screen centre
      expect(pickRadius(z), `radius at ${z}`).toBeCloseTo(r, 9);
      expect(at(st, cam, 640 + r - 0.5, 360), `inside at ${z}`).toBe(1);
      expect(at(st, cam, 640, 360 - (r - 0.5)), `inside, above, at ${z}`).toBe(1);
      expect(at(st, cam, 640 + r + 0.5, 360), `outside at ${z}`).toBeNull();
    }
  });
  it('skips the crew slot and inactive slots, and picks the nearest of two', () => {
    const st = createTacticalState(4, 3), crew = st.ships[0], en = st.ships[1], third = st.ships[2]!;
    expect(at(st, createCamera(crew.x, crew.y, 0.5), 640, 360)).toBeNull();   // the crew's own ship
    third.x = en.x + 2000; third.y = en.y;
    expect(at(st, createCamera(third.x, third.y, 0.5), 640, 360)).toBeNull();   // an inactive slot
    third.active = true;
    expect(at(st, createCamera(third.x, third.y, 0.5), 640, 360)).toBe(2);
    third.x = en.x + 20;   // 24 px right of the enemy at zoom 1.2
    const cam = createCamera(en.x, en.y, 1.2);
    expect(at(st, cam, 640 + 16, 360)).toBe(2);
    expect(at(st, cam, 640 + 8, 360)).toBe(1);
  });
});

describe('arrows around the own ship window (own ship window spec §3)', () => {
  const RL = 228, RR = 156, RT = 44, m = 28, AR = OWN_SHIP.x + OWN_SHIP.w + m, AB = OWN_SHIP.y + OWN_SHIP.h + m;   // A's right 496, bottom 240
  const inWindow = (a: { x: number; y: number }) => a.x > OWN_SHIP.x && a.x < OWN_SHIP.x + OWN_SHIP.w && a.y > OWN_SHIP.y && a.y < OWN_SHIP.y + OWN_SHIP.h;
  const onA = (a: { x: number; y: number }) => (Math.abs(a.x - AR) < 1e-6 && a.y <= AB + 1e-6) || (Math.abs(a.y - AB) < 1e-6 && a.x <= AR + 1e-6);
  it('an object hidden under the window gets an arrow on A, not inside the window', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);
    Object.assign(st.ships[0], { x: 300 - 640, y: 150 - 360 - 1 });   // screen (300, 150): under the window
    expect(tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT })).arrows.find((a) => a.target === 'ship')).toBeUndefined();
    const a = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT, avoid: OWN_SHIP })).arrows.find((x) => x.target === 'ship')!;
    expect(a.edge).toBeDefined(); expect(onA(a)).toBe(true); expect(inWindow(a)).toBe(false);
  });
  it('an off-screen object up and left, whose edge arrow would sit on the window, moves onto A', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);
    Object.assign(st.ships[0], { x: -1500, y: -1000 });
    const plain = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT })).arrows.find((x) => x.target === 'ship')!;
    expect(plain.x).toBeCloseTo(RL + m, 6); expect(plain.y).toBeLessThan(AB);   // today: on the left edge, beside the window
    const a = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT, avoid: OWN_SHIP })).arrows.find((x) => x.target === 'ship')!;
    expect(onA(a)).toBe(true); expect(a.angle).toBeCloseTo(plain.angle, 9);
  });
  it("a ray through A's corner lands on the right edge", () => {
    const vp = { w: 1280, h: 720 }, l = RL + m, t = RT + m, r = 1280 - RR - m, b = 720 - m, cx = (l + r) / 2, cy = (t + b) / 2;
    const p = { x: cx + (AR - cx) * 3, y: cy + (AB - cy) * 3 };   // straight through the corner, off screen
    const e = aroundAvoid(vp, RL, RR, RT, OWN_SHIP, p, { x: l, y: cy + (AB - cy) * ((l - cx) / (AR - cx)), angle: 0 });
    expect(e!.edge).toBe('avoidRight'); expect(e!.x).toBeCloseTo(AR, 6); expect(e!.y).toBeCloseTo(AB, 6);
  });
  it("an on-screen object in A's margin band, not under the window, gets no arrow", () => {
    const vp = { w: 1280, h: 720 };
    expect(aroundAvoid(vp, RL, RR, RT, OWN_SHIP, { x: OWN_SHIP.x + OWN_SHIP.w + 10, y: 100 }, null)).toBeNull();
  });
  it('two arrows on one avoid edge spread apart; no top-edge arrow is left of A after spreading', () => {
    const vp = { w: 1280, h: 720 }, mk = (x: number, y: number, edge?: ArrowDraw['edge']): ArrowDraw => ({ target: 'planet', x, y, angle: 0, distance: 1, label: '', ...(edge ? { edge } : {}) });
    const two = [mk(400, AB, 'avoidBottom'), mk(401, AB, 'avoidBottom')];
    spreadArrows(two, vp, RR, RL, RT, OWN_SHIP);
    expect(Math.abs(two[0]!.x - two[1]!.x)).toBeGreaterThanOrEqual(110 - 1e-9);   // ARROW_GAP_TOP
    for (const a of two) { expect(a.x).toBeLessThanOrEqual(AR + 1e-9); expect(a.x).toBeGreaterThanOrEqual(RL + m - 1e-9); }
    const top = [mk(AR + 5, RT + m), mk(AR + 6, RT + m), mk(1000, RT + m)];
    spreadArrows(top, vp, RR, RL, RT, OWN_SHIP);
    for (const a of top) expect(a.x).toBeGreaterThanOrEqual(AR - 1e-9);
  });
  it('without avoid nothing changes', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);
    Object.assign(st.ships[0], { x: -1500, y: -1000 });
    const a = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT })).arrows.find((x) => x.target === 'ship')!;
    expect(a.edge).toBeUndefined();
  });
});
