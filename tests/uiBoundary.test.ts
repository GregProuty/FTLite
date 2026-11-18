// The React UI's import boundaries (React UI spec §8): UI libraries stay out of the deterministic and process code, and
// the UI reads only models (types from anywhere; values never from sim, authority, client control or the network).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [resolve(p)] : [];
  });
}
/** Every static `import … from 'x'`, `import 'x'` and `export … from 'x'` in a source, and whether it is `import type`/`export type`. */
export function staticImports(source: string): { specifier: string; typeOnly: boolean }[] {
  const re = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  return [...source.matchAll(re)].map((m) => ({ specifier: m[2]!, typeOnly: !!m[1] }));
}
const slash = (p: string): string => p.replaceAll('\\', '/');
const UI_LIB = /^(?:react|react-dom|zustand)(?:\/|$)/;
const NO_UI_LIB_ROOTS = [...['sim', 'authority', 'clientControl', 'headless', 'net', 'events'].map((d) => `src/renderer/src/${d}`), 'src/network', 'src/shared', 'src/main', 'src/preload', 'src/utility', 'src/worker'];
const UI_FORBIDDEN_VALUE_DIRS = [...['sim', 'authority', 'clientControl', 'net'].map((d) => slash(resolve(`src/renderer/src/${d}`)) + '/'), slash(resolve('src/network')) + '/'];

describe('staticImports', () => {
  it('finds value, type, side-effect, multi-line and re-export imports', () => {
    const src = "import type { A } from './a';\nimport { b,\n  c } from \"./b\";\nimport './side';\nexport { d } from './d';\nexport type { E } from './e';\nexport const f = 1;";
    expect(staticImports(src)).toEqual([
      { specifier: './a', typeOnly: true }, { specifier: './b', typeOnly: false }, { specifier: './side', typeOnly: false },
      { specifier: './d', typeOnly: false }, { specifier: './e', typeOnly: true }
    ]);
  });
});

describe('UI libraries stay out of deterministic and process code', () => {
  for (const file of NO_UI_LIB_ROOTS.flatMap(walk)) it(`${slash(file)} imports no React or zustand`, () => {
    expect(staticImports(readFileSync(file, 'utf8')).map((i) => i.specifier).filter((s) => UI_LIB.test(s))).toEqual([]);
  });
});

describe('the UI imports no runtime values from sim, authority, client control or the network', () => {
  for (const file of walk('src/renderer/src/ui')) it(`${slash(file)} imports only types from those directories`, () => {
    const bad = staticImports(readFileSync(file, 'utf8')).filter((i) => !i.typeOnly && i.specifier.startsWith('.'))
      .map((i) => slash(resolve(dirname(file), i.specifier))).filter((p) => UI_FORBIDDEN_VALUE_DIRS.some((d) => (p + '/').startsWith(d)));
    expect(bad).toEqual([]);
  });
});
