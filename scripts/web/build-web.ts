// `npm run build:web` (web build spec §5.1): the renderer's plain Vite build into <out>/static, version.json, the passcode
// middleware into <out>/functions/_middleware.func, and <out>/config.json, in Vercel's Build Output API v3 layout.
// Production: FTLITE_WEB_SERVICE_ORIGIN, the paid art present, out .vercel/output. A local test build: --test (deviation W-1).
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { checkPaidArt, resolveWebBuildPlan, webVersionInfo, type WebBuildPlan } from '../../build/webBuild';
import { createWebViteConfig } from '../../vite.web.config';
import { bundleMiddleware, VERCEL_CONFIG } from './web-output';

export async function buildWeb(root: string, plan: WebBuildPlan): Promise<{ outDir: string; paidArt: boolean }> {
  const paidArt = checkPaidArt(root, plan);
  rmSync(plan.outDir, { recursive: true, force: true });   // resolveWebBuildPlan limited it to .vercel/output, out/ or the temp directory
  await build(createWebViteConfig(root, plan));
  const staticDir = join(plan.outDir, 'static');
  if (existsSync(join(staticDir, 'networkTransport.html'))) rmSync(join(staticDir, 'networkTransport.html'));   // spec §5.1: never ships
  for (const required of ['index.html', 'assets/authorityWorker.js', 'assets/manifest.json'])
    if (!existsSync(join(staticDir, required))) throw Error(`build:web: ${required} is missing from the build`);
  writeFileSync(join(staticDir, 'version.json'), JSON.stringify(webVersionInfo(root)) + '\n');
  await bundleMiddleware(root, plan.outDir);
  writeFileSync(join(plan.outDir, 'config.json'), JSON.stringify(VERCEL_CONFIG, null, 2) + '\n');
  return { outDir: plan.outDir, paidArt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  void (async () => {
    const plan = resolveWebBuildPlan(root, process.argv.slice(2), process.env);
    const result = await buildWeb(root, plan);
    console.log(`WEB BUILD ${plan.test ? 'TEST' : 'PRODUCTION'}: ${result.outDir} (service ${plan.pageConfig.serviceOrigin}, paid art ${result.paidArt ? 'included' : 'MISSING (test only)'})`);
  })().catch(error => { console.error(String((error as Error)?.message ?? error)); process.exitCode = 1; });
}
