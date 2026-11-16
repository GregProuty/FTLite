import type { CardUiState } from '../clientControl/cardController';
import { AnimatedSprite, Container, Graphics, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { FIRE_CAP } from '../sim/tuning';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import { fireTiles, breachOrientation, ventRotation, breachDamagedTiles, airlockDraw, airlockOutward, ventParticles, doorsCursorTile } from './hazardTiles';
import { featureReady } from './fallback';
import { syncCache } from './cache';
import { ROLE } from './palette';
import { airlockOutlineBand, breachRect, failedRect, fireFallbackRect, ventSpeckRect } from './effectsShapes';

export const LOW_O2_THRESHOLD = 0.98;
export const LOW_O2_COLOR = ROLE.lowO2;   // Art-i spec section 4: the palette role (Art-i-b turns it into the vacuum grade)
export const LOW_O2_MAX_ALPHA = 0.6;
const IMPACT_FLASH_TICKS = 18, IMPACT_COLOR = ROLE.impact, IMPACT_MAX_ALPHA = 0.7;
const SCALE = TILE_PX / 16;

export interface EffectsLayer { below: Container; above: Container; draw(state: SimState, ui?: CardUiState): void }

export function createEffectsLayer(assets: GameAssets, memory: RenderMemory): EffectsLayer {
  const missing = new Set(assets.missing);
  const art = { fire: featureReady(missing, 'fire'), breach: featureReady(missing, 'breach'), vent: featureReady(missing, 'vent'), arc: featureReady(missing, 'arc') };
  const below = new Container(), above = new Container();
  const o2Layer = new Graphics(), fireLayer = new Container(), breachLayer = new Container(), fallback = new Graphics();
  below.addChild(o2Layer, fireLayer, breachLayer, fallback);
  const fires = new Map<number, AnimatedSprite>();
  const outline = new Graphics(); above.addChild(outline);
  const ventLayer = new Graphics(); above.addChild(ventLayer);
  const impactLayer = new Graphics(); above.addChild(impactLayer);
  const failLayer = new Container(); below.addChild(failLayer); const fails = new Map<number, AnimatedSprite>();
  const decals: Sprite[] = [], puffs: AnimatedSprite[] = [];
  const tileXY = (w: number, t: number): [number, number] => { const tx = t % w; return [tx, (t - tx) / w]; };

  function markDamaged(t: number): void { memory.damaged.add(t); }

  return {
    below, above,
    draw(state, ui) {
      const d = state.derived, w = d.width;
      // Low oxygen tint: nothing drawn at frac >= 0.98.
      o2Layer.clear();
      for (let r = 0; r < d.volume.length; r++) {
        const frac = state.rooms.o2[r]! / d.volume[r]!;
        if (frac >= LOW_O2_THRESHOLD) continue;
        for (const t of d.roomTiles[r]!) { const [tx, ty] = tileXY(w, t); o2Layer.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill({ color: LOW_O2_COLOR, alpha: LOW_O2_MAX_ALPHA * (1 - frac) }); }
      }
      // Debris impact flash: the hit room's floor, fading over IMPACT_FLASH_TICKS (several rooms can flash at once).
      impactLayer.clear();
      for (let r = 0; r < d.volume.length; r++) {
        const age = state.tick - state.rooms.impactTick[r]!;
        if (state.rooms.impactTick[r]! < 0 || age < 0 || age >= IMPACT_FLASH_TICKS) continue;
        const alpha = IMPACT_MAX_ALPHA * (1 - age / IMPACT_FLASH_TICKS);
        for (const t of d.roomTiles[r]!) { const [tx, ty] = tileXY(w, t); impactLayer.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill({ color: IMPACT_COLOR, alpha }); }
      }
      // Fire: a stable, growing subset of each burning room's tiles.
      fallback.clear();
      const wanted: number[] = [];
      for (let r = 0; r < d.volume.length; r++) {
        const fire = state.rooms.fire[r]!; if (fire <= 0) continue;
        for (const t of fireTiles(d.roomTiles[r]!, fire, FIRE_CAP)) { wanted.push(t); markDamaged(t); }
      }
      if (art.fire) {
        const a = assets.animation('fire.loop');
        syncCache(fires, wanted, (t) => {
          const s = new AnimatedSprite(a.textures); s.scale.set(SCALE); s.animationSpeed = a.fps / 60; s.loop = true;
          s.gotoAndPlay(t % a.textures.length);                                  // frame offset by tile index: no pulsing in unison
          const [tx, ty] = tileXY(w, t); s.position.set(tx * TILE_PX, ty * TILE_PX); fireLayer.addChild(s); return s;
        }, (s) => s.destroy());
      } else {
        for (const t of wanted) { const [tx, ty] = tileXY(w, t), r = fireFallbackRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.fireFallback, alpha: 0.8 }); }
      }
      // Breaches: decal on the site wall tile, puff oriented away from the room, damaged floor on the room-side neighbours.
      for (let s = 0; s < d.siteTile.length; s++) {
        const active = state.breaches.active[s] === 1, [tx, ty] = tileXY(w, d.siteTile[s]!);
        if (active) for (const t of breachDamagedTiles(d, s)) markDamaged(t);
        if (art.breach) {
          if (!decals[s]) { const sp = new Sprite(assets.texture(`breach.${breachOrientation(d, s)}`)); sp.scale.set(SCALE); sp.position.set(tx * TILE_PX, ty * TILE_PX); breachLayer.addChild(sp); decals[s] = sp; }
          decals[s]!.visible = active;
        } else if (active) { const r = breachRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill(ROLE.breach); }
        if (art.vent) {
          if (!puffs[s]) {
            const a = assets.animation('vent.puff');
            const p = new AnimatedSprite(a.textures); p.scale.set(SCALE); p.animationSpeed = a.fps / 60; p.loop = true; p.anchor.set(0.5);
            p.position.set((tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX); p.rotation = ventRotation(d, s); p.play(); above.addChild(p); puffs[s] = p;
          }
          puffs[s]!.visible = active;
        }
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
