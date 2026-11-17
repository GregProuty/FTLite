import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { computeContentDigest } from './build/contentDigest';
import { ensureIsolatedBuildReporterOutput } from './build/isolatedBuildReporter';
import { computeBuildInfo } from './build/buildInfo';

ensureIsolatedBuildReporterOutput();
const digest = JSON.stringify(computeContentDigest(import.meta.dirname));
export default defineConfig({
  main: {
    envDir: false,
    define: { __GAMEPLAY_CONTENT_DIGEST__: digest, __FTLITE_PACKAGED_SERVICE_ORIGIN__: JSON.stringify(process.env['FTLITE_PACKAGED_SERVICE_ORIGIN'] ?? '') },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), authorityHost: resolve('src/utility/authorityHost.ts'), hostProcess: resolve('src/main/network/hostProcess.ts'), rtcTransport: resolve('src/main/network/rtcTransport.ts') }, output: { chunkFileNames: '[name].js' } } }
  },
  // Sandboxed preloads cannot require a relative shared chunk. Inline each entry's validators.
  preload: { envDir: false, build: { isolatedEntries: true, externalizeDeps: false, rollupOptions: { input: { index: resolve('src/preload/index.ts'), networkTransport: resolve('src/preload/networkTransport.ts') } } } },
  // Repo-root public/ is copied verbatim into out/renderer/ at build (assets, manifest, notices).
  renderer: {
    envDir: false,
    // electron-vite's renderer defaults use `envDir || root`; restore the
    // explicit opt-out after that config hook and before Vite loads env files.
    plugins: [react(), { name: 'no-renderer-env-files', enforce: 'post', config: () => ({ envDir: false }) }],
    publicDir: resolve('public'),
    define: { __GAMEPLAY_CONTENT_DIGEST__: digest, __FTLITE_BUILD__: JSON.stringify(computeBuildInfo(import.meta.dirname)) },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), networkTransport: resolve('src/renderer/networkTransport.html') } } }
  }
});
