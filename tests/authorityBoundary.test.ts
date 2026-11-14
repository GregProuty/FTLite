import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { moduleSpecifiers } from './helpers/determinismGuard';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
}
const coreOwners = ['src/renderer/src/authority/authority.ts', 'src/renderer/src/authority/replay.ts'];
function assertCoreOwner(file: string, source: string): void {
  for (const specifier of moduleSpecifiers(source)) if (/authority\/core$|^\.\/core$/.test(specifier)) {
    expect(coreOwners).toContain(file.replaceAll('\\', '/'));
  }
}
it('rejects new authority core importers outside the two named validated owners', () => {
  expect(() => assertCoreOwner('src/renderer/src/headless/runner.ts', "import { createAuthorityCore } from '../authority/core';")).toThrow();
  expect(() => assertCoreOwner('src/renderer/src/authority/unvalidatedReplay.ts', "import { createAuthorityCore } from './core';")).toThrow();
});
it('keeps fixture adoption and publication outside the production composition graph', () => {
  for (const file of sourceFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      expect(specifier).not.toMatch(/(?:^|\/)tests(?:\/|$)/);
    }
    assertCoreOwner(file, source);
    if (!file.replaceAll('\\', '/').endsWith('/authority/core.ts')) expect(source).not.toContain('.publishCompletedState(');
  }
});

it('keeps all eight gates, parity, acceptance and golden on the shared byte runner', () => {
  for (const gate of ['boarding', 'cutter', 'duo', 'jump', 'run', 'skiff', 'survival', 'warden']) {
    const imports = moduleSpecifiers(readFileSync(`tests/gate-${gate}.test.ts`, 'utf8'));
    expect(imports).toContain('./helpers/gateTrace');
    expect(imports.some((path) => /sim\/step|heldInput|snapshotPhaseFixture/.test(path))).toBe(false);
  }
  expect(moduleSpecifiers(readFileSync('tests/helpers/gateTrace.ts', 'utf8'))).toContain('./rawInput');
  expect(moduleSpecifiers(readFileSync('tests/helpers/rawInput.ts', 'utf8'))).toContain('./authorityFixture');
  expect(moduleSpecifiers(readFileSync('tests/helpers/authorityFixture.ts', 'utf8'))).toContain('../../src/renderer/src/headless/runner');
  expect(moduleSpecifiers(readFileSync('tests/helpers/gameplayTrace.ts', 'utf8'))).toContain('./authorityFixture');
  expect(moduleSpecifiers(readFileSync('tests/helpers/legacyReplay.ts', 'utf8'))).toContain('./semanticReplay');
  expect(moduleSpecifiers(readFileSync('tests/helpers/semanticReplay.ts', 'utf8'))).toContain('./authorityFixture');
  expect(moduleSpecifiers(readFileSync('src/renderer/src/headless/acceptance.ts', 'utf8'))).toContain('./runner');
  for (const file of sourceFiles('tests')) {
    if (!moduleSpecifiers(readFileSync(file, 'utf8')).some((path) => path.endsWith('/snapshotPhaseFixture'))) continue;
    expect(['tests/snapshot.test.ts', 'tests/console.test.ts', 'tests/weapons.test.ts', 'tests/botSelfPreservationUnit.test.ts']).toContain(file.replaceAll('\\', '/'));
  }
  expect(moduleSpecifiers(readFileSync('tests/bot.test.ts', 'utf8'))).toContain('./helpers/rawInput');
  expect(moduleSpecifiers(readFileSync('tests/bot.test.ts', 'utf8')).some(path => /snapshotPhaseFixture|botSelfPreservationUnit/.test(path))).toBe(false);
});
