import { defineConfig } from 'vitest/config';
import { computeContentDigest } from './build/contentDigest';
import { availableParallelism } from 'node:os';

export default defineConfig({
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(computeContentDigest(import.meta.dirname)) },
  // This suite has long CPU-bound authority scenarios. Fifteen simultaneous
  // workers on the 8-core/16-thread gate host oversubscribe the unchanged 5s cases.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup.ts'], maxWorkers: Math.min(8, availableParallelism()) }
});
