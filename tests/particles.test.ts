import { describe, it, expect } from 'vitest';
import { ART_PX, createEmitter, particleColour, particleCorner, PARTICLE_CAP, type ParticleSpec, type Source } from '../src/renderer/src/render/particles/emitter';
import { createRandom, hash2, hashString } from '../src/renderer/src/render/particles/random';
import { RAMP } from '../src/renderer/src/render/palette';

const spec = (over: Partial<ParticleSpec> = {}): ParticleSpec => ({ x: 10, y: 10, vx: 0, vy: 0, life: 1, size: 1, ramp: RAMP.fire, blend: 'normal', ...over });
const source = (key: string, rate: number): Source => ({ key, rate, make: (r) => spec({ x: r.range(0, 100), y: r.range(0, 100), vx: r.range(-20, 20), vy: r.range(-20, 20), life: r.range(0.5, 2) }) });

describe('the particle generator (Art-i spec section 6)', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = createRandom(hashString('abc')), b = createRandom(hashString('abc')), c = createRandom(hashString('abd'));
    const xs = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(xs);
    expect(c.next()).not.toBe(xs[0]);
    for (let k = 0; k < 1000; k++) { const v = a.next(), i = a.int(7); expect(v >= 0 && v < 1).toBe(true); expect(i >= 0 && i < 7 && Number.isInteger(i)).toBe(true); }
    expect(hash2(3, 4)).toBe(hash2(3, 4)); expect(hash2(3, 4)).not.toBe(hash2(4, 3));
  });
});

describe('the emitter (Art-i spec section 6)', () => {
  it('caps live particles at 600 and drops the oldest first, reusing its pool slot', () => {
    expect(PARTICLE_CAP).toBe(600);
    const e = createEmitter(1);
    for (let k = 0; k < PARTICLE_CAP; k++) e.spawn(spec({ x: k }));
    expect(e.particles).toHaveLength(600);
    const oldestSlot = e.particles[0]!.slot;
    e.spawn(spec({ x: 9999 }));
    expect(e.particles).toHaveLength(600);
    expect(e.particles[0]!.x).toBe(1);                                  // particle 0 went
    expect(e.particles[599]!).toMatchObject({ x: 9999, slot: oldestSlot });
    expect(new Set(e.particles.map((p) => p.slot)).size).toBe(600);     // every slot used once
  });
  it('emits rate x dt per source, carrying the fraction across frames, and forgets absent sources', () => {
    const e = createEmitter(1), s = source('fire:3', 10);
    for (let k = 0; k < 5; k++) e.step(1 / 60, [s]);
    expect(e.particles).toHaveLength(0);                                // 5/60 x 10 = 0.83 carried
    e.step(1 / 60, [s]); e.step(1 / 60, [s]);
    expect(e.particles).toHaveLength(1);                                // 7/60 x 10 = 1.17
    for (let k = 0; k < 53; k++) e.step(1 / 60, [s]);
    expect(e.particles.length).toBeGreaterThanOrEqual(9); expect(e.particles.length).toBeLessThanOrEqual(10);
    e.step(0, []);
    e.step(0.05, [s]);
    expect(e.particles.length).toBeLessThanOrEqual(10);                  // the carry was dropped with the source
  });
  it('a zero dt (the hitstop) neither emits, ages nor moves', () => {
    const e = createEmitter(1);
    e.spawn(spec({ vx: 100 }));
    e.step(0, [source('a', 1000)]);
    expect(e.particles).toHaveLength(1); expect(e.particles[0]).toMatchObject({ x: 10, age: 0 });
  });
  it('ages, applies gravity and removes particles at the end of their life', () => {
    const e = createEmitter(1);
    e.spawn(spec({ vx: 10, vy: 0, gravity: 100, life: 0.5 }));
    e.step(0.25, []);
    expect(e.particles[0]).toMatchObject({ age: 0.25, vy: 25 });
    expect(e.particles[0]!.x).toBeCloseTo(12.5); expect(e.particles[0]!.y).toBeCloseTo(16.25);
    e.step(0.25, []);
    expect(e.particles).toHaveLength(0);
  });
  it('is deterministic with a fixed seed', () => {
    const run = (): string => { const e = createEmitter(42); for (let k = 0; k < 120; k++) e.step(1 / 60, [source('a', 30), source('b', 7)]); return JSON.stringify(e.particles); };
    expect(run()).toBe(run());
  });
  it('snaps every drawn corner to whole art pixels, centred on the position', () => {
    expect(ART_PX).toBe(2);
    const r = createRandom(7);
    for (let k = 0; k < 500; k++) {
      const size = (1 + r.int(3)) as 1 | 2 | 3, c = particleCorner({ x: r.range(-50, 500), y: r.range(-50, 500), size });
      expect(Number.isInteger(c.x / 2) && Number.isInteger(c.y / 2), JSON.stringify(c)).toBe(true);
    }
    expect(particleCorner({ x: 10, y: 10, size: 1 })).toEqual({ x: 10, y: 10 });   // 9 rounds to the even 10 (half up)
    expect(particleCorner({ x: 10, y: 10, size: 2 })).toEqual({ x: 8, y: 8 });
  });
  it('steps the colour along its ramp by life, never between ramp colours', () => {
    const ramp = RAMP.fire, at = (age: number): number => particleColour({ age, life: 1, ramp });
    expect(at(0)).toBe(ramp[0]); expect(at(0.999)).toBe(ramp[ramp.length - 1]); expect(at(2)).toBe(ramp[ramp.length - 1]);
    const seen: number[] = [];
    for (let k = 0; k < 100; k++) { const c = at(k / 100); expect(ramp).toContain(c); if (seen[seen.length - 1] !== c) seen.push(c); }
    expect(seen).toEqual([...ramp]);
  });
});
