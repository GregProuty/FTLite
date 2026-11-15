import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [cloudflareTest({
    main: './tests/runtime-probe.ts',
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: {
      compatibilityDate: '2026-10-23',
      bindings: { TURN_KEY_ID: '1'.repeat(32), TURN_KEY_API_TOKEN: 'synthetic-server-turn-secret' },
      durableObjects: { PROBE: { className: 'ProbeDO', useSQLite: true } },
    },
  })],
  test: { include: ['tests/**/*.test.ts'] },
});
