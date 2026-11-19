// The Vercel Build Output's routing and Edge function (web build spec §5.1, §5.3, deviation W-2), and the
// vercel-dev-free check of a built output (§8): the bundled middleware is imported in Node and asked about every static
// path, with and without a cookie it minted itself through POST /__pass.
import { build as esbuild } from 'esbuild';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { isNext, PASS_PATH, WRONG_PASSCODE_TEXT } from '../../src/web/passcode';

export const MIDDLEWARE_NAME = '_middleware';
/** The middleware runs first on every path; then the game's cache headers (spec §5.3) and version.json's (§5.4). */
export const VERCEL_CONFIG = { version: 3, routes: [
  { src: '/(.*)', middlewarePath: MIDDLEWARE_NAME, continue: true },
  { src: '/(.*)', headers: { 'Cache-Control': 'private, no-cache' }, continue: true },
  { src: '/version\\.json', headers: { 'Cache-Control': 'no-store' }, continue: true }
] };
/** envVarsInUse (review R1-F1): the env vars the Edge function reads, so a prebuilt function is handed them. */
export const VC_CONFIG = { runtime: 'edge', entrypoint: 'index.js', envVarsInUse: ['FTLITE_PASSCODE', 'FTLITE_COOKIE_SECRET'] };

/** Bundle src/web/middleware.ts into <out>/functions/_middleware.func (deviation W-8: process.env stays as written). */
export async function bundleMiddleware(root: string, outDir: string): Promise<void> {
  const dir = join(outDir, 'functions', `${MIDDLEWARE_NAME}.func`);
  mkdirSync(dir, { recursive: true });
  await esbuild({ entryPoints: [resolve(root, 'src/web/middleware.ts')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    outfile: join(dir, 'index.js'), logLevel: 'warning' });
  writeFileSync(join(dir, '.vc-config.json'), JSON.stringify(VC_CONFIG, null, 2) + '\n');
}

function walk(dir: string): string[] {
  return readdirSync(dir).sort().flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
function validVersion(value: any): boolean {
  return !!value && typeof value === 'object' && Object.keys(value).sort().join() === 'build,digest,sim' && Number.isSafeInteger(value.sim)
    && typeof value.digest === 'string' && /^[0-9a-f]{64}$/.test(value.digest) && !!value.build && typeof value.build.version === 'string'
    && typeof value.build.rev === 'string' && value.build.sim === value.sim;
}
const readJson = (path: string): unknown => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; } };

export async function checkWebOutput(outDir: string): Promise<{ problems: string[]; staticPaths: number }> {
  const problems: string[] = [], staticDir = join(outDir, 'static'), fn = join(outDir, 'functions', `${MIDDLEWARE_NAME}.func`);
  if (!isDeepStrictEqual(readJson(join(outDir, 'config.json')), VERCEL_CONFIG)) problems.push('config.json is not the passcode routing config');
  if (!isDeepStrictEqual(readJson(join(fn, '.vc-config.json')), VC_CONFIG)) problems.push('the middleware .vc-config.json is not the Edge config');
  for (const required of ['index.html', 'version.json', 'assets/authorityWorker.js']) if (!existsSync(join(staticDir, required))) problems.push(`static/${required} is missing`);
  if (existsSync(join(staticDir, PASS_PATH.slice(1)))) problems.push(`a static file shadows ${PASS_PATH}`);
  if (existsSync(join(staticDir, 'networkTransport.html'))) problems.push('networkTransport.html must not ship');
  if (existsSync(join(staticDir, 'version.json')) && !validVersion(readJson(join(staticDir, 'version.json')))) problems.push('version.json is not { build, sim, digest }');
  const paths = existsSync(staticDir) ? walk(staticDir).map(p => '/' + relative(staticDir, p).split(/[\\/]/).map(encodeURIComponent).join('/')) : [];
  if (!existsSync(join(fn, 'index.js'))) return { problems: [...problems, 'the middleware bundle is missing'], staticPaths: paths.length };
  // The middleware reads its env per request; set a throwaway passcode and secret for this check only, then restore.
  const saved = { passcode: process.env.FTLITE_PASSCODE, secret: process.env.FTLITE_COOKIE_SECRET };
  process.env.FTLITE_PASSCODE = 'output-check-' + randomBytes(8).toString('hex'); process.env.FTLITE_COOKIE_SECRET = randomBytes(32).toString('base64');
  try {
    const mod = await import(pathToFileURL(join(fn, 'index.js')).href + `?check=${Date.now()}`) as { default: (request: Request) => Promise<Response> };
    const ask = (path: string, init: RequestInit = {}): Promise<Response> => mod.default(new Request(`https://ftlite.example${path}`, init));
    const form = (code: string): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code }).toString() });
    const wrong = await ask(PASS_PATH, form('not-the-passcode'));
    if (wrong.status !== 401 || !(await wrong.text()).includes(WRONG_PASSCODE_TEXT)) problems.push('a wrong passcode is not refused');
    const right = await ask(PASS_PATH, form(process.env.FTLITE_PASSCODE));
    const cookie = /^(ftlite_pass=[^;]+);/.exec(right.headers.get('set-cookie') ?? '')?.[1];
    if (right.status !== 303 || !cookie) problems.push('the right passcode sets no cookie');
    for (const path of paths) {
      const bare = await ask(path);
      if (isNext(bare) || bare.status !== 401 || !(await bare.text()).includes(`action="${PASS_PATH}"`)) problems.push(`served without the cookie: ${path}`);
      if (cookie && !isNext(await ask(path, { headers: { cookie } }))) problems.push(`refused with a valid cookie: ${path}`);
    }
  } finally {
    if (saved.passcode === undefined) delete process.env.FTLITE_PASSCODE; else process.env.FTLITE_PASSCODE = saved.passcode;
    if (saved.secret === undefined) delete process.env.FTLITE_COOKIE_SECRET; else process.env.FTLITE_COOKIE_SECRET = saved.secret;
  }
  return { problems, staticPaths: paths.length };
}
