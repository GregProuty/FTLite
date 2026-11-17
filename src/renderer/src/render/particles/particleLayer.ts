import { Container, Sprite, Texture } from 'pixi.js';
import { ART_PX, PARTICLE_CAP, particleColour, particleCorner, type Particle } from './emitter';

/** The particles on screen (Art-i spec section 6): one pooled Sprite per emitter slot, made up front so the display
 *  tree never grows, in a normal and an additive container; a slot's Sprite moves to its particle's container on spawn. */
export interface ParticleLayer { normal: Container; add: Container; draw(particles: readonly Particle[]): void }

export function createParticleLayer(cap = PARTICLE_CAP): ParticleLayer {
  const normal = new Container(), add = new Container();
  add.blendMode = 'add';
  const pool = Array.from({ length: cap }, () => { const s = new Sprite(Texture.WHITE); s.visible = false; s.roundPixels = true; normal.addChild(s); return s; });
  let shown: Sprite[] = [];
  return {
    normal, add,
    draw(particles) {
      for (const s of shown) s.visible = false;
      shown = [];
      for (const p of particles) {
        const s = pool[p.slot]!, home = p.blend === 'add' ? add : normal;
        if (s.parent !== home) home.addChild(s);
        const c = particleCorner(p), size = p.size * ART_PX;
        s.position.set(c.x, c.y); s.setSize(size, size); s.tint = particleColour(p); s.visible = true;
        shown.push(s);
      }
    }
  };
}
