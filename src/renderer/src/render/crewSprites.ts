import { AnimatedSprite, Container, Graphics, type Texture } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable, Life, LifeState, Owner, Seated } from '../sim/components';
import { CREW_HALF } from '../sim/tuning';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import type { Facing8 } from './assetNames';
import { facingFromDelta, MOVE_EPS_PX } from './facing';
import { featureReady } from './fallback';
import { syncCache } from './cache';
import { drawTorpedo } from './torpedoLayer';
import { CARRY_LIFT_LIMEZU, CARRY_LIFT_PUNY, crewPose, crewSlot, crewStandName, LIMEZU_ANCHOR_Y, type CrewPoseState } from './crewArt';
import { stationSides, type Side } from './consoleModel';
import { CREW_COLORS, tokenLook } from './tokenModel';
import { battlemapFor } from './battlemapModel';
import { drawPaintedToken } from './painted/tokenDraw';
import { CARRY_LIFT_3D, CREW3D_ANCHOR_X, CREW3D_SCALE, crew3dPose } from './crew3dModel';
import type { Working } from './particles/sources';
import type { PresentationPoint } from '../../../network/state/timeline';

export { CREW_COLORS };
const DEAD_TINT = 0x777777;
const SCALE = TILE_PX / 16;
/** A painted token's walk phase: radians per tile walked (about one stride cycle per 0.7 tile). */
const STRIDE_PER_TILE = (2 * Math.PI) / 0.7;
const ANCHOR_X = 0.5, ANCHOR_Y = 0.75;   // spec §2: feet at the bottom of the 0.6-tile collision box

/** `bob`: per player, a world-unit lift for a working crew member (Art-i spec section 6); absent or undefined is 0.
 *  `working`: who is working on what this frame (Crew3D spec section 4): the 3D crew play their work poses from it. */
export interface CrewLayer { container: Container; draw(state: SimState, alpha: number, presentation?: readonly PresentationPoint[], bob?: readonly (number | undefined)[], working?: readonly Working[]): void }

interface CrewSprite { sprite: AnimatedSprite; anim: string | null }
/** A 3D crew member: the rendered figure and, over it, the team-colour layer, which shows the same frame. */
interface Crew3dFigure { root: Container; base: AnimatedSprite; mask: AnimatedSprite; anim: string | null }

/** One AnimatedSprite per crew member, keyed by StableId. Falls back to the Increment 1 circles when any crew name is missing.
 *  With the crewArt feature (Art-ii spec section 1) each player wears their own LimeZu character (slot pid % 4), untinted;
 *  without it the Puny sheet draws, tinted per player, as before. */
