// The code particle emitter (Art-i spec section 6): at most PARTICLE_CAP live particles in fixed pool slots (the Pixi
// layer keeps one Sprite per slot), the oldest dropped first past the cap, positions on whole art pixels and colour
// stepped along one ramp by life. Sources emit at a rate through per-source accumulators. Pure: no Pixi.
import { createRandom, type Random } from './random';

export const PARTICLE_CAP = 600;
/** World units per art pixel (TILE_PX 32 shows 16 px art at 2x). */
export const ART_PX = 2;

export type Blend = 'normal' | 'add';
export interface ParticleSpec {
  x: number; y: number; vx: number; vy: number;
  /** Seconds. */
  life: number;
  /** Art pixels square: 1 to 3. */
  size: 1 | 2 | 3;
  /** Bright to dark; the colour steps through it as the particle ages. */
  ramp: readonly number[];
  blend: Blend;
  /** World units per second squared, added to vy. */
  gravity?: number;
}
export interface Particle extends ParticleSpec { age: number; slot: number }

/** A steady source this frame: `rate` particles a second, each made by `make`. Keyed so its fractional carry survives frames. */
export interface Source { key: string; rate: number; make(r: Random): ParticleSpec }

export interface Emitter {
  /** Live particles, oldest first. */
  readonly particles: readonly Particle[];
  readonly random: Random;
  spawn(p: ParticleSpec): void;
  /** Emit from every source for `dt` seconds (sources absent this frame lose their carry), then age and move everything. */
  step(dt: number, sources: readonly Source[]): void;
  clear(): void;
}

/** The ramp colour for a particle's age: index floor(age / life x length), clamped, so it steps, never blends. */
export function particleColour(p: Pick<Particle, 'age' | 'life' | 'ramp'>): number {
  const k = Math.min(p.ramp.length - 1, Math.max(0, Math.floor((p.age / p.life) * p.ramp.length)));
  return p.ramp[k]!;
}

/** The drawn top-left corner, on whole art pixels (even world units), centred on the particle's position. */
export function particleCorner(p: Pick<Particle, 'x' | 'y' | 'size'>): { x: number; y: number } {
  const half = (p.size * ART_PX) / 2;
  return { x: ART_PX * Math.round((p.x - half) / ART_PX) || 0, y: ART_PX * Math.round((p.y - half) / ART_PX) || 0 };
}

export function createEmitter(seed: number, cap = PARTICLE_CAP): Emitter {
  const random = createRandom(seed);
  let particles: Particle[] = [];
  let free = Array.from({ length: cap }, (_, k) => cap - 1 - k);   // pop() hands out slot 0 first
  const carry = new Map<string, number>();

  function spawn(spec: ParticleSpec): void {
    if (particles.length >= cap) { const old = particles.shift()!; free.push(old.slot); }
    particles.push({ ...spec, age: 0, slot: free.pop()! });
  }

  return {
    get particles() { return particles; },
    random, spawn,
    step(dt, sources) {
      const live = new Set<string>();
      for (const s of sources) {
        live.add(s.key);
        let acc = (carry.get(s.key) ?? 0) + s.rate * dt;
        while (acc >= 1) { spawn(s.make(random)); acc -= 1; }
        carry.set(s.key, acc);
      }
      for (const k of carry.keys()) if (!live.has(k)) carry.delete(k);
      const kept: Particle[] = [];
      for (const p of particles) {
        p.age += dt;
        if (p.age >= p.life) { free.push(p.slot); continue; }
        p.vy += (p.gravity ?? 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        kept.push(p);
      }
      particles = kept;
    },
    clear() { particles = []; free = Array.from({ length: cap }, (_, k) => cap - 1 - k); carry.clear(); }
  };
}
