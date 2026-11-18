import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleSpecifiers } from './helpers/determinismGuard';

// Web build spec §2.3, §3: page-side online code runs in a browser page or Worker, so it imports no Node or Electron.
export const PAGE_ROOTS = ['src/network/online', 'src/network/host', 'src/network/transport'];
function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(root, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(root, entry.name)] : []);
}
describe('page-side online code is browser-only', () => {
  for (const file of PAGE_ROOTS.flatMap(walk)) it(`${relative('.', file).replaceAll('\\', '/')} imports no node:, electron, process or Buffer`, () => {
    const source = readFileSync(file, 'utf8');
    expect(moduleSpecifiers(source).filter(s => s.startsWith('node:') || s === 'electron' || /^(fs|path|crypto|os|child_process)$/.test(s))).toEqual([]);
    expect(source).not.toMatch(/\bprocess\.|\bBuffer\b|\brequire\(/);
  });
});
