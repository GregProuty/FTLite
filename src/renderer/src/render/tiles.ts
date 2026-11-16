import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import { airlockDraw, airlockOutward } from './hazardTiles';
import { advanceDoor, doorTarget, DOOR_ANIM_SECONDS } from './doorAnim';
import { floorSeams, houseFloorName, wallPicture, type Cell } from './wallModel';
import { doorPicture, doorLook, PANEL_STROKE, type DoorPicture, type DoorRect } from './doorModel';
import { featureReady } from './fallback';
import { ROLE } from './palette';

export interface TileLayer { container: Container; build(state: SimState): void; update(state: SimState, dtSeconds: number): void }

/** World units per art pixel: art is drawn at 16 px a tile and shown at 2x (Art-i spec section 1). */
const ART = TILE_PX / 16;

/**
 * Floors and walls, built once per layout; doors and airlocks redrawn every frame from the door model (spec Demo-x-c section 2), their slide driven by the door animation.
 * Art-i spec section 4: colours are palette roles; walls get a light top-left edge and a shadow bottom-right edge; floors a one-art-pixel seam;
 * when the houseFloor feature is ready the floors draw house.floor.N instead of the procedural plating (walls stay procedural thin bands).
 */
export function createTileLayer(assets: GameAssets, _memory: RenderMemory): TileLayer {
  const container = new Container();
  const floorArt = new Container(), base = new Graphics(), doors = new Graphics();
  container.addChild(floorArt, base, doors);
  const art = featureReady(new Set(assets.missing), 'houseFloor');
  let builtFor: string | null = null;
  const doorProgress = new Map<number, number>(), lockProgress = new Map<number, number>();

  /** A floor sprite covering `r` (tile-local world units) of the tile at (x, y), cut from the matching part of the 16 px art. */
  function floorSprite(tile: number, x: number, y: number, r: DoorRect): void {
    const tex = assets.texture(houseFloorName(tile)), f = tex.frame;
    const part = new Texture({ source: tex.source, frame: new Rectangle(f.x + r.x / ART, f.y + r.y / ART, r.w / ART, r.h / ART) });
    const s = new Sprite(part); s.scale.set(ART); s.position.set(x + r.x, y + r.y); floorArt.addChild(s);
  }
  function floor(tile: number, x: number, y: number, r: DoorRect, seams: boolean): void {
    if (art) { floorSprite(tile, x, y, r); return; }
    base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.floor);
    if (seams) for (const s of floorSeams()) base.rect(x + s.x, y + s.y, s.w, s.h).fill(ROLE.floorSeam);
  }

  function build(state: SimState): void {
    const d = state.derived, rows = state.layout.rows;
    base.clear();
    for (const c of floorArt.removeChildren()) c.destroy({ texture: true, textureSource: false });   // the per-part sub-textures go; the shared source stays
    const cell = (x: number, y: number): Cell => { const c = rows[y]?.charAt(x) ?? ' '; return c === '' || c === ' ' ? 'space' : c === '#' ? 'wall' : c === '+' ? 'door' : 'floor'; };
    for (let ty = 0; ty < d.height; ty++) for (let tx = 0; tx < d.width; tx++) {
      const c = cell(tx, ty), x = tx * TILE_PX, y = ty * TILE_PX, tile = ty * d.width + tx;
      if (c === 'space') continue;
      if (c !== 'wall') { floor(tile, x, y, { x: 0, y: 0, w: TILE_PX, h: TILE_PX }, true); continue; }
      const p = wallPicture(cell(tx, ty - 1), cell(tx + 1, ty), cell(tx, ty + 1), cell(tx - 1, ty), cell(tx + 1, ty - 1), cell(tx + 1, ty + 1), cell(tx - 1, ty + 1), cell(tx - 1, ty - 1));   // thin walls, as thick as a door (the user, 2026-11-13)
      for (const r of p.floor) floor(tile, x, y, r, false);
      for (const r of p.band) base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.wall);
      for (const r of p.shadow) base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.wallShadow);
      for (const r of p.light) base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.wallLight);
    }
    builtFor = d.layoutHash; doorProgress.clear(); lockProgress.clear();
  }

  const at = (x: number, y: number, r: DoorRect) => doors.rect(x + r.x, y + r.y, r.w, r.h);
  function draw(x: number, y: number, p: DoorPicture): void {
    if (p.gap) at(x, y, p.gap).fill(ROLE.spaceGap);
    if (p.floor && !art) at(x, y, p.floor).fill(ROLE.floor);   // with floor art the doorway shows the art drawn under it
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
