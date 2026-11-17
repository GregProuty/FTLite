import type { CardUiState } from '../clientControl/cardController';
import { AnimatedSprite, Container, Graphics, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { FIRE_CAP } from '../sim/tuning';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import { fireTiles, breachOrientation, breachDamagedTiles, airlockDraw, airlockOutward, ventParticles, doorsCursorTile } from './hazardTiles';
import { featureReady } from './fallback';
import { battlemapFor } from './battlemapModel';
import { syncCache } from './cache';
import { ROLE } from './palette';
import { airlockOutlineBand, breachRect, failedRect, fireFallbackRect, ventSpeckRect } from './effectsShapes';

// Art-i-b (spec sections 5-7): the low-oxygen tint became the grade's vacuum (gradeModel.ts, drawn by interiorFeel.ts),
// the red impact flash became the white flash, and the breach vent puff became the venting particles.
const SCALE = TILE_PX / 16;

export interface EffectsLayer { below: Container; above: Container; draw(state: SimState, ui?: CardUiState): void }

export function createEffectsLayer(assets: GameAssets, memory: RenderMemory): EffectsLayer {
  const missing = new Set(assets.missing);
  const art = { fire: featureReady(missing, 'fire'), breach: featureReady(missing, 'breach'), arc: featureReady(missing, 'arc') };
  const below = new Container(), above = new Container();
  const fireLayer = new Container(), breachLayer = new Container(), fallback = new Graphics();
  below.addChild(fireLayer, breachLayer, fallback);
  const fires = new Map<number, AnimatedSprite>();
  const outline = new Graphics(); above.addChild(outline);
  const ventLayer = new Graphics(); above.addChild(ventLayer);
  const failLayer = new Container(); below.addChild(failLayer); const fails = new Map<number, AnimatedSprite>();
  const decals: Sprite[] = [];
  const tileXY = (w: number, t: number): [number, number] => { const tx = t % w; return [tx, (t - tx) / w]; };

  function markDamaged(t: number): void { memory.damaged.add(t); }

  return {
    below, above,
    draw(state, ui) {
      const d = state.derived, w = d.width;
      // Fire: a stable, growing subset of each burning room's tiles.
      fallback.clear();
      const wanted: number[] = [];
      for (let r = 0; r < d.volume.length; r++) {
        const fire = state.rooms.fire[r]!; if (fire <= 0) continue;
        for (const t of fireTiles(d.roomTiles[r]!, fire, FIRE_CAP)) { wanted.push(t); markDamaged(t); }
      }
      if (battlemapFor(state.layout.id, missing)) {   // the art spike: a painted ship's fire is code-drawn (painted/fireLayer.ts, via the interior feel)
        syncCache(fires, [], () => { throw new Error('unreachable'); }, (s) => s.destroy());
      } else if (art.fire) {
        const a = assets.animation('fire.loop');
        syncCache(fires, wanted, (t) => {
          const s = new AnimatedSprite(a.textures); s.scale.set(SCALE); s.animationSpeed = a.fps / 60; s.loop = true;
          s.gotoAndPlay(t % a.textures.length);                                  // frame offset by tile index: no pulsing in unison
          const [tx, ty] = tileXY(w, t); s.position.set(tx * TILE_PX, ty * TILE_PX); fireLayer.addChild(s); return s;
        }, (s) => s.destroy());
      } else {
        for (const t of wanted) { const [tx, ty] = tileXY(w, t), r = fireFallbackRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.fireFallback, alpha: 0.8 }); }
      }
      // Breaches: decal on the site wall tile and damaged floor on the room-side neighbours (the venting is particles now).
      for (let s = 0; s < d.siteTile.length; s++) {
        const active = state.breaches.active[s] === 1, [tx, ty] = tileXY(w, d.siteTile[s]!);
        if (active) for (const t of breachDamagedTiles(d, s)) markDamaged(t);
        if (art.breach) {
          if (!decals[s]) { const sp = new Sprite(assets.texture(`breach.${breachOrientation(d, s)}`)); sp.scale.set(SCALE); sp.position.set(tx * TILE_PX, ty * TILE_PX); breachLayer.addChild(sp); decals[s] = sp; }
          decals[s]!.visible = active;
        } else if (active) { const r = breachRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill(ROLE.breach); }
      }
      // Doors console selection: a pulsing outline on the selected door or airlock tile while someone is seated there (spec Demo-vii amendment 3).
      outline.clear();
      const sel = doorsCursorTile(state, ui);
      if (sel >= 0) {
        const [tx, ty] = tileXY(w, sel), pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.tick * 0.2)), band = airlockOutlineBand(tx, ty);
        outline.rect(band.rect.x, band.rect.y, band.rect.w, band.rect.h).stroke({ color: ROLE.airlockOutline, width: band.width, alignment: band.alignment, alpha: pulse });   // painted just outside the tile: it stays visible on amber airlock leaves
      }
      // Open airlocks: oxygen specks streaming outward while the room still holds air.
      ventLayer.clear();
      for (let k = 0; k < d.airlockTile.length; k++) {
        if (!airlockDraw(state, k).venting) continue;
        const out = airlockOutward(d, k), [tx, ty] = tileXY(w, d.airlockTile[k]!);
        for (const p of ventParticles(out, k, state.tick)) {
          const cx = (tx + 0.5 + out.dx * (0.5 + p.along) + (out.dx === 0 ? p.side : 0)) * TILE_PX, cy = (ty + 0.5 + out.dy * (0.5 + p.along) + (out.dy === 0 ? p.side : 0)) * TILE_PX;
          const r = ventSpeckRect(cx, cy); ventLayer.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.ventSpeck, alpha: p.alpha });
        }
      }
      // Failed stations: arc animation on the console tile, or a yellow square.
      const failedTiles: number[] = [];
      for (let i = 0; i < d.stationTile.length; i++) if (state.stations.failed[i]) failedTiles.push(d.stationTile[i]!);
      if (art.arc) {
        const a = assets.animation('fx.arc');
        syncCache(fails, failedTiles, (t) => {
          const s = new AnimatedSprite(a.textures); s.scale.set(SCALE); s.animationSpeed = a.fps / 60; s.loop = true; s.play();
          const [tx, ty] = tileXY(w, t); s.position.set(tx * TILE_PX, ty * TILE_PX); failLayer.addChild(s); return s;
        }, (s) => s.destroy());
      } else {
        for (const t of failedTiles) { const [tx, ty] = tileXY(w, t), r = failedRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.failed, alpha: 0.9 }); }
      }
    }
  };
}
