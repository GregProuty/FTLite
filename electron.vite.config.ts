import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { computeContentDigest } from './build/contentDigest';
import { ensureIsolatedBuildReporterOutput } from './build/isolatedBuildReporter';

ensureIsolatedBuildReporterOutput();
const digest = JSON.stringify(computeContentDigest(import.meta.dirname));
export default defineConfig({
  main: {
    define: { __GAMEPLAY_CONTENT_DIGEST__: digest, __FTLITE_PACKAGED_SERVICE_ORIGIN__: JSON.stringify(process.env['FTLITE_PACKAGED_SERVICE_ORIGIN'] ?? '') },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), authorityHost: resolve('src/utility/authorityHost.ts'), hostProcess: resolve('src/main/network/hostProcess.ts'), rtcTransport: resolve('src/main/network/rtcTransport.ts') }, output: { chunkFileNames: '[name].js' } } }
  },
  // Sandboxed preloads cannot require a relative shared chunk. Inline each entry's validators.
  preload: { build: { isolatedEntries: true, externalizeDeps: false, rollupOptions: { input: { index: resolve('src/preload/index.ts'), networkTransport: resolve('src/preload/networkTransport.ts') } } } },
  // Repo-root public/ is copied verbatim into out/renderer/ at build (assets, manifest, notices).
  renderer: {
    publicDir: resolve('public'),
    define: { __GAMEPLAY_CONTENT_DIGEST__: digest },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), networkTransport: resolve('src/renderer/networkTransport.html') } } }
  }
});
