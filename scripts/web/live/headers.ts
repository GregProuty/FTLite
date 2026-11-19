// Web-iii live smoke (web build spec §8 "The live check", §5.3): the checks that run against the live site before any
// duel. Pure apart from the injected fetch. The passcode comes only from FTLITE_LIVE_PASSCODE; it and the minted
// cookie are returned as secrets for redaction and never written into a check.
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PASS_COOKIE, PASS_MAX_AGE_S, PASS_PATH, WRONG_PASSCODE_TEXT } from '../../../src/web/passcode';
import { validVersion } from '../web-output';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface LiveArgs { url: string; passcode: string; paidPath: string | null; serviceOrigin: string | null; reportPath: string }
export interface HeaderCheck { label: string; method: 'GET' | 'POST'; path: string; cookie: boolean; status: number | null; cacheControl: string | null; problem: string | null }
export interface LiveVersion { build: { version: string; rev: string; sim: number }; sim: number; digest: string }
export interface HeaderResult { checks: HeaderCheck[]; version: LiveVersion | null; problems: string[]; secrets: string[] }
export interface ServiceCheck { origin: string; status: number | null; allowOrigin: string | null; problem: string | null }

export const LIVE_REPORT_PATH = 'out/web-iii-live/live-smoke.json';
export const WORKER_PATH = '/assets/authorityWorker.js', VERSION_PATH = '/version.json';
/** Web-ii W-2: the game's files; spec §5.4: version.json. Compared after lower-casing and normalising the commas. */
export const GAME_CACHE = 'private, no-cache', VERSION_CACHE = 'no-store';
export const NOT_CONFIGURED_PROBLEM = 'the site answers 503 "FTLite is not configured.": FTLITE_PASSCODE and FTLITE_COOKIE_SECRET are not reaching the middleware. '
  + 'Check that both are set for Production in Vercel (the secret is 32 random bytes in base64), then redeploy (env changes need a new deploy).';
