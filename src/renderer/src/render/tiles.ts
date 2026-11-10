import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import { floorVariant, wallVariant, wallKind } from './tilePick';
import { advanceDoor, doorTarget, doorFrame, initialDoorProgress, DOOR_ANIM_SECONDS } from './doorAnim';

export interface TileLayer { container: Container; build(state: SimState): void; update(state: SimState, dtSeconds: number): void }

/** Red tint on a sealed door when the pack has no distinct sealed frame (same red as LOW_O2_COLOR in effects.ts). */
export const SEALED_TINT = 0xd13a3a;

const SCALE = TILE_PX / 16;   // 16 px art drawn at 2x

function tileSprite(tex: Texture, tx: number, ty: number): Sprite {
  const s = new Sprite(tex); s.scale.set(SCALE); s.position.set(tx * TILE_PX, ty * TILE_PX); return s;
}
/** Tall art (16×32 walls or doors) sits on the bottom-left of its tile and extends one tile upward (spec §2). */
function bottomAnchored(tex: Texture, tx: number, ty: number): Sprite {
  const s = new Sprite(tex); s.scale.set(SCALE); s.anchor.set(0, 1); s.position.set(tx * TILE_PX, (ty + 1) * TILE_PX); return s;
}

/** The lower 16 px of a 16×32 door frame, for doors with a floor tile above them. */
function lowerHalf(t: Texture): Texture {
  return new Texture({ source: t.source, frame: new Rectangle(t.frame.x, t.frame.y + t.frame.height / 2, t.frame.width, t.frame.height / 2) });
}

/** Floors, walls and doors as plain sprites. Built once per layout (never rebuilt in Increment 1); doors are reconciled every frame. */
export function createTileLayer(assets: GameAssets, memory: RenderMemory): TileLayer {
  const container = new Container();
  const floors = new Container(), walls = new Container(), doors = new Container();
  container.addChild(floors, walls, doors);
  const doorSprites: Sprite[] = [];        // per edge index; non-door edges have no sprite
  const openFrames = assets.animation('door.open').textures;
  const sealed = assets.texture('door.sealed');
  const openHalf = openFrames.map(lowerHalf), sealedHalf = lowerHalf(sealed);
  const halfDoor: boolean[] = [];          // per edge: door has a floor above, draws lower half only
  let builtFor: string | null = null;

  function build(state: SimState): void {
      const d = state.derived, rows = state.layout.rows;
      for (const c of floors.removeChildren()) c.destroy();
      for (const c of walls.removeChildren()) c.destroy();
      for (const c of doors.removeChildren()) c.destroy();
      doorSprites.length = 0; halfDoor.length = 0;
      for (let ty = 0; ty < d.height; ty++) for (let tx = 0; tx < d.width; tx++) {
        const i = ty * d.width + tx, c = rows[ty]!.charAt(tx);
        if (c === ' ') continue;                                                  // void: nothing drawn
        if (c === '#') {
          if (wallKind(rows, tx, ty) === 'tall') walls.addChild(bottomAnchored(assets.texture(wallVariant(i)), tx, ty));
          else walls.addChild(tileSprite(assets.texture('wall.flat'), tx, ty));
          continue;
        }
        const room = d.roomOfTile[i]!;
        const variant = room >= 0 ? floorVariant(room) : floorVariant(i);          // door tiles get a floor underneath
        floors.addChild(tileSprite(assets.texture(`floor.${variant}`), tx, ty));
      }
      for (let e = 0; e < d.edgeIsDoor.length; e++) {
        if (!d.edgeIsDoor[e]) continue;
        const t = d.edgeTile[e]!, tx = t % d.width, ty = (t - tx) / d.width;
        const half = wallKind(rows, tx, ty) === 'flat'; halfDoor[e] = half;
        const s = bottomAnchored((half ? openHalf : openFrames)[0]!, tx, ty); doors.addChild(s); doorSprites[e] = s;
      }
      builtFor = d.layoutHash;
  }

  return {
    container, build,
    update(state, dt) {
      if (builtFor !== state.derived.layoutHash) build(state);
      const E = state.doors.state.length;
      if (!memory.doorProgress) memory.doorProgress = Array.from(state.doors.state, (st) => initialDoorProgress(st));
      for (let e = 0; e < E; e++) {
        const s = doorSprites[e]; if (!s) continue;
        const st = state.doors.state[e]!;
        memory.doorProgress[e] = advanceDoor(memory.doorProgress[e]!, doorTarget(st), dt, DOOR_ANIM_SECONDS);
        const f = doorFrame(st, memory.doorProgress[e]!, openFrames.length);
        const half = halfDoor[e] === true;
        s.texture = f.kind === 'sealed' ? (half ? sealedHalf : sealed) : (half ? openHalf : openFrames)[f.frame]!;
        s.tint = f.kind === 'sealed' ? SEALED_TINT : 0xffffff;
      }
    }
  };
}
