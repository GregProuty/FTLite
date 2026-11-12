import { Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import { DoorState, doorIsOpen } from '../sim/grid';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';

export interface TileLayer { container: Container; build(state: SimState): void; update(state: SimState, dtSeconds: number): void }

export const FLOOR = 0xc9cdd6, WALL = 0x3b4150, DOOR = 0x8a909e, DOOR_LINE = 0x5f6575, SEALED = 0xb05a4a;
const JAMB = 3, LINE = 2;

/** Flat floors, walls and doors. Floors and walls are built once per layout; doors are redrawn every frame from the door state. */
export function createTileLayer(_assets: GameAssets, _memory: RenderMemory): TileLayer {
  const container = new Container();
  const base = new Graphics(), doors = new Graphics();
  container.addChild(base, doors);
  let builtFor: string | null = null;

  function build(state: SimState): void {
    const d = state.derived, rows = state.layout.rows;
    base.clear();
    for (let ty = 0; ty < d.height; ty++) for (let tx = 0; tx < d.width; tx++) {
      const c = rows[ty]!.charAt(tx);
      if (c === ' ') continue;
      base.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill(c === '#' ? WALL : FLOOR);
    }
    builtFor = d.layoutHash;
  }

  return {
    container, build,
    update(state) {
      if (builtFor !== state.derived.layoutHash) build(state);
      const d = state.derived, rows = state.layout.rows;
      const isWall = (x: number, y: number): boolean => rows[y]?.charAt(x) === '#';
      doors.clear();
      for (let e = 0; e < d.edgeIsDoor.length; e++) {
        if (!d.edgeIsDoor[e]) continue;
        const t = d.edgeTile[e]!, tx = t % d.width, ty = (t - tx) / d.width, x = tx * TILE_PX, y = ty * TILE_PX;
        const st = state.doors.state[e]!;
        const wallsSideways = isWall(tx - 1, ty) && isWall(tx + 1, ty);          // walls left and right: passage runs vertically
        if (doorIsOpen(st)) {
          if (wallsSideways) { doors.rect(x, y, JAMB, TILE_PX).fill(DOOR); doors.rect(x + TILE_PX - JAMB, y, JAMB, TILE_PX).fill(DOOR); }
          else { doors.rect(x, y, TILE_PX, JAMB).fill(DOOR); doors.rect(x, y + TILE_PX - JAMB, TILE_PX, JAMB).fill(DOOR); }
        } else {
          doors.rect(x, y, TILE_PX, TILE_PX).fill(st === DoorState.Sealed ? SEALED : DOOR);
          if (st !== DoorState.Sealed) {
            if (wallsSideways) doors.rect(x, y + TILE_PX / 2 - LINE / 2, TILE_PX, LINE).fill(DOOR_LINE);
            else doors.rect(x + TILE_PX / 2 - LINE / 2, y, LINE, TILE_PX).fill(DOOR_LINE);
          }
        }
      }
    }
  };
}
