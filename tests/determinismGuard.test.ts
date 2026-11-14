import { describe, expect, it } from 'vitest';
import { deterministicViolations } from './helpers/determinismGuard';

describe('AST determinism guard', () => {
  it.each([
    'Math.sin(1)', "Math['pow'](2, 3)", 'const { sin } = Math; sin(1)',
    'const m = Math; m.random()', 'globalThis.Math.random()', '2 ** 31', 'x **= 2',
    'new Date()', 'Date.now()', 'performance.now()', "globalThis['performance'].now()",
    "import x from 'electron'", "import 'pixi.js'", "export { x } from '../app/x'",
    "const x = import('../render/x')", "const x = require('node:fs')",
  ])('rejects %s', (source) => expect(deterministicViolations(source)).not.toEqual([]));
  it('ignores comments, strings, property names and accepts every approved Math method', () => {
    expect(deterministicViolations(`// Math.sin Date performance.now() **
      const text = "Math.random()"; const o = { Date: 1, performance: 2 };
      Math.abs(-1); Math.ceil(1); Math.floor(1); Math.round(1); Math.min(1); Math.max(1);
      Math.sign(1); Math.imul(1, 2); Math.sqrt(4); Math['sqrt'](4);
      import { x } from './pure'; import { z } from 'zod';
    `)).toEqual([]);
  });
});