const HTTPS_ORIGIN = /^https:\/\/[^/\\\s@?#]+\/?$/i;

function httpsOrigin(value: string | undefined, what: string): string {
  if (!value || !HTTPS_ORIGIN.test(value)) throw Error(`${what} must be exactly one https origin, like https://<project>.vercel.app`);
  return new URL(value).origin;
}

/** The debug module enables a namespace for any non-negated pattern that is a wildcard or starts with pw (pw:api,
 *  pw:channel, pw:protocol print fill() values); DEBUG_FILE and PWDEBUG turn Playwright's logging on by themselves. */
export function debugCouldLogPasscode(env: Record<string, string | undefined>): boolean {
  const risky = (env.DEBUG ?? '').split(/[\s,]+/).some(p => p.length > 0 && !p.startsWith('-') && (p.includes('*') || p.startsWith('pw')));
  return risky || !!env.DEBUG_FILE || !!env.PWDEBUG;
}

export function parseLiveArgs(argv: readonly string[], env: Record<string, string | undefined>): LiveArgs {
  const value = (name: string): string | undefined => argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (argv.some(a => a.startsWith('--passcode'))) throw Error('the passcode is read only from FTLITE_LIVE_PASSCODE, never from the command line');
  if (debugCouldLogPasscode(env)) throw Error("unset DEBUG, DEBUG_FILE and PWDEBUG: Playwright's debug log would print the passcode");
  const url = httpsOrigin(value('url') ?? env.FTLITE_LIVE_URL, 'FTLITE_LIVE_URL (or --url=)');
  const passcode = env.FTLITE_LIVE_PASSCODE ?? '';
  if (!passcode) throw Error('set FTLITE_LIVE_PASSCODE to the passcode friends type');
  const paidPath = value('paid-path') ?? null;
  if (paidPath !== null && !/^\/assets\/paid\/[^?#\s]+$/.test(paidPath)) throw Error('--paid-path must be /assets/paid/<file>');
  const service = value('service-origin') ?? env.FTLITE_WEB_SERVICE_ORIGIN;
  return { url, passcode, paidPath, serviceOrigin: service ? httpsOrigin(service, 'FTLITE_WEB_SERVICE_ORIGIN (or --service-origin=)') : null,
    reportPath: value('report-path') ?? LIVE_REPORT_PATH };
}

/** The first PNG under public/assets/paid in sorted order, as a URL path; null when there is none (a worktree has no paid art). */
export function firstPaidPath(root: string): string | null {
  const base = join(root, 'public', 'assets', 'paid');
  if (!existsSync(base)) return null;
  const walk = (dir: string): string[] => readdirSync(dir).sort().flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const first = walk(base).find(p => /\.png$/i.test(p));
  return first === undefined ? null : '/assets/paid/' + relative(base, first).split(/[\\/]/).map(encodeURIComponent).join('/');
}

/** Each secret as typed, URL-encoded, form-encoded (spaces as +) and JSON-escaped (the report is redacted as JSON
 *  text), longest first; empty strings dropped. */
export function secretVariants(secrets: readonly string[]): string[] {
  const all = secrets.filter(s => s.length > 0).flatMap(s => [s, encodeURIComponent(s), new URLSearchParams({ c: s }).toString().slice(2), JSON.stringify(s).slice(1, -1)]);
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}
export function redact(text: string, secrets: readonly string[]): string {
  return secretVariants(secrets).reduce((t, s) => t.split(s).join('[redacted]'), text);
}
/** Redact first, then cut: a secret across the cut would otherwise survive as an unmatched fragment. */
export function clip(text: string, secrets: readonly string[], max: number): string {
  return redact(text, secrets).slice(0, max);
}

/** Plan L-5: the live version.json must be the build deploy:web just wrote, when that output is present. */
export function compareDeployedVersion(live: LiveVersion | null, localPath: string): { versionCompared: boolean; problem: string | null } {
  if (!existsSync(localPath)) return { versionCompared: false, problem: null };
  let local: unknown; try { local = JSON.parse(readFileSync(localPath, 'utf8')); } catch { local = undefined; }
  return { versionCompared: true, problem: live !== null && isDeepStrictEqual(local, live) ? null : 'the live site is not the build in .vercel/output' };
}

function cacheControlOf(response: Response): string | null {
  const v = response.headers.get('cache-control');
  return v === null ? null : v.toLowerCase().split(',').map(s => s.trim()).filter(Boolean).join(', ');
}

export async function runHeaderChecks(o: { url: string; passcode: string; paidPath: string; fetch: FetchLike }): Promise<HeaderResult> {
  const checks: HeaderCheck[] = [], secrets: string[] = [];
  let version: LiveVersion | null = null, notConfigured = false;
  const form = `action="${PASS_PATH}"`;
  const ask = async (label: string, path: string, cookie: string | null, code?: string): Promise<{ response: Response | null; body: string; check: HeaderCheck }> => {
    const check: HeaderCheck = { label, method: code === undefined ? 'GET' : 'POST', path, cookie: cookie !== null, status: null, cacheControl: null, problem: null };
    checks.push(check);
    const headers: Record<string, string> = {};
    if (cookie !== null) headers.cookie = `${PASS_COOKIE}=${cookie}`;
    if (code !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
    try {
      const response = await o.fetch(o.url + path, { method: check.method, redirect: 'manual', headers,
        ...(code === undefined ? {} : { body: new URLSearchParams({ code }).toString() }) });
      check.status = response.status; check.cacheControl = cacheControlOf(response);
      if (response.status === 503) notConfigured = true;
      return { response, body: (await response.text()).slice(0, 65536), check };
    } catch (error) {
      check.problem = `request failed: ${clip(String((error as Error)?.message ?? error), [o.passcode, ...secrets], 200)}`;
      return { response: null, body: '', check };
    }
  };
  const fail = (check: HeaderCheck, problem: string): void => { check.problem ??= problem; };
  const done = (): HeaderResult => ({ checks, version, secrets,
    problems: notConfigured ? [NOT_CONFIGURED_PROBLEM] : checks.filter(c => c.problem !== null).map(c => `${c.label}: ${c.problem}`) });

  // 1. Without the cookie every path is the passcode page (401): the root, the Worker, the paid art and version.json.
  for (const path of ['/', WORKER_PATH, o.paidPath, VERSION_PATH]) {
    const { check, body } = await ask(`without the cookie: ${path}`, path, null);
    if (check.status !== null && (check.status !== 401 || !body.includes(form))) fail(check, `answered ${check.status} without the cookie (expected 401 with the passcode form)`);
  }
  if (notConfigured) return done();
  // 2. A wrong passcode is refused (after the middleware's 1 s delay).
  const wrong = await ask('wrong passcode', PASS_PATH, null, 'wrong-' + randomBytes(12).toString('hex'));
  if (wrong.check.status !== null && (wrong.check.status !== 401 || !wrong.body.includes(WRONG_PASSCODE_TEXT)))
    fail(wrong.check, `a wrong passcode answered ${wrong.check.status} (expected 401 "${WRONG_PASSCODE_TEXT}")`);
  // 3. The right passcode answers 303 to / and sets the spec's cookie.
  const right = await ask('right passcode', PASS_PATH, null, o.passcode);
  const setCookie = right.response?.headers.get('set-cookie') ?? '';
  const cookie = new RegExp(`(?:^|[,\\s])${PASS_COOKIE}=([^;,\\s]+)`).exec(setCookie)?.[1] ?? null;
  if (cookie) secrets.push(cookie, `${PASS_COOKIE}=${cookie}`);
  const attributes = setCookie.split(';').map(s => s.trim().toLowerCase());
  if (right.check.status !== null && (right.check.status !== 303 || right.response?.headers.get('location') !== '/' || !cookie
    || !['httponly', 'secure', 'samesite=lax', 'path=/', `max-age=${PASS_MAX_AGE_S}`].every(a => attributes.includes(a))))
    fail(right.check, `the right passcode answered ${right.check.status} without the spec's redirect and cookie (expected 303 to / setting ${PASS_COOKIE}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${PASS_MAX_AGE_S})`);
  if (!cookie || right.check.problem !== null) return done();
  // 4. With the cookie: the game's files answer 200 with private, no-cache; / is the game (the prebuilt output is live).
  for (const path of ['/', WORKER_PATH, o.paidPath]) {
    const { check, body } = await ask(`with the cookie: ${path}`, path, cookie);
    if (check.status === null) continue;
    if (check.status !== 200 || check.cacheControl !== GAME_CACHE) fail(check, `answered ${check.status} with cache-control ${check.cacheControl} (expected 200 with ${GAME_CACHE})`);
    else if (path === '/' && (body.includes(form) || !body.includes('<script'))) fail(check, 'the root page is not the game (the prebuilt output is not what is served)');
  }
  // 5. version.json: 200, no-store, { build, sim, digest }.
  const v = await ask(`with the cookie: ${VERSION_PATH}`, VERSION_PATH, cookie);
  if (v.check.status !== null) {
    let parsed: unknown; try { parsed = JSON.parse(v.body); } catch { parsed = undefined; }
    if (v.check.status !== 200 || v.check.cacheControl !== VERSION_CACHE) fail(v.check, `answered ${v.check.status} with cache-control ${v.check.cacheControl} (expected 200 with ${VERSION_CACHE})`);
    else if (!validVersion(parsed)) fail(v.check, 'version.json is not { build, sim, digest }');
    else version = parsed as LiveVersion;
  }
  return done();
}

/** The page's room-create preflight from Node with the live Origin (web-net-smoke.ts's shape): ALLOWED_ORIGINS must list it. */
export async function checkServiceOrigin(o: { serviceOrigin: string; pageOrigin: string; fetch: FetchLike }): Promise<ServiceCheck> {
  const result: ServiceCheck = { origin: o.serviceOrigin, status: null, allowOrigin: null, problem: null };
  let status: number;
  try {
    const r = await o.fetch(`${o.serviceOrigin}/v2/rooms`, { method: 'OPTIONS',
      headers: { Origin: o.pageOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    status = r.status; result.status = status; result.allowOrigin = r.headers.get('access-control-allow-origin');
  } catch (error) { result.problem = `the signalling service did not answer: ${String((error as Error)?.message ?? error).slice(0, 200)}`; return result; }
  if (status < 200 || status > 299 || result.allowOrigin !== o.pageOrigin)
    result.problem = `the signalling service refuses ${o.pageOrigin} (preflight ${status}): from services/signalling run npx wrangler secret put ALLOWED_ORIGINS with null,${o.pageOrigin}`;
  return result;
}
