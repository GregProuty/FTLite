// The web build's Vite config (web build spec §5.1): Electron's renderer settings (build/rendererConfig.ts) with the
// baked page online config, written to <out>/static. Entries: index.html, and the host Worker found through its
// `new Worker(new URL(...))`. Only scripts/web/build-web.ts uses it; there is no default export, so a bare `vite build`
// cannot skip the plan's checks.
import { resolve } from 'node:path';
import type { InlineConfig } from 'vite';
import { rendererSettings } from './build/rendererConfig';
import type { WebBuildPlan } from './build/webBuild';

export function createWebViteConfig(root: string, plan: WebBuildPlan): InlineConfig {
  return { ...rendererSettings(root, plan.pageConfig), configFile: false, root: resolve(root, 'src/renderer'), base: './', mode: 'production', logLevel: 'warn',
    build: { outDir: resolve(plan.outDir, 'static'), emptyOutDir: true, rollupOptions: { input: { index: resolve(root, 'src/renderer/index.html') } } } };
}
