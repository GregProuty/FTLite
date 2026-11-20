import { AnimatedSprite, Container, Graphics, type Texture } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { boarderMarkers, roomCentre } from '../sim/boarders';
import { syncCache } from './cache';
import type { GameAssets } from './assets';
import { featureReady } from './fallback';
import { facingFromDelta, MOVE_EPS_PX } from './facing';
import type { Facing8 } from './assetNames';
import { BOARDER_TINT, freshWalker, stepWalker, type Walker } from './boarderModel';
import { BOARDER_BAR_LIFT_3D, boarderPose, CREW3D_ANCHOR_X, CREW3D_SCALE } from './crew3dModel';
import { Life, LifeState, Position } from '../sim/components';
import { roomAt } from '../sim/grid';

const SCALE = TILE_PX / 16, ANCHOR_X = 0.5, ANCHOR_Y = 0.75;
const SPREAD = 2;   // the sim seats boarders 0.4 tiles apart; the figures are wider, so draw them 0.8 apart
const BAR_W = 18, BAR_H = 3, BAR_Y = -30;

interface Figure { root: Container; body: AnimatedSprite | Graphics; bar: Graphics; walker: Walker; facing: Facing8; anim: string | null }

/** Drawn humanoid for when the crew art is missing (and in tests): a red-suited figure with a dark visor. */
function drawFigure(g: Graphics): void {
  g.clear();
  g.rect(-5, -4, 10, 12).fill(BOARDER_TINT).stroke({ width: 1, color: 0x1b1b1b, alignment: 1 });   // body
  g.rect(-5, 8, 4, 6).fill(0x5d1010); g.rect(1, 8, 4, 6).fill(0x5d1010);                            // legs
  g.circle(0, -10, 6).fill(BOARDER_TINT).stroke({ width: 1, color: 0x1b1b1b, alignment: 1 });        // helmet
  g.rect(-4, -12, 8, 3).fill(0x1b1b1b);                                                               // visor
}

/** One walking figure per boarder (crew art tinted hostile red, with a health bar), keyed by StableId; it walks to its room through the door. */
export function createBoarderLayer(assets?: GameAssets, crew3d: () => boolean = () => true): { container: Container; draw(state: SimState, dtSeconds?: number): void } {
  const container = new Container();
  const useArt = !!assets && featureReady(new Set(assets.missing), 'crew');
  const use3d = !!assets && featureReady(new Set(assets.missing), 'crew3d');   // Crew3D spec section 4: the rendered raider, untinted
  let was3d = false;
  const figs = new Map<number, Figure>();
  const setAnim = (f: Figure, name: string, textures: Texture[], fps: number): void => {
    if (f.anim === name || !(f.body instanceof AnimatedSprite)) return;
    f.anim = name; f.body.textures = textures; f.body.animationSpeed = fps / 60; f.body.loop = true;
    if (textures.length > 1) f.body.gotoAndPlay(0); else f.body.gotoAndStop(0);
  };
  return {
    container,
    draw(state, dt = 1 / 60) {
      const b = state.boarders, roomOf = new Map<number, number>();
      for (let k = 0; k < b.active.length; k++) if (b.active[k]) roomOf.set(b.stableId[k]!, b.room[k]!);
      const in3d = use3d && crew3d();
      if (in3d !== was3d) { syncCache(figs, [], () => { throw new Error('unreachable'); }, (f) => { f.root.destroy({ children: true }); }); was3d = in3d; }   // the dev toggle rebuilds the figures
      const markers = boarderMarkers(state).map((m) => { const room = roomOf.get(m.stableId) ?? -1, cx = room >= 0 ? roomCentre(state, room)[0] : m.x; return { ...m, room, x: cx + (m.x - cx) * SPREAD }; }), byId = new Map(markers.map((m) => [m.stableId, m]));
      syncCache(figs, markers.map((m) => m.stableId), (id) => {
        const m = byId.get(id)!, root = new Container();
        let body: AnimatedSprite | Graphics;
        if (in3d) { const p = boarderPose(false, false, 's'), s = new AnimatedSprite(assets!.animation(p.name).textures); s.anchor.set(CREW3D_ANCHOR_X, p.anchorY); s.scale.set(CREW3D_SCALE); body = s; }
        else if (useArt) { const s = new AnimatedSprite([assets!.texture('crew.idle.s')]); s.anchor.set(ANCHOR_X, ANCHOR_Y); s.scale.set(SCALE); s.tint = BOARDER_TINT; body = s; }
        else { const g = new Graphics(); drawFigure(g); body = g; }
        const bar = new Graphics();
        root.addChild(body, bar); container.addChild(root);
        const fig: Figure = { root, body, bar, walker: freshWalker(m), facing: 's', anim: null }; return fig;
      }, (f) => { f.root.destroy({ children: true }); });
      for (const m of markers) {
        const f = figs.get(m.stableId)!, { dx, dy } = stepWalker(state, f.walker, m, dt);
        f.root.position.set(f.walker.x * TILE_PX, f.walker.y * TILE_PX);
        if (in3d) {
          const moving = Math.abs(dx) >= MOVE_EPS_PX || Math.abs(dy) >= MOVE_EPS_PX;
          // it fights the first conscious crew member in its room (the sim's rule), and turns to face them
          const foe = moving ? undefined : state.crew.find((eid) => Life.state[eid] === LifeState.Conscious && roomAt(state, Position.x[eid]!, Position.y[eid]!) === m.room);
          f.facing = foe === undefined ? facingFromDelta(dx, dy, f.facing) : facingFromDelta(Position.x[foe]! - f.walker.x, Position.y[foe]! - f.walker.y, f.facing);
          const p = boarderPose(foe !== undefined, moving, f.facing), a = assets!.animation(p.name);
          setAnim(f, p.name, a.textures, a.fps); (f.body as AnimatedSprite).anchor.set(CREW3D_ANCHOR_X, p.anchorY);
        } else if (useArt) {
          f.facing = facingFromDelta(dx, dy, f.facing);
          const moving = Math.abs(dx) >= MOVE_EPS_PX || Math.abs(dy) >= MOVE_EPS_PX;
          if (moving) { const a = assets!.animation(`crew.walk.${f.facing}`); setAnim(f, `crew.walk.${f.facing}`, a.textures, a.fps); }
          else setAnim(f, `crew.idle.${f.facing}`, [assets!.texture(`crew.idle.${f.facing}`)], 1);
        }
        const h = Math.max(0, Math.min(1, m.health));
        const barY = in3d ? -BOARDER_BAR_LIFT_3D : BAR_Y;   // over the taller rendered figure
        f.bar.clear().rect(-BAR_W / 2 - 1, barY - 1, BAR_W + 2, BAR_H + 2).fill(0x1b1b1b).rect(-BAR_W / 2, barY, Math.round(BAR_W * h), BAR_H).fill(0x8fe06a);   // green on the red suit, as the crew bars
      }
    }
  };
}
