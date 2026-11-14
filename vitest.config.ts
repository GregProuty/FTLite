import { defineConfig } from 'vitest/config';
import { computeContentDigest } from './build/contentDigest';

export default defineConfig({
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(computeContentDigest(import.meta.dirname)) },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', setupFiles: ['tests/setup.ts'] }
});
