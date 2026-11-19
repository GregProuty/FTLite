// The vercel-dev-free check of a built .vercel/output (web build spec §8): config.json runs the middleware first on every
// path, the Edge function is configured, version.json is valid, and every static path except the passcode page needs the
// cookie. A fixture output with the real bundled middleware passes; broken ones fail for their named reason.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleMiddleware, checkWebOutput, MIDDLEWARE_NAME, VERCEL_CONFIG } from '../scripts/web/web-output';
import { webVersionInfo } from '../build/webBuild';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
async function fixture(): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), 'ftlite-web-output-')); dirs.push(out);
  for (const [path, body] of [['index.html', '<!DOCTYPE html>'], ['assets/authorityWorker.js', '//'], ['assets/manifest.json', '{}'], ['assets/paid/2mt/a b.png', 'png'],
    ['version.json', JSON.stringify(webVersionInfo(process.cwd()))]] as const) {
    mkdirSync(join(out, 'static', path, '..'), { recursive: true }); writeFileSync(join(out, 'static', path), body);
  }
  await bundleMiddleware(process.cwd(), out);
  writeFileSync(join(out, 'config.json'), JSON.stringify(VERCEL_CONFIG));
  return out;
}

describe('checkWebOutput', () => {
  it('passes a correct output: every static path needs the cookie', async () => {
    const result = await checkWebOutput(await fixture());
    expect(result).toEqual({ problems: [], staticPaths: 5 });
  }, 30000);
  it('fails when a route runs before the middleware, or the middleware does not cover every path', async () => {
    const out = await fixture();
    writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ src: '/assets/(.*)', continue: true }, ...VERCEL_CONFIG.routes] }));
    expect((await checkWebOutput(out)).problems).toContain('config.json is not the passcode routing config');
  }, 30000);
  it('fails when the middleware lets a static path through without the cookie', async () => {
    const out = await fixture();
    writeFileSync(join(out, 'functions', `${MIDDLEWARE_NAME}.func`, 'index.js'), "export default () => new Response(null, { headers: { 'x-middleware-next': '1' } });\n");
    const { problems } = await checkWebOutput(out);
    expect(problems).toContain('served without the cookie: /index.html'); expect(problems).toContain('served without the cookie: /assets/paid/2mt/a%20b.png');
  }, 30000);
  it('fails on a static file at the passcode path, a hidden transport page, or a bad version.json', async () => {
    const out = await fixture();
    writeFileSync(join(out, 'static', '__pass'), 'x'); writeFileSync(join(out, 'static', 'networkTransport.html'), 'x'); writeFileSync(join(out, 'static', 'version.json'), '{}');
    const { problems } = await checkWebOutput(out);
    expect(problems).toEqual(expect.arrayContaining(['a static file shadows /__pass', 'networkTransport.html must not ship', 'version.json is not { build, sim, digest }']));
  }, 30000);
});