export function createCrewLayer(assets: GameAssets, memory: RenderMemory, crew3d: () => boolean = () => true): CrewLayer {
  const container = new Container();
  const use3d = featureReady(new Set(assets.missing), 'crew3d');   // Crew3D spec section 4: tried first, on every ship
  const figures = new Map<number, Crew3dFigure>();
  const useArt = featureReady(new Set(assets.missing), 'crew');
  const useSit = featureReady(new Set(assets.missing), 'sit');
  const useLimeZu = useArt && featureReady(new Set(assets.missing), 'crewArt');   // the circle fallback still wins when Puny is missing
  const carryLift = useLimeZu ? CARRY_LIFT_LIMEZU : CARRY_LIFT_PUNY;
  let sides: Side[] = [], sidesFor = '';
  const sprites = new Map<number, CrewSprite>();
  const circles = new Map<number, Graphics>();
  const missing = new Set(assets.missing);
  const tokens = new Map<number, Graphics>(), strides = new Map<number, number>();   // a painted token's walk phase, by StableId
  const carried = new Container(), torps = new Map<number, Graphics>();   // a torpedo in a carrier's arms (spec Coop-ii section 2), drawn over every crew sprite
  const drawCarried = (state: SimState, eid: number, pid: number, x: number, y: number, lift = carryLift): void => {
    const g = torps.get(Stable.id[eid]!)!;
    g.visible = state.carrying[pid] === 1 && Life.state[eid] === LifeState.Conscious;
    g.position.set(x * TILE_PX, y * TILE_PX - lift);   // held overhead, clear of the sprite's head
  };
  const forget = (id: number): void => { memory.prev.delete(id); memory.lastDrawn.delete(id); memory.facing.delete(id); };
  const newFigure = (): Crew3dFigure => {
    const root = new Container(), first = assets.animation(crew3dPose({ pid: 0, life: 'conscious', seated: false, seatSide: null, working: null, facing: 's', moving: false }).name).textures;
    const base = new AnimatedSprite(first), mask = new AnimatedSprite(first);
    for (const s of [base, mask]) { s.scale.set(CREW3D_SCALE); root.addChild(s); }
    container.addChild(root);
    return { root, base, mask, anim: null };
  };
  /** The 3D crew (Crew3D spec section 4): two sprites per member, the figure and its colour layer tinted with the
   *  player colour, on the same frame. Lower on the screen draws in front. */
  const draw3d = (state: SimState, alpha: number, liveIds: number[], pointFor: (eid: number) => PresentationPoint | undefined, bob: readonly (number | undefined)[], working: readonly Working[]): void => {
    syncCache(sprites, [], () => { throw new Error('unreachable'); }, (cs) => cs.sprite.destroy());
    syncCache(circles, [], () => { throw new Error('unreachable'); }, (g) => g.destroy());
    syncCache(tokens, [], () => { throw new Error('unreachable'); }, (g, id) => { g.destroy(); strides.delete(id); });
    syncCache(figures, liveIds, newFigure, (f, id) => { f.root.destroy({ children: true }); forget(id); });
    container.sortableChildren = true; carried.zIndex = Number.MAX_SAFE_INTEGER;
    if (sidesFor !== state.derived.layoutHash) { sides = stationSides(state); sidesFor = state.derived.layoutHash; }
    for (const eid of state.crew) {
      const id = Stable.id[eid]!, f = figures.get(id)!, pid = Owner.pid[eid]!, { x, y, dx, dy } = interpolated(eid, alpha, pointFor(eid));
      const facing: Facing8 = facingFromDelta(dx, dy, memory.facing.get(id) ?? 's'); memory.facing.set(id, facing);
      const seat = Seated.station[eid]!, l = Life.state[eid], work = working.find((w) => w.pid === pid);
      const p = crew3dPose({
        pid, life: l === LifeState.Conscious ? 'conscious' : l === LifeState.Downed ? 'downed' : 'dead', seated: seat >= 0, seatSide: seat >= 0 ? sides[seat] ?? null : null,
        working: work ? { kind: work.kind, facing: facingFromDelta(work.x - x * TILE_PX, work.y - y * TILE_PX, facing) } : null,
        facing, moving: Math.abs(dx) >= MOVE_EPS_PX || Math.abs(dy) >= MOVE_EPS_PX
      });
      if (f.anim !== p.name) {
        const a = assets.animation(p.name), m = assets.animation(p.mask);
        f.anim = p.name; f.base.textures = a.textures; f.mask.textures = m.textures;
        f.base.animationSpeed = a.fps / 60; f.base.loop = a.loop;
        if (a.textures.length > 1) f.base.gotoAndPlay(p.anim === 'walk' ? id % a.textures.length : 0); else f.base.gotoAndStop(0);
      }
      f.mask.gotoAndStop(f.base.currentFrame);   // the colour layer never runs its own clock
      for (const s of [f.base, f.mask]) s.anchor.set(CREW3D_ANCHOR_X, p.anchorY);
      f.base.tint = p.tint; f.mask.tint = p.maskTint; f.root.alpha = p.alpha;
      f.root.position.set(x * TILE_PX, y * TILE_PX + (bob[pid] ?? 0)); f.root.zIndex = y;
      drawCarried(state, eid, pid, x, y, CARRY_LIFT_3D);
    }
  };

  /** Interpolated draw position, and the movement since the last drawn frame (not since the last tick: a paused sim must read as idle). */
  const interpolated = (eid: number, alpha: number, point?: PresentationPoint): { x: number; y: number; dx: number; dy: number } => {
    const id = Stable.id[eid]!, p = memory.prev.get(id) ?? { x: Position.x[eid]!, y: Position.y[eid]! };
    const x = point?.x ?? p.x + (Position.x[eid]! - p.x) * alpha, y = point?.y ?? p.y + (Position.y[eid]! - p.y) * alpha;
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
    draw(state, alpha, presentation, bob = [], working = []) {
      const pointFor = (eid: number) => presentation?.find(point => point.id === `crew:${state.crew.indexOf(eid)}`);
      const liveIds = state.crew.map((eid) => Stable.id[eid]!);
      if (carried.parent !== container) container.addChild(carried); else container.setChildIndex(carried, container.children.length - 1);
      syncCache(torps, liveIds, () => { const g = new Graphics(); drawTorpedo(g, 0, 0, 20); carried.addChild(g); return g; }, (g) => { g.destroy(); });
      if (use3d && crew3d()) { draw3d(state, alpha, liveIds, pointFor, bob, working); return; }
      syncCache(figures, [], () => { throw new Error('unreachable'); }, (f) => f.root.destroy({ children: true }));
      container.sortableChildren = false;
      if (battlemapFor(state.layout.id, missing)) {   // Art-iv spec section 5: VTT tokens on a painted ship
        syncCache(sprites, [], () => { throw new Error('unreachable'); }, (cs) => cs.sprite.destroy());
        syncCache(circles, [], () => { throw new Error('unreachable'); }, (g) => g.destroy());
        syncCache(tokens, liveIds, () => { const g = new Graphics(); container.addChild(g); return g; }, (g, id) => { g.destroy(); strides.delete(id); memory.prev.delete(id); memory.lastDrawn.delete(id); memory.facing.delete(id); });
        for (const eid of state.crew) {
          const id = Stable.id[eid]!, g = tokens.get(id)!, { x, y, dx, dy } = interpolated(eid, alpha, pointFor(eid));
          const facing: Facing8 = facingFromDelta(dx, dy, memory.facing.get(id) ?? 's'); memory.facing.set(id, facing);
          if (sidesFor !== state.derived.layoutHash) { sides = stationSides(state); sidesFor = state.derived.layoutHash; }
          const seat = Seated.station[eid]!, l = Life.state[eid];
          const t = tokenLook(Owner.pid[eid]!, l === LifeState.Conscious ? 'conscious' : l === LifeState.Downed ? 'downed' : 'dead', seat >= 0, seat >= 0 ? sides[seat] ?? facing : facing);   // seated: facing the console
          const moving = Math.abs(dx) >= MOVE_EPS_PX || Math.abs(dy) >= MOVE_EPS_PX, stride = (strides.get(id) ?? id) + Math.hypot(dx, dy) * STRIDE_PER_TILE;
          strides.set(id, stride);
          drawPaintedToken(g, t, { stride, moving });   // the art spike: an inked top-down figure that sits on the painting
          g.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
          drawCarried(state, eid, Owner.pid[eid]!, x, y);
        }
        return;
      }
      syncCache(tokens, [], () => { throw new Error('unreachable'); }, (g) => g.destroy());
      if (!useArt) {
        syncCache(circles, liveIds, () => { const g = new Graphics(); container.addChild(g); return g; }, (g, id) => { g.destroy(); memory.prev.delete(id); memory.lastDrawn.delete(id); });
        for (const eid of state.crew) {
          const g = circles.get(Stable.id[eid]!)!, { x, y } = interpolated(eid, alpha, pointFor(eid)), life = Life.state[eid];
          g.clear().circle(0, 0, CREW_HALF * TILE_PX).fill({ color: life === LifeState.Dead ? DEAD_TINT : CREW_COLORS[Owner.pid[eid]! % 4]!, alpha: life === LifeState.Downed ? 0.5 : 1 });
          g.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
          drawCarried(state, eid, Owner.pid[eid]!, x, y);
        }
        return;
      }
      syncCache(sprites, liveIds,
        () => { const s = new AnimatedSprite([assets.texture(useLimeZu ? crewStandName(0, 's') : 'crew.idle.s')]); s.anchor.set(ANCHOR_X, useLimeZu ? LIMEZU_ANCHOR_Y : ANCHOR_Y); s.scale.set(SCALE); container.addChild(s); return { sprite: s, anim: null }; },
        (cs, id) => { cs.sprite.destroy(); memory.prev.delete(id); memory.lastDrawn.delete(id); memory.facing.delete(id); });
      for (const eid of state.crew) {
        const id = Stable.id[eid]!, cs = sprites.get(id)!, { x, y, dx, dy } = interpolated(eid, alpha, pointFor(eid));
        const facing: Facing8 = facingFromDelta(dx, dy, memory.facing.get(id) ?? 's');
        memory.facing.set(id, facing);
        const life = Life.state[eid];
        const moving = Math.abs(dx) >= MOVE_EPS_PX || Math.abs(dy) >= MOVE_EPS_PX;
        if (useLimeZu) {
          if (sidesFor !== state.derived.layoutHash) { sides = stationSides(state); sidesFor = state.derived.layoutHash; }
          const seat = Seated.station[eid]!, pose: CrewPoseState = life !== LifeState.Conscious ? 'down' : seat >= 0 ? 'seated' : moving ? 'walk' : 'idle';
          const p = crewPose(crewSlot(Owner.pid[eid]!), pose, facing, seat >= 0 ? sides[seat] ?? null : null);
          if (p.animated) { const a = assets.animation(p.name); setAnim(cs, p.name, a.textures, a.fps, a.loop, pose === 'walk' ? id : 0); }
          else setAnim(cs, p.name, [assets.texture(p.name)], 1, false);
          cs.sprite.anchor.set(ANCHOR_X, p.anchorY); cs.sprite.rotation = p.rotation;
          cs.sprite.tint = life === LifeState.Dead ? DEAD_TINT : 0xffffff;   // the character identifies the player: no per-player tint
          cs.sprite.alpha = life === LifeState.Downed ? 0.85 : 1;
          cs.sprite.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
          drawCarried(state, eid, Owner.pid[eid]!, x, y);
          continue;
        }
        if (life !== LifeState.Conscious) setAnim(cs, 'crew.down', [assets.texture('crew.down')], 1, false);
        else if (Seated.station[eid]! >= 0) { const n = useSit ? 'crew.sit' : 'crew.idle.s'; setAnim(cs, n, [assets.texture(n)], 1, false); }
        else if (!moving) setAnim(cs, `crew.idle.${facing}`, [assets.texture(`crew.idle.${facing}`)], 1, false);
        else { const a = assets.animation(`crew.walk.${facing}`); setAnim(cs, `crew.walk.${facing}`, a.textures, a.fps, a.loop, id); }
        cs.sprite.tint = life === LifeState.Dead ? DEAD_TINT : CREW_COLORS[Owner.pid[eid]! % 4]!;
        cs.sprite.alpha = life === LifeState.Downed ? 0.85 : 1;
        cs.sprite.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
        drawCarried(state, eid, Owner.pid[eid]!, x, y);
      }
    }
  };
}
