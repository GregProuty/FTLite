import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { computeContentDigest } from './build/contentDigest';

export default defineConfig({
  main: {},
  preload: {},
  // Repo-root public/ is copied verbatim into out/renderer/ at build (assets, manifest, notices).
  renderer: {
    publicDir: resolve('public'),
    define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(computeContentDigest(import.meta.dirname)) }
  }
});
