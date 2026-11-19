# Web-iii live smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run test:web-live` (`scripts/web/live-smoke.ts`) checks the live `https://<project>.vercel.app` deploy: the passcode and cache headers first, then a Chromium host and a Firefox guest (forced through TURN) host, join by code, play 60 s and leave. It writes a JSON report and prints one PASS/FAIL line.

**Architecture:** There are three small modules under `scripts/web/live/`. `headers.ts` holds the argument parsing, the fetch-injected header checks, the service preflight check, the paid-file pick and redaction. `relay.ts` holds the page-side relay hook, the stats and UI read sources, and the pure verdicts. `duel.ts` is the Playwright runner. `report.ts` validates the report. The entry `scripts/web/live-smoke.ts` wires them together. Everything except `duel.ts` and the entry is unit-tested against fakes; the header checks run against a fake site built from the real `handlePasscode`. TURN is forced with a Playwright init script that wraps `RTCPeerConnection`. That is test code, so there is **no product change**. Relay use is then verified through `getStats` on the selected candidate pair.

**Tech Stack:** TypeScript, tsx, Vitest 3.2.7, Playwright 1.48.2 (already pinned), Node 24 `fetch`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Spec:** `docs/superpowers/specs/2026-11-18-web-build-design.md`. This plan covers part **Web-iii** (§9 item 3), as far as code goes: §8 "The live check" (*"enters the passcode from an environment variable. It runs two browser profiles with `iceTransportPolicy: 'relay'` (forced through TURN), host, join, play 60 s and leave"*), the §5.3 header rules, and the owner steps of §5.2/§6/§9 in `docs/gates.md`. **No task runs a deploy, `vercel`, `wrangler`, or the live smoke against a real site.** The owner runs those.
- **No gameplay change and no product change.** `SIM_VERSION` stays as it is, and no file under `src/` is edited. The only edit outside the new files is one `export` added to `validVersion` in `scripts/web/web-output.ts` (Task 1), which is test tooling.
- **Base:** written against master `438fd688`. If master moved, find every quoted line again with `grep -n` before editing; never trust a line number alone.
- **Worktree:** `.worktrees/web-iii` on branch `web-iii` from `master`. `node_modules` and `services/signalling/node_modules` must be directory junctions to the main checkout's (`cmd /c mklink /J`). **Never run `npm install` in the worktree.** No new dependency is needed: `playwright@1.48.2` is already pinned.
- **Stage files by explicit path only.** Never `git add -A`, `git add .` or `git commit -a`.
- **Every commit message ends with** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Use the Write tool** for new files and multi-line content, because bash heredocs have failed on this machine. Shell examples are Git Bash.
- **Secrets:** the passcode is read **only** from `FTLITE_LIVE_PASSCODE`; a `--passcode` argument is refused. Neither the passcode nor the minted `ftlite_pass` cookie may appear in any console line, error text or the report. Every outgoing string passes through `redact` with the raw, URL-encoded and form-encoded variants. With `DEBUG` containing `pw:`, the run is refused, because Playwright's API log would print `fill()` values.
- **Page code passed to `page.evaluate` as a function must be anonymous and inline.** tsx keeps function names, so a named inner function (`const f = () => …`) compiles to a `__name(...)` call that does not exist in the page. Longer page code is passed as a **string** (`UI_READ_SOURCE`, `PEER_STATS_SOURCE`, `RELAY_INIT_SCRIPT`).
- **Every page call has an explicit time limit** (`bounded` from `scripts/web/net/players.ts`, Web-ii gate lesson).
- **Exact texts (spec and code, verbatim):** `Wrong passcode` (`WRONG_PASSCODE_TEXT`), passcode form `action="/__pass"`, cookie `ftlite_pass=<value>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`. `cache-control` is `private, no-cache` for the game (Web-ii W-2) and `no-store` for `/version.json`. The 503 page says `FTLite is not configured.`
- **Gates:** `npm run typecheck`; `npx vitest run tests/webLive*.test.ts tests/webDeployScripts.test.ts tests/webOutput.test.ts`; then the full `npm test` once at the end (known load flakes that pass alone: director soak, `duelFire`, `snapshot`, `authorityBoundary`, `authorityIngress`, `leaseSmokeCleanup`, `onlineAppRuntime`, `acceptance`, `bot`, `eventList`, `run`; `tests/onlineRecoveryInstrumentation.test.ts` needs a built `out/`).

## Decisions (recorded for the reviewer)

- **L-1 Drive the real UI; force relay with an init script, not a product switch.** A production build has `packaged: true` and no test probe (Web-ii W-1, Web-i D-1), so the Web-ii `createBrowserPlayer` cannot be reused: it reads `window.__ftliteOnlineTest` and `window.onlineAppObservation`. The live driver clicks the same `data-testid` controls the Web-ii scenario clicks (`multiplayer`, `host`, `crew-2`, `create-room`, `join`, `join-code`, `join-room`, `ready`, `start`, `leave`). It reads the phase from the menu's `status` line: on the session page, `menuMessage` prints the phase name, and the lobby shows the title `Lobby`. It reads the join code from `room-code`. `onlinePeers.ts:110` hard-codes `iceTransportPolicy: 'all'`, so a Playwright `addInitScript` replaces `globalThis.RTCPeerConnection` with a subclass that forces `'relay'` in the constructor and in `setConfiguration`, and keeps every instance for `getStats`. `peer.ts` builds its connection with `new RTCPeerConnection(config)` at call time, so the subclass is used. Nothing ships to players.
- **L-2 Relay proof.** It is sampled every 10 s on both pages. Each sample covers every connected `RTCPeerConnection`: its `iceTransportPolicy`, the selected pair's local and remote `candidateType`, and the bytes. The pair is found three ways: Chromium's `transport.selectedCandidatePairId`, else Firefox's `candidate-pair.selected`, else `nominated && state 'succeeded'`. A side passes when at least two samples had a connected peer, every connected peer is `policy 'relay'` with local candidate `relay`, and at least 1,024 bytes arrived between the first and the last such sample. The remote type is recorded but not required: the local type alone proves this side went through TURN.
- **L-3 "Play 60 s".** Both players walk the duel smoke's routes (host to Weapons, guest to the Helm, then the guest holds thrust 2 s). This is best effort, because a production page exposes no seat state. Then both phases must stay `running` until 60 s after the round started. If the round ends first (`ended`), the play stops early and `endedEarly: true` is recorded. That still passes when the relay proof holds. `paused`, `error` or anything else fails.
- **L-4 Reused from Web-ii:** `bounded` and the `GateKey` type (`scripts/web/net/players.ts`); the key-press pattern (bring to front, blur, down/up); the duel routes, the 1280×800 viewport and the two-context isolation (own IndexedDB and Web Lock); `validVersion` (`scripts/web/web-output.ts`, newly exported); and the `OPTIONS /v2/rooms` preflight shape from `web-net-smoke.ts`.
- **L-5 The site-is-up check (the `vercel.json` question).** The root `vercel.json` `buildCommand` exits 1 for source builds only; `vercel deploy --prebuilt` runs no build. The live smoke proves that the prebuilt output is what is served: with the cookie, `/` answers 200 with HTML that contains `<script` and not the passcode form, and `/version.json` is a valid `{ build, sim, digest }`, whose `build` and `sim` go into the report. The gates doc also has the owner confirm that `deploy:web` printed the production URL and that `npx vercel ls` shows the deployment **Ready**.
- **L-6 The service preflight is optional.** When `FTLITE_WEB_SERVICE_ORIGIN` (or `--service-origin=`) is set, as it already is from the deploy step, the smoke sends the page's `OPTIONS /v2/rooms` with `Origin: <live url>`. It needs a 2xx with `access-control-allow-origin` equal to the live origin. A refusal names the `wrangler secret put ALLOWED_ORIGINS` fix and skips the duel.
- **L-7 Firefox is optional.** If `firefox.launch` fails because the browser is not installed, the guest is a second Chromium context, and the report says `chromium (Firefox not installed)`.
- **L-8 Header failures skip the duel and say "roll back".** If the paid art or the Worker might be reachable without the cookie, the run stops before any duel and prints the rollback command.

