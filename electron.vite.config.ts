import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { ensureIsolatedBuildReporterOutput } from './build/isolatedBuildReporter';
import { rendererSettings } from './build/rendererConfig';

ensureIsolatedBuildReporterOutput();
export default defineConfig({
  // Electron's main is a thin window (web build spec §3.3); the session, peers and host Worker are page code.
  main: {
    envDir: false,
    define: { __FTLITE_PACKAGED_SERVICE_ORIGIN__: JSON.stringify(process.env['FTLITE_PACKAGED_SERVICE_ORIGIN'] ?? '') },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  // Sandboxed preloads cannot require a relative shared chunk. Inline the entry's validators.
  preload: { envDir: false, build: { isolatedEntries: true, externalizeDeps: false, rollupOptions: { input: { index: resolve('src/preload/index.ts') } } } },
  // The renderer settings are shared with the web build (build/rendererConfig.ts); Electron bakes no page config.
  renderer: {
    ...rendererSettings(import.meta.dirname, null),
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
});
