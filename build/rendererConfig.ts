// The renderer's Vite settings, shared by Electron's build (electron.vite.config.ts) and the web build
// (vite.web.config.ts, web build spec §5.1). `webConfig` is the baked page online config: null in Electron, whose
// preload hands the page main's resolved config instead.
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import type { InlineConfig } from 'vite';
import type { PageOnlineConfig } from '../src/shared/onlineConfig';
import { computeBuildInfo } from './buildInfo';
import { computeContentDigest } from './contentDigest';

export function rendererSettings(root: string, webConfig: PageOnlineConfig | null): Pick<InlineConfig, 'envDir' | 'plugins' | 'publicDir' | 'define' | 'worker'> {
  return {
    envDir: false,
    // electron-vite's renderer defaults use `envDir || root`; restore the explicit opt-out after that config hook and
    // before Vite loads env files.
    plugins: [react(), { name: 'no-renderer-env-files', enforce: 'post', config: () => ({ envDir: false }) }],
    // Repo-root public/ is copied verbatim into the output (assets, manifest, notices; the web build's paid art too).
    publicDir: resolve(root, 'public'),
    define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(computeContentDigest(root)), __FTLITE_BUILD__: JSON.stringify(computeBuildInfo(root)),
      __FTLITE_WEB_CONFIG__: JSON.stringify(webConfig) },
    // The host Worker (spec §3.2) is one ES module at a fixed name, so the gates can find and hash it.
    worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name]-[hash].js' } } }
  };
}
