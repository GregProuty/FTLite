import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const pureDirs = ['src/renderer/src/sim', 'src/shared'];
const bannedImports = [/from\s+['"]pixi\.js/, /from\s+['"]electron/, /from\s+['"][^'"]*\/render\//, /from\s+['"][^'"]*\/input\//, /from\s+['"][^'"]*\/app\//];
const bannedCalls = [/Math\.random/, /\bDate\b/, /performance\.now/, /Math\.(sin|cos|atan2|pow|hypot)\b/, /\bdocument\b/, /\bwindow\b/];

describe('sim/ and shared/ are pure', () => {
  for (const dir of pureDirs) for (const file of walk(dir)) {
    it(`${file} has no banned imports or calls`, () => {
      const src = readFileSync(file, 'utf8');
      for (const re of bannedImports) expect(src).not.toMatch(re);
      for (const re of bannedCalls) expect(src).not.toMatch(re);
    });
  }
});
