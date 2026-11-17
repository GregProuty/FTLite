import { defineConfig } from 'vitest/config';
import { computeContentDigest } from './build/contentDigest';
import { readSimVersion } from './build/buildInfo';
import { availableParallelism } from 'node:os';

export default defineConfig({
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(computeContentDigest(import.meta.dirname)), __FTLITE_BUILD__: JSON.stringify({ version: '0.0.0-test', rev: 'test', sim: readSimVersion(import.meta.dirname) }) },
  // This suite has long CPU-bound authority scenarios. Fifteen simultaneous
  // workers on the 8-core/16-thread gate host oversubscribe the unchanged 5s cases.
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node', setupFiles: ['tests/setup.ts'], maxWorkers: Math.min(8, availableParallelism()) }
});
