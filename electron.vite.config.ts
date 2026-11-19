import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { computeContentDigest } from './build/contentDigest';
import { ensureIsolatedBuildReporterOutput } from './build/isolatedBuildReporter';
import { computeBuildInfo } from './build/buildInfo';

ensureIsolatedBuildReporterOutput();
const digest = JSON.stringify(computeContentDigest(import.meta.dirname));
export default defineConfig({
  // Electron's main is a thin window (web build spec §3.3); the session, peers and host Worker are page code.
  main: {
    envDir: false,
    define: { __FTLITE_PACKAGED_SERVICE_ORIGIN__: JSON.stringify(process.env['FTLITE_PACKAGED_SERVICE_ORIGIN'] ?? '') },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  // Sandboxed preloads cannot require a relative shared chunk. Inline the entry's validators.
  preload: { envDir: false, build: { isolatedEntries: true, externalizeDeps: false, rollupOptions: { input: { index: resolve('src/preload/index.ts') } } } },
  // Repo-root public/ is copied verbatim into out/renderer/ at build (assets, manifest, notices).
  renderer: {
    envDir: false,
    // electron-vite's renderer defaults use `envDir || root`; restore the
    // explicit opt-out after that config hook and before Vite loads env files.
    plugins: [react(), { name: 'no-renderer-env-files', enforce: 'post', config: () => ({ envDir: false }) }],
    publicDir: resolve('public'),
    define: { __GAMEPLAY_CONTENT_DIGEST__: digest, __FTLITE_BUILD__: JSON.stringify(computeBuildInfo(import.meta.dirname)) },
    // The host Worker (spec §3.2) is one ES module at a fixed name, so the gates can find and hash it.
    worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name]-[hash].js' } } },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
});