## File structure

- Create `scripts/web/live/headers.ts`: `parseLiveArgs`, `runHeaderChecks`, `checkServiceOrigin`, `firstPaidPath`, `redact`, `secretVariants`, and the shared types and constants.
- Create `scripts/web/live/relay.ts`: `RELAY_INIT_SCRIPT`, `PEER_STATS_SOURCE`, `UI_READ_SOURCE`, `uiPhase`, `roomCodeOf`, `relayVerdict`, `LiveDuelReport`, `PeerSample`, `UiView`, and the timing constants. It is pure and does not import Playwright.
- Create `scripts/web/live/duel.ts`: `runLiveDuel`, the Playwright runner.
- Create `scripts/web/live/report.ts`: `LiveReport` and `validateLiveReport`.
- Create `scripts/web/live-smoke.ts`: the entry (the path is named by the spec).
- Modify `scripts/web/web-output.ts`: export `validVersion`.
- Modify `package.json`: add the `test:web-live` script.
- Modify `docs/gates.md`: tick the Web-ii plan line and add the Web-iii section.
- Tests: `tests/webLiveHeaders.test.ts`, `tests/webLiveRelay.test.ts`, `tests/webLiveReport.test.ts`, `tests/webDeployScripts.test.ts` (one new case).

---

### Task 1: Header checks core

**Files:**
- Create: `scripts/web/live/headers.ts`
- Modify: `scripts/web/web-output.ts` (the line `function validVersion(value: any): boolean {` becomes `export function validVersion(value: any): boolean {`)
- Test: `tests/webLiveHeaders.test.ts`

**Interfaces:**
- Consumes: `PASS_COOKIE`, `PASS_MAX_AGE_S`, `PASS_PATH`, `WRONG_PASSCODE_TEXT`, `handlePasscode`, `isNext`, `PasscodeEnv` from `src/web/passcode.ts` (the test uses the last three), and `validVersion` from `scripts/web/web-output.ts`.
- Produces:
  - `type FetchLike = (url: string, init?: RequestInit) => Promise<Response>`
  - `interface LiveArgs { url: string; passcode: string; paidPath: string | null; serviceOrigin: string | null; reportPath: string }`
  - `interface HeaderCheck { label: string; method: 'GET' | 'POST'; path: string; cookie: boolean; status: number | null; cacheControl: string | null; problem: string | null }`
  - `interface LiveVersion { build: { version: string; rev: string; sim: number }; sim: number; digest: string }`
  - `interface HeaderResult { checks: HeaderCheck[]; version: LiveVersion | null; problems: string[]; secrets: string[] }`
  - `interface ServiceCheck { origin: string; status: number | null; allowOrigin: string | null; problem: string | null }`
  - `parseLiveArgs(argv: readonly string[], env: Record<string, string | undefined>): LiveArgs` (throws with a message that never holds the passcode)
  - `runHeaderChecks(o: { url: string; passcode: string; paidPath: string; fetch: FetchLike }): Promise<HeaderResult>`
  - `checkServiceOrigin(o: { serviceOrigin: string; pageOrigin: string; fetch: FetchLike }): Promise<ServiceCheck>`
  - `firstPaidPath(root: string): string | null`
  - `secretVariants(secrets: readonly string[]): string[]`, `redact(text: string, secrets: readonly string[]): string`
  - constants `LIVE_REPORT_PATH = 'out/web-iii-live/live-smoke.json'`, `WORKER_PATH`, `VERSION_PATH`, `GAME_CACHE`, `VERSION_CACHE`, `NOT_CONFIGURED_PROBLEM`

- [ ] **Step 1: Write the failing test**

Create `tests/webLiveHeaders.test.ts`:

```ts
// Web-iii live smoke, the pure part before any duel (web build spec §8 "The live check", §5.3): arguments, the header
// checks against a fake site built from the real passcode middleware, the service preflight, the paid-file pick and
// redaction.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handlePasscode, isNext, type PasscodeEnv } from '../src/web/passcode';
import { checkServiceOrigin, firstPaidPath, NOT_CONFIGURED_PROBLEM, parseLiveArgs, redact, runHeaderChecks, type FetchLike } from '../scripts/web/live/headers';

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
    expect(() => parseLiveArgs([], { ...env, DEBUG: 'pw:api' })).toThrow(/unset DEBUG/);
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/webLiveHeaders.test.ts`
Expected: FAIL, because `scripts/web/live/headers` cannot be resolved.

- [ ] **Step 3: Export `validVersion`**

In `scripts/web/web-output.ts`, change `function validVersion(value: any): boolean {` to `export function validVersion(value: any): boolean {`. Nothing else changes.

- [ ] **Step 4: Write the implementation**

Create `scripts/web/live/headers.ts`:

```ts
// Web-iii live smoke (web build spec §8 "The live check", §5.3): the checks that run against the live site before any
// duel. Pure apart from the injected fetch. The passcode comes only from FTLITE_LIVE_PASSCODE; it and the minted
// cookie are returned as secrets for redaction and never written into a check.
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
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

export function parseLiveArgs(argv: readonly string[], env: Record<string, string | undefined>): LiveArgs {
  const value = (name: string): string | undefined => argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (argv.some(a => a.startsWith('--passcode'))) throw Error('the passcode is read only from FTLITE_LIVE_PASSCODE, never from the command line');
  if (/pw:/.test(env.DEBUG ?? '')) throw Error("unset DEBUG: Playwright's debug log would print the passcode");
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

/** Each secret as typed, URL-encoded and form-encoded (spaces as +), longest first; empty strings dropped. */
export function secretVariants(secrets: readonly string[]): string[] {
  const all = secrets.filter(s => s.length > 0).flatMap(s => [s, encodeURIComponent(s), new URLSearchParams({ c: s }).toString().slice(2)]);
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}
export function redact(text: string, secrets: readonly string[]): string {
  return secretVariants(secrets).reduce((t, s) => t.split(s).join('[redacted]'), text);
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
      check.problem = `request failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`;
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/webLiveHeaders.test.ts tests/webOutput.test.ts`
Expected: PASS (all cases; `webOutput` still passes with the new export).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/web/live/headers.ts scripts/web/web-output.ts tests/webLiveHeaders.test.ts
git commit -m "feat(web-iii): live header checks (passcode, cookie, cache headers, 503 hint, service preflight)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The relay hook, verdicts and the live duel runner

**Files:**
- Create: `scripts/web/live/relay.ts`
- Create: `scripts/web/live/duel.ts`
- Test: `tests/webLiveRelay.test.ts`

