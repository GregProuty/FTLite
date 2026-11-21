// Own ship window spec §2, §4, §6: the view model (fit, looks, edges, fire, hull, crew, flash) and the fire watch.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import starter from '../src/renderer/src/sim/ship/starter.json';
import valkyrn from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { extinguishProgress } from '../src/renderer/src/sim/duel/fire';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { classOf, CREW_SLOT, Room } from '../src/renderer/src/sim/tactical/state';
import { addShieldHit, createShieldFx } from '../src/renderer/src/render/shieldFx';
import { OWN_SHIP_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import {
  FIRE_FLASH_S, fireWatch, ownRoomLook, ownShipFit, ownShipModel, tileEdges, type OwnShipView
} from '../src/renderer/src/render/duel/ownShipModel';

const layout = parseShip(cutter);
const box = OWN_SHIP_BOX;
const LIT = 0.25, DARK = 0;   // blink(t, 2): floor(t * 4) % 2 is 1 at 0.25 and 0 at 0
const withDuel = (f: (d: DuelState) => void): void => { const d = createDuel(layout, 5); try { f(d); } finally { disposeDuel(d); } };
const roomOf = (d: DuelState, r: number): number => d.points.find((p) => p.tacticalRoom === r)!.room;
/** The view's tile for interior tile index k. */
const tileOf = (d: DuelState, v: OwnShipView, k: number) => {
  const gw = d.interior.derived.width, f = ownShipFit(gw, d.interior.derived.height, box);
  return v.tiles.find((q) => q.x === f.ox + (k % gw) * f.s && q.y === f.oy + Math.floor(k / gw) * f.s)!;
};

describe('the fit (spec §4)', () => {
  it('keeps every room tile inside the box and centres the grid', () => withDuel((d) => {
    const v = ownShipModel(d, box, 0, 0), gw = d.interior.derived.width, gh = d.interior.derived.height, f = ownShipFit(gw, gh, box);
    expect(v.tiles.length).toBe(d.interior.derived.roomTiles.reduce((n, r) => n + r.length, 0));
    for (const q of v.tiles) {
      expect(q.x).toBeGreaterThanOrEqual(box.x); expect(q.y).toBeGreaterThanOrEqual(box.y);
      expect(q.x + q.s).toBeLessThanOrEqual(box.x + box.w + 1e-9); expect(q.y + q.s).toBeLessThanOrEqual(box.y + box.h + 1e-9);
    }
    expect(Math.abs((f.ox - box.x) - (box.x + box.w - (f.ox + gw * f.s)))).toBeLessThanOrEqual(1);
    expect(Math.abs((f.oy - box.y) - (box.y + box.h - (f.oy + gh * f.s)))).toBeLessThanOrEqual(1);
  }));
  it('floors the tile size at 3 px and above, keeps it fractional below', () => {
    expect(ownShipFit(10, 5, { x: 0, y: 0, w: 75, h: 75 }).s).toBe(7);
    expect(ownShipFit(100, 5, { x: 0, y: 0, w: 250, h: 75 }).s).toBeCloseTo(2.5, 9);
  });
  it('every room of every shipped layout is a rectangle', () => {
    for (const json of [cutter, hound, skiff, starter, valkyrn]) {
      const dv = deriveLayout(parseShip(json));
      dv.roomTiles.forEach((tiles, room) => {
        const xs = tiles.map((k) => k % dv.width), ys = tiles.map((k) => Math.floor(k / dv.width));
        const area = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
        expect(tiles.length, `${(json as { id?: string }).id} room ${room}`).toBe(area);
      });
    }
  });
});

describe('the painting and shield (UI round Part 3 §3.5)', () => {
  const img = { url: 'hound.png', w: 2800, h: 1400 };
  const withHound = (f: (d: DuelState) => void): void => { const d = createDuel(parseShip(hound), 5); try { f(d); } finally { disposeDuel(d); } };
  it('places the painting in the tiles transform and draws only damaged or burning tiles over it', () => withHound((d) => {
    const fx = createShieldFx(2), f = ownShipFit(d.interior.derived.width, d.interior.derived.height, box);
    const plain = ownShipModel(d, box, 0, 0), v = ownShipModel(d, box, 0, 0, { painting: img, fx });
    expect(v.painting).toEqual({ url: 'hound.png', x: f.ox + -5.5 * f.s, y: f.oy + -3.5 * f.s, w: 2800 / 70 * f.s, h: 1400 / 70 * f.s });
    const tx0 = Math.min(...plain.tiles.map((q) => q.x)), tx1 = Math.max(...plain.tiles.map((q) => q.x + q.s));
    expect(v.painting!.x).toBeLessThanOrEqual(tx0); expect(v.painting!.x + v.painting!.w).toBeGreaterThanOrEqual(tx1);
    expect(plain.painting).toBeNull(); expect(plain.tileOpacity).toBe(1);
    expect(v.tileOpacity).toBe(0.6);
    expect(v.tiles.length).toBe(0);   // an undamaged ship: no tile draws over the painting
    expect(v.edges).toEqual(plain.edges);
  }));
  it('a burning room still draws its tiles over the painting', () => withHound((d) => {
    igniteRoom(d.interior, roomOf(d, Room.Engines));
    const v = ownShipModel(d, box, LIT, 0, { painting: img, fx: createShieldFx(2) });
    expect(v.tiles.length).toBeGreaterThan(0);
  }));
  it('no image for the layout, or an unpainted layout, gives no painting; the shield still shows', () => {
    withHound((d) => { expect(ownShipModel(d, box, 0, 0, { painting: null, fx: createShieldFx(2) }).painting).toBeNull(); });
    withDuel((d) => { const v = ownShipModel(d, box, 0, 0, { painting: img, fx: createShieldFx(2) }); expect(v.painting).toBeNull(); expect(v.tiles.length).toBeGreaterThan(0); });
  });
  it('the shield ellipse is the tiles box at 0.56 radii and the cells shimmer on a hit; no fx, no shield', () => withHound((d) => {
    const fx = createShieldFx(2); addShieldHit(fx, CREW_SLOT, 0, false, false); fx.hits[CREW_SLOT]![0]!.age = 0.01;
    const plain = ownShipModel(d, box, 0, 0), v = ownShipModel(d, box, 0, 0, { painting: img, fx });
    const x0 = Math.min(...plain.tiles.map((q) => q.x)), x1 = Math.max(...plain.tiles.map((q) => q.x + q.s));
    expect(v.shield!.ellipse.cx).toBeCloseTo((x0 + x1) / 2, 9); expect(v.shield!.ellipse.rx).toBeCloseTo(0.56 * (x1 - x0), 9);
    expect(v.shield!.cell).toBe(4); expect(v.shield!.cells.length).toBeGreaterThan(0);
    expect(plain.shield).toBeNull();
  }));
});

describe('edges (spec §4)', () => {
  it('a single-room 2×2 block yields only its 8 perimeter segments', () => {
    const owner = [0, 0, 0, 0], out: number[] = [];
    for (let k = 0; k < 4; k++) tileEdges(owner, 2, 2, k, 10, 0, 0, out);
    expect(out.length / 4).toBe(8);
    for (let k = 0; k < out.length; k += 4) {   // every segment lies on the block's border
      const onBorder = (v: number) => v === 0 || v === 20;
      expect((out[k] === out[k + 2] && onBorder(out[k]!)) || (out[k + 1] === out[k + 3] && onBorder(out[k + 1]!))).toBe(true);
    }
  });
  it('two rooms side by side outline their shared side twice, once per room', () => {
    const out: number[] = [];
    tileEdges([0, 1], 2, 1, 0, 10, 0, 0, out); tileEdges([0, 1], 2, 1, 1, 10, 0, 0, out);
    expect(out.length / 4).toBe(8);
  });
});

describe('the own-ship look table (spec §2)', () => {
  it('normal, level 1, level 2 (hatch in phase 1 only)', () => {
    expect(ownRoomLook(0, false, LIT)).toEqual({ fill: CRT.glass, outline: CRT.main, hatch: false });
    expect(ownRoomLook(1, false, LIT)).toEqual({ fill: CRT.dim, outline: CRT.main, hatch: false });
    expect(ownRoomLook(2, false, LIT)).toEqual({ fill: CRT.dim, outline: CRT.main, hatch: true });
    expect(ownRoomLook(2, false, DARK)).toEqual({ fill: CRT.dim, outline: CRT.main, hatch: false });
  });
  it('fire overrides damage: hot or mid fill, hot outline, never a hatch', () => {
    for (const level of [0, 1, 2] as const) {
      expect(ownRoomLook(level, true, LIT)).toEqual({ fill: CRT.hot, outline: CRT.hot, hatch: false });
      expect(ownRoomLook(level, true, DARK)).toEqual({ fill: CRT.mid, outline: CRT.hot, hatch: false });
    }
  });
  it('damage never uses CRT.hot', () => {
    for (const level of [0, 1, 2] as const) for (const t of [LIT, DARK]) expect(ownRoomLook(level, false, t).fill).not.toBe(CRT.hot);
  });
});

describe('the model on a duel (spec §2, §4)', () => {
  it('a damaged room takes the table fill; level 2 hatches in phase 1 only', () => withDuel((d) => {
    d.tactical.systems[0].rooms[Room.Weapons] = 1; d.tactical.systems[0].rooms[Room.Engines] = 2;
    const w = d.interior.derived.roomTiles[roomOf(d, Room.Weapons)]![0]!, e = d.interior.derived.roomTiles[roomOf(d, Room.Engines)]![0]!;
    expect(tileOf(d, ownShipModel(d, box, LIT, 0), w).fill).toBe(CRT.dim);
    expect(tileOf(d, ownShipModel(d, box, LIT, 0), e).fill).toBe(CRT.dim);
    expect(ownShipModel(d, box, LIT, 0).hatch.length).toBeGreaterThan(0);
    expect(ownShipModel(d, box, DARK, 0).hatch).toEqual([]);
  }));
  it('a burning room at level 1 and 2: the fire fill in both phases, no hatch, a bar only once the extinguish has begun', () => withDuel((d) => {
    const room = roomOf(d, Room.Engines), k = d.interior.derived.roomTiles[room]![0]!, p = d.points.find((q) => q.room === room)!;
    igniteRoom(d.interior, room);
    for (const level of [1, 2]) {
      d.tactical.systems[0].rooms[Room.Engines] = level;
      expect(tileOf(d, ownShipModel(d, box, LIT, 0), k).fill).toBe(CRT.hot);
      expect(tileOf(d, ownShipModel(d, box, DARK, 0), k).fill).toBe(CRT.mid);
      expect(ownShipModel(d, box, LIT, 0).hatch).toEqual([]);
      expect(ownShipModel(d, box, LIT, 0).edges.find((g) => g.colour === CRT.hot)!.segments.length).toBeGreaterThan(0);
      expect(ownShipModel(d, box, LIT, 0).fires).toEqual([]);
    }
    d.interior.rooms.fireRepair[room] = 0.25;
    const fires = ownShipModel(d, box, LIT, 0).fires;
    expect(fires).toHaveLength(1);
    expect(fires[0]!.progress).toBe(extinguishProgress(d, p));
  }));
  it('the hull alerts at 25 % or below, with the block alternating hot and main', () => withDuel((d) => {
    const max = classOf(d.tactical, 0).hull, sys = d.tactical.systems[0];
    sys.hull = Math.floor(max / 4);
    expect(ownShipModel(d, box, LIT, 0).hull).toEqual({ value: sys.hull, fill: sys.hull / max, alert: true, block: CRT.hot });
    expect(ownShipModel(d, box, DARK, 0).hull.block).toBe(CRT.main);
    sys.hull = Math.floor(max / 4) + 1;
    expect(ownShipModel(d, box, LIT, 0).hull).toMatchObject({ alert: false, block: null });
  }));
  it('the shields match the crew ship', () => withDuel((d) => {
    d.tactical.systems[0].shields = 1;
    expect(ownShipModel(d, box, 0, 0).shields).toEqual({ up: 1, of: Math.max(classOf(d.tactical, 0).shields.layers, 1) });
  }));
  it('crew centres sit at origin + position * s; a downed crew member is marked', () => withDuel((d) => {
    const f = ownShipFit(d.interior.derived.width, d.interior.derived.height, box), eid = d.interior.crew[0]!;
    Life.state[eid] = LifeState.Downed;
    const v = ownShipModel(d, box, 0, 0);
    expect(v.crew[0]).toEqual({ x: f.ox + Position.x[eid]! * f.s, y: f.oy + Position.y[eid]! * f.s, downed: true });
    expect(v.crew).toHaveLength(d.interior.crew.length);
  }));
  it('flash only before flashUntil and in the lit phase', () => withDuel((d) => {
    expect(ownShipModel(d, box, LIT, LIT + 1).flash).toBe(true);
    expect(ownShipModel(d, box, DARK, 1).flash).toBe(false);
    expect(ownShipModel(d, box, LIT, LIT).flash).toBe(false);
  }));
});

describe('the fire watch (spec §4)', () => {
  it('first frame re-baselines; a new fire flashes for FIRE_FLASH_S; an old fire does not', () => withDuel((d) => {
    let r = fireWatch(null, d, 10, 0);
    expect(r.flashUntil).toBe(0);
    igniteRoom(d.interior, roomOf(d, Room.Shields));
    r = fireWatch(r.watch, d, 11, r.flashUntil);
    expect(r.flashUntil).toBe(11 + FIRE_FLASH_S);
    r = fireWatch(r.watch, d, 12, r.flashUntil);
    expect(r.flashUntil).toBe(11 + FIRE_FLASH_S);
  }));
  it('a stale tick (back, or more than HIT_FRESH_TICKS ahead) re-baselines with no flash', () => withDuel((d) => {
    const base = fireWatch(null, d, 0, 0).watch;
    igniteRoom(d.interior, roomOf(d, Room.Shields));
    d.tactical.tick = base.tick + 1000;
    expect(fireWatch(base, d, 1, 0).flashUntil).toBe(0);
    d.tactical.tick = base.tick - 1;
    expect(fireWatch({ ...base, tick: base.tick }, d, 1, 0).flashUntil).toBe(0);
  }));
});
