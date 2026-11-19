// The local web stack shared by `npm run test:web-net` and `npm run test:web-live-local`: local workerd, a --test web
// build pointed at it, a `vite preview` of that build on a free loopback port, and the browser options that let loopback
// ICE connect (web build spec §8 "Browser network gates"). The caller owns the temporary directory and its exact cleanup.
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { LaunchOptions } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { resolveWebBuildPlan } from '../../../build/webBuild';
import { startLocalRuntime } from '../../../services/signalling/scripts/local-runtime';
import { buildWeb } from '../build-web';

/** Chromium hides host candidates behind mDNS and Firefox drops loopback ones by default; both are needed for loopback ICE. */
export const LOOPBACK_CHROMIUM: LaunchOptions = { headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] };
export const LOOPBACK_FIREFOX: LaunchOptions = { headless: true, firefoxUserPrefs: { 'media.peerconnection.ice.obfuscate_host_addresses': false, 'media.peerconnection.ice.loopback': true } };

export function freePort(): Promise<number> {
  return new Promise((done, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const port = (s.address() as { port: number }).port; s.close(() => done(port)); }); });
}

export class LocalWebStack {
  port = 0; origin = '';
  runtime: Awaited<ReturnType<typeof startLocalRuntime>> | undefined;
  server: PreviewServer | undefined;

  /** Starts workerd, builds the page with `buildArgs(serviceUrl)` (plus --out) into `directory/web` and previews it.
   *  `afterBuild` runs between the build and the preview. Handles already started stay on the stack for close(). */
  async start(o: { root: string; directory: string; buildArgs(serviceUrl: string): string[]; refuseOrigin?: boolean; step(label: string): void; afterBuild?(): Promise<void> }): Promise<void> {
    this.port = await freePort(); this.origin = `http://127.0.0.1:${this.port}`;
    mkdirSync(join(o.directory, 'service'));
    o.step('workerd');
    this.runtime = await startLocalRuntime(join(o.directory, 'service'), { allowedOrigins: o.refuseOrigin ? 'null' : `null,http://localhost:${this.port},${this.origin}` });
    o.step('web build');
    await buildWeb(o.root, resolveWebBuildPlan(o.root, [...o.buildArgs(this.runtime.baseUrl), `--out=${join(o.directory, 'web')}`], {}));
    await o.afterBuild?.();
    o.step('preview');
    this.server = await preview({ configFile: false, root: o.root, logLevel: 'warn', build: { outDir: join(o.directory, 'web', 'static') }, preview: { host: '127.0.0.1', port: this.port, strictPort: true } });
  }
  /** Closes the preview; a failure is returned as text, never thrown. */
  async closePreview(): Promise<string | null> { try { await this.server?.close(); return null; } catch { return 'preview close failed'; } }
  async closeRuntime(): Promise<string | null> { try { await this.runtime?.dispose(); return null; } catch { return 'workerd cleanup failed'; } }
}
