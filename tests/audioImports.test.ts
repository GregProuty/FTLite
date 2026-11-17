// Audio-i spec section 7: the audio code reads sim types only, and the pure models take their random source from the caller.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUDIO_DIR = 'src/renderer/src/audio';
const pure = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.ts')).map((f) => join(AUDIO_DIR, f));
const adapters = ['src/renderer/src/app/audio.ts', 'src/renderer/src/app/duel/duelAudio.ts', 'src/renderer/src/app/sectorAudio.ts'].filter((f) => existsSync(f));
/** Every value import or re-export (not `import type` / `export type`) and its specifier. */
const valueImports = (src: string): string[] => [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]!);

describe('audio imports (Audio-i spec section 7)', () => {
  it('has pure models to check', () => { expect(pure.length).toBeGreaterThan(0); });
  for (const file of [...pure, ...adapters]) it(`${file} imports nothing from sim/ or the shared RNG at runtime`, () => {
    const bad = valueImports(readFileSync(file, 'utf8')).filter((s) => /(?:^|\/)sim\//.test(s) || /shared\/rng/.test(s));
    expect(bad).toEqual([]);
  });
  for (const file of pure) it(`${file} never calls Math.random (the caller injects it)`, () => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/Math\.random/);
  });
});
