// Web-iii live smoke, the pure part before any duel (web build spec §8 "The live check", §5.3): arguments, the header
// checks against a fake site built from the real passcode middleware, the service preflight, the paid-file pick and
// redaction.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handlePasscode, isNext, type PasscodeEnv } from '../src/web/passcode';
import { checkServiceOrigin, clip, compareDeployedVersion, firstPaidPath, NOT_CONFIGURED_PROBLEM, parseLiveArgs, redact, runHeaderChecks, type FetchLike } from '../scripts/web/live/headers';

const PASSCODE = 'correct horse battery staple', SECRET = Buffer.alloc(32, 7).toString('base64');
const VERSION = { build: { version: '0.1.0', rev: 'abc1234', sim: 54 }, sim: 54, digest: 'a'.repeat(64) };
const URL_ = 'https://ftlite-test.vercel.app', PAID = '/assets/paid/2mt/hound.png';
/** A fake live site: the real middleware in front of a static server with the deploy's cache headers. */
function site(o: { secret?: string | undefined; leak?: string; cache?: string; versionCache?: string } = {}): FetchLike {
  const env: PasscodeEnv = { passcode: PASSCODE, secret: 'secret' in o ? o.secret : SECRET, nowMs: () => Date.now(), sleep: async () => {} };
  return async (url, init) => {
    const path = new URL(url).pathname;
    if (path === o.leak) return new Response('png', { status: 200, headers: { 'cache-control': 'private, no-cache' } });
    const answer = await handlePasscode(new Request(url, init), env);
    if (!isNext(answer)) return answer;
    if (path === '/version.json') return new Response(JSON.stringify(VERSION), { headers: { 'cache-control': o.versionCache ?? 'no-store' } });
    const body = path === '/' ? '<!doctype html><script type="module" src="/assets/index-abc.js"></script>' : 'file';
    return new Response(body, { headers: { 'cache-control': o.cache ?? 'private, no-cache' } });
  };
}
const run = (fetch: FetchLike, passcode = PASSCODE) => runHeaderChecks({ url: URL_, passcode, paidPath: PAID, fetch });

describe('parseLiveArgs', () => {
  const env = { FTLITE_LIVE_URL: `${URL_}/`, FTLITE_LIVE_PASSCODE: PASSCODE };
  it('reads the url and passcode from the environment and the rest from flags', () => {
    expect(parseLiveArgs([], env)).toEqual({ url: URL_, passcode: PASSCODE, paidPath: null, serviceOrigin: null, reportPath: 'out/web-iii-live/live-smoke.json' });
    expect(parseLiveArgs(['--url=https://other.vercel.app', `--paid-path=${PAID}`, '--report-path=out/x.json'], { ...env, FTLITE_WEB_SERVICE_ORIGIN: 'https://sig.example.workers.dev' }))
      .toEqual({ url: 'https://other.vercel.app', passcode: PASSCODE, paidPath: PAID, serviceOrigin: 'https://sig.example.workers.dev', reportPath: 'out/x.json' });
  });
  it('refuses a passcode flag, a missing passcode, a non-https or non-origin url, a bad paid path and Playwright debug logging', () => {
    expect(() => parseLiveArgs([`--passcode=${PASSCODE}`], env)).toThrow(/only from FTLITE_LIVE_PASSCODE/);
    try { parseLiveArgs([`--passcode=${PASSCODE}`], env); } catch (error) { expect(String(error)).not.toContain(PASSCODE); }
    expect(() => parseLiveArgs([], { FTLITE_LIVE_URL: URL_ })).toThrow(/FTLITE_LIVE_PASSCODE/);
    expect(() => parseLiveArgs([], { ...env, FTLITE_LIVE_URL: 'http://ftlite-test.vercel.app' })).toThrow(/https origin/);
    expect(() => parseLiveArgs([], { ...env, FTLITE_LIVE_URL: `${URL_}/game` })).toThrow(/https origin/);
    expect(() => parseLiveArgs([], { FTLITE_LIVE_PASSCODE: PASSCODE })).toThrow(/FTLITE_LIVE_URL/);
    expect(() => parseLiveArgs(['--paid-path=/assets/other.png'], env)).toThrow(/paid-path/);
  });
  it('refuses any DEBUG pattern that could enable a Playwright namespace, and DEBUG_FILE or PWDEBUG', () => {
    for (const DEBUG of ['pw:api', '*', 'pw*', 'foo,*', 'vite:*', 'express pw:protocol'])
      expect(() => parseLiveArgs([], { ...env, DEBUG }), DEBUG).toThrow(/unset DEBUG/);
    expect(() => parseLiveArgs([], { ...env, DEBUG_FILE: 'out/debug.log' })).toThrow(/unset DEBUG/);
    expect(() => parseLiveArgs([], { ...env, PWDEBUG: '1' })).toThrow(/unset DEBUG/);
    for (const DEBUG of ['', 'express', 'vite:config', '-pw:*', '-*']) expect(parseLiveArgs([], { ...env, DEBUG }).url, DEBUG).toBe(URL_);
  });
});

