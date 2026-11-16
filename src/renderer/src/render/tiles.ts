import { Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import { airlockDraw, airlockOutward } from './hazardTiles';
import { advanceDoor, doorTarget, DOOR_ANIM_SECONDS } from './doorAnim';
import { wallPicture, type Cell } from './wallModel';
import { doorPicture, doorLook, PANEL_STROKE, type DoorPicture, type DoorRect } from './doorModel';
import { ROLE } from './palette';

export interface TileLayer { container: Container; build(state: SimState): void; update(state: SimState, dtSeconds: number): void }

export const FLOOR = 0xc9cdd6, WALL = 0x3b4150;

/** Flat floors and walls, built once per layout; doors and airlocks redrawn every frame from the door model (spec Demo-x-c section 2), their slide driven by the door animation. */
export function createTileLayer(_assets: GameAssets, _memory: RenderMemory): TileLayer {
  const container = new Container();
  const base = new Graphics(), doors = new Graphics();
  container.addChild(base, doors);
  let builtFor: string | null = null;
  const doorProgress = new Map<number, number>(), lockProgress = new Map<number, number>();

  function build(state: SimState): void {
    const d = state.derived, rows = state.layout.rows;
    base.clear();
    const cell = (x: number, y: number): Cell => { const c = rows[y]?.charAt(x) ?? ' '; return c === '' || c === ' ' ? 'space' : c === '#' ? 'wall' : c === '+' ? 'door' : 'floor'; };
    for (let ty = 0; ty < d.height; ty++) for (let tx = 0; tx < d.width; tx++) {
      const c = cell(tx, ty), x = tx * TILE_PX, y = ty * TILE_PX;
      if (c === 'space') continue;
      if (c !== 'wall') { base.rect(x, y, TILE_PX, TILE_PX).fill(FLOOR); continue; }
      const p = wallPicture(cell(tx, ty - 1), cell(tx + 1, ty), cell(tx, ty + 1), cell(tx - 1, ty), cell(tx + 1, ty - 1), cell(tx + 1, ty + 1), cell(tx - 1, ty + 1), cell(tx - 1, ty - 1));   // thin walls, as thick as a door (the user, 2026-11-13)
      for (const r of p.floor) base.rect(x + r.x, y + r.y, r.w, r.h).fill(FLOOR);
      for (const r of p.band) base.rect(x + r.x, y + r.y, r.w, r.h).fill(WALL);
    }
    builtFor = d.layoutHash; doorProgress.clear(); lockProgress.clear();
  }

  const at = (x: number, y: number, r: DoorRect) => doors.rect(x + r.x, y + r.y, r.w, r.h);
  function draw(x: number, y: number, p: DoorPicture): void {
    if (p.gap) at(x, y, p.gap).fill(ROLE.spaceGap);
    if (p.floor) at(x, y, p.floor).fill(FLOOR);
    for (const j of p.jambs) at(x, y, j).fill(p.outline);
    for (const r of p.panels) at(x, y, r).fill(p.fill).stroke({ width: PANEL_STROKE, color: p.outline, alignment: 1 });
    for (const s of p.stripes) at(x, y, s).fill(p.outline);
    if (p.seam) at(x, y, p.seam).fill(p.outline);
    if (p.bar) at(x, y, p.bar).fill(p.outline);
    for (const t of p.ticks) at(x, y, t).fill(ROLE.heldTick);
  }
  const step = (m: Map<number, number>, k: number, target: 0 | 1, dt: number): number => { const v = advanceDoor(m.get(k) ?? target, target, dt, DOOR_ANIM_SECONDS); m.set(k, v); return v; };

  return {
    container, build,
    update(state, dt) {
      if (builtFor !== state.derived.layoutHash) build(state);
      const d = state.derived, rows = state.layout.rows;
      const isWall = (x: number, y: number): boolean => rows[y]?.charAt(x) === '#';
      doors.clear();
      for (let e = 0; e < d.edgeIsDoor.length; e++) {
        if (!d.edgeIsDoor[e]) continue;
        const t = d.edgeTile[e]!, tx = t % d.width, ty = (t - tx) / d.width;
        const st = state.doors.state[e]!, look = doorLook(st);
        const progress = look === 'sealed' ? (doorProgress.set(e, 0), 0) : step(doorProgress, e, doorTarget(st), dt);   // sealing is instant
        draw(tx * TILE_PX, ty * TILE_PX, doorPicture(look, progress, isWall(tx - 1, ty) && isWall(tx + 1, ty) ? 'x' : 'y'));   // walls left and right: the wall runs across, the panels slide sideways
      }
      for (let k = 0; k < d.airlockTile.length; k++) {
        const t = d.airlockTile[k]!, tx = t % d.width, ty = (t - tx) / d.width;
        const open = airlockDraw(state, k).open, progress = step(lockProgress, k, open ? 1 : 0, dt);
        draw(tx * TILE_PX, ty * TILE_PX, doorPicture(open ? 'open' : 'closed', progress, airlockOutward(d, k).dy !== 0 ? 'x' : 'y', true));   // space above or below: the hull runs across
      }
    }
  };
}