**Interfaces:**
- Consumes: `bounded(work, ms, label)` and `type GateKey` from `scripts/web/net/players.ts`, and `WRONG_PASSCODE_TEXT` from `src/web/passcode.ts`.
- Produces (in `relay.ts`, pure):
  - `LIVE_PLAY_MS = 60000`, `MIN_RELAY_BYTES = 1024`, `RELAY_SAMPLE_MS = 10000`
  - `interface PeerSample { state: string; policy: string | null; local: string | null; remote: string | null; bytesReceived: number; bytesSent: number }`
  - `interface UiView { status: string | null; title: string | null; roomCode: string | null; pause: string | null; leave: string | null; retry: boolean; home: boolean }`
  - `interface LiveDuelReport { hostBrowser: string; guestBrowser: string; playedMs: number; endedEarly: boolean; phases: { host: string; guest: string }; samples: { host: PeerSample[][]; guest: PeerSample[][] }; relay: { host: string | null; guest: string | null }; pageErrors: string[]; problems: string[] }`
  - `RELAY_INIT_SCRIPT: string`, `PEER_STATS_SOURCE: string`, `UI_READ_SOURCE: string`
  - `uiPhase(v: UiView): string`, `roomCodeOf(v: UiView): string | null`, `relayVerdict(samples: readonly (readonly PeerSample[])[]): string | null` (null means relay was proven)
- Produces (in `duel.ts`): `runLiveDuel(o: { url: string; passcode: string; step(label: string): void; aborted(): boolean }): Promise<LiveDuelReport>`. It throws on a driver failure. Relay or page-error findings go into `problems`.

- [ ] **Step 1: Write the failing test**

Create `tests/webLiveRelay.test.ts`:

```ts
// Web-iii live smoke, the page-side pieces run in Node against fakes: the RTCPeerConnection relay hook, the stats read
// for Chromium- and Firefox-shaped stats, the phase read from the menu, and the relay verdict.
import { describe, expect, it } from 'vitest';
import { PEER_STATS_SOURCE, RELAY_INIT_SCRIPT, relayVerdict, roomCodeOf, UI_READ_SOURCE, uiPhase, type PeerSample, type UiView } from '../scripts/web/live/relay';

class FakePc { config: any; connectionState = 'new'; stats = new Map<string, any>();
  constructor(config?: any) { this.config = config; }
  setConfiguration(config: any): void { this.config = config; }
  getConfiguration(): any { return this.config; }
  async getStats(): Promise<Map<string, any>> { return this.stats; } }
const runIn = (g: object, source: string): unknown => new Function('globalThis', `return ${source}`)(g);

describe('the relay hook', () => {
  it('forces relay in the constructor and setConfiguration, keeps every instance and installs once', () => {
    const g: any = { RTCPeerConnection: FakePc };
    new Function('globalThis', RELAY_INIT_SCRIPT)(g);
    const pc = new g.RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all' });
    expect(pc).toBeInstanceOf(FakePc); expect(pc.config).toEqual({ iceServers: [], iceTransportPolicy: 'relay' });
    pc.setConfiguration({ iceTransportPolicy: 'all' }); expect(pc.config.iceTransportPolicy).toBe('relay');
    new Function('globalThis', RELAY_INIT_SCRIPT)(g);
    const bare = new g.RTCPeerConnection(); expect(bare.config).toEqual({ iceTransportPolicy: 'relay' });
    expect(g.__ftliteLive.peers).toEqual([pc, bare]);
    const none: any = {}; new Function('globalThis', RELAY_INIT_SCRIPT)(none); expect(none.__ftliteLive).toBeUndefined();
  });
});

describe('the peer stats read', () => {
  it('reads the selected pair from Chromium transport stats and Firefox selected pairs; skips unconnected peers', async () => {
    const chrome = new FakePc({ iceTransportPolicy: 'relay' }); chrome.connectionState = 'connected';
    chrome.stats = new Map<string, any>([['T', { type: 'transport', selectedCandidatePairId: 'P' }], ['P', { type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', bytesReceived: 5000, bytesSent: 4000 }],
      ['L', { type: 'local-candidate', candidateType: 'relay' }], ['R', { type: 'remote-candidate', candidateType: 'relay' }]]);
    const fox = new FakePc({ iceTransportPolicy: 'relay' }); fox.connectionState = 'connected';
    fox.stats = new Map<string, any>([['P1', { type: 'candidate-pair', selected: false, localCandidateId: 'L2', remoteCandidateId: 'R', bytesReceived: 1 }],
      ['P2', { type: 'candidate-pair', selected: true, localCandidateId: 'L', remoteCandidateId: 'R', bytesReceived: 700, bytesSent: 600 }],
      ['L', { type: 'local-candidate', candidateType: 'relay' }], ['L2', { type: 'local-candidate', candidateType: 'host' }], ['R', { type: 'remote-candidate', candidateType: 'srflx' }]]);
    const idle = new FakePc({ iceTransportPolicy: 'relay' }); idle.connectionState = 'closed';
    expect(await runIn({ __ftliteLive: { peers: [chrome, fox, idle] } }, PEER_STATS_SOURCE)).toEqual([
      { state: 'connected', policy: 'relay', local: 'relay', remote: 'relay', bytesReceived: 5000, bytesSent: 4000 },
      { state: 'connected', policy: 'relay', local: 'relay', remote: 'srflx', bytesReceived: 700, bytesSent: 600 },
      { state: 'closed', policy: 'relay', local: null, remote: null, bytesReceived: 0, bytesSent: 0 }]);
    expect(await runIn({}, PEER_STATS_SOURCE)).toBeNull();
  });
  it('parses the UI read as an expression', () => { expect(() => new Function(`return ${UI_READ_SOURCE}`)).not.toThrow(); });
});

describe('the menu phase and the room code', () => {
  const view = (v: Partial<UiView>): UiView => ({ status: null, title: null, roomCode: null, pause: null, leave: null, retry: false, home: false, ...v });
  it('reads the phase the session page prints', () => {
    expect(uiPhase(view({ title: 'Lobby', status: 'Everyone presses Ready, then the host starts.' }))).toBe('lobby');
    expect(uiPhase(view({ status: 'running' }))).toBe('running');
    expect(uiPhase(view({ status: 'creating…' }))).toBe('creating');
    expect(uiPhase(view({ status: 'Online stopped (rtc-failed). Retry or leave.' }))).toBe('error');
    expect(uiPhase(view({ status: 'The room is full.', retry: true }))).toBe('error');
    expect(uiPhase(view({ status: 'Choose how to play.', home: true }))).toBe('home');
    expect(uiPhase(view({ status: 'Restoring the mirrored checkpoint…' }))).toBe('other');
  });
  it('reads the room code from the lobby key or the strip', () => {
    expect(roomCodeOf(view({ roomCode: 'K7Q2MX' }))).toBe('K7Q2MX');
    expect(roomCodeOf(view({ roomCode: 'ROOM K7Q2MX' }))).toBe('K7Q2MX');
    expect(roomCodeOf(view({}))).toBeNull();
  });
});

describe('relayVerdict', () => {
  const peer = (bytesReceived: number, o: Partial<PeerSample> = {}): PeerSample => ({ state: 'connected', policy: 'relay', local: 'relay', remote: 'relay', bytesReceived, bytesSent: 0, ...o });
  it('passes two connected relay samples with traffic between them and ignores unconnected peers', () => {
    expect(relayVerdict([[peer(100)], [peer(9000), { ...peer(0), state: 'closed', policy: 'all', local: null }]])).toBeNull();
  });
  it('fails too few samples, a non-relay policy or pair, and too little traffic', () => {
    expect(relayVerdict([[peer(100)], []])).toMatch(/only 1 sample/);
    expect(relayVerdict([[peer(100, { policy: 'all' })], [peer(9000)]])).toMatch(/iceTransportPolicy all/);
    expect(relayVerdict([[peer(100)], [peer(9000, { local: 'srflx' })]])).toMatch(/local srflx, not relay/);
    expect(relayVerdict([[peer(100)], [peer(600)]])).toMatch(/only 500 bytes/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/webLiveRelay.test.ts`
