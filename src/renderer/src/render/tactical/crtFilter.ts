// The tactical layer's CRT filters (CRT map spec section 3): a bloom on the bright strokes (pixi-filters' AdvancedBloomFilter,
// the v6 line for PixiJS 8) and a faint animated noise (Pixi's NoiseFilter). Made once, on the first setting with a glow;
// with glow 0 the layer attaches none.
import { AdvancedBloomFilter } from 'pixi-filters/advanced-bloom';
import { NoiseFilter, type Filter } from 'pixi.js';
import type { CrtScale } from '../crt';

/** Bloom and noise at glow 1; each scales linearly with the glow strength. */
export const BLOOM_THRESHOLD = 0.5, BLOOM_SCALE = 1, BLOOM_BLUR = 4, NOISE = 0.08;

export interface CrtFilters { list: Filter[]; apply(scale: CrtScale): void; tick(t: number): void }

export function createCrtFilters(): CrtFilters {
  const bloom = new AdvancedBloomFilter({ threshold: BLOOM_THRESHOLD, bloomScale: BLOOM_SCALE, brightness: 1, blur: BLOOM_BLUR, quality: 5 });
  const noise = new NoiseFilter({ noise: NOISE, seed: 0.5 });
  return {
    list: [bloom, noise],
    apply(scale) { bloom.bloomScale = BLOOM_SCALE * scale.glow; bloom.blur = BLOOM_BLUR * Math.max(0.5, scale.glow); noise.noise = NOISE * scale.glow; },
    /** A new grain each frame from the presentation time. */
    tick(t) { noise.seed = (t * 7.31) % 1; }
  };
}
