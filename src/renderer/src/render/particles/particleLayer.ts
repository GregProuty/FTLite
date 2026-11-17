import { Container, Sprite, Texture } from 'pixi.js';
import { ART_PX, PARTICLE_CAP, particleColour, particleCorner, type Particle } from './emitter';
import { DEBRIS, EMBER, SMOKE } from './sources';
import { FLAME, mix, SMOKE_TONES } from '../painted/ink';
import { softTextures } from '../painted/softTextures';

/** The particles on screen (Art-i spec section 6): one pooled Sprite per emitter slot, made up front so the display
 *  tree never grows, in a normal and an additive container; a slot's Sprite moves to its particle's container on spawn.
 *  `painted` (the art spike, a ship on a painted battlemap): smooth, unsnapped particles: round soft smoke puffs that
 *  swell and fade, sparks and embers as short glowing streaks along their flight, debris as inked shards. */
export interface ParticleLayer { normal: Container; add: Container; draw(particles: readonly Particle[], painted?: boolean): void }

export function createParticleLayer(cap = PARTICLE_CAP): ParticleLayer {
  const normal = new Container(), add = new Container();
  add.blendMode = 'add';
  const pool = Array.from({ length: cap }, () => { const s = new Sprite(Texture.WHITE); s.visible = false; s.roundPixels = true; normal.addChild(s); return s; });
  let shown: Sprite[] = [];
  return {
    normal, add,
    draw(particles, painted = false) {
      for (const s of shown) s.visible = false;
      shown = [];
      const soft = painted ? softTextures() : null;
      for (const p of particles) {
        const s = pool[p.slot]!, home = p.blend === 'add' && (!soft || p.ramp === EMBER) ? add : normal;   // painted sparks are inked, so they read on a light floor
        if (s.parent !== home) home.addChild(s);
        s.tint = particleColour(p); s.visible = true;
        shown.push(s);
        if (!soft) {
          const c = particleCorner(p), size = p.size * ART_PX;
          s.texture = Texture.WHITE; s.anchor.set(0); s.rotation = 0; s.alpha = 1; s.roundPixels = true;
          s.position.set(c.x, c.y); s.setSize(size, size);
          continue;
        }
        const u = p.age / p.life, base = p.size * ART_PX;
        s.anchor.set(0.5); s.roundPixels = false; s.position.set(p.x, p.y);
        if (p.ramp === EMBER) {   // a glowing mote over the flames
          s.texture = soft.glow; s.rotation = 0; s.alpha = 1 - u;
          s.setSize(base * 2.5, base * 2.5);
        } else if (p.blend === 'add') {   // a spark: an inked streak along the flight, longer the faster it goes
          const speed = Math.hypot(p.vx, p.vy);
          s.texture = soft.streak; s.rotation = Math.atan2(p.vy, p.vx); s.alpha = 1 - 0.4 * u; s.tint = FLAME[u < 0.4 ? 0 : u < 0.7 ? 1 : 2];   // white-hot to orange
          s.setSize(base * 6 + speed * 0.2, base * 3.5);
        } else if (p.ramp === DEBRIS) {
          s.texture = soft.shard; s.rotation = p.slot + p.age * 9; s.alpha = 1 - u * u;
          s.setSize(base * 2.6, base * 2.6);
        } else {   // smoke, steam, foam: a round puff that swells and fades
          const grow = p.ramp === SMOKE ? 2.4 + 2.6 * u : 1.6 + 1.2 * u;
          s.texture = soft.puff; s.rotation = 0; s.alpha = (p.ramp === SMOKE ? 0.6 : 0.75) * (1 - u);
          if (p.ramp === SMOKE) s.tint = mix(SMOKE_TONES[1], SMOKE_TONES[3], u);   // the painting's warm greys, darkening as it rises
          s.setSize(base * grow, base * grow);
        }
      }
    }
  };
}