Expected: FAIL, because `scripts/web/live/relay` cannot be resolved.

- [ ] **Step 3: Write `relay.ts`**

Create `scripts/web/live/relay.ts`:

```ts
// Web-iii live smoke (web build spec §8: "two browser profiles with iceTransportPolicy: 'relay'"): the page-side
// sources and the pure verdicts. Pure: no Playwright. A production page has no test probe (Web-ii W-1), so the relay is
// forced by an init script and the phase is read from the menu as a player sees it (plan L-1, L-2).
export const LIVE_PLAY_MS = 60000, MIN_RELAY_BYTES = 1024, RELAY_SAMPLE_MS = 10000;
export interface PeerSample { state: string; policy: string | null; local: string | null; remote: string | null; bytesReceived: number; bytesSent: number }
export interface UiView { status: string | null; title: string | null; roomCode: string | null; pause: string | null; leave: string | null; retry: boolean; home: boolean }
export interface LiveDuelReport {
  hostBrowser: string; guestBrowser: string; playedMs: number; endedEarly: boolean; phases: { host: string; guest: string };
  samples: { host: PeerSample[][]; guest: PeerSample[][] }; relay: { host: string | null; guest: string | null }; pageErrors: string[]; problems: string[];
}

/** Playwright init script (runs before any page script, every document): RTCPeerConnection becomes a subclass that
 *  forces iceTransportPolicy 'relay' and keeps every instance in globalThis.__ftliteLive.peers. Installs once. */
export const RELAY_INIT_SCRIPT = `(() => {
  const g = globalThis, Native = g.RTCPeerConnection;
  if (typeof Native !== 'function' || g.__ftliteLive) return;
  const peers = [];
  class RelayPeerConnection extends Native {
    constructor(config, ...rest) { super(Object.assign({}, config || {}, { iceTransportPolicy: 'relay' }), ...rest); peers.push(this); }
    setConfiguration(config) { return super.setConfiguration(Object.assign({}, config || {}, { iceTransportPolicy: 'relay' })); }
  }
  Object.defineProperty(g, 'RTCPeerConnection', { value: RelayPeerConnection, writable: true, configurable: true });
  g.__ftliteLive = { peers };
})();`;

/** page.evaluate source: one PeerSample per kept connection; the selected pair from Chromium's transport stats, else
 *  Firefox's selected pair, else a nominated succeeded pair. null when the hook is missing. */
export const PEER_STATS_SOURCE = `(async () => {
  const live = globalThis.__ftliteLive;
  if (!live) return null;
  const out = [];
  for (const pc of live.peers.slice(-20)) {
    const sample = { state: pc.connectionState, policy: pc.getConfiguration().iceTransportPolicy || null, local: null, remote: null, bytesReceived: 0, bytesSent: 0 };
    out.push(sample);
    if (pc.connectionState !== 'connected') continue;
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach(s => { if (!pair && s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId) || null; });
    stats.forEach(s => { if (!pair && s.type === 'candidate-pair' && s.selected === true) pair = s; });
    stats.forEach(s => { if (!pair && s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
    if (!pair) continue;
    const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
    sample.local = local ? local.candidateType : null; sample.remote = remote ? remote.candidateType : null;
    sample.bytesReceived = pair.bytesReceived || 0; sample.bytesSent = pair.bytesSent || 0;
  }
  return out;
})()`;

/** page.evaluate source: what the menu shows (Menu.tsx status line and title, SessionPage.tsx room code and buttons). */
export const UI_READ_SOURCE = `(() => {
  const text = id => { const el = document.querySelector('[data-testid="' + id + '"]'); return el ? (el.textContent || '').trim() : null; };
  return { status: text('status'), title: text('page-title'), roomCode: text('room-code'), pause: text('pause'), leave: text('leave'),
    retry: !!document.querySelector('[data-testid="retry"]'), home: !!document.querySelector('[data-testid="multiplayer"]') };
})()`;

const PHASES = ['idle', 'creating', 'joining', 'lobby', 'connecting', 'syncing', 'running', 'paused', 'reconnecting', 'saved', 'saving', 'rehosting', 'ended', 'error'];
/** The session page prints the phase name (menuMessage), the lobby its title; an error replaces the status with its text. */
export function uiPhase(v: UiView): string {
  if (v.title === 'Lobby') return 'lobby';
  const s = (v.status ?? '').replace(/…$/, '');
  if (PHASES.includes(s)) return s;
  if (v.retry || s.startsWith('Online stopped')) return 'error';
  if (v.home && s === 'Choose how to play.') return 'home';
  return 'other';
}
export function roomCodeOf(v: UiView): string | null {
  return v.roomCode === null ? null : v.roomCode.replace(/^ROOM\s+/, '').trim() || null;
}

/** null when the samples prove TURN: two samples with a connected peer, every connected peer relay-only with a relay
 *  local candidate on its selected pair, and at least MIN_RELAY_BYTES received between the first and last of them. */
export function relayVerdict(samples: readonly (readonly PeerSample[])[]): string | null {
  const connected = samples.map(s => s.filter(p => p.state === 'connected')).filter(s => s.length > 0);
  if (connected.length < 2) return `only ${connected.length} sample(s) had a connected peer (need 2)`;
  for (const sample of connected) for (const p of sample) {
    if (p.policy !== 'relay') return `a peer connection ran with iceTransportPolicy ${p.policy}`;
    if (p.local !== 'relay') return `the selected candidate pair is local ${p.local}, not relay`;
  }
  const bytes = (s: readonly PeerSample[]): number => s.reduce((n, p) => n + p.bytesReceived, 0);
  const moved = bytes(connected[connected.length - 1]!) - bytes(connected[0]!);
  return moved < MIN_RELAY_BYTES ? `only ${moved} bytes arrived over the relay during play (need ${MIN_RELAY_BYTES})` : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/webLiveRelay.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `duel.ts`**

Create `scripts/web/live/duel.ts`:

```ts
// Web-iii live smoke, the duel (web build spec §8 "The live check"): a Chromium host and a Firefox guest (a second
// Chromium context when Firefox is not installed, plan L-7) open the live site, pass the passcode form as a friend
// would, host and join by code through the real menu with TURN forced (plan L-1), play 60 s (L-3) and leave. Relay is
// proven from getStats (L-2). Not run in CI: it needs the owner's live deploy and passcode.
import { chromium, firefox, type Browser, type BrowserContext, type Page } from 'playwright';
import { WRONG_PASSCODE_TEXT } from '../../../src/web/passcode';
import { bounded, type GateKey } from '../net/players';
import { LIVE_PLAY_MS, PEER_STATS_SOURCE, RELAY_INIT_SCRIPT, RELAY_SAMPLE_MS, relayVerdict, roomCodeOf, UI_READ_SOURCE, uiPhase,
  type LiveDuelReport, type PeerSample, type UiView } from './relay';

interface LivePlayer { readonly name: string; readonly page: Page; readonly context: BrowserContext; readonly errors: string[] }
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const read = (p: LivePlayer): Promise<UiView> => bounded(p.page.evaluate<UiView>(UI_READ_SOURCE), 4000, `${p.name} read`);
const stats = async (p: LivePlayer): Promise<PeerSample[]> => (await bounded(p.page.evaluate<PeerSample[] | null>(PEER_STATS_SOURCE), 6000, `${p.name} stats`)) ?? [];
const click = (p: LivePlayer, id: string, timeout = 5000): Promise<void> =>
  bounded(p.page.click(`[data-testid="${id}"]`, { timeout }), timeout + 1000, `${p.name} click ${id}`);
const type = (p: LivePlayer, id: string, text: string): Promise<void> =>
  bounded(p.page.fill(`[data-testid="${id}"]`, text, { timeout: 5000 }), 6000, `${p.name} type ${id}`);
/** Web-ii players.ts key(): the tab in front, nothing focused, then the key held for `ms`. */
async function press(p: LivePlayer, code: GateKey, ms: number): Promise<void> {
  await bounded(p.page.bringToFront(), 4000, `${p.name} front`);
  await bounded(p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()), 4000, `${p.name} blur`);
  await bounded(p.page.keyboard.down(code), 4000, `${p.name} key ${code}`);
  await delay(ms);
  await bounded(p.page.keyboard.up(code), 4000, `${p.name} key ${code}`);
}
async function until(p: LivePlayer, ok: (phase: string, view: UiView) => boolean, label: string, ms: number): Promise<UiView> {
  const end = performance.now() + ms;
  let last: UiView | null = null;
  while (performance.now() < end) {
    const v = await read(p); last = v;
    const phase = uiPhase(v);
    if (ok(phase, v)) return v;
    if (phase === 'error') throw Error(`${p.name} ${label}: online error (${v.status})`);
    await delay(250);
  }
  throw Error(`${p.name} ${label} timeout (last status: ${last?.status ?? 'none'})`);
}

async function openPlayer(browser: Browser, name: string, url: string, passcode: string): Promise<LivePlayer> {
  const context = await bounded(browser.newContext({ viewport: { width: 1280, height: 800 } }), 15000, `${name} context`);
  await bounded(context.addInitScript({ content: RELAY_INIT_SCRIPT }), 4000, `${name} relay hook`);
  const page = await bounded(context.newPage(), 15000, `${name} page`), errors: string[] = [];
  page.on('pageerror', error => { if (errors.length < 20) errors.push(String(error.message).slice(0, 200)); });
  const player: LivePlayer = { name, page, context, errors };
  const first = await bounded(page.goto(`${url}/`), 30000, `${name} load`);
  if (first?.status() !== 401) throw Error(`${name}: the site answered ${first?.status() ?? 'nothing'} before the passcode (expected 401)`);
  await bounded(page.fill('#code', passcode, { timeout: 5000 }), 6000, `${name} passcode field`);
  await bounded(page.click('button[type="submit"]', { timeout: 5000 }), 6000, `${name} passcode submit`);
  const end = performance.now() + 30000;
  for (;;) {
    const v = await read(player).catch(() => null);   // the form posts and redirects: a read can land mid-navigation
    if (v?.home) break;
    const text = await bounded(page.evaluate(() => document.body?.innerText ?? ''), 4000, `${name} text`).catch(() => '');
    if (text.includes(WRONG_PASSCODE_TEXT)) throw Error(`${name}: the passcode was refused (${WRONG_PASSCODE_TEXT})`);
    if (performance.now() > end) throw Error(`${name}: the menu did not appear after the passcode`);
    await delay(250);
  }
  if (!(await bounded(page.evaluate(() => typeof (globalThis as any).__ftliteLive === 'object'), 4000, `${name} relay check`)))
    throw Error(`${name}: the relay hook did not load, so TURN would not be forced`);
  return player;
}

export async function runLiveDuel(o: { url: string; passcode: string; step(label: string): void; aborted(): boolean }): Promise<LiveDuelReport> {
  const browsers: Browser[] = [], contexts: BrowserContext[] = [];
  try {
    o.step('browsers');
    const chrome = await bounded(chromium.launch({ headless: true }), 60000, 'chromium launch'); browsers.push(chrome);
    let fox: Browser | null = null;
    try { fox = await bounded(firefox.launch({ headless: true }), 60000, 'firefox launch'); browsers.push(fox); } catch { fox = null; }
    o.step('passcode');
    const host = await openPlayer(chrome, 'chromium-host', o.url, o.passcode); contexts.push(host.context);
    const guest = await openPlayer(fox ?? chrome, `${fox ? 'firefox' : 'chromium'}-guest`, o.url, o.passcode); contexts.push(guest.context);

    o.step('host and join');
    await click(host, 'multiplayer'); await click(host, 'host'); await click(host, 'crew-2'); await click(host, 'create-room');
    const lobby = await until(host, phase => phase === 'lobby', 'lobby', 20000);
    const code = roomCodeOf(lobby);
    if (!code) throw Error(`${host.name}: no room code in the lobby`);
    await click(guest, 'multiplayer'); await click(guest, 'join'); await type(guest, 'join-code', code); await click(guest, 'join-room');
    await until(guest, phase => phase === 'lobby', 'lobby', 20000);
    await click(host, 'ready'); await click(guest, 'ready');
    await click(host, 'start', 15000);   // Playwright waits for Start to be enabled (both ready)
    await until(host, phase => phase === 'running', 'running', 30000); await until(guest, phase => phase === 'running', 'running', 30000);

    o.step('play 60 s');
    const began = performance.now(), samples = { host: [] as PeerSample[][], guest: [] as PeerSample[][] };
    const sample = async (): Promise<void> => { samples.host.push(await stats(host)); samples.guest.push(await stats(guest)); };
    await sample();
    // The duel smoke's routes (best effort: a production page exposes no seat state): host to Weapons, guest to the Helm, then thrust.
    for (const [key, ms] of [['KeyD', 3000], ['KeyW', 1500], ['KeyA', 300], ['KeyE', 120]] as const) await press(host, key, ms);
    for (const [key, ms] of [['KeyD', 3000], ['KeyE', 120], ['KeyW', 2000]] as const) await press(guest, key, ms);
    let endedEarly = false, nextSample = began + RELAY_SAMPLE_MS, phases = { host: 'running', guest: 'running' };
    while (performance.now() - began < LIVE_PLAY_MS) {
      if (o.aborted()) throw Error('launcher timeout');
      phases = { host: uiPhase(await read(host)), guest: uiPhase(await read(guest)) };
      if (phases.host === 'ended' || phases.guest === 'ended') { endedEarly = true; break; }
      if (phases.host !== 'running' || phases.guest !== 'running') throw Error(`the duel left running during play: host ${phases.host}, guest ${phases.guest}`);
      if (performance.now() >= nextSample) { await sample(); nextSample += RELAY_SAMPLE_MS; }
      await delay(1000);
    }
    if (!endedEarly) await sample();
    const playedMs = Math.round(performance.now() - began);

    o.step('leave');
    await click(guest, 'leave'); await until(guest, (phase, v) => v.home || phase === 'idle', 'left', 20000);
    await click(host, 'leave'); await until(host, (phase, v) => v.home || phase === 'idle', 'left', 20000);

    const relay = { host: relayVerdict(samples.host), guest: relayVerdict(samples.guest) };
    const pageErrors = [...host.errors, ...guest.errors];
    const problems = [...(relay.host ? [`host relay: ${relay.host}`] : []), ...(relay.guest ? [`guest relay: ${relay.guest}`] : []),
      ...(pageErrors.length ? [`page errors: ${pageErrors.slice(0, 3).join(' | ')}`] : [])];
    return { hostBrowser: 'chromium', guestBrowser: fox ? 'firefox' : 'chromium (Firefox not installed)', playedMs, endedEarly, phases, samples, relay, pageErrors, problems };
  } finally {
    for (const c of contexts) await bounded(c.close(), 10000, 'context close').catch(() => {});
    for (const b of browsers) await b.close().catch(() => {});
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If `page.evaluate<UiView>(UI_READ_SOURCE)` does not type-check under Playwright 1.48's overloads, write `(await p.page.evaluate(UI_READ_SOURCE)) as UiView` inside the `bounded` call instead, and the same for `PEER_STATS_SOURCE`.

- [ ] **Step 7: Run the tests again**

Run: `npx vitest run tests/webLiveRelay.test.ts tests/webLiveHeaders.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/web/live/relay.ts scripts/web/live/duel.ts tests/webLiveRelay.test.ts
git commit -m "feat(web-iii): live duel runner with TURN forced by an init script and relay proven from getStats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Report, entry, npm script and the owner steps

**Files:**
- Create: `scripts/web/live/report.ts`
- Create: `scripts/web/live-smoke.ts`
- Modify: `package.json` (add `"test:web-live"` directly after the `"test:web-net"` line)
- Modify: `docs/gates.md` (tick the Web-ii line that starts `- [ ] Web-iii plan: \`scripts/web/live-smoke.ts\` repeats`, and append the Web-iii section at the end of the file)
- Test: `tests/webLiveReport.test.ts`, `tests/webDeployScripts.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces (`parseLiveArgs`, `runHeaderChecks`, `checkServiceOrigin`, `firstPaidPath`, `redact`, `secretVariants`, `HeaderCheck`, `LiveVersion`, `ServiceCheck`, `LiveArgs`); from Task 2, `runLiveDuel`, `LIVE_PLAY_MS` and `LiveDuelReport`.
- Produces: `interface LiveReport { version: 1; url: string; startedAt: string; elapsedMs: number; headers: { checks: HeaderCheck[]; version: LiveVersion | null; problems: string[] } | null; service: ServiceCheck | null; duel: LiveDuelReport | null; failure: string | null; pass: boolean }`, `validateLiveReport(report: LiveReport, secrets: readonly string[]): string[]`, and the npm entry `test:web-live`.

- [ ] **Step 1: Write the failing tests**

Create `tests/webLiveReport.test.ts`:

```ts
// Web-iii live smoke report (web build spec §8 "The live check"): a PASS needs every header check, the live
// version.json, relay on both sides for the full 60 s (or a round that ended first) and no page errors; a FAIL names its
// failure; no report may hold the passcode or the cookie.
import { describe, expect, it } from 'vitest';
import { validateLiveReport, type LiveReport } from '../scripts/web/live/report';

const PASSCODE = 'correct horse battery staple';
function passing(): LiveReport {
  return { version: 1, url: 'https://ftlite-test.vercel.app', startedAt: '2026-11-18T20:00:00.000Z', elapsedMs: 95000,
    headers: { checks: [{ label: 'without the cookie: /', method: 'GET', path: '/', cookie: false, status: 401, cacheControl: 'no-store', problem: null }],
      version: { build: { version: '0.1.0', rev: 'abc1234', sim: 54 }, sim: 54, digest: 'a'.repeat(64) }, problems: [] },
    service: { origin: 'https://sig.example', status: 204, allowOrigin: 'https://ftlite-test.vercel.app', problem: null },
    duel: { hostBrowser: 'chromium', guestBrowser: 'firefox', playedMs: 60400, endedEarly: false, phases: { host: 'running', guest: 'running' },
      samples: { host: [], guest: [] }, relay: { host: null, guest: null }, pageErrors: [], problems: [] },
    failure: null, pass: true };
}
describe('validateLiveReport', () => {
  it('accepts a full pass and a pass whose round ended early', () => {
    expect(validateLiveReport(passing(), [PASSCODE])).toEqual([]);
    const ended = passing(); ended.duel!.playedMs = 41000; ended.duel!.endedEarly = true;
    expect(validateLiveReport(ended, [PASSCODE])).toEqual([]);
  });
  it('refuses a pass with a header problem, no version, a short duel, a relay finding or a failure', () => {
    const header = passing(); header.headers!.checks[0]!.problem = 'answered 200 without the cookie';
    expect(validateLiveReport(header, [])).toContainEqual(expect.stringMatching(/every header check/));
    const noVersion = passing(); noVersion.headers!.version = null;
    expect(validateLiveReport(noVersion, [])).toContainEqual(expect.stringMatching(/version\.json/));
    const short = passing(); short.duel!.playedMs = 30000;
    expect(validateLiveReport(short, [])).toContainEqual(expect.stringMatching(/under 60000 ms/));
    const relay = passing(); relay.duel!.relay.guest = 'the selected candidate pair is local host, not relay';
    expect(validateLiveReport(relay, [])).toContainEqual(expect.stringMatching(/relay on both sides/));
    const failed = passing(); failed.failure = 'x';
    expect(validateLiveReport(failed, [])).toContainEqual(expect.stringMatching(/has a failure/));
    const noDuel = passing(); noDuel.duel = null;
    expect(validateLiveReport(noDuel, [])).toContainEqual(expect.stringMatching(/needs the duel/));
  });
  it('needs a failing report to name its failure and refuses any report holding a secret', () => {
    const fail = passing(); fail.pass = false;
    expect(validateLiveReport(fail, [])).toContainEqual(expect.stringMatching(/name its failure/));
    fail.failure = `header checks: code ${encodeURIComponent(PASSCODE)} leaked`;
    expect(validateLiveReport(fail, [PASSCODE])).toEqual(['the report holds a secret']);
  });
});
```

In `tests/webDeployScripts.test.ts`, add this case inside `describe('deploy:web', () => { ... })` after the `'never commits .vercel/'` case:

```ts
  it('runs the live smoke from its own entry and never builds or deploys in it', () => {
    expect(pkg.scripts['test:web-live']).toBe('tsx scripts/web/live-smoke.ts');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/webLiveReport.test.ts tests/webDeployScripts.test.ts`
Expected: FAIL. `scripts/web/live/report` cannot be resolved, and `test:web-live` is undefined.

- [ ] **Step 3: Write `report.ts`**

Create `scripts/web/live/report.ts`:

```ts
// Web-iii live smoke report (web build spec §8 "The live check"): its shape and the rules a PASS must meet.
import { secretVariants, type HeaderCheck, type LiveVersion, type ServiceCheck } from './headers';
import { LIVE_PLAY_MS, type LiveDuelReport } from './relay';

export interface LiveReport {
  version: 1; url: string; startedAt: string; elapsedMs: number;
  headers: { checks: HeaderCheck[]; version: LiveVersion | null; problems: string[] } | null;
  service: ServiceCheck | null; duel: LiveDuelReport | null; failure: string | null; pass: boolean;
}

export function validateLiveReport(report: LiveReport, secrets: readonly string[]): string[] {
  const problems: string[] = [];
  if (report.version !== 1) problems.push('version is not 1');
  if (!/^https:\/\//.test(report.url)) problems.push('url is not https');
  if (!Number.isFinite(report.elapsedMs) || report.elapsedMs < 0) problems.push('elapsedMs is not a duration');
  if (Number.isNaN(Date.parse(report.startedAt))) problems.push('startedAt is not a date');
  if (report.pass) {
    if (report.failure !== null) problems.push('a passing report has a failure');
    const h = report.headers;
    if (!h || h.checks.length === 0 || h.problems.length > 0 || h.checks.some(c => c.problem !== null)) problems.push('a passing report needs every header check to pass');
    if (!h?.version) problems.push('a passing report needs the live version.json');
    if (report.service?.problem) problems.push('a passing report has a service problem');
    const d = report.duel;
    if (!d) problems.push('a passing report needs the duel');
    else {
      if (d.problems.length > 0 || d.relay.host !== null || d.relay.guest !== null) problems.push('a passing report needs relay on both sides and no page errors');
      if (!d.endedEarly && d.playedMs < LIVE_PLAY_MS) problems.push(`a passing duel played under ${LIVE_PLAY_MS} ms`);
    }
  } else if (typeof report.failure !== 'string' || report.failure.length === 0) problems.push('a failing report must name its failure');
  const text = JSON.stringify(report);
  if (secretVariants(secrets).some(s => text.includes(s))) problems.push('the report holds a secret');
  return problems;
}
```

- [ ] **Step 4: Write the entry**

Create `scripts/web/live-smoke.ts`:

```ts
// `npm run test:web-live` (web build spec §8 "The live check", §9 Web-iii): run by the owner after a deploy, against
// the live site. First the passcode and cache headers without and with the cookie (a failure says to roll back and
// skips the duel), then the optional service preflight, then a Chromium host and a Firefox guest forced through TURN
// host, join by code, play 60 s and leave. Writes a JSON report and one PASS/FAIL line; exits 1 on failure. The
// passcode (FTLITE_LIVE_PASSCODE) and the minted cookie are never printed or written.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runLiveDuel } from './live/duel';
import { checkServiceOrigin, firstPaidPath, parseLiveArgs, redact, runHeaderChecks, type FetchLike, type LiveArgs } from './live/headers';
import { validateLiveReport, type LiveReport } from './live/report';

const message = (error: unknown): string => String((error as Error)?.message ?? error).slice(0, 700);
const liveFetch: FetchLike = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) });

async function main(): Promise<void> {
  const began = performance.now(), startedAt = new Date().toISOString();
  let args: LiveArgs;
  try { args = parseLiveArgs(process.argv.slice(2), process.env); }
  catch (error) { console.error(`LIVE SMOKE FAIL: ${redact(message(error), [process.env.FTLITE_LIVE_PASSCODE ?? ''])}`); process.exitCode = 1; return; }
  const secrets: string[] = [args.passcode];
  const report: LiveReport = { version: 1, url: args.url, startedAt, elapsedMs: 0, headers: null, service: null, duel: null, failure: null, pass: false };
  let step = 'header checks', aborted = false;
  const watchdog = setTimeout(() => { aborted = true; }, 600000);
  try {
    const paidPath = args.paidPath ?? firstPaidPath(process.cwd());
    if (!paidPath) throw Error('no paid file to check: run from the main checkout (it has public/assets/paid) or pass --paid-path=/assets/paid/<file>');
    console.log(`[web-live] ${step} against ${args.url}`);
    const live = await runHeaderChecks({ url: args.url, passcode: args.passcode, paidPath, fetch: liveFetch });
    secrets.push(...live.secrets);
    report.headers = { checks: live.checks, version: live.version, problems: live.problems };
    if (live.problems.length) throw Error(`${live.problems.join('; ')}. Roll the deploy back now (npx vercel rollback) and fix it before redeploying.`);
    if (args.serviceOrigin) {
      step = 'service preflight'; console.log(`[web-live] ${step}`);
      report.service = await checkServiceOrigin({ serviceOrigin: args.serviceOrigin, pageOrigin: args.url, fetch: liveFetch });
      if (report.service.problem) throw Error(report.service.problem);
    }
    step = 'duel';
    report.duel = await runLiveDuel({ url: args.url, passcode: args.passcode, aborted: () => aborted,
      step: label => { step = `duel: ${label}`; console.log(`[web-live] ${step}`); } });
    if (report.duel.problems.length) throw Error(report.duel.problems.join('; '));
  } catch (error) { report.failure = `${step}: ${message(error)}`; }
  finally { clearTimeout(watchdog); }
  report.elapsedMs = Math.ceil(performance.now() - began);
  report.pass = report.failure === null;
  if (report.failure !== null) report.failure = redact(report.failure, secrets);
  const problems = validateLiveReport(report, secrets);
  if (problems.length) { report.pass = false; report.failure = redact(`report: ${problems.join('; ')}${report.failure ? ` (after ${report.failure})` : ''}`, secrets); }
  const reportPath = resolve(args.reportPath);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, redact(JSON.stringify(report, null, 2), secrets) + '\n');
  if (!report.pass) { console.error(`LIVE SMOKE FAIL: ${report.failure} (report ${reportPath})`); process.exitCode = 1; return; }
  const d = report.duel!;
  console.log(`LIVE SMOKE PASS (${report.elapsedMs} ms; ${d.hostBrowser} host, ${d.guestBrowser} guest, relay on both sides, ${d.playedMs} ms played${d.endedEarly ? ', round ended early' : ''}; report ${reportPath})`);
}
void main();
```

- [ ] **Step 5: Add the npm script**

In `package.json`, after the line `"test:web-net": "electron-vite build && tsx scripts/web/net/web-net-smoke.ts",` add:

```json
    "test:web-live": "tsx scripts/web/live-smoke.ts",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/webLiveReport.test.ts tests/webDeployScripts.test.ts tests/webLiveHeaders.test.ts tests/webLiveRelay.test.ts`
Expected: PASS.

- [ ] **Step 7: Check the entry's refusal paths (no live site needed)**

Run in Git Bash, from the worktree:
```bash
env -u FTLITE_LIVE_URL -u FTLITE_LIVE_PASSCODE npm run test:web-live; echo "exit $?"
FTLITE_LIVE_URL=https://ftlite-test.vercel.app npm run test:web-live -- --passcode=hunter22; echo "exit $?"
```
Expected: the first prints `LIVE SMOKE FAIL: FTLITE_LIVE_URL (or --url=) must be exactly one https origin, like https://<project>.vercel.app` and `exit 1`. The second prints `LIVE SMOKE FAIL: the passcode is read only from FTLITE_LIVE_PASSCODE, never from the command line`, `exit 1`, and the output does **not** contain `hunter22` beyond npm's own echo of the command line.

Then run once against an unreachable origin to exercise the report path:
```bash
FTLITE_LIVE_URL=https://ftlite-nonexistent-0.vercel.app FTLITE_LIVE_PASSCODE=dry-run-code npm run test:web-live -- --paid-path=/assets/paid/x.png --report-path=out/web-iii-live/dry.json; echo "exit $?"
grep -c "dry-run-code" out/web-iii-live/dry.json
```
Expected: `LIVE SMOKE FAIL: header checks: …` (the requests fail or answer 404, so every check has a problem), `exit 1`, and the grep prints `0`.

- [ ] **Step 8: Update `docs/gates.md`**

Replace the Web-ii line
```
- [ ] Web-iii plan: `scripts/web/live-smoke.ts` repeats the step-5 checks (401 without the cookie for `/assets/paid/<file>` and `/assets/authorityWorker.js`; 200 with `private, no-cache` with it; `version.json` `no-store`) before its duel.
```
with
```
- [x] Web-iii plan: `scripts/web/live-smoke.ts` repeats the step-5 checks (401 without the cookie for `/assets/paid/<file>` and `/assets/authorityWorker.js`; 200 with `private, no-cache` with it; `version.json` `no-store`) before its duel (`docs/superpowers/plans/2026-11-18-web-iii-live-smoke.md`; `npm run test:web-live`).
```

Append at the end of the file:

````markdown

## Web-iii: going live (2026-11-18)

`npm run test:web-live` (`scripts/web/live-smoke.ts`) checks the live site after a deploy. It runs the Web-ii step-5 header checks: without the cookie, `/`, the Worker, a real paid file and `version.json` each answer 401 with the passcode form; a wrong passcode is refused; the right one sets the spec's cookie. With the cookie, `/`, the Worker and the paid file answer 200 with `private, no-cache`, and `version.json` answers 200 with `no-store`. If `FTLITE_WEB_SERVICE_ORIGIN` is set, it then sends the service preflight with the live Origin. Last, a Chromium host and a Firefox guest (a second Chromium if Firefox is not installed) pass the passcode form, host, join by code with TURN forced (`iceTransportPolicy: 'relay'` through a test-only init script; the selected candidate pair must be `relay` on both sides, with traffic), play 60 s and leave. It writes `out/web-iii-live/live-smoke.json` and prints `LIVE SMOKE PASS` or `LIVE SMOKE FAIL: <reason>` (exit 1). The passcode is read only from `FTLITE_LIVE_PASSCODE`. Neither it nor the cookie is ever printed or written.

**Owner steps, in order, from the main checkout (it has `public/assets/paid`), in PowerShell:**
1. Vercel: `npx vercel login`, then `npx vercel link` to a new **Hobby** project with git **disconnected** (Web-ii steps 1-2).
2. The two Production env vars, `FTLITE_PASSCODE` and `FTLITE_COOKIE_SECRET` (Web-ii step 3).
3. Cloudflare allowed origins (spec §6), from `services/signalling`:
   ```powershell
   cd services/signalling
   npx wrangler secret put ALLOWED_ORIGINS    # paste: null,https://<project>.vercel.app
   npx wrangler deploy                        # ships the service at this revision; harmless if already current
   cd ../..
   ```
4. Deploy: `$env:FTLITE_WEB_SERVICE_ORIGIN='https://<signalling worker origin>'; npm run deploy:web`. It must end by printing the production URL, and `npx vercel ls` must show the deployment **Ready**. The root `vercel.json` `buildCommand` fails only source builds; `--prebuilt` runs no build. The live smoke's with-cookie `/` check (the game's HTML, not the passcode page) and its `version.json` check confirm that the prebuilt output is what is served.
5. Live smoke, with the passcode typed and not stored in history:
   ```powershell
   $env:FTLITE_LIVE_URL = 'https://<project>.vercel.app'
   $s = Read-Host -AsSecureString 'Passcode'
   $env:FTLITE_LIVE_PASSCODE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
   npm run test:web-live
   Remove-Item Env:FTLITE_LIVE_PASSCODE
   ```
   `FTLITE_WEB_SERVICE_ORIGIN`, still set from step 4, adds the service preflight. Do not set `DEBUG=pw:*` (the run refuses it). Expect `LIVE SMOKE PASS`.
6. **Rollback rule.** If the smoke fails in `header checks` (it says "Roll the deploy back now"), run `npx vercel rollback` at once, or delete the deployment in the dashboard. Fix the cause before redeploying; never leave the paid art reachable without the cookie. A 503 "FTLite is not configured." means the env vars are not reaching the middleware: set both for **Production**, then redeploy. A `service preflight` failure means `ALLOWED_ORIGINS` is missing the live origin; redo step 3 (no rollback: nothing leaks). A `duel` failure (relay, join, page errors) needs no rollback either: the site is safe. Read the report.
7. **Friend playtest (the acceptance, spec §9 "Done means"):** two people on different networks open the `https://<project>.vercel.app` link and pass the passcode. One hosts and the other joins by code. They finish a duel. Rehost works after the host tab closes.

- [ ] Owner: steps 1-3 (Vercel login/link, env vars, `ALLOWED_ORIGINS` and `wrangler deploy`).
- [ ] Owner: step 4 `deploy:web` (URL printed, `vercel ls` Ready).
- [ ] Owner: step 5 `npm run test:web-live` prints `LIVE SMOKE PASS` (Firefox guest, or note the Chromium fallback). Date, live `version.json` build/sim and notes: pending owner.
- [ ] Owner: step 7 friend playtest on different networks: passcode, host, join by code, a finished duel, rehost after the host tab closes. Date and notes: pending owner.
````

- [ ] **Step 9: Full gates**

Run: `npm run typecheck` (expected exit 0), then `npm test` (expected: all pass apart from the Global Constraints' known load flakes, each of which passes alone).

- [ ] **Step 10: Commit**

```bash
git add scripts/web/live/report.ts scripts/web/live-smoke.ts package.json tests/webLiveReport.test.ts tests/webDeployScripts.test.ts docs/gates.md
git commit -m "feat(web-iii): test:web-live entry, report validation and the owner's go-live steps in gates.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage.** §8 live check: passcode from env (Task 1 `parseLiveArgs`, Task 2 `openPlayer`), two browser profiles with relay forced (Task 2, L-1, L-2), host, join, 60 s, leave (Task 2). Web-ii step-5 header checks, including 401 for paid, Worker and `version.json`, the cookie headers and the 503 hint (Task 1). The site-is-up check (L-5, Task 1 `/` and `version.json`, Task 3 step 4). JSON report, PASS/FAIL, non-zero exit, no secrets (Task 3). The gates owner steps, rollback and the friend acceptance (Task 3 step 8). §6 `ALLOWED_ORIGINS` (gates step 3, plus the optional preflight L-6). No SIM change and no `src/` change.
- **Placeholders.** None, apart from the `<project>` and `<signalling worker origin>` placeholders the owner fills in, which the spec uses too.
- **Types.** `FetchLike`, `HeaderCheck`, `LiveVersion`, `ServiceCheck` and `LiveArgs` are defined in Task 1 and used in Task 3. `PeerSample`, `UiView`, `LiveDuelReport` and `LIVE_PLAY_MS` are defined in Task 2 `relay.ts` and used in `duel.ts` and Task 3 `report.ts`. `runLiveDuel`'s signature matches the entry's call. `secretVariants` is defined in Task 1 and used by `report.ts`.
