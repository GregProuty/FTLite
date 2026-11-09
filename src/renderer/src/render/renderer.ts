import { Application, Container, Graphics } from 'pixi.js';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable, Life, LifeState, Owner } from '../sim/components';
import { DoorState } from '../sim/grid';
import { CREW_HALF, FIRE_CAP } from '../sim/tuning';
import { computeLetterbox } from './letterbox';
import { syncCache } from './cache';

const CREW_COLORS = [0x4fc3f7, 0x81c784, 0xffb74d, 0xe57373];

export interface Renderer {
  app: Application; world: Container; hud: Container;
  resize(winW: number, winH: number): void;
  recordPrev(state: SimState): void;
  draw(state: SimState, alpha: number): void;
}

export async function createRenderer(): Promise<Renderer> {
  const app = new Application();
  await app.init({ width: INTERNAL_W, height: INTERNAL_H, background: 0x05060a, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);
  const world = new Container(); world.isRenderGroup = true;
  const hud = new Container(); hud.isRenderGroup = true;
  app.stage.addChild(world, hud);
  const tiles = new Graphics(), overlays = new Container(), breachLayer = new Graphics(), crewLayer = new Container();
  world.addChild(tiles, overlays, breachLayer, crewLayer);
  let doorCache: Uint8Array | null = null;
  const roomGfx: Graphics[] = [];
  const crewGfx = new Map<number, Graphics>();
  const prev = new Map<number, { x: number; y: number }>();

  function rebuildTiles(state: SimState): void {
    const d = state.derived;
    tiles.clear();
    for (let ty = 0; ty < d.height; ty++) for (let tx = 0; tx < d.width; tx++) {
      const i = ty * d.width + tx;
      const edge = d.doorTileToEdge[i]!;
      let color: number;
      if (edge >= 0) { const st = state.doors.state[edge]; color = st === DoorState.Open ? 0x3a4a3a : st === DoorState.Sealed ? 0x8a2a2a : 0x6a6a3a; }
      else if (d.wallTile[i]) color = state.layout.rows[ty]!.charAt(tx) === ' ' ? 0x05060a : 0x3b3f4a;
      else color = (tx + ty) % 2 ? 0x1b1e26 : 0x1f232c;
      tiles.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill(color);
    }
    doorCache = Uint8Array.from(state.doors.state);
  }

  return {
    app, world, hud,
    resize(winW, winH) {
      const lb = computeLetterbox(winW, winH, INTERNAL_W, INTERNAL_H);
      app.renderer.resize(winW, winH);
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
    },
    recordPrev(state) {
      for (const eid of state.crew) prev.set(Stable.id[eid]!, { x: Position.x[eid]!, y: Position.y[eid]! });
    },
    draw(state, alpha) {
      const d = state.derived;
      world.position.set(Math.floor((INTERNAL_W - d.width * TILE_PX) / 2), Math.floor((INTERNAL_H - d.height * TILE_PX) / 2));
      if (!doorCache || doorCache.some((v, i) => v !== state.doors.state[i])) rebuildTiles(state);
      while (roomGfx.length < d.volume.length) { const g = new Graphics(); roomGfx.push(g); overlays.addChild(g); }
      for (let r = 0; r < d.volume.length; r++) {
        const g = roomGfx[r]!; g.clear();
        const frac = state.rooms.o2[r]! / d.volume[r]!, fire = state.rooms.fire[r]!;
        for (const t of d.roomTiles[r]!) {
          const tx = t % d.width, ty = (t - tx) / d.width;
          if (frac < 1) g.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill({ color: 0xff2040, alpha: 0.6 * (1 - frac) });
          if (fire > 0) g.rect(tx * TILE_PX + 4, ty * TILE_PX + 4, TILE_PX - 8, TILE_PX - 8).fill({ color: 0xff8c1a, alpha: 0.3 + 0.7 * fire / FIRE_CAP });
        }
      }
      breachLayer.clear();
      for (let s = 0; s < d.siteTile.length; s++) if (state.breaches.active[s]) {
        const t = d.siteTile[s]!, tx = t % d.width, ty = (t - tx) / d.width;
        breachLayer.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill(0xff3030);
      }
      const liveIds = state.crew.map((eid) => Stable.id[eid]!);
      syncCache(crewGfx, liveIds, () => { const g = new Graphics(); crewLayer.addChild(g); return g; }, (g, id) => { g.destroy(); prev.delete(id); });
      for (const eid of state.crew) {
        const id = Stable.id[eid]!, g = crewGfx.get(id)!, p = prev.get(id) ?? { x: Position.x[eid]!, y: Position.y[eid]! };
        const x = p.x + (Position.x[eid]! - p.x) * alpha, y = p.y + (Position.y[eid]! - p.y) * alpha;
        const life = Life.state[eid];
        g.clear().circle(0, 0, CREW_HALF * TILE_PX).fill({ color: life === LifeState.Dead ? 0x777777 : CREW_COLORS[Owner.pid[eid]! % 4]!, alpha: life === LifeState.Downed ? 0.5 : 1 });
        g.position.set(x * TILE_PX, y * TILE_PX);
      }
    }
  };
}
