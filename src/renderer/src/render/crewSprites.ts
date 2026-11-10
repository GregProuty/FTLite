import { AnimatedSprite, Container, Graphics, type Texture } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable, Life, LifeState, Owner } from '../sim/components';
import { CREW_HALF } from '../sim/tuning';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import type { Facing8 } from './assetNames';
import { facingFromDelta, MOVE_EPS_PX } from './facing';
import { featureReady } from './fallback';
import { syncCache } from './cache';

export const CREW_COLORS = [0x4fc3f7, 0x81c784, 0xffb74d, 0xe57373];
const DEAD_TINT = 0x777777;
const SCALE = TILE_PX / 16;
const ANCHOR_X = 0.5, ANCHOR_Y = 0.75;   // spec §2: feet at the bottom of the 0.6-tile collision box

export interface CrewLayer { container: Container; draw(state: SimState, alpha: number): void }

interface CrewSprite { sprite: AnimatedSprite; anim: string | null }

/** One AnimatedSprite per crew member, keyed by StableId. Falls back to the Increment 1 circles when any crew name is missing. */
export function createCrewLayer(assets: GameAssets, memory: RenderMemory): CrewLayer {
  const container = new Container();
  const useArt = featureReady(new Set(assets.missing), 'crew');
  const sprites = new Map<number, CrewSprite>();
  const circles = new Map<number, Graphics>();

  /** Interpolated draw position, and the movement since the last drawn frame (not since the last tick: a paused sim must read as idle). */
  const interpolated = (eid: number, alpha: number): { x: number; y: number; dx: number; dy: number } => {
    const id = Stable.id[eid]!, p = memory.prev.get(id) ?? { x: Position.x[eid]!, y: Position.y[eid]! };
    const x = p.x + (Position.x[eid]! - p.x) * alpha, y = p.y + (Position.y[eid]! - p.y) * alpha;
    const last = memory.lastDrawn.get(id) ?? { x, y };
    memory.lastDrawn.set(id, { x, y });
    return { x, y, dx: x - last.x, dy: y - last.y };
  };

  const setAnim = (cs: CrewSprite, name: string, textures: Texture[], fps: number, loop: boolean, startFrame = 0): void => {
    if (cs.anim === name) return;
    cs.anim = name;
    cs.sprite.textures = textures; cs.sprite.animationSpeed = fps / 60; cs.sprite.loop = loop;
    if (textures.length > 1) cs.sprite.gotoAndPlay(startFrame % textures.length); else cs.sprite.gotoAndStop(0);
  };

  return {
    container,
    draw(state, alpha) {
      const liveIds = state.crew.map((eid) => Stable.id[eid]!);
      if (!useArt) {
        syncCache(circles, liveIds, () => { const g = new Graphics(); container.addChild(g); return g; }, (g, id) => { g.destroy(); memory.prev.delete(id); memory.lastDrawn.delete(id); });
        for (const eid of state.crew) {
          const g = circles.get(Stable.id[eid]!)!, { x, y } = interpolated(eid, alpha), life = Life.state[eid];
          g.clear().circle(0, 0, CREW_HALF * TILE_PX).fill({ color: life === LifeState.Dead ? DEAD_TINT : CREW_COLORS[Owner.pid[eid]! % 4]!, alpha: life === LifeState.Downed ? 0.5 : 1 });
          g.position.set(x * TILE_PX, y * TILE_PX);
        }
        return;
      }
      syncCache(sprites, liveIds,
        () => { const s = new AnimatedSprite([assets.texture('crew.idle.s')]); s.anchor.set(ANCHOR_X, ANCHOR_Y); s.scale.set(SCALE); container.addChild(s); return { sprite: s, anim: null }; },
        (cs, id) => { cs.sprite.destroy(); memory.prev.delete(id); memory.lastDrawn.delete(id); memory.facing.delete(id); });
      for (const eid of state.crew) {
        const id = Stable.id[eid]!, cs = sprites.get(id)!, { x, y, dx, dy } = interpolated(eid, alpha);
        const facing: Facing8 = facingFromDelta(dx, dy, memory.facing.get(id) ?? 's');
        memory.facing.set(id, facing);
        const life = Life.state[eid];
        const moving = Math.abs(dx) >= MOVE_EPS_PX || Math.abs(dy) >= MOVE_EPS_PX;
        if (life !== LifeState.Conscious) setAnim(cs, 'crew.down', [assets.texture('crew.down')], 1, false);
        else if (!moving) setAnim(cs, `crew.idle.${facing}`, [assets.texture(`crew.idle.${facing}`)], 1, false);
        else { const a = assets.animation(`crew.walk.${facing}`); setAnim(cs, `crew.walk.${facing}`, a.textures, a.fps, a.loop, id); }
        cs.sprite.tint = life === LifeState.Dead ? DEAD_TINT : CREW_COLORS[Owner.pid[eid]! % 4]!;
        cs.sprite.alpha = life === LifeState.Downed ? 0.85 : 1;
        cs.sprite.position.set(x * TILE_PX, y * TILE_PX);
      }
    }
  };
}
