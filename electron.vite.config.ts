import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {},
  // Repo-root public/ is copied verbatim into out/renderer/ at build (assets, manifest, notices).
  renderer: { publicDir: resolve('public') }
});