describe('runHeaderChecks', () => {
  it('passes a correctly deployed site and returns the cookie only as a secret', async () => {
    const result = await run(site());
    expect(result.problems).toEqual([]);
    expect(result.version).toEqual(VERSION);
    expect(result.checks.map(c => `${c.method} ${c.path} ${c.cookie} ${c.status}`)).toEqual([
      'GET / false 401', 'GET /assets/authorityWorker.js false 401', `GET ${PAID} false 401`, 'GET /version.json false 401',
      'POST /__pass false 401', 'POST /__pass false 303',
      'GET / true 200', 'GET /assets/authorityWorker.js true 200', `GET ${PAID} true 200`, 'GET /version.json true 200']);
    expect(result.secrets.length).toBe(2);
    const text = JSON.stringify(result.checks);
    expect(text).not.toContain(PASSCODE); for (const s of result.secrets) expect(text).not.toContain(s);
  });
  it('names the env-var cause when the middleware is not configured (503) and stops', async () => {
    const result = await run(site({ secret: undefined }));
    expect(result.problems).toEqual([NOT_CONFIGURED_PROBLEM]);
    expect(result.checks.length).toBe(4);
    expect(NOT_CONFIGURED_PROBLEM).toMatch(/Production/);
  });
  it('fails when the paid art is served without the cookie', async () => {
    expect((await run(site({ leak: PAID }))).problems).toContainEqual(expect.stringMatching(/^without the cookie: \/assets\/paid\/2mt\/hound\.png: answered 200/));
  });
  it('fails on the wrong cache headers', async () => {
    expect((await run(site({ cache: 'public, max-age=3600' }))).problems).toContainEqual(expect.stringMatching(/^with the cookie: \/: answered 200 with cache-control public, max-age=3600/));
    expect((await run(site({ versionCache: 'private, no-cache' }))).problems).toContainEqual(expect.stringMatching(/^with the cookie: \/version\.json: .*no-store/));
  });
  it('fails without cookie checks when the passcode is refused', async () => {
    const result = await run(site(), 'not the passcode');
    expect(result.problems).toContainEqual(expect.stringMatching(/^right passcode: the right passcode answered 401/));
    expect(result.checks.length).toBe(6); expect(result.secrets).toEqual([]);
  });
});

describe('checkServiceOrigin', () => {
  const service = (status: number, allow: string | null): FetchLike => async (_url, init) => {
    expect(init?.method).toBe('OPTIONS'); expect((init?.headers as Record<string, string>).Origin).toBe(URL_);
    return new Response(null, { status, headers: allow ? { 'access-control-allow-origin': allow } : {} });
  };
  it('accepts a preflight that allows the live origin and names the fix otherwise', async () => {
    expect((await checkServiceOrigin({ serviceOrigin: 'https://sig.example', pageOrigin: URL_, fetch: service(204, URL_) })).problem).toBeNull();
    expect((await checkServiceOrigin({ serviceOrigin: 'https://sig.example', pageOrigin: URL_, fetch: service(403, null) })).problem).toMatch(/wrangler secret put ALLOWED_ORIGINS with null,https:\/\/ftlite-test\.vercel\.app/);
  });
});

describe('firstPaidPath and redact', () => {
  let dir = '';
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });
  it('picks the first paid PNG in sorted order, URL-encoded; null without the folder', () => {
    dir = mkdtempSync(join(tmpdir(), 'ftlite-live-paid-'));
    expect(firstPaidPath(dir)).toBeNull();
    mkdirSync(join(dir, 'public', 'assets', 'paid', 'a'), { recursive: true }); mkdirSync(join(dir, 'public', 'assets', 'paid', 'b'), { recursive: true });
    writeFileSync(join(dir, 'public', 'assets', 'paid', 'a', 'readme.txt'), 'x'); writeFileSync(join(dir, 'public', 'assets', 'paid', 'b', 'x y.png'), 'x');
    expect(firstPaidPath(dir)).toBe('/assets/paid/b/x%20y.png');
  });
  it('redacts the raw, URL-encoded and form-encoded secret', () => {
    expect(redact(`a ${PASSCODE} b ${encodeURIComponent(PASSCODE)} c code=${new URLSearchParams({ code: PASSCODE }).toString().slice(5)}`, [PASSCODE]))
      .toBe('a [redacted] b [redacted] c code=[redacted]');
    expect(redact('nothing', ['', 'zz'])).toBe('nothing');
  });
  it('redacts a passcode with a quote or backslash inside JSON text', () => {
    const odd = 'say "hi" \\ now';
    expect(redact(JSON.stringify({ failure: `x ${odd} y` }), [odd])).toBe('{"failure":"x [redacted] y"}');
  });
  it('clip redacts before it cuts, so a secret across the cut leaves no fragment', () => {
    const out = clip('x'.repeat(695) + PASSCODE + ' tail', [PASSCODE], 700);
    expect(out).toBe('x'.repeat(695) + '[reda'); expect(out).not.toContain('corr');
  });
});

describe('compareDeployedVersion', () => {
  let dir = '';
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });
  it('needs the live version.json to equal the local build output when there is one', () => {
    dir = mkdtempSync(join(tmpdir(), 'ftlite-live-version-'));
    const path = join(dir, 'version.json');
    expect(compareDeployedVersion(VERSION, path)).toEqual({ versionCompared: false, problem: null });
    writeFileSync(path, JSON.stringify(VERSION));
    expect(compareDeployedVersion(VERSION, path)).toEqual({ versionCompared: true, problem: null });
    expect(compareDeployedVersion({ ...VERSION, digest: 'b'.repeat(64) }, path)).toEqual({ versionCompared: true, problem: 'the live site is not the build in .vercel/output' });
    expect(compareDeployedVersion(null, path).problem).toBe('the live site is not the build in .vercel/output');
  });
});
