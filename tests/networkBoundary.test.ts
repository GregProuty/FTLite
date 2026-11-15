import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { moduleSpecifiers } from './helpers/determinismGuard';

function walk(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(root, entry.name)) : entry.name.endsWith('.ts') ? [join(root, entry.name)] : []);
}
function forbiddenDependencies(source: string): string[] {
  const tree = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true);
  const allowed = new Set<string>();
  for (const statement of tree.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly
    && ts.isStringLiteral(statement.moduleSpecifier) && /renderer\/src\/net\/(contracts|receivePolicy)$/.test(statement.moduleSpecifier.text)) allowed.add(statement.moduleSpecifier.text);
  return moduleSpecifiers(source).filter(specifier => !allowed.has(specifier)
    && (/renderer\//.test(specifier) || /(?:sector|tactical|bitecs|components|schema|snapshot)(?:[/.]|$)/.test(specifier)));
}
describe('generic host import boundary', () => {
  it.each([
    "import { createSimState } from '../renderer/src/sim/state';",
    "import type { Snapshot } from '../renderer/src/sim/snapshot';",
    "import { sectorMode } from './modes/sector';",
    "export { schema } from './tactical/schema';",
    "const ecs = require('bitecs');"
  ])('rejects a mode dependency even through a type/export/require: %s', source => {
    expect(forbiddenDependencies(source)).toHaveLength(1);
  });
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
    it(`${relative(resolve('.'), resolve(file))} imports only generic runtime contracts`, () => {
      expect(forbiddenDependencies(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});
