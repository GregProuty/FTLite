import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { deterministicViolations, forbiddenImport, moduleSpecifiers } from './helpers/determinismGuard';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [resolve(p)] : [];
  });
}
const roots = ['src/shared', ...['sim', 'authority', 'net', 'clientControl', 'headless', 'events'].map((p) => `src/renderer/src/${p}`)];
const files = new Set(roots.flatMap(walk));
// Follow actual local imports, including pure helpers outside the named directories.
for (const file of files) for (const specifier of moduleSpecifiers(readFileSync(file, 'utf8'))) {
  if (!specifier.startsWith('.')) continue;
  const base = resolve(dirname(file), specifier);
  const dependency = [base + '.ts', join(base, 'index.ts')].find(existsSync);
  if (dependency) files.add(dependency);
}
describe('deterministic module graph', () => {
  for (const file of [...files].sort()) it(`${file} has no forbidden imports or nondeterministic code`, () => {
    const source = readFileSync(file, 'utf8');
    expect(deterministicViolations(source)).toEqual([]);
    for (const specifier of moduleSpecifiers(source)) {
      expect(forbiddenImport(specifier)).toBe(false);
      if (file.replaceAll('\\', '/').includes('/sim/')) expect(specifier).not.toMatch(/(?:^|\/)(?:authority|clientControl|headless)(?:\/|$)/);
    }
  });
});
