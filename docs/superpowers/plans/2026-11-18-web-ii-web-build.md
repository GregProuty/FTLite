# Web-ii: The Web Build and Browser Behaviour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship FTLite as a private website: `npm run build:web` writes a Vercel Build Output (the game, a passcode Routing Middleware, routes), `npm run deploy:web` uploads it, and the page behaves like a game in Chrome, Edge and Firefox (keys, fullscreen, audio, saved data, one online tab, leave prompt, unsupported-browser text, update banner), proven by browser network gates and passcode tests.

**Architecture:** One renderer, two packagings. `build/rendererConfig.ts` holds the renderer settings that `electron.vite.config.ts` and the new `vite.web.config.ts` both use; the web build adds a baked `__FTLITE_WEB_CONFIG__` (a `PageOnlineConfig`) that `main.ts` reads when `window.ftlite` is absent. `scripts/web/build-web.ts` runs the Vite build into `<out>/static`, writes `version.json`, bundles `src/web/middleware.ts` (a thin Edge wrapper over the pure, unit-tested `src/web/passcode.ts`) into `<out>/functions/_middleware.func`, and writes `<out>/config.json`. Every browser-only behaviour is a small injectable module under `src/renderer/src/app/web/` wired in `main.ts` only when `window.ftlite` is absent. The browser gate (`scripts/web/net/*`) drives Playwright Chromium and Firefox (and one Electron guest) against local workerd and a `vite preview` of a `--test` web build.

**Tech Stack:** Electron 37.10.3, electron-vite 5.0.0, Vite 7.3.8, TypeScript 5.8, React 19 + zustand, Vitest 3.2.7, Playwright 1.48.2 (browsers chromium-1140 and firefox-1465 already installed), fake-indexeddb 6.0.0, esbuild 0.25.12 (new direct pin), Vercel CLI 65.10.0 (new pin), Miniflare/workerd 1.20261023.1.

## Global Constraints

Every task's requirements implicitly include this section.

- **Spec:** `docs/superpowers/specs/2026-11-18-web-build-design.md`. This plan is part **Web-ii** (§9 item 2): §5.1-§5.4, all of §7, and §8's browser network gates and passcode tests. Out of scope (Web-iii): any `wrangler deploy` or `wrangler secret put`, any `vercel login`/`link`/`deploy`, setting Vercel env vars, `scripts/web/live-smoke.ts`, the owner's playtest. **No task runs a deploy.**
- **No gameplay change.** `SIM_VERSION` stays as it is on master; `npm run test:determinism` passes unchanged. No file in `build/contentDigest.ts`'s manifest is edited, so the content digest is unchanged too.
- **Base:** written against master `e2845987` (Web-i merged at `121700ed`). If master moved, re-find every quoted line with `grep -n` before editing; never trust a line number alone.
- **Worktree:** `.worktrees/web-ii` on branch `web-ii` from `master`. `node_modules` and `services/signalling/node_modules` must be directory junctions to the main checkout's (`cmd /c mklink /J`). **Never run `npm install` inside the worktree** (it replaced the junction last time).
- **Adding a dependency** (Tasks 3 and 4 only): run the stated `npm install --save-dev --save-exact <pkg>@<ver>` **in the main checkout** (so the shared `node_modules` gets it), then move the manifest change to the worktree and restore the main checkout:
  ```bash
  cd /c/Users/djuar/FTLite && git diff -- package.json package-lock.json > /tmp/web-ii-dep.patch && git checkout -- package.json package-lock.json
  cd /c/Users/djuar/FTLite/.worktrees/web-ii && git apply /tmp/web-ii-dep.patch
  ```
  (Use the scratchpad directory instead of `/tmp` if `/tmp` is not writable.) Commit `package.json` and `package-lock.json` from the worktree.
- **Pinned versions (exact, no caret):** `esbuild@0.25.12`, `vercel@65.10.0` (released 2026-11-03, older than two weeks), `playwright@1.48.2`, `fake-indexeddb@6.0.0`. Existing pins stay.
- **Stage files by explicit path only.** Never `git add -A`, `git add .` or `git commit -a`.
- **Every commit message ends with** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Use the Write tool** for new files and multi-line content (bash heredocs have failed on this machine). Shell examples are Git Bash.
- **Gates:** `npm run typecheck`, `npm test` (known load flakes that pass alone: director soak, `duelFire`, `snapshot`, `authorityBoundary`, `authorityIngress`, `leaseSmokeCleanup`, `onlineAppRuntime`, `acceptance`, `bot`, `eventList`, `run`; `tests/onlineRecoveryInstrumentation.test.ts` needs a built `out/`), `npm run test:determinism` (then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/`), `npm run test:signalling`, `npm run typecheck:signalling`, and the Electron runtime gates in `package.json`.
- **Gate lessons from Web-i (apply to every new gate):** assert every page `MessagePort` ends closed or transferred; count Worker exits from `terminate()` only; give every page call an explicit time limit; a failure injection must fail for its named reason.
- **Exact texts (spec, verbatim):** `New version: reload` (§5.4), `FTLite is already open in another tab` (§7.5), `FTLite needs a recent Chrome, Edge or Firefox on a computer.` (§7.7), `Safari is not tested` (§7.7), `Wrong passcode` (§5.3), `Download playtest log` (§7.4), file name `ftlite-playtest-<first date>-to-<last date>.jsonl` (§7.4).
- **Cookie (spec §5.3, exact):** `ftlite_pass=<expiry>.<HMAC-SHA256(secret, expiry)>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`. `<expiry>` is epoch seconds; the MAC is base64url without padding over the ASCII decimal expiry; the secret is `FTLITE_COOKIE_SECRET` decoded from base64 (at least 32 bytes).
- **IndexedDB:** database `ftlite` moves from version 1 to **version 2**; version 2 has stores `records` (unchanged keys `seat-v1`, `mirror-v1`) and `duelRecords` (key: local date `YYYY-MM-DD`). Every opener goes through one `openFtliteDatabase`.
- **Duel record caps unchanged:** 8,192 bytes per record (`DUEL_RECORD_MAX_BYTES`), 16 MiB per day.
- **Page-side code imports no `node:*`, `electron`, `process` or `Buffer`:** `src/renderer/src/app/web` joins `PAGE_ROOTS` in `tests/pageBoundary.test.ts` (Task 5). `src/web/middleware.ts` is Edge code and may read `process.env`; `src/web/passcode.ts` may not (it is pure).
- **Browser-only wiring:** every §7 behaviour is wired in `main.ts` only when `window.ftlite` is absent, except the key/mouse guards (Task 6, harmless in Electron, installed for both) and the pagehide teardown (Task 10, both).

## Vercel facts this plan relies on (check them against the docs; verified 2026-11-18)

- Build Output API v3: `.vercel/output/config.json` needs `"version": 3`; `routes` use the `vercel.json` route syntax (`src`, `headers`, `continue`, `middlewarePath`, …). https://vercel.com/docs/build-output-api/configuration
- Static files go in `.vercel/output/static` and are served at `/` unchanged. https://vercel.com/docs/build-output-api/primitives#static-files
- An Edge function is `.vercel/output/functions/<name>.func/` with `.vc-config.json` `{ "runtime": "edge", "entrypoint": "index.js", "envVarsInUse": [...] }`; `envVarsInUse` names the project env vars the function reads (the docs page marks it ignored, but Next.js's adapter still fills it for its own middleware, so this plan lists `FTLITE_PASSCODE` and `FTLITE_COOKIE_SECRET` there as cheap insurance, review R1-F1). https://vercel.com/docs/build-output-api/primitives#functions-with-edge-runtime
- Routing Middleware: a route `{ "src": "/(.*)", "middlewarePath": "_middleware", "continue": true }` runs `functions/_middleware.func` on every request; the middleware passes the request through by returning a response with header `x-middleware-next: 1`. https://vercel.com/docs/build-output-api/features#routing-middleware and the official example https://github.com/vercel/examples/tree/main/build-output-api/edge-middleware (`.vercel/output/functions/_middleware.func/index.js`).
- `vercel deploy --prebuilt` needs only `.vercel/output`; `builds.json` is optional, and its `target` check is skipped when absent (`packages/cli/src/commands/deploy/index.ts`, `getPrebuiltJson`).
- Routing Middleware runs on Hobby, and Edge code reads project env vars through `process.env`. https://vercel.com/docs/routing-middleware — **check this at Web-iii's first deploy** (the live smoke enters the passcode; a 503 "not configured" page means the env did not reach the middleware).

## Spec decisions and deviations (recorded for the reviewer)

- **W-1 A `--test` web build is `packaged: false`.** `validatePageOnlineConfig` refuses test fields when `packaged` is true, so the spec's "test-only fields only in a `--test` build, `packaged: true` always in production" becomes: production is always `packaged: true` with every test field off; a `--test` build is `packaged: false`. `--test`'s companions (`--out`, `--service-origin`, `--duel-test-seed`, `--test-probe`, `--allow-missing-paid`) are refused without `--test`, and a `--test` build can never write to `.vercel/output` (it writes under `out/` or the temp directory), so a test build cannot be deployed by mistake. `deploy:web` always runs a fresh production `build:web` first.
- **W-2 `Cache-Control: private, no-cache`** on the game's files (spec: `private`). `no-cache` keeps `private` (no shared cache) and makes the browser revalidate, so a new deploy's `index.html` is fetched; `version.json` is `no-store` as specified. Both come from `config.json` route headers.
- **W-3 The passcode page is the answer to every request without a valid cookie**, at any path (status 401), plus `GET /__pass`; `POST /__pass` checks the code. If `FTLITE_PASSCODE` or `FTLITE_COOKIE_SECRET` is missing or the secret is under 32 bytes, every request gets a 503 "FTLite is not configured." page (fail closed).
- **W-4 Single player counts as "a match"** for the key guard (§7.1), the fullscreen Escape rule (§7.2) and the leave prompt (§7.6). A solo duel loses its round to an accidental Ctrl+W just like an online one.
- **W-5 The Web Lock is browser-only.** Electron opens one window per profile, and its gates run two apps with separate profiles; the lock is §7's browser rule. Start-up waits at most 2 s for it (then online is off and the menu starts anyway); a busy lock is asked once more with a 1.5 s waiting request, so a reload is not locked out by its own old document; the pagehide teardown releases it (review R1-F2). A lock manager that fails in a supported browser shows the unsupported text on Multiplayer (R1-F6).
- **W-6 "Download playtest log" is browser-only.** Electron still writes its records to disk through `duel:record` (§3.3 job 4); its IndexedDB store stays empty, so the button would only ever say there is nothing.
- **W-7 Audio unlock (§7.3) already holds on master** (`main.ts` resumes on the first `keydown`/`pointerdown` and on focus). The passcode page is a different document, so its submit gesture cannot carry over; the first menu gesture resumes audio. Task 8 only moves the three listeners into a tested module.
- **W-8 The middleware is bundled with esbuild** (pinned, Task 3), not Vite library mode, so `process.env.FTLITE_*` is left untouched for the Edge runtime.
- **W-9 The update banner compares the whole build identity** (`build.version`, `build.rev`, `build.sim`, `sim`, `digest`), not only `build`, so a rebuild at the same commit with a different gameplay digest still prompts.
- **W-10 Task count:** twelve tasks.

## File structure

New:

| Path | Responsibility |
|---|---|
| `src/web/passcode.ts` | Pure passcode logic: cookie mint/verify, the form, the passcode page (spec §5.3) |
| `src/web/middleware.ts` | The Edge entry: env and clock into `handlePasscode` |
| `build/rendererConfig.ts` | Renderer settings shared by the Electron and web builds |
| `build/webBuild.ts` | `resolveWebBuildPlan`, `checkPaidArt`, `webVersionInfo` |
| `vite.web.config.ts` | `createWebViteConfig(root, plan)` |
| `scripts/web/build-web.ts` | `npm run build:web`: Vite build + Build Output assembly |
| `scripts/web/web-output.ts` | `VERCEL_CONFIG`, `bundleMiddleware`, `checkWebOutput` |
| `scripts/web/check-output.ts` | The vercel-dev-free output check (CLI) |
| `src/renderer/src/app/web/versionWatch.ts` | `version.json` polling (§5.4) |
| `src/renderer/src/app/web/pageGuards.ts` | Keys, context menu, Ctrl+wheel (§7.1); `inMatch` |
| `src/renderer/src/app/web/browserFullscreen.ts` | Fullscreen API, keyboard lock, the Escape rule (§7.2) |
| `src/renderer/src/app/web/browserSupport.ts` | Unsupported/Safari checks and the exact texts (§7.5, §7.7) |
| `src/renderer/src/app/web/onlineLock.ts` | The `ftlite-online` Web Lock (§7.5) |
| `src/renderer/src/app/audioUnlock.ts` | First-gesture audio resume (§7.3) |
| `src/renderer/src/app/web/duelRecordStore.ts` | The `duelRecords` store and the combined log (§7.4) |
| `src/renderer/src/app/web/download.ts` | Blob-link download |
| `src/renderer/src/app/web/leavePrompt.ts` | The `beforeunload` prompt (§7.6) |
| `scripts/web/net/players.ts`, `scenario.ts`, `web-net-smoke.ts` | The browser network gates (§8) |

---

### Task 1: The passcode middleware (spec §5.3, §8 "Passcode tests")

**Files:**
- Create: `src/web/passcode.ts`
- Create: `src/web/middleware.ts`
- Modify: `tsconfig.web.json` (include)
- Test: `tests/webPasscode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const PASS_COOKIE = 'ftlite_pass', PASS_PATH = '/__pass', PASS_MAX_AGE_S = 2592000, PASS_FAIL_DELAY_MS = 1000, WRONG_PASSCODE_TEXT = 'Wrong passcode'`
  - `export interface PasscodeEnv { passcode: string | undefined; secret: string | undefined; nowMs(): number; sleep(ms: number): Promise<void> }`
  - `export function handlePasscode(request: Request, env: PasscodeEnv): Promise<Response>`
  - `export function nextResponse(): Response`, `export function isNext(response: Response): boolean`
  - `export function mintPassCookie(secret: Uint8Array, nowMs: number): Promise<string>` (the cookie value, `<expiry>.<mac>`)
  - `src/web/middleware.ts` default export `(request: Request) => Promise<Response>`

- [ ] **Step 1: Add `src/web` to the web project.** In `tsconfig.web.json`, change the start of `"include"` from `["src/renderer/src/**/*",` to `["src/web/**/*", "src/renderer/src/**/*",`.

- [ ] **Step 2: Write the failing test** `tests/webPasscode.test.ts`:

```ts
// The passcode middleware (web build spec §5.3, §8 "Passcode tests"): the page and /__pass are the only answers without
// the cookie; a wrong code waits 1 s; a right code sets the signed cookie; expired and tampered cookies are refused.
import { describe, expect, it, vi } from 'vitest';
import { handlePasscode, isNext, mintPassCookie, PASS_MAX_AGE_S, WRONG_PASSCODE_TEXT, type PasscodeEnv } from '../src/web/passcode';

const KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const SECRET = btoa(String.fromCharCode(...KEY));
const NOW = Date.UTC(2026, 10, 18, 12);
const env = (over: Partial<PasscodeEnv> = {}): PasscodeEnv & { sleep: ReturnType<typeof vi.fn> } =>
  ({ passcode: 'open sesame', secret: SECRET, nowMs: () => NOW, sleep: vi.fn(async () => {}), ...over }) as never;
const get = (path: string, cookie?: string): Request => new Request(`https://ftlite.vercel.app${path}`, { headers: cookie ? { cookie } : {} });
const post = (body: string, type = 'application/x-www-form-urlencoded'): Request =>
  new Request('https://ftlite.vercel.app/__pass', { method: 'POST', headers: { 'content-type': type }, body });
const form = (code: string): string => new URLSearchParams({ code }).toString();
const PATHS = ['/', '/index.html', '/assets/paid/2mt/hound.png', '/version.json', '/assets/authorityWorker.js', '/__pass'];

async function expectPage(response: Response, status = 401): Promise<string> {
  expect(response.status).toBe(status); expect(isNext(response)).toBe(false);
  expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  const body = await response.text(); if (status === 401) expect(body).toContain('action="/__pass"'); return body;
}

describe('the passcode middleware', () => {
  it('serves only the passcode page without the cookie, on every path (paid art, version.json and the Worker too)', async () => {
    for (const path of PATHS) await expectPage(await handlePasscode(get(path), env()));
    await expectPage(await handlePasscode(get('/', 'other=1; ftlite_pass='), env()));
  });
  it('a wrong code waits 1 s and shows Wrong passcode, with no cookie', async () => {
    const e = env(), r = await handlePasscode(post(form('nope')), e);
    expect(await expectPage(r)).toContain(WRONG_PASSCODE_TEXT); expect(e.sleep).toHaveBeenCalledWith(1000); expect(r.headers.get('set-cookie')).toBeNull();
    const big = env(); await expectPage(await handlePasscode(post(form('x'.repeat(2000))), big)); expect(big.sleep).toHaveBeenCalledWith(1000);
    const json = env(); await expectPage(await handlePasscode(post(JSON.stringify({ code: 'open sesame' }), 'application/json'), json)); expect(json.sleep).toHaveBeenCalledWith(1000);
  });
  it('the right code sets the signed 30-day cookie and redirects to /, and the cookie then passes every path', async () => {
    const e = env(), r = await handlePasscode(post(form('open sesame')), e);
    expect(r.status).toBe(303); expect(r.headers.get('location')).toBe('/'); expect(e.sleep).not.toHaveBeenCalled();
    const m = /^ftlite_pass=(\d+)\.([A-Za-z0-9_-]{43}); HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/.exec(r.headers.get('set-cookie') ?? '');
    expect(m).not.toBeNull(); expect(Number(m![1])).toBe(Math.floor(NOW / 1000) + PASS_MAX_AGE_S);
    const cookie = `theme=dark; ftlite_pass=${m![1]}.${m![2]}`;
    for (const path of PATHS.filter(p => p !== '/__pass')) expect(isNext(await handlePasscode(get(path, cookie), env()))).toBe(true);
  });
  it('refuses an expired cookie', async () => {
    const old = await mintPassCookie(KEY, NOW - (PASS_MAX_AGE_S + 1) * 1000);
    await expectPage(await handlePasscode(get('/', `ftlite_pass=${old}`), env()));
    const edge = await mintPassCookie(KEY, NOW - PASS_MAX_AGE_S * 1000);   // expires exactly now
    await expectPage(await handlePasscode(get('/', `ftlite_pass=${edge}`), env()));
    const fresh = await mintPassCookie(KEY, NOW - 1000);
    expect(isNext(await handlePasscode(get('/', `ftlite_pass=${fresh}`), env()))).toBe(true);
  });
  it('refuses a tampered cookie', async () => {
    const good = await mintPassCookie(KEY, NOW), [expiry, mac] = good.split('.') as [string, string];
    const flip = (s: string): string => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    const other = await mintPassCookie(Uint8Array.from({ length: 32 }, () => 9), NOW);
    for (const bad of [`${Number(expiry) + 1}.${mac}`, `${expiry}.${flip(mac)}`, other, `${expiry}.`, `${expiry}`, `-1.${mac}`, `${expiry}.${mac}=`, 'garbage'])
      await expectPage(await handlePasscode(get('/', `ftlite_pass=${bad}`), env()));
    const far = await mintPassCookie(KEY, NOW + 3600_000);   // a valid MAC whose expiry lies beyond 30 days from now
    await expectPage(await handlePasscode(get('/', `ftlite_pass=${far}`), env()));
  });
  it('fails closed without its configuration', async () => {
    for (const e of [env({ passcode: '' }), env({ passcode: undefined }), env({ secret: undefined }), env({ secret: btoa('short') }), env({ secret: '%%%' })]) {
      const page = await expectPage(await handlePasscode(post(form('open sesame')), e), 503); expect(page).toContain('FTLite is not configured.');
      await expectPage(await handlePasscode(get('/'), e), 503);
    }
  });
});
```

- [ ] **Step 3: Run it to see it fail.** Run: `npx vitest run tests/webPasscode.test.ts` — Expected: FAIL, `Cannot find module '../src/web/passcode'`.

- [ ] **Step 4: Write `src/web/passcode.ts`:**

```ts
// The private site's passcode (web build spec §5.3): a Vercel Routing Middleware (Edge runtime) runs this on every
// request. Without a valid ftlite_pass cookie the only answers are the passcode page and POST /__pass. Pure: the
// passcode, secret, clock and sleep come in through PasscodeEnv, so it is unit-tested without Vercel.
export const PASS_COOKIE = 'ftlite_pass', PASS_PATH = '/__pass', PASS_MAX_AGE_S = 2592000, PASS_FAIL_DELAY_MS = 1000;
export const WRONG_PASSCODE_TEXT = 'Wrong passcode';
const NOT_CONFIGURED_TEXT = 'FTLite is not configured.';
const MAX_FORM_CHARS = 1024;
export interface PasscodeEnv { passcode: string | undefined; secret: string | undefined; nowMs(): number; sleep(ms: number): Promise<void> }
const encoder = new TextEncoder();

/** Vercel's pass-through: the request continues to the static file (Build Output API Routing Middleware). */
export function nextResponse(): Response { return new Response(null, { headers: { 'x-middleware-next': '1' } }); }
export function isNext(response: Response): boolean { return response.headers.get('x-middleware-next') === '1'; }

function base64url(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(text: string): Uint8Array | null {
  try { return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)), c => c.charCodeAt(0)); } catch { return null; }
}
/** FTLITE_COOKIE_SECRET: base64 of at least 32 random bytes; anything else is "not configured". */
function secretBytes(secret: string | undefined): Uint8Array | null {
  if (!secret) return null;
  try { const bytes = Uint8Array.from(atob(secret.trim()), c => c.charCodeAt(0)); return bytes.length >= 32 ? bytes : null; } catch { return null; }
}
function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
/** The cookie value `<expiry>.<HMAC-SHA256(secret, expiry)>`, expiring 30 days after `nowMs`. */
export async function mintPassCookie(secret: Uint8Array, nowMs: number): Promise<string> {
  const expiry = String(Math.floor(nowMs / 1000) + PASS_MAX_AGE_S);
  return `${expiry}.${base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(expiry))))}`;
}
async function passCookieValid(value: string | null, secret: Uint8Array, nowMs: number): Promise<boolean> {
  const m = value === null ? null : /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return false;
  const expiry = Number(m[1]), now = Math.floor(nowMs / 1000);
  if (!(expiry > now && expiry <= now + PASS_MAX_AGE_S)) return false;
  const mac = fromBase64url(m[2]!);
  if (!mac || mac.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), mac, encoder.encode(m[1]!));   // constant time
}
function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('='); if (at < 0) continue;
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}
/** Constant-time compare: both sides hashed to 32 bytes first, so neither length nor content leaks through timing. */
async function samePasscode(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([given, expected].map(async s => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)))));
  let diff = 0; for (let i = 0; i < 32; i++) diff |= a![i]! ^ b![i]!;
  return diff === 0;
}
async function submittedCode(request: Request): Promise<string | null> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) return null;
  const text = await request.text();
  return text.length > MAX_FORM_CHARS ? null : new URLSearchParams(text).get('code');
}
function page(status: number, message: string): Response {
  const form = status === 503 ? '' : `<form method="post" action="${PASS_PATH}"><label for="code">Passcode</label>
<input id="code" name="code" type="password" autocomplete="current-password" autofocus required><button type="submit">Enter</button></form>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FTLite</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#030302;color:#ffb000;font:16px monospace}
main{display:flex;flex-direction:column;gap:10px}form{display:flex;flex-direction:column;gap:10px}input,button{font:inherit;color:inherit;background:#0b0a06;border:1px solid #b07a00;padding:8px}</style>
</head><body><main><h1>FTLite</h1>${form}${message ? `<p role="alert">${message}</p>` : ''}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
}

export async function handlePasscode(request: Request, env: PasscodeEnv): Promise<Response> {
  const secret = secretBytes(env.secret);
  if (!env.passcode || !secret) return page(503, NOT_CONFIGURED_TEXT);
  const path = new URL(request.url).pathname;
  if (path === PASS_PATH && request.method === 'POST') {
    const code = await submittedCode(request);
    if (code !== null && await samePasscode(code, env.passcode)) {
      const cookie = await mintPassCookie(secret, env.nowMs());
      return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store',
        'Set-Cookie': `${PASS_COOKIE}=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${PASS_MAX_AGE_S}` } });
    }
    await env.sleep(PASS_FAIL_DELAY_MS);
    return page(401, WRONG_PASSCODE_TEXT);
  }
  if (path !== PASS_PATH && await passCookieValid(readCookie(request.headers.get('cookie'), PASS_COOKIE), secret, env.nowMs())) return nextResponse();
  return page(401, '');
}
```

- [ ] **Step 5: Write `src/web/middleware.ts`:**

```ts
// The Vercel Routing Middleware entry (web build spec §5.3), bundled by scripts/web/web-output.ts into
// .vercel/output/functions/_middleware.func/index.js. FTLITE_PASSCODE and FTLITE_COOKIE_SECRET are the project's env vars.
import { handlePasscode } from './passcode';

export default function middleware(request: Request): Promise<Response> {
  return handlePasscode(request, { passcode: process.env.FTLITE_PASSCODE, secret: process.env.FTLITE_COOKIE_SECRET,
    nowMs: () => Date.now(), sleep: ms => new Promise(done => setTimeout(done, ms)) });
}
```

- [ ] **Step 6: Run the tests.** Run: `npx vitest run tests/webPasscode.test.ts && npm run typecheck` — Expected: PASS (6 tests), typecheck exit 0. If Node's `Request` drops the `cookie` header, the cookie cases fail: then build requests with `new Request(url, { headers: new Headers([['cookie', value]]) })` — Node's undici keeps it either way; do not change product code for it.

- [ ] **Step 7: Commit.**

```bash
git add src/web/passcode.ts src/web/middleware.ts tests/webPasscode.test.ts tsconfig.web.json
git commit -m "feat(web-ii): passcode Routing Middleware (signed 30-day cookie, constant-time check, 1 s delay, fail closed)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The web build plan, shared renderer settings, and the baked page config (spec §5.1)

**Files:**
- Create: `build/rendererConfig.ts`
- Create: `build/webBuild.ts`
- Create: `vite.web.config.ts`
- Modify: `electron.vite.config.ts`
- Modify: `src/renderer/src/net/env.d.ts`
- Modify: `vitest.config.ts`
- Modify: `tsconfig.node.json`, `tsconfig.web.json` (include)
- Modify: `src/renderer/src/main.ts` (the online config source)
- Test: `tests/webBuildPlan.test.ts`

**Interfaces:**
- Consumes: `resolveOnlineConfig`, `validatePageOnlineConfig`, `PageOnlineConfig` (`src/shared/onlineConfig.ts`); `computeBuildInfo`, `readSimVersion` (`build/buildInfo.ts`); `computeContentDigest` (`build/contentDigest.ts`).
- Produces:
  - `rendererSettings(root: string, webConfig: PageOnlineConfig | null)` returning `{ envDir, plugins, publicDir, define, worker }`
  - `export interface WebBuildPlan { test: boolean; allowMissingPaid: boolean; outDir: string; pageConfig: PageOnlineConfig }`
  - `resolveWebBuildPlan(root: string, argv: readonly string[], env: Readonly<Record<string, string | undefined>>): WebBuildPlan` (throws `build:web: …`)
  - `checkPaidArt(root: string, plan: Pick<WebBuildPlan, 'allowMissingPaid'>): boolean` (true when the paid art is present)
  - `export interface WebVersion { build: { version: string; rev: string; sim: number }; sim: number; digest: string }`, `webVersionInfo(root: string): WebVersion`
  - `export const PRODUCTION_OUT = '.vercel/output', TEST_OUT = 'out/web-test'`
  - `createWebViteConfig(root: string, plan: WebBuildPlan): InlineConfig` (`vite.web.config.ts`)
  - the global `declare const __FTLITE_WEB_CONFIG__: PageOnlineConfig | null`

- [ ] **Step 1: Write the failing test** `tests/webBuildPlan.test.ts`:

```ts
// The web build's plan (web build spec §5.1): exactly one https service origin (loopback only in a --test build), the
// baked PageOnlineConfig (packaged and test-free in production, deviation W-1), test-only flags, the out directory, and
// the paid-art check.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkPaidArt, resolveWebBuildPlan, webVersionInfo } from '../build/webBuild';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const root = process.cwd(), HTTPS = 'https://ftlite-signalling-dev.example.workers.dev';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('resolveWebBuildPlan', () => {
  it('bakes a packaged, test-free TURN config for production and writes .vercel/output', () => {
    const plan = resolveWebBuildPlan(root, [], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS });
    expect(plan).toEqual({ test: false, allowMissingPaid: false, outDir: resolve(root, '.vercel/output'),
      pageConfig: { serviceOrigin: HTTPS, iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false } });
  });
  it('refuses anything but exactly one https origin in production', () => {
    for (const bad of [undefined, '', 'http://127.0.0.1:8787', 'http://example.com', `${HTTPS}/`, `${HTTPS}/v2`, `${HTTPS},https://b.example.com`, ` ${HTTPS}`, 'https://user@example.com'])
      expect(() => resolveWebBuildPlan(root, [], { FTLITE_WEB_SERVICE_ORIGIN: bad })).toThrow(/exactly one https origin/);
  });
  it('builds a loopback --test config with its test fields, under out/', () => {
    const plan = resolveWebBuildPlan(root, ['--test', '--service-origin=http://127.0.0.1:8787', '--duel-test-seed=351', '--test-probe', '--allow-missing-paid'], {});
    expect(plan).toEqual({ test: true, allowMissingPaid: true, outDir: resolve(root, 'out/web-test'),
      pageConfig: { serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: false, duelTestSeed: 351, testProbe: true } });
    expect(resolveWebBuildPlan(root, ['--test'], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS }).pageConfig.iceMode).toBe('turn');
    const tmp = join(tmpdir(), 'ftlite-web-plan-out');
    expect(resolveWebBuildPlan(root, ['--test', `--out=${tmp}`], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS }).outDir).toBe(resolve(tmp));
  });
  it('refuses test-only flags without --test, unknown flags, bad seeds and test output outside out/ or the temp directory', () => {
    for (const flag of ['--test-probe', '--duel-test-seed=1', '--allow-missing-paid', '--out=out/x', '--service-origin=http://127.0.0.1:1'])
      expect(() => resolveWebBuildPlan(root, [flag], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/needs --test/);
    expect(() => resolveWebBuildPlan(root, ['--prod'], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/unknown argument/);
    for (const seed of ['-1', 'x', '4294967296', '12345678901']) expect(() => resolveWebBuildPlan(root, ['--test', `--duel-test-seed=${seed}`], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/duel-test-seed/);
    for (const out of ['.vercel/output', 'src/x', '..']) expect(() => resolveWebBuildPlan(root, ['--test', `--out=${out}`], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/under out\//);
  });
});

describe('checkPaidArt and webVersionInfo', () => {
  it('fails without public/assets/paid unless --allow-missing-paid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftlite-paid-')); dirs.push(dir);
    expect(() => checkPaidArt(dir, { allowMissingPaid: false })).toThrow(/public\/assets\/paid is missing or empty/);
    mkdirSync(join(dir, 'public/assets/paid'), { recursive: true });
    expect(() => checkPaidArt(dir, { allowMissingPaid: false })).toThrow(/missing or empty/);
    expect(checkPaidArt(dir, { allowMissingPaid: true })).toBe(false);
    writeFileSync(join(dir, 'public/assets/paid/x.png'), 'x');
    expect(checkPaidArt(dir, { allowMissingPaid: false })).toBe(true);
  });
  it('describes the build as { build, sim, digest }', () => {
    const v = webVersionInfo(root);
    expect(v.sim).toBe(SIM_VERSION); expect(v.build.sim).toBe(SIM_VERSION); expect(v.digest).toMatch(/^[0-9a-f]{64}$/); expect(typeof v.build.rev).toBe('string');
  });
});
```

- [ ] **Step 2: Run it to see it fail.** Run: `npx vitest run tests/webBuildPlan.test.ts` — Expected: FAIL, `Cannot find module '../build/webBuild'`.

- [ ] **Step 3: Write `build/rendererConfig.ts`:**

```ts
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
```

- [ ] **Step 4: Switch `electron.vite.config.ts` to it.** Replace the whole file with:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { ensureIsolatedBuildReporterOutput } from './build/isolatedBuildReporter';
import { rendererSettings } from './build/rendererConfig';

ensureIsolatedBuildReporterOutput();
export default defineConfig({
  // Electron's main is a thin window (web build spec §3.3); the session, peers and host Worker are page code.
  main: {
    envDir: false,
    define: { __FTLITE_PACKAGED_SERVICE_ORIGIN__: JSON.stringify(process.env['FTLITE_PACKAGED_SERVICE_ORIGIN'] ?? '') },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  // Sandboxed preloads cannot require a relative shared chunk. Inline the entry's validators.
  preload: { envDir: false, build: { isolatedEntries: true, externalizeDeps: false, rollupOptions: { input: { index: resolve('src/preload/index.ts') } } } },
  // The renderer settings are shared with the web build (build/rendererConfig.ts); Electron bakes no page config.
  renderer: {
    ...rendererSettings(import.meta.dirname, null),
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
});
```

- [ ] **Step 5: Write `build/webBuild.ts`:**

```ts
// The web build's plan (web build spec §5.1, deviation W-1): which service origin is baked in, whether this is a local
// --test build, where the Build Output goes, and the checks that refuse a wrong build before Vite runs.
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { resolveOnlineConfig, validatePageOnlineConfig, type PageOnlineConfig } from '../src/shared/onlineConfig';
import { computeBuildInfo, readSimVersion } from './buildInfo';
import { computeContentDigest } from './contentDigest';

export const PRODUCTION_OUT = '.vercel/output', TEST_OUT = 'out/web-test';
export interface WebBuildPlan { test: boolean; allowMissingPaid: boolean; outDir: string; pageConfig: PageOnlineConfig }
export interface WebVersion { build: { version: string; rev: string; sim: number }; sim: number; digest: string }
const KNOWN = new Set(['test', 'allow-missing-paid', 'out', 'service-origin', 'duel-test-seed', 'test-probe']);
const TEST_ONLY = ['allow-missing-paid', 'out', 'service-origin', 'duel-test-seed', 'test-probe'];

export function resolveWebBuildPlan(root: string, argv: readonly string[], env: Readonly<Record<string, string | undefined>>): WebBuildPlan {
  const flags = new Map<string, string | true>();
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(arg);
    if (!m || !KNOWN.has(m[1]!)) throw Error(`build:web: unknown argument ${JSON.stringify(arg)}`);
    flags.set(m[1]!, m[2] ?? true);
  }
  const test = flags.has('test');
  for (const name of TEST_ONLY) if (flags.has(name) && !test) throw Error(`build:web: --${name} needs --test (a production build refuses test-only settings)`);
  const text = (name: string): string | undefined => { const v = flags.get(name); return typeof v === 'string' ? v : undefined; };
  const origin = text('service-origin') ?? env.FTLITE_WEB_SERVICE_ORIGIN ?? '';
  const loopback = test && /^http:\/\//i.test(origin);
  const resolved = resolveOnlineConfig(loopback ? { packaged: false, localServiceUrl: origin } : { packaged: false, serviceUrl: origin });
  if (!resolved.enabled || resolved.baseUrl !== origin)
    throw Error(`build:web: FTLITE_WEB_SERVICE_ORIGIN must be exactly one https origin${test ? ' (or a loopback http origin in a --test build)' : ''}; got ${JSON.stringify(origin)}`);
  const seedText = text('duel-test-seed');
  if (seedText !== undefined && !(/^\d{1,10}$/.test(seedText) && Number(seedText) <= 0xffffffff)) throw Error(`build:web: --duel-test-seed must be 0..4294967295; got ${JSON.stringify(seedText)}`);
  const pageConfig: PageOnlineConfig = test
    ? { serviceOrigin: resolved.baseUrl, iceMode: resolved.iceMode, allowInsecureLocalhost: resolved.allowInsecureLocalhost, packaged: false,
        sectorOnlineTest: false, duelTestSeed: seedText === undefined ? null : Number(seedText), testProbe: flags.has('test-probe') }
    : { serviceOrigin: resolved.baseUrl, iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false };
  if (!validatePageOnlineConfig(pageConfig)) throw Error('build:web: the page online config is invalid');
  const outDir = resolve(root, test ? text('out') ?? TEST_OUT : PRODUCTION_OUT);
  if (test && !outDir.startsWith(resolve(root, 'out') + sep) && !outDir.startsWith(resolve(tmpdir()) + sep))
    throw Error(`build:web: a --test build writes under out/ or the temp directory only; got ${outDir}`);
  return { test, allowMissingPaid: flags.has('allow-missing-paid'), outDir, pageConfig };
}

/** Spec §5.1: the gitignored paid art must ship, so a deploy cannot go out without it by mistake. */
export function checkPaidArt(root: string, plan: Pick<WebBuildPlan, 'allowMissingPaid'>): boolean {
  const dir = join(root, 'public/assets/paid'), present = existsSync(dir) && readdirSync(dir).length > 0;
  if (!present && !plan.allowMissingPaid)
    throw Error('build:web: public/assets/paid is missing or empty; the paid art ships with the site (build from the main checkout, or use --test --allow-missing-paid for a local test build)');
  return present;
}

/** Spec §5.4: version.json. */
export function webVersionInfo(root: string): WebVersion {
  return { build: computeBuildInfo(root), sim: readSimVersion(root), digest: computeContentDigest(root) };
}
```

- [ ] **Step 6: Write `vite.web.config.ts`:**

```ts
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
```

- [ ] **Step 7: Declare the define and give it to Vitest.** Append to `src/renderer/src/net/env.d.ts`:

```ts
/** The web build's baked page online config (web build spec §5.1); null in Electron, whose preload hands the page its config. */
declare const __FTLITE_WEB_CONFIG__: import('../../../shared/onlineConfig').PageOnlineConfig | null;
```

In `vitest.config.ts`, change `define: { __GAMEPLAY_CONTENT_DIGEST__: …, __FTLITE_BUILD__: JSON.stringify({ … }) },` by inserting `__FTLITE_WEB_CONFIG__: 'null', ` right after `define: { `.

- [ ] **Step 8: Add the new build files to both projects.** In `tsconfig.node.json` `"include"`, after `"build/buildInfo.ts",` add `"build/rendererConfig.ts", "build/webBuild.ts", "vite.web.config.ts",`. In `tsconfig.web.json` `"include"`, after `"build/isolatedBuildReporter.ts"` add `, "build/buildInfo.ts", "build/rendererConfig.ts", "build/webBuild.ts", "vite.web.config.ts"` (scripts in the web project import them).

- [ ] **Step 9: The page reads the baked config when there is no preload.** In `src/renderer/src/main.ts` replace:

```ts
  // The online session runs in this page (web build spec §3.3); Electron's preload hands it main's resolved config.
  const onlineConfig = window.ftlite?.onlineConfig;
```

with:

```ts
  // The online session runs in this page (web build spec §3.3): Electron's preload hands it main's resolved config, and
  // the web build bakes its own in (§5.1).
  const onlineConfig = window.ftlite ? window.ftlite.onlineConfig : __FTLITE_WEB_CONFIG__;
```

- [ ] **Step 10: Run the tests and the Electron build.** Run: `npx vitest run tests/webBuildPlan.test.ts && npm run typecheck && npm run build && npx vitest run tests/build-output.test.ts` — Expected: all PASS; `out/renderer/assets/authorityWorker.js` still exists.

- [ ] **Step 11: Commit.**

```bash
git add build/rendererConfig.ts build/webBuild.ts vite.web.config.ts electron.vite.config.ts src/renderer/src/net/env.d.ts vitest.config.ts tsconfig.node.json tsconfig.web.json src/renderer/src/main.ts tests/webBuildPlan.test.ts
git commit -m "feat(web-ii): web build plan, shared renderer settings, baked page online config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `build:web` writes the Build Output, and the vercel-dev-free output check (spec §5.1, §8)

**Files:**
- Create: `scripts/web/web-output.ts`
- Create: `scripts/web/build-web.ts`
- Create: `scripts/web/check-output.ts`
- Modify: `package.json` (scripts `build:web`, `test:web-output`; devDependency `esbuild`)
- Modify: `package-lock.json` (from the main-checkout install)
- Modify: `.gitignore`
- Test: `tests/webOutput.test.ts`

**Interfaces:**
- Consumes: `resolveWebBuildPlan`, `checkPaidArt`, `webVersionInfo`, `WebBuildPlan` (Task 2); `createWebViteConfig` (Task 2); `src/web/middleware.ts`, `isNext`, `PASS_PATH`, `WRONG_PASSCODE_TEXT` (Task 1).
- Produces:
  - `export const MIDDLEWARE_NAME = '_middleware'`, `VERCEL_CONFIG`, `VC_CONFIG`
  - `bundleMiddleware(root: string, outDir: string): Promise<void>`
  - `checkWebOutput(outDir: string): Promise<{ problems: string[]; staticPaths: number }>`
  - `buildWeb(root: string, plan: WebBuildPlan): Promise<{ outDir: string; paidArt: boolean }>` (`scripts/web/build-web.ts`, also its CLI)

- [ ] **Step 1: Pin esbuild** (it is already installed at this version as Vite's dependency; this makes it direct). In the **main checkout**: `npm install --save-dev --save-exact esbuild@0.25.12`, then move the change to the worktree as Global Constraints say.

- [ ] **Step 2: Ignore Vercel's directory.** Append to `.gitignore`:

```
# Vercel Build Output and project link (web build spec §5.1, §5.2; never commit)
.vercel/
```

- [ ] **Step 3: Write the failing test** `tests/webOutput.test.ts`:

```ts
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
```

- [ ] **Step 4: Run it to see it fail.** Run: `npx vitest run tests/webOutput.test.ts` — Expected: FAIL, `Cannot find module '../scripts/web/web-output'`.

- [ ] **Step 5: Write `scripts/web/web-output.ts`:**

```ts
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
```

- [ ] **Step 6: Run the test.** Run: `npx vitest run tests/webOutput.test.ts` — Expected: PASS (4 tests; each sleeps 1 s once for the wrong-code check).

- [ ] **Step 7: Write `scripts/web/build-web.ts`:**

```ts
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
```

- [ ] **Step 8: Write `scripts/web/check-output.ts`:**

```ts
// The vercel-dev-free output check (web build spec §8): `tsx scripts/web/check-output.ts [outDir]` (default .vercel/output).
import { resolve } from 'node:path';
import { checkWebOutput } from './web-output';

const outDir = resolve(process.argv[2] ?? '.vercel/output');
checkWebOutput(outDir).then(({ problems, staticPaths }) => {
  if (problems.length) { console.error(`WEB OUTPUT FAIL (${outDir}):\n  ${problems.slice(0, 40).join('\n  ')}`); process.exitCode = 1; return; }
  console.log(`WEB OUTPUT PASS: ${staticPaths} static paths need the cookie; only the passcode page and ${'/__pass'} answer without it (${outDir})`);
}, error => { console.error(`WEB OUTPUT FAIL: ${String((error as Error)?.message ?? error)}`); process.exitCode = 1; });
```

- [ ] **Step 9: Add the npm scripts.** In `package.json` `"scripts"`, after `"build": "electron-vite build",` add:

```json
    "build:web": "tsx scripts/web/build-web.ts",
    "test:web-output": "tsx scripts/web/build-web.ts --test --allow-missing-paid --service-origin=http://127.0.0.1:8787 --out=out/web-output-check && tsx scripts/web/check-output.ts out/web-output-check",
```

- [ ] **Step 10: Run the real build and the check.** Run: `npm run test:web-output` — Expected: `WEB BUILD TEST: …out\web-output-check (service http://127.0.0.1:8787, paid art MISSING (test only))` (the worktree has no paid art) and `WEB OUTPUT PASS: <N> static paths need the cookie …`. Then `ls out/web-output-check/static/assets/authorityWorker.js out/web-output-check/functions/_middleware.func/.vc-config.json` — Expected: both exist. Then the production refusal: `FTLITE_WEB_SERVICE_ORIGIN=https://example.workers.dev npm run build:web` — Expected: exit 1 with `public/assets/paid is missing or empty` (in the worktree); and `npm run build:web` with no env — Expected: exit 1 `must be exactly one https origin`.

- [ ] **Step 11: Typecheck and commit.**

```bash
npm run typecheck
git add scripts/web/web-output.ts scripts/web/build-web.ts scripts/web/check-output.ts tests/webOutput.test.ts package.json package-lock.json .gitignore
git commit -m "feat(web-ii): build:web writes the Vercel Build Output (static, version.json, passcode middleware, routes) and a vercel-dev-free output check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `deploy:web`, the pinned Vercel CLI, and the owner's one-time steps (spec §5.2)

**Files:**
- Modify: `package.json` (script `deploy:web`; devDependency `vercel`)
- Modify: `package-lock.json`
- Modify: `docs/gates.md` (new Web-ii section)
- Test: `tests/webDeployScripts.test.ts`

**Interfaces:**
- Consumes: `build:web` and `scripts/web/check-output.ts` (Task 3).
- Produces: `npm run deploy:web` (never run by this plan).

- [ ] **Step 1: Pin the Vercel CLI.** In the **main checkout**: `npm install --save-dev --save-exact vercel@65.10.0`, then move the change to the worktree as Global Constraints say.

- [ ] **Step 2: Write the failing test** `tests/webDeployScripts.test.ts`:

```ts
// The deploy entry (web build spec §5.2): a fresh production build:web, the output check, then a prebuilt production
// deploy; the CLI and esbuild are exact pins; Vercel's directory is never committed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
describe('deploy:web', () => {
  it('builds for production, checks the output, then deploys the prebuilt output to production', () => {
    expect(pkg.scripts['deploy:web']).toBe('npm run build:web && tsx scripts/web/check-output.ts .vercel/output && vercel deploy --prebuilt --prod');
    expect(pkg.scripts['build:web']).toBe('tsx scripts/web/build-web.ts');
  });
  it('pins the Vercel CLI and esbuild exactly', () => {
    expect(pkg.devDependencies.vercel).toBe('65.10.0'); expect(pkg.devDependencies.esbuild).toBe('0.25.12');
  });
  it('never commits .vercel/', () => { expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\.vercel\/$/m); });
});
```

- [ ] **Step 3: Run it to see it fail.** Run: `npx vitest run tests/webDeployScripts.test.ts` — Expected: FAIL on `deploy:web` (undefined).

- [ ] **Step 4: Add the script.** In `package.json` `"scripts"`, after `"build:web": …,` add:

```json
    "deploy:web": "npm run build:web && tsx scripts/web/check-output.ts .vercel/output && vercel deploy --prebuilt --prod",
```

- [ ] **Step 5: Document the owner's steps.** Append to `docs/gates.md`:

```markdown
## Web-ii: the web build and browser behaviour (2026-11-18)

`npm run build:web` writes `.vercel/output` (Build Output API v3: `static/`, the passcode middleware in `functions/_middleware.func`, `config.json`). `npm run deploy:web` runs a fresh production `build:web`, the output check (`scripts/web/check-output.ts`), then `vercel deploy --prebuilt --prod`. Vercel never builds from git. Nothing is deployed in Web-ii; the first deploy is Web-iii.

**Owner's one-time Vercel setup (Web-iii, needs the owner's login).** Run from the main checkout (it has `public/assets/paid`):
1. `npx vercel login`.
2. `npx vercel link` and create a new **Hobby** project. Keep its git integration **disconnected** (Project Settings → Git: no repository), so only `--prod` deploys exist and no preview address is ever made.
3. Set the two environment variables for **Production**:
   - `npx vercel env add FTLITE_PASSCODE production` (the code friends type).
   - `npx vercel env add FTLITE_COOKIE_SECRET production` with 32 random bytes in base64, made by `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
   Changing `FTLITE_PASSCODE` changes the code; changing `FTLITE_COOKIE_SECRET` signs everyone out. A missing or short secret makes every page answer "FTLite is not configured." (fail closed).
4. Each deploy: `FTLITE_WEB_SERVICE_ORIGIN=https://<signalling worker origin> npm run deploy:web` (exactly one https origin; no trailing slash).
5. After the first deploy, put `https://<project>.vercel.app` into Cloudflare's `ALLOWED_ORIGINS` (spec §6), then run these live checks with `curl -I`. Use `-b ftlite_pass=<value>` for the cookie; copy the value from a browser sign-in (DevTools → Application → Cookies).
   - Without the cookie: `/`, `/assets/authorityWorker.js` and `/assets/paid/<a real file from public/assets/paid>` each answer `401` (the passcode page).
   - With the cookie: `/`, `/assets/authorityWorker.js` and the same paid file each answer `200` with `cache-control: private, no-cache`, and `/version.json` answers `200` with `cache-control: no-store`.
   - If any check fails, roll the first deploy back at once: `npx vercel rollback`, or delete the deployment in the dashboard. Fix it before redeploying; never leave the paid art reachable without the cookie.
   - If every page answers `503` "FTLite is not configured." although both vars are set, the vars are not reaching the middleware. Check that both are set for **Production**, then redeploy (env changes need a new deploy).
   Web-iii's `scripts/web/live-smoke.ts` runs the same cookie and header checks, without and with the cookie, before its two-browser duel, and fails the run if any of them fails.

- [ ] Owner: Vercel login, link (Hobby, git disconnected) and the two env vars (Web-iii).
- [ ] Owner: first `deploy:web`, then the step-5 live checks without and with the cookie (paid art, Worker, `/`, `version.json`); roll back on any failure (Web-iii).
- [ ] Web-iii plan: `scripts/web/live-smoke.ts` repeats the step-5 checks (401 without the cookie for `/assets/paid/<file>` and `/assets/authorityWorker.js`; 200 with `private, no-cache` with it; `version.json` `no-store`) before its duel.
```

- [ ] **Step 6: Run the test and commit.**

```bash
npx vitest run tests/webDeployScripts.test.ts
git add package.json package-lock.json docs/gates.md tests/webDeployScripts.test.ts
git commit -m "feat(web-ii): deploy:web (production build, output check, vercel deploy --prebuilt --prod), Vercel CLI pinned, owner setup documented

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The browser slice, `version.json` polling and the update banner (spec §5.4)

**Files:**
- Create: `src/renderer/src/app/web/versionWatch.ts`
- Modify: `src/renderer/src/ui/menuState.ts` (BrowserSlice, UiState, texts)
- Modify: `src/renderer/src/ui/store.ts`
- Modify: `src/renderer/src/ui/actions.ts`
- Modify: `src/renderer/src/ui/menu/Menu.tsx`
- Modify: `src/renderer/src/main.ts`
- Modify: `tests/pageBoundary.test.ts` (PAGE_ROOTS)
- Test: `tests/webVersionWatch.test.ts`, `tests/webBanner.test.tsx`

**Interfaces:**
- Consumes: `isPlaying` (`ui/menuState.ts`), `__FTLITE_BUILD__`, `__GAMEPLAY_CONTENT_DIGEST__`.
- Produces (later tasks rely on all of these):
  - `export interface BrowserSlice { web: boolean; update: boolean; unsupported: string | null; note: string | null; onlineBlocked: string | null; playtestLog: boolean; playtestLogText: string }`, `INITIAL_BROWSER`, `UiState.browser`
  - `NO_PLAYTEST_RECORDS_TEXT = 'No playtest records yet.'`, `PLAYTEST_LOG_FAILED_TEXT = 'The playtest log could not be read.'`, `BROWSER_F11_TEXT` (in `menuState.ts`)
  - `UiStoreInit.browser?: Partial<BrowserSlice>`
  - actions `updateAvailable(): void`, `reload(): void`; dep `reload?(): void`
  - `watchVersion(deps: VersionWatchDeps): () => void`, `parseVersion`, `versionDiffers`, `versionPollActive(s: Pick<UiState, 'menu' | 'online'>): boolean`, `VERSION_POLL_MS = 300000`

- [ ] **Step 1: Add the slice.** In `src/renderer/src/ui/menuState.ts`, after the `LayoutSlice` interface add:

```ts
/** Browser-only menu facts (web build spec §5.4, §7.4, §7.5, §7.7); all off in Electron. `unsupported` replaces Home's
 *  Multiplayer button, `note` is the Safari line, `onlineBlocked` the Multiplayer screen's one-tab text, `playtestLog`
 *  shows Settings' Download playtest log and `playtestLogText` its last result. `web`: the page runs in a browser (no
 *  preload), where F11 is the browser's own fullscreen (review R1-F7). */
export interface BrowserSlice { web: boolean; update: boolean; unsupported: string | null; note: string | null; onlineBlocked: string | null; playtestLog: boolean; playtestLogText: string }
export const INITIAL_BROWSER: BrowserSlice = { web: false, update: false, unsupported: null, note: null, onlineBlocked: null, playtestLog: false, playtestLogText: '' };
export const NO_PLAYTEST_RECORDS_TEXT = 'No playtest records yet.', PLAYTEST_LOG_FAILED_TEXT = 'The playtest log could not be read.';
/** Settings' fullscreen note in a browser (R1-F7): F11 there is the browser's fullscreen, which the toggle cannot see. */
export const BROWSER_F11_TEXT = "F11 is the browser's own fullscreen; this switch does not follow it.";
```

and in `UiState` change `menu: MenuState; online: OnlineSlice; settings: SettingsSlice; layout: LayoutSlice;` to `menu: MenuState; online: OnlineSlice; settings: SettingsSlice; layout: LayoutSlice; browser: BrowserSlice;`.

- [ ] **Step 2: The store.** In `src/renderer/src/ui/store.ts`: change the import to `import { INITIAL_BROWSER, INITIAL_MENU, type BrowserSlice, type LayoutSlice, type ShipChoice, type UiState } from './menuState';`; in `UiStoreInit` add the line `  browser?: Partial<BrowserSlice>;` after `onlineAvailable: boolean;`; and in `createUiStore` after `layout: { stripHeight: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1 },` add `    browser: { ...INITIAL_BROWSER, ...init.browser },`.

- [ ] **Step 3: The actions.** In `src/renderer/src/ui/actions.ts` `UiActionDeps`, after the `quit?(): void;` line add:

```ts
  /** Web build spec §5.4: the update banner's reload (location.reload in the page). */
  reload?(): void;
```

and in the returned object, after `quit(): void { deps.quit?.(); },` add:

```ts
    /** Web build spec §5.4: version.json names another build (the version watch); shown by the menu outside a match. */
    updateAvailable(): void { if (!store.getState().browser.update) store.setState((s) => ({ browser: { ...s.browser, update: true } })); },
    reload(): void { deps.reload?.(); },
```

- [ ] **Step 4: The banner.** In `src/renderer/src/ui/menu/Menu.tsx`, in `Menu()` change the first line to `const menu = useUi((s) => s.menu), online = useUi((s) => s.online), update = useUi((s) => s.browser.update), actions = useActions();`, and replace `        {!playing && <><h1>FTLite</h1><p>Crew together. Keep the ship flying.</p></>}` with:

```tsx
        {update && !playing && <p data-testid="update-banner" role="status">New version: <button type="button" data-testid="reload" style={BUTTON} onClick={actions.reload}>reload</button></p>}
        {!playing && <><h1>FTLite</h1><p>Crew together. Keep the ship flying.</p></>}
```

(The `single` page returns early above, so the banner never shows during a match.)

- [ ] **Step 5: Write the failing tests.** `tests/webVersionWatch.test.ts`:

```ts
// The update check (web build spec §5.4): version.json at start and every 5 minutes on the menu or in a lobby; a
// different build calls onUpdate once and stops; failures and malformed answers are ignored.
import { describe, expect, it, vi } from 'vitest';
import { parseVersion, versionDiffers, versionPollActive, VERSION_POLL_MS, watchVersion, type BuildVersion } from '../src/renderer/src/app/web/versionWatch';
import { INITIAL_MENU } from '../src/renderer/src/ui/menuState';
import { idle } from './helpers/uiStore';

const local: BuildVersion = { build: { version: '0.0.1', rev: 'abc1234', sim: 53 }, sim: 53, digest: 'a'.repeat(64) };
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function harness(answers: unknown[], active = () => true) {
  let tick: (() => void) | undefined; const clearInterval = vi.fn(), onUpdate = vi.fn();
  const fetch = vi.fn(async () => { const a = answers.shift(); if (a instanceof Error) throw a; return { ok: a !== 'not-ok', json: async () => a }; });
  const stop = watchVersion({ fetch, local, active, onUpdate, setInterval: (cb, ms) => { expect(ms).toBe(VERSION_POLL_MS); tick = cb; return 7; }, clearInterval });
  return { fetch, onUpdate, clearInterval, stop, tick: async () => { tick!(); await flush(); } };
}
describe('watchVersion', () => {
  it('fetches at start with no-store, then every 5 minutes while active', async () => {
    let on = true; const h = harness([local, local, local], () => on); await flush();
    expect(h.fetch).toHaveBeenCalledWith('./version.json', { cache: 'no-store', credentials: 'same-origin' });
    await h.tick(); expect(h.fetch).toHaveBeenCalledTimes(2);
    on = false; await h.tick(); expect(h.fetch).toHaveBeenCalledTimes(2);   // in a match: no poll
    on = true; await h.tick(); expect(h.fetch).toHaveBeenCalledTimes(3); expect(h.onUpdate).not.toHaveBeenCalled();
  });
  it('calls onUpdate once for another build and stops polling', async () => {
    const h = harness([local, { ...local, digest: 'b'.repeat(64) }, local]); await flush(); await h.tick();
    expect(h.onUpdate).toHaveBeenCalledOnce(); expect(h.clearInterval).toHaveBeenCalledWith(7);
  });
  it('ignores errors, non-OK answers and malformed JSON', async () => {
    const h = harness([Error('offline'), 'not-ok', { build: 'x' }, '<html>']); await flush(); await h.tick(); await h.tick(); await h.tick();
    expect(h.onUpdate).not.toHaveBeenCalled(); h.stop(); expect(h.clearInterval).toHaveBeenCalledOnce();
  });
});
describe('parseVersion, versionDiffers and versionPollActive', () => {
  it('accepts exactly { build, sim, digest } and compares every field', () => {
    expect(parseVersion(local)).toEqual(local);
    for (const bad of [null, {}, { ...local, extra: 1 }, { ...local, digest: 'x' }, { ...local, build: { version: '1', rev: 'r' } }, { ...local, sim: '53' }]) expect(parseVersion(bad)).toBeNull();
    expect(versionDiffers(local, local)).toBe(false);
    for (const other of [{ ...local, sim: 54 }, { ...local, digest: 'c'.repeat(64) }, { ...local, build: { ...local.build, rev: 'def5678' } }, { ...local, build: { ...local.build, version: '0.0.2' } }])
      expect(versionDiffers(other, local)).toBe(true);
  });
  it('is active on the menu and in a lobby, never in a match', () => {
    const lobby = { ...idle, phase: 'lobby' as const }, running = { ...idle, phase: 'running' as const };
    const at = (menu: Partial<typeof INITIAL_MENU>, status: typeof idle | null = null) => ({ menu: { ...INITIAL_MENU, ...menu }, online: { available: true, status, receivedAt: 0 } });
    expect(versionPollActive(at({}))).toBe(true);
    expect(versionPollActive(at({ page: 'session', hadView: false }, lobby))).toBe(true);
    expect(versionPollActive(at({ page: 'session', hadView: true }, lobby))).toBe(true);
    expect(versionPollActive(at({ page: 'session', hadView: true }, running))).toBe(false);
    expect(versionPollActive(at({ page: 'single' }))).toBe(false);
  });
});
```

`tests/webBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
// The update banner (web build spec §5.4): "New version: reload" with a reload button, never during a match.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { idle } from './helpers/uiStore';
import { renderUi } from './helpers/uiRender';

afterEach(() => { cleanup(); });
describe('the update banner', () => {
  it('reads New version: reload and reloads', () => {
    const reload = vi.fn(), { actions } = renderUi({ deps: { reload } });
    expect(screen.queryByTestId('update-banner')).toBeNull();
    act(() => actions.updateAvailable());
    expect(screen.getByTestId('update-banner').textContent).toBe('New version: reload');
    fireEvent.click(screen.getByTestId('reload')); expect(reload).toHaveBeenCalledOnce();
  });
  it('never shows during a match', () => {
    const { actions } = renderUi(); act(() => actions.updateAvailable());
    act(() => actions.setStatus({ ...idle, phase: 'running', role: 'host', attachmentEpoch: 1, actions: ['leave'] }));
    expect(screen.queryByTestId('update-banner')).toBeNull();
    act(() => { actions.openShips(); actions.single('hound'); }); expect(screen.queryByTestId('update-banner')).toBeNull();
  });
});
```

- [ ] **Step 6: Run them to see them fail.** Run: `npx vitest run tests/webVersionWatch.test.ts tests/webBanner.test.tsx` — Expected: FAIL, `Cannot find module '../src/renderer/src/app/web/versionWatch'` (the banner test may already pass after Steps 1-4; that is fine).

- [ ] **Step 7: Write `src/renderer/src/app/web/versionWatch.ts`:**

```ts
// The update check (web build spec §5.4, deviation W-9): version.json at start and every 5 minutes while the menu or a
// lobby shows; a different build raises the "New version: reload" banner once. Browser only (main.ts).
import { isPlaying, type UiState } from '../../ui/menuState';

export interface BuildVersion { build: { version: string; rev: string; sim: number }; sim: number; digest: string }
export const VERSION_POLL_MS = 300000;
export interface VersionWatchDeps {
  fetch(url: string, init: { cache: 'no-store'; credentials: 'same-origin' }): Promise<{ ok: boolean; json(): Promise<unknown> }>;
  local: BuildVersion; active(): boolean; onUpdate(): void;
  setInterval(cb: () => void, ms: number): unknown; clearInterval(handle: unknown): void;
}
export function parseVersion(value: unknown): BuildVersion | null {
  const v = value as BuildVersion | null;
  if (!v || typeof v !== 'object' || Object.keys(v).sort().join() !== 'build,digest,sim' || !Number.isSafeInteger(v.sim)
    || typeof v.digest !== 'string' || !/^[0-9a-f]{64}$/.test(v.digest) || !v.build || typeof v.build !== 'object'
    || Object.keys(v.build).sort().join() !== 'rev,sim,version' || typeof v.build.version !== 'string' || typeof v.build.rev !== 'string' || !Number.isSafeInteger(v.build.sim)) return null;
  return { build: { version: v.build.version, rev: v.build.rev, sim: v.build.sim }, sim: v.sim, digest: v.digest };
}
export function versionDiffers(remote: BuildVersion, local: BuildVersion): boolean {
  return remote.digest !== local.digest || remote.sim !== local.sim || remote.build.version !== local.build.version || remote.build.rev !== local.build.rev || remote.build.sim !== local.build.sim;
}
/** On the menu or in a lobby (spec §5.4); never in a match (W-4: Single player is one). */
export function versionPollActive(s: Pick<UiState, 'menu' | 'online'>): boolean {
  return s.menu.page !== 'single' && (!isPlaying(s.menu) || s.online.status?.phase === 'lobby');
}
export function watchVersion(deps: VersionWatchDeps): () => void {
  let stopped = false, busy = false;
  const stop = (): void => { if (!stopped) { stopped = true; deps.clearInterval(handle); } };
  const check = async (): Promise<void> => {
    if (stopped || busy || !deps.active()) return;
    busy = true;
    try {
      const response = await deps.fetch('./version.json', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const remote = parseVersion(await response.json());
      if (!stopped && remote && versionDiffers(remote, deps.local)) { stop(); deps.onUpdate(); }
    } catch { /* offline, signed out (the passcode page is not JSON) or mid-deploy: try again next time */ }
    finally { busy = false; }
  };
  const handle = deps.setInterval(() => { void check(); }, VERSION_POLL_MS);
  void check();
  return stop;
}
```

- [ ] **Step 8: Wire it in the page.** In `src/renderer/src/main.ts` add the import `import { versionPollActive, watchVersion } from './app/web/versionWatch';` after the `watchHostVisibility` import. In the `createUiActions({ … })` call, insert before `    quit() { window.close(); }`:

```ts
    reload() { location.reload(); },   // web build spec §5.4: the update banner
```

and after the line `  const offStatus = bridge?.onStatus(next => { status = next; online?.setStatus(next); actions.setStatus(next); });` add:

```ts
  // Web build spec §5.4: version.json at start and every 5 minutes on the menu or in a lobby (the browser only).
  const offVersion = window.ftlite ? undefined : watchVersion({ fetch: (url, init) => fetch(url, init),
    local: { build: __FTLITE_BUILD__, sim: __FTLITE_BUILD__.sim, digest: __GAMEPLAY_CONTENT_DIGEST__ },
    active: () => versionPollActive(store.getState()), onUpdate: () => actions.updateAvailable(),
    setInterval: (cb, ms) => window.setInterval(cb, ms), clearInterval: handle => window.clearInterval(handle as number) });
```

(`offVersion` joins the teardown in Task 10.)

- [ ] **Step 9: Browser-only app code joins the page boundary.** In `tests/pageBoundary.test.ts` change `PAGE_ROOTS` to end with `'src/renderer/src/app/online', 'src/renderer/src/app/web'];`.

- [ ] **Step 10: Run the tests.** Run: `npx vitest run tests/webVersionWatch.test.ts tests/webBanner.test.tsx tests/menu.test.tsx tests/uiActions.test.ts tests/pageBoundary.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 11: Commit.**

```bash
git add src/renderer/src/app/web/versionWatch.ts src/renderer/src/ui/menuState.ts src/renderer/src/ui/store.ts src/renderer/src/ui/actions.ts src/renderer/src/ui/menu/Menu.tsx src/renderer/src/main.ts tests/pageBoundary.test.ts tests/webVersionWatch.test.ts tests/webBanner.test.tsx
git commit -m "feat(web-ii): version.json polling on the menu and in a lobby, New version: reload banner never during a match

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Keys and mouse over the stage (spec §7.1)

**Files:**
- Create: `src/renderer/src/app/web/pageGuards.ts`
- Modify: `src/renderer/index.html` (touch-action)
- Modify: `src/renderer/src/main.ts`
- Test: `tests/webPageGuards.test.ts`

**Interfaces:**
- Consumes: `PRESS_CODES`, `FREQ_CODES`, `WEAPON_CODES`, `MOVE_CODES`, `INTERACT_HELD`, `PING_CODE` (`app/duel/input.ts`); `SECTOR_KEYS` (`input/sources.ts`); `isPlaying`, `MenuState` (`ui/menuState.ts`).
- Produces: `GUARDED_CODES: ReadonlySet<string>`, `inMatch(menu: MenuState): boolean` (used by Tasks 7 and 10), `installPageGuards(target: GuardTarget, playing: () => boolean): () => void`.

- [ ] **Step 1: Write the failing test** `tests/webPageGuards.test.ts`:

```ts
// Keys and mouse in the page (web build spec §7.1, W-4): during a match the browser's own handling of Tab, Space,
// arrows, PageUp/PageDown, Home/End, Backspace and the game's bound keys is stopped; F11, modified shortcuts and text
// fields are left alone; the context menu and Ctrl+wheel (pinch) zoom are off; the plain wheel is untouched.
import { describe, expect, it, vi } from 'vitest';
import { GUARDED_CODES, inMatch, installPageGuards } from '../src/renderer/src/app/web/pageGuards';
import { INITIAL_MENU } from '../src/renderer/src/ui/menuState';

function target() {
  const listeners = new Map<string, { fn: (e: any) => void; opts: unknown }>();
  return { listeners, addEventListener: (type: string, fn: (e: any) => void, opts?: unknown) => listeners.set(type, { fn, opts }),
    removeEventListener: (type: string) => listeners.delete(type), fire: (type: string, e: object) => { const ev = { preventDefault: vi.fn(), ...e }; listeners.get(type)!.fn(ev); return ev.preventDefault; } };
}
const input = { closest: (s: string) => (s.includes('input') ? {} : null) };
describe('installPageGuards', () => {
  it('stops the browser default for scrolling, focus, navigation and bound keys during a match only', () => {
    let playing = true; const t = target(); installPageGuards(t, () => playing);
    for (const code of ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace', 'KeyW', 'KeyE', 'Escape', 'Digit1', 'F3', 'Slash', 'Enter'])
      expect(t.fire('keydown', { code })).toHaveBeenCalledOnce();
    playing = false; expect(t.fire('keydown', { code: 'Space' })).not.toHaveBeenCalled();
  });
  it('leaves F11, unbound keys, modified shortcuts and text fields to the browser', () => {
    const t = target(); installPageGuards(t, () => true);
    expect(GUARDED_CODES.has('F11')).toBe(false);
    for (const e of [{ code: 'F11' }, { code: 'F5' }, { code: 'KeyW', ctrlKey: true }, { code: 'Tab', altKey: true }, { code: 'KeyR', metaKey: true }, { code: 'Backspace', target: input }])
      expect(t.fire('keydown', e)).not.toHaveBeenCalled();
  });
  it('turns off the context menu (but not in a text field) and Ctrl+wheel zoom, not the plain wheel', () => {
    const t = target(); const off = installPageGuards(t, () => false);
    expect(t.fire('contextmenu', { target: null })).toHaveBeenCalledOnce(); expect(t.fire('contextmenu', { target: input })).not.toHaveBeenCalled();
    expect(t.fire('wheel', { ctrlKey: true })).toHaveBeenCalledOnce(); expect(t.fire('wheel', { ctrlKey: false })).not.toHaveBeenCalled();
    expect(t.listeners.get('wheel')!.opts).toEqual({ passive: false, capture: true });
    off(); expect(t.listeners.size).toBe(0);
  });
  it('a match is Single player or a viewed online session', () => {
    expect(inMatch({ ...INITIAL_MENU, page: 'single' })).toBe(true);
    expect(inMatch({ ...INITIAL_MENU, page: 'session', hadView: true })).toBe(true);
    expect(inMatch({ ...INITIAL_MENU, page: 'session', hadView: false })).toBe(false);
    expect(inMatch(INITIAL_MENU)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail.** Run: `npx vitest run tests/webPageGuards.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/renderer/src/app/web/pageGuards.ts`:**

```ts
// Keys and mouse in the page (web build spec §7.1, deviation W-4). The duel keyboard already prevents Tab, Space, the
// arrows and Backspace on its own keys; this guard covers the rest of the page during a match. F11 is the browser's;
// browser-reserved shortcuts (Ctrl+W, Ctrl+T) cannot be caught, and modified keys are left alone.
import { FREQ_CODES, INTERACT_HELD, MOVE_CODES, PING_CODE, PRESS_CODES, WEAPON_CODES } from '../duel/input';
import { SECTOR_KEYS } from '../../input/sources';
import { isPlaying, type MenuState } from '../../ui/menuState';

const SCROLL_AND_FOCUS = ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace'];
/** F3 is the latency overlay (render/duel/latencyOverlay.ts); Slash and Y are the sector's other callout keys (hudModel). */
const OTHER_BOUND = ['F3', 'Slash', 'KeyY'];
export const GUARDED_CODES: ReadonlySet<string> = new Set([...SCROLL_AND_FOCUS, ...Object.keys(PRESS_CODES), ...Object.keys(FREQ_CODES), ...Object.keys(WEAPON_CODES),
  ...Object.values(MOVE_CODES), INTERACT_HELD, PING_CODE, ...OTHER_BOUND, ...Object.entries(SECTOR_KEYS).filter(([k]) => k !== 'key').map(([, code]) => code)].filter(code => code !== 'F11'));

/** A match: Single player, or an online session that has shown its game (the menu is then the strip). */
export function inMatch(menu: MenuState): boolean { return menu.page === 'single' || isPlaying(menu); }

export interface GuardTarget {
  addEventListener(type: string, fn: (e: any) => void, opts?: AddEventListenerOptions): void;
  removeEventListener(type: string, fn: (e: any) => void, opts?: EventListenerOptions): void;
}
const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';
const textEntry = (target: unknown): boolean => !!(target as { closest?(selector: string): unknown } | null)?.closest?.(TEXT_ENTRY);

export function installPageGuards(target: GuardTarget, playing: () => boolean): () => void {
  const key = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || !GUARDED_CODES.has(e.code) || textEntry(e.target) || !playing()) return;
    e.preventDefault();
  };
  const menu = (e: MouseEvent): void => { if (!textEntry(e.target)) e.preventDefault(); };
  const wheel = (e: WheelEvent): void => { if (e.ctrlKey) e.preventDefault(); };   // Ctrl+wheel and touchpad pinch zoom the page
  const wheelOpts = { passive: false, capture: true };
  target.addEventListener('keydown', key); target.addEventListener('contextmenu', menu, { capture: true }); target.addEventListener('wheel', wheel, wheelOpts);
  return () => { target.removeEventListener('keydown', key); target.removeEventListener('contextmenu', menu, { capture: true }); target.removeEventListener('wheel', wheel, { capture: true }); };
}
```

- [ ] **Step 4: Touch pinch off.** In `src/renderer/index.html` change `html,body{margin:0;padding:0;background:#000;overflow:hidden}` to `html,body{margin:0;padding:0;background:#000;overflow:hidden;touch-action:none}`.

- [ ] **Step 5: Install it.** In `src/renderer/src/main.ts` add `import { inMatch, installPageGuards } from './app/web/pageGuards';` after the versionWatch import, and after the line `  bootCrt(renderer, store);` inside `startApp` add:

```ts
  const offGuards = installPageGuards(window, () => inMatch(store.getState().menu));   // web build spec §7.1 (harmless in Electron)
```

- [ ] **Step 6: Run and commit.**

```bash
npx vitest run tests/webPageGuards.test.ts tests/pageBoundary.test.ts && npm run typecheck
git add src/renderer/src/app/web/pageGuards.ts src/renderer/index.html src/renderer/src/main.ts tests/webPageGuards.test.ts
git commit -m "feat(web-ii): page key guard during a match, no context menu, no Ctrl+wheel or pinch zoom over the stage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Fullscreen in the browser: the Fullscreen API, keyboard lock and the Escape rule (spec §7.2)

**Files:**
- Create: `src/renderer/src/app/web/browserFullscreen.ts`
- Modify: `src/renderer/src/main.ts`
- Test: `tests/webFullscreen.test.ts`

**Interfaces:**
- Consumes: `inMatch` (Task 6); actions `windowResized()` (existing).
- Produces: `createBrowserFullscreen(deps: BrowserFullscreenDeps): BrowserFullscreen` with `{ available: boolean; get(): Promise<boolean>; set(on: boolean): Promise<boolean>; dispose(): void }`; `ESCAPE_DEDUPE_MS = 100`, `PAGE_EXIT_WINDOW_MS = 1000`.

- [ ] **Step 1: Write the failing test** `tests/webFullscreen.test.ts`:

```ts
// Browser fullscreen (web build spec §7.2): the Settings toggle uses the Fullscreen API and then tries
// navigator.keyboard.lock(['Escape']). With the lock, Esc reaches the game and the browser's exit is not a press. Without
// it, a user exit (Esc) counts as one Escape press only when the page did not start the exit, a match is running and no
// Escape keydown reached the game in the last 100 ms.
import { describe, expect, it, vi } from 'vitest';
import { createBrowserFullscreen } from '../src/renderer/src/app/web/browserFullscreen';

function harness(o: { lock?: 'resolve' | 'reject' | 'missing'; running?: boolean } = {}) {
  let element: object | null = null, now = 1000, running = o.running ?? true, change: (() => void) | undefined, keydown: ((e: { code: string }) => void) | undefined;
  const doc = { fullscreenEnabled: true, get fullscreenElement() { return element; },
    documentElement: { requestFullscreen: vi.fn(async () => { element = {}; change?.(); }) },
    exitFullscreen: vi.fn(async () => { element = null; }),   // the change event arrives after the promise, as a browser may order it
    addEventListener: (_: string, fn: () => void) => { change = fn; }, removeEventListener: vi.fn() };
  const keyboard = o.lock === 'missing' ? undefined : { lock: vi.fn(o.lock === 'reject' ? async () => { throw Error('not allowed'); } : async () => {}), unlock: vi.fn() };
  const win = { addEventListener: (_: string, fn: (e: { code: string }) => void) => { keydown = fn; }, removeEventListener: vi.fn(), dispatchEscape: vi.fn() };
  const onChange = vi.fn();
  const fs = createBrowserFullscreen({ document: doc, keyboard, window: win, matchRunning: () => running, now: () => now, onChange });
  return { fs, doc, keyboard, win, onChange, userExit: () => { element = null; change!(); }, fireChange: () => change!(), escape: () => keydown!({ code: 'Escape' }),
    advance: (ms: number) => { now += ms; }, setRunning: (v: boolean) => { running = v; } };
}
describe('createBrowserFullscreen', () => {
  it('enters with the Fullscreen API and locks Escape; a user exit under the lock is not a press', async () => {
    const h = harness({ lock: 'resolve' });
    expect(await h.fs.set(true)).toBe(true); expect(h.doc.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    expect(h.keyboard!.lock).toHaveBeenCalledWith(['Escape']); expect(await h.fs.get()).toBe(true);
    h.advance(500); h.userExit(); expect(h.win.dispatchEscape).not.toHaveBeenCalled(); expect(h.keyboard!.unlock).toHaveBeenCalled();
  });
  for (const lock of ['missing', 'reject'] as const) it(`without the lock (${lock}) a user exit during a match is one Escape press`, async () => {
    const h = harness({ lock }); await h.fs.set(true); h.advance(2000); h.userExit();
    expect(h.win.dispatchEscape).toHaveBeenCalledOnce(); expect(await h.fs.get()).toBe(false);
  });
  it('never counts the page’s own exit, even when the change event comes after exitFullscreen resolves', async () => {
    const h = harness({ lock: 'missing' }); await h.fs.set(true); h.advance(2000);
    expect(await h.fs.set(false)).toBe(false); h.advance(50); h.fireChange();
    expect(h.doc.exitFullscreen).toHaveBeenCalledOnce(); expect(h.win.dispatchEscape).not.toHaveBeenCalled();
  });
  it('counts nothing outside a match, or when an Escape keydown reached the game within 100 ms', async () => {
    const a = harness({ lock: 'missing', running: false }); await a.fs.set(true); a.advance(2000); a.userExit(); expect(a.win.dispatchEscape).not.toHaveBeenCalled();
    const b = harness({ lock: 'missing' }); await b.fs.set(true); b.advance(2000); b.escape(); b.advance(100); b.userExit(); expect(b.win.dispatchEscape).not.toHaveBeenCalled();
    const c = harness({ lock: 'missing' }); await c.fs.set(true); c.advance(2000); c.escape(); c.advance(150); c.userExit(); expect(c.win.dispatchEscape).toHaveBeenCalledOnce();
  });
  it('reports availability and changes, and disposes its listeners', async () => {
    const h = harness(); expect(h.fs.available).toBe(true); await h.fs.set(true); expect(h.onChange).toHaveBeenCalled();
    h.fs.dispose(); expect(h.doc.removeEventListener).toHaveBeenCalled(); expect(h.win.removeEventListener).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail.** Run: `npx vitest run tests/webFullscreen.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/renderer/src/app/web/browserFullscreen.ts`:**

```ts
// Fullscreen in the browser (web build spec §7.2): window.ftlite.window is absent, so the Settings toggle uses the
// Fullscreen API. The path is chosen by whether navigator.keyboard.lock(['Escape']) resolves, not by browser name. With
// the lock (Chrome, Edge) Esc reaches the game and holding Esc leaves fullscreen (the browser's rule). Without it
// (Firefox, or a failed lock) Esc leaves fullscreen first, and that exit is one Escape press if the page did not start it,
// a match is running and no Escape keydown reached the game in the last 100 ms.
export const ESCAPE_DEDUPE_MS = 100;
/** The page's own exitFullscreen: its fullscreenchange may arrive after the promise resolves; this long counts it as ours. */
export const PAGE_EXIT_WINDOW_MS = 1000;
export interface FullscreenDocument {
  readonly fullscreenEnabled: boolean; readonly fullscreenElement: unknown;
  documentElement: { requestFullscreen(): Promise<void> }; exitFullscreen(): Promise<void>;
  addEventListener(type: 'fullscreenchange', fn: () => void): void; removeEventListener(type: 'fullscreenchange', fn: () => void): void;
}
export interface KeyboardLockApi { lock?(codes: string[]): Promise<void>; unlock?(): void }
export interface FullscreenWindow {
  addEventListener(type: 'keydown', fn: (e: { code: string }) => void, capture: boolean): void;
  removeEventListener(type: 'keydown', fn: (e: { code: string }) => void, capture: boolean): void;
  /** One Escape press for the game: keydown then keyup. */
  dispatchEscape(): void;
}
export interface BrowserFullscreenDeps { document: FullscreenDocument; keyboard: KeyboardLockApi | undefined; window: FullscreenWindow; matchRunning(): boolean; now(): number; onChange?(): void }
export interface BrowserFullscreen { readonly available: boolean; get(): Promise<boolean>; set(on: boolean): Promise<boolean>; dispose(): void }

export function createBrowserFullscreen(deps: BrowserFullscreenDeps): BrowserFullscreen {
  const doc = deps.document;
  let locked = false, pageExitAt = -Infinity, lastEscapeAt = -Infinity;
  const isOn = (): boolean => doc.fullscreenElement !== null && doc.fullscreenElement !== undefined;
  const keydown = (e: { code: string }): void => { if (e.code === 'Escape') lastEscapeAt = deps.now(); };
  const change = (): void => {
    if (!isOn()) {
      const wasLocked = locked, own = deps.now() - pageExitAt <= PAGE_EXIT_WINDOW_MS;
      locked = false; pageExitAt = -Infinity;
      try { deps.keyboard?.unlock?.(); } catch { /* nothing locked */ }
      if (!wasLocked && !own && deps.matchRunning() && deps.now() - lastEscapeAt > ESCAPE_DEDUPE_MS) deps.window.dispatchEscape();
    }
    deps.onChange?.();
  };
  deps.window.addEventListener('keydown', keydown, true);
  doc.addEventListener('fullscreenchange', change);
  return {
    available: doc.fullscreenEnabled,
    async get() { return isOn(); },
    async set(on) {
      if (on && !isOn()) {
        await doc.documentElement.requestFullscreen();
        try { if (!deps.keyboard?.lock) throw Error('no-keyboard-lock'); await deps.keyboard.lock(['Escape']); locked = isOn(); } catch { locked = false; }
      } else if (!on && isOn()) {
        pageExitAt = deps.now();
        try { await doc.exitFullscreen(); } catch { pageExitAt = -Infinity; }
      }
      return isOn();
    },
    dispose() { deps.window.removeEventListener('keydown', keydown, true); doc.removeEventListener('fullscreenchange', change); }
  };
}
```

- [ ] **Step 4: Wire it in the page.** In `src/renderer/src/main.ts` add `import { createBrowserFullscreen, type KeyboardLockApi } from './app/web/browserFullscreen';` after the pageGuards import. Replace:

```ts
  const win = window.ftlite?.window;
  const store = createUiStore({ onlineAvailable: !!bridge, settings: { master: settings.master, music: settings.music, effects: settings.effects, shake: settings.shake, fullscreenAvailable: !!win, controls: controlSections(),
```

with:

```ts
  const win = window.ftlite?.window;
  // Web build spec §7.2: no preload window API in the browser, so the Fullscreen API with the keyboard-lock rule.
  const pageFullscreen = window.ftlite ? null : createBrowserFullscreen({ document,
    keyboard: (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard,
    window: { addEventListener: (type, fn, capture) => window.addEventListener(type, fn as (e: KeyboardEvent) => void, capture),
      removeEventListener: (type, fn, capture) => window.removeEventListener(type, fn as (e: KeyboardEvent) => void, capture),
      dispatchEscape: () => { for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code: 'Escape', key: 'Escape', bubbles: true })); } },
    matchRunning: () => inMatch(store.getState().menu), now: () => performance.now(), onChange: () => actions.windowResized() });
  const store = createUiStore({ onlineAvailable: !!bridge, settings: { master: settings.master, music: settings.music, effects: settings.effects, shake: settings.shake, fullscreenAvailable: !!win || !!pageFullscreen?.available, controls: controlSections(),
```

and replace `    fullscreen: win ? { get: () => win.isFullScreen(), set: (on) => win.setFullScreen(on) } : undefined,` with:

```ts
    fullscreen: win ? { get: () => win.isFullScreen(), set: (on) => win.setFullScreen(on) }
      : pageFullscreen ? { get: () => pageFullscreen.get(), set: (on) => pageFullscreen.set(on) } : undefined,
```

(`store` and `actions` are read only inside callbacks that run after both exist. `pageFullscreen.dispose()` joins the teardown in Task 10.)

- [ ] **Step 5: Run and commit.**

```bash
npx vitest run tests/webFullscreen.test.ts tests/uiActions.test.ts && npm run typecheck
git add src/renderer/src/app/web/browserFullscreen.ts src/renderer/src/main.ts tests/webFullscreen.test.ts
git commit -m "feat(web-ii): browser fullscreen through the Fullscreen API with the keyboard-lock-or-fallback Escape rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Browser start-up: support check, Safari note, one online tab, storage persistence, audio unlock (spec §7.3, §7.4, §7.5, §7.7)

**Files:**
- Create: `src/renderer/src/app/web/browserSupport.ts`
- Create: `src/renderer/src/app/web/onlineLock.ts`
- Create: `src/renderer/src/app/audioUnlock.ts`
- Modify: `src/renderer/src/app/online/pageSession.ts` (`persistStorage`)
- Modify: `src/renderer/src/ui/menu/Home.tsx`, `Multiplayer.tsx`, `Menu.tsx`
- Modify: `src/renderer/src/main.ts`
- Test: `tests/webStartup.test.ts`, `tests/webStartupUi.test.tsx`

**Interfaces:**
- Consumes: `BrowserSlice`/`UiStoreInit.browser` (Task 5); `createPageOnline`, `PageOnlineDeps` (Web-i).
- Produces:
  - `UNSUPPORTED_TEXT`, `SAFARI_NOTE`, `ONE_TAB_TEXT`; `checkBrowserSupport(g: SupportGlobals): { ok: boolean; missing: string[]; safari: boolean }`; `isSafari(ua: string, vendor: string): boolean`
  - `ONLINE_LOCK_NAME = 'ftlite-online'`; `type OnlineLock = { state: 'held'; release(): void } | { state: 'busy' } | { state: 'unavailable' }`; `acquireOnlineLock(locks: Pick<LockManager, 'request'> | undefined, o?: { timeoutMs?: number; retryMs?: number }): Promise<OnlineLock>` (2 s start-up limit, one 1.5 s waiting retry when busy; review R1-F2); `LOCK_START_TIMEOUT_MS = 2000`, `LOCK_RETRY_MS = 1500`; `lock` (the page's `OnlineLock`, released by Task 10's teardown)
  - `installAudioUnlock(target, audio: { unlock(): void }): () => void`
  - `PageOnlineDeps.persistStorage?(): Promise<unknown> | void` (asked once, on the first host/join/reconnect/rehost)
  - in `main.ts`: `const web = !window.ftlite;` (used by Tasks 9 and 10)

- [ ] **Step 1: Write the failing tests.** `tests/webStartup.test.ts`:

```ts
// Browser start-up (web build spec §7.3, §7.4, §7.5, §7.7): the API checks and Safari, the ftlite-online Web Lock,
// navigator.storage.persist() on the first online use (a refusal is not an error), and the first-gesture audio unlock.
import { describe, expect, it, vi } from 'vitest';
import { checkBrowserSupport, isSafari, ONE_TAB_TEXT, SAFARI_NOTE, UNSUPPORTED_TEXT } from '../src/renderer/src/app/web/browserSupport';
import { acquireOnlineLock, ONLINE_LOCK_NAME } from '../src/renderer/src/app/web/onlineLock';
import { installAudioUnlock } from '../src/renderer/src/app/audioUnlock';
import { createPageOnline } from '../src/renderer/src/app/online/pageSession';
import { createMemoryRecordStore } from '../src/network/online/recordStore';
import type { OnlineSessionOwner } from '../src/network/online/onlineSession';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const full = () => ({ RTCPeerConnection: function () {}, Worker: function () {}, indexedDB: {}, crypto: { subtle: {}, getRandomValues: () => {} }, MessageChannel: function () {},
  navigator: { locks: {}, userAgent: CHROME, vendor: 'Google Inc.' } });

describe('checkBrowserSupport', () => {
  it('needs every API, and names the missing ones', () => {
    expect(checkBrowserSupport(full())).toEqual({ ok: true, missing: [], safari: false });
    const g = full() as any; delete g.RTCPeerConnection; g.navigator.locks = undefined; g.crypto.subtle = undefined;
    expect(checkBrowserSupport(g)).toEqual({ ok: false, missing: ['RTCPeerConnection', 'crypto.subtle', 'navigator.locks'], safari: false });
  });
  it('knows Safari, and only Safari', () => {
    expect(isSafari(SAFARI, 'Apple Computer, Inc.')).toBe(true);
    expect(isSafari(CHROME, 'Google Inc.')).toBe(false); expect(isSafari(FIREFOX, '')).toBe(false);
    expect(isSafari(SAFARI.replace('Version/18.0', 'CriOS/140.0'), 'Apple Computer, Inc.')).toBe(false);
  });
  it('carries the spec texts', () => {
    expect(UNSUPPORTED_TEXT).toBe('FTLite needs a recent Chrome, Edge or Firefox on a computer.');
    expect(SAFARI_NOTE).toBe('Safari is not tested'); expect(ONE_TAB_TEXT).toBe('FTLite is already open in another tab');
  });
});

describe('acquireOnlineLock', () => {
  it('holds ftlite-online while available, and is unavailable without a working lock manager', async () => {
    let held: Promise<unknown> | undefined;
    const free = { request: vi.fn((name: string, opts: { ifAvailable: boolean }, cb: (lock: object | null) => Promise<unknown> | undefined) => { held = cb({}); return Promise.resolve(); }) };
    const lock = await acquireOnlineLock(free as never);
    expect(free.request.mock.calls[0]!.slice(0, 2)).toEqual([ONLINE_LOCK_NAME, { ifAvailable: true }]); expect(lock.state).toBe('held');
    let released = false; void held!.then(() => { released = true; }); (lock as { release(): void }).release(); await Promise.resolve(); await Promise.resolve();
    expect(released).toBe(true);
    expect(await acquireOnlineLock(undefined)).toEqual({ state: 'unavailable' });
    expect(await acquireOnlineLock({ request: () => Promise.reject(Object.assign(Error('x'), { name: 'SecurityError' })) } as never)).toEqual({ state: 'unavailable' });
    expect(await acquireOnlineLock({ request: () => { throw Error('sync'); } } as never)).toEqual({ state: 'unavailable' });
  });
  it('retries a busy lock once with a waiting, time-limited request (a reload racing its old document)', async () => {
    const calls: object[] = [];
    const later = { request: vi.fn((_n: string, opts: object, cb: (lock: object | null) => unknown) => { calls.push(opts);
      if (calls.length === 1) { cb(null); return Promise.resolve(); } cb({}); return Promise.resolve(); }) };
    expect((await acquireOnlineLock(later as never, { retryMs: 30 })).state).toBe('held');
    expect(calls[0]).toEqual({ ifAvailable: true }); expect((calls[1] as { signal: unknown }).signal).toBeInstanceOf(AbortSignal);
    const still = { request: vi.fn((_n: string, opts: { ifAvailable?: boolean }, cb: (lock: null) => unknown) => {
      if (opts.ifAvailable) { cb(null); return Promise.resolve(); } return Promise.reject(Object.assign(Error('t'), { name: 'TimeoutError' })); }) };
    expect(await acquireOnlineLock(still as never, { retryMs: 30 })).toEqual({ state: 'busy' });
  });
  it('gives up after its start-up limit, and releases a grant that arrives later', async () => {
    let grant: ((lock: object) => Promise<unknown> | undefined) | undefined;
    const stuck = { request: vi.fn((_n: string, _o: object, cb: (lock: object) => Promise<unknown> | undefined) => { grant = cb; return new Promise(() => {}); }) };
    const began = performance.now();
    expect(await acquireOnlineLock(stuck as never, { timeoutMs: 50 })).toEqual({ state: 'unavailable' });
    expect(performance.now() - began).toBeLessThan(1000);
    expect(grant!({})).toBeUndefined();   // returning no promise lets the late lock go at once
  });
});

describe('storage persistence on first online use', () => {
  it('asks once, on the first host/join/reconnect/rehost, and survives a refusal', async () => {
    const persistStorage = vi.fn(async () => { throw Error('refused'); });
    const owner: OnlineSessionOwner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null,
      retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] }) as never,
      subscribe: () => () => {}, suspend: vi.fn(async () => {}), resume: vi.fn(async () => {}), prepareExit: vi.fn(async () => {}), dispose: vi.fn(async () => {}), releaseForUnload: vi.fn() };
    const lifecycle = { onSuspend: () => () => {}, onResume: () => () => {}, dispose: vi.fn() };
    const online = createPageOnline({ serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: false, duelTestSeed: null, testProbe: false },
      { window: new EventTarget() as never, records: createMemoryRecordStore(), lifecycle, fetch: vi.fn() as never, WebSocket: class {} as never, hostPlatform: vi.fn() as never,
        createSession: () => owner, persistStorage });
    await online.ready(true); expect(persistStorage).not.toHaveBeenCalled();
    expect(await online.join('ABCDEFGH')).toEqual({ ok: true }); expect(persistStorage).toHaveBeenCalledOnce();
    await online.host({ mode: 'duel', capacity: 2 }); await online.reconnect(); expect(persistStorage).toHaveBeenCalledOnce();
  });
});

describe('installAudioUnlock', () => {
  it('resumes audio on the first key or pointer event and on every focus', () => {
    const t = new EventTarget(), audio = { unlock: vi.fn() }, off = installAudioUnlock(t as never, audio);
    t.dispatchEvent(new Event('pointerdown')); t.dispatchEvent(new Event('pointerdown')); t.dispatchEvent(new Event('keydown'));
    expect(audio.unlock).toHaveBeenCalledTimes(2);
    t.dispatchEvent(new Event('focus')); t.dispatchEvent(new Event('focus')); expect(audio.unlock).toHaveBeenCalledTimes(4);
    off(); t.dispatchEvent(new Event('focus')); expect(audio.unlock).toHaveBeenCalledTimes(4);
  });
});
```

`tests/webStartupUi.test.tsx`:

```tsx
// @vitest-environment jsdom
// The start-up texts on the menu (web build spec §7.5, §7.7): the unsupported text in place of Multiplayer (Single
// player still runs), the one-tab text on the Multiplayer screen, and the Safari note.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { ONE_TAB_TEXT, SAFARI_NOTE, UNSUPPORTED_TEXT } from '../src/renderer/src/app/web/browserSupport';
import { buttonIds, renderUi } from './helpers/uiRender';

afterEach(() => { cleanup(); });
describe('browser start-up texts', () => {
  it('shows the unsupported text in place of Multiplayer and keeps Single player', () => {
    const { store, view, deps } = renderUi();
    act(() => store.setState((s) => ({ browser: { ...s.browser, unsupported: UNSUPPORTED_TEXT } })));
    expect(buttonIds(view.container)).toEqual(['single-player', 'settings', 'quit']);
    expect(screen.getByTestId('online-unsupported').textContent).toBe(UNSUPPORTED_TEXT);
    fireEvent.click(screen.getByTestId('single-player')); fireEvent.click(screen.getByTestId('ship-hound')); expect(deps.single).toHaveBeenCalledOnce();
  });
  it('shows the one-tab text on the Multiplayer screen', () => {
    const { store } = renderUi({ api: null });
    act(() => store.setState((s) => ({ browser: { ...s.browser, onlineBlocked: ONE_TAB_TEXT } })));
    fireEvent.click(screen.getByTestId('multiplayer'));
    expect(screen.getByTestId('online-availability').textContent).toBe(ONE_TAB_TEXT);
  });
  it('shows the Safari note on the menu', () => {
    const { store } = renderUi(); expect(screen.queryByTestId('browser-note')).toBeNull();
    act(() => store.setState((s) => ({ browser: { ...s.browser, note: SAFARI_NOTE } })));
    expect(screen.getByTestId('browser-note').textContent).toBe(SAFARI_NOTE);
  });
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx vitest run tests/webStartup.test.ts tests/webStartupUi.test.tsx` — Expected: FAIL, modules not found.

- [ ] **Step 3: Write `src/renderer/src/app/web/browserSupport.ts`:**

```ts
// Unsupported browsers (web build spec §7.7): the online stack needs these APIs; without one, Multiplayer is replaced by
// the text below and Single player still runs. Safari passes and gets a one-line note. The texts are the spec's, exact.
export const UNSUPPORTED_TEXT = 'FTLite needs a recent Chrome, Edge or Firefox on a computer.';
export const SAFARI_NOTE = 'Safari is not tested';
export const ONE_TAB_TEXT = 'FTLite is already open in another tab';
export interface SupportGlobals {
  RTCPeerConnection?: unknown; Worker?: unknown; indexedDB?: unknown; MessageChannel?: unknown;
  crypto?: { subtle?: unknown; getRandomValues?: unknown };
  navigator?: { locks?: unknown; userAgent?: string; vendor?: string };
}
export function isSafari(userAgent: string, vendor: string): boolean {
  return /Apple/.test(vendor) && /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|OPR|Firefox|Electron)\//.test(userAgent);
}
export function checkBrowserSupport(g: SupportGlobals): { ok: boolean; missing: string[]; safari: boolean } {
  const checks: [string, boolean][] = [
    ['RTCPeerConnection', typeof g.RTCPeerConnection === 'function'], ['Worker', typeof g.Worker === 'function'],
    ['indexedDB', !!g.indexedDB && typeof g.indexedDB === 'object'], ['crypto.subtle', !!g.crypto?.subtle],
    ['crypto.getRandomValues', typeof g.crypto?.getRandomValues === 'function'], ['MessageChannel', typeof g.MessageChannel === 'function'],
    ['navigator.locks', !!g.navigator?.locks]];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { ok: missing.length === 0, missing, safari: isSafari(g.navigator?.userAgent ?? '', g.navigator?.vendor ?? '') };
}
```

- [ ] **Step 4: Write `src/renderer/src/app/web/onlineLock.ts`:**

```ts
// One online tab (web build spec §7.5, deviation W-5): the online session takes the Web Lock `ftlite-online` for as long
// as it exists (the page's life). A tab that cannot get it shows "FTLite is already open in another tab" on the
// Multiplayer screen; Single player stays available there.
export const ONLINE_LOCK_NAME = 'ftlite-online';
export type OnlineLock = { state: 'held'; release(): void } | { state: 'busy' } | { state: 'unavailable' };
/** Review R1-F2: start-up never waits on the lock longer than this; on timeout online is off and the menu still starts. */
export const LOCK_START_TIMEOUT_MS = 2000;
/** A busy lock is asked once more, waiting this long, so a reloaded tab's old document has time to release it. */
export const LOCK_RETRY_MS = 1500;
type Attempt = 'busy' | 'unavailable' | { release(): void };

export async function acquireOnlineLock(locks: Pick<LockManager, 'request'> | undefined,
  o: { timeoutMs?: number; retryMs?: number } = {}): Promise<OnlineLock> {
  if (!locks) return { state: 'unavailable' };
  let gaveUp = false;
  const attempt = (options: LockOptions): Promise<Attempt> => new Promise(resolve => {
    let release!: () => void;
    const held = new Promise<void>(done => { release = done; });
    try {
      locks.request(ONLINE_LOCK_NAME, options, lock => {
        if (!lock) { resolve('busy'); return undefined; }
        if (gaveUp) { resolve('unavailable'); return undefined; }   // granted after start-up gave up: let it go at once
        resolve({ release }); return held;   // kept until release() (the pagehide teardown) or the page goes away
      }).catch((error: unknown) => { const name = (error as { name?: string } | null)?.name; resolve(name === 'AbortError' || name === 'TimeoutError' ? 'busy' : 'unavailable'); });
    } catch { resolve('unavailable'); }
  });
  const work = (async (): Promise<OnlineLock> => {
    let result = await attempt({ ifAvailable: true });
    if (result === 'busy') result = await attempt({ signal: AbortSignal.timeout(o.retryMs ?? LOCK_RETRY_MS) });
    return result === 'busy' ? { state: 'busy' } : result === 'unavailable' ? { state: 'unavailable' } : { state: 'held', release: result.release };
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<OnlineLock>(resolve => { timer = setTimeout(() => resolve({ state: 'unavailable' }), o.timeoutMs ?? LOCK_START_TIMEOUT_MS); });
  const outcome = await Promise.race([work, timeout]);
  clearTimeout(timer); gaveUp = true;
  if (outcome.state !== 'held') void work.then(late => { if (late.state === 'held') late.release(); });   // a grant that lost the race is released
  return outcome;
}
```

- [ ] **Step 5: Write `src/renderer/src/app/audioUnlock.ts`:**

```ts
// Audio in the browser (web build spec §7.3, deviation W-7): the AudioContext resumes on the first key or pointer event
// (the first menu click) and on every focus; audio.unlock is guarded inside, so repeats are harmless.
export interface UnlockTarget { addEventListener(type: string, fn: () => void, opts?: AddEventListenerOptions): void; removeEventListener(type: string, fn: () => void): void }
export function installAudioUnlock(target: UnlockTarget, audio: { unlock(): void }): () => void {
  const unlock = (): void => audio.unlock();
  target.addEventListener('keydown', unlock, { once: true }); target.addEventListener('pointerdown', unlock, { once: true }); target.addEventListener('focus', unlock);
  return () => { for (const type of ['keydown', 'pointerdown', 'focus']) target.removeEventListener(type, unlock); };
}
```

- [ ] **Step 6: Persist storage on the first online use.** In `src/renderer/src/app/online/pageSession.ts` `PageOnlineDeps`, after `createSession?(deps: OnlineSessionDeps): OnlineSessionOwner;` add:

```ts
  /** Web build spec §7.4: navigator.storage.persist(), asked once on the first host, join, reconnect or rehost; a refusal is not an error. */
  persistStorage?(): Promise<unknown> | void;
```

Replace:

```ts
  async function action(value: OnlineAction): Promise<OnlineResult> {
    if (!validateOnlineAction(value)) return { ok: false, code: 'invalid-action' };
```

with:

```ts
  let persistAsked = false;
  async function action(value: OnlineAction): Promise<OnlineResult> {
    if (!validateOnlineAction(value)) return { ok: false, code: 'invalid-action' };
    if (!persistAsked && (value.type === 'host' || value.type === 'join' || value.type === 'reconnect' || value.type === 'rehost')) {
      persistAsked = true;
      try { void Promise.resolve(deps.persistStorage?.()).catch(() => {}); } catch { /* a refusal is not an error */ }
    }
```

- [ ] **Step 7: The menu texts.** Replace the body of `Home()` in `src/renderer/src/ui/menu/Home.tsx` (and add `useUi` to the `../context` import):

```tsx
import { useActions, useUi } from '../context';
import { MenuButton } from './MenuButton';
import { NAV } from './styles';

/** Single player, Multiplayer, Settings (main menu spec decision 1) and Quit (owner 2026-11-17). In a browser without the
 *  online APIs, the unsupported text takes Multiplayer's place (web build spec §7.7). */
export function Home() {
  const actions = useActions(), unsupported = useUi((s) => s.browser.unsupported);
  return (
    <nav style={NAV}>
      <MenuButton id="single-player" text="Single player" onClick={actions.openShips} />
      {unsupported ? <p data-testid="online-unsupported">{unsupported}</p> : <MenuButton id="multiplayer" text="Multiplayer" onClick={actions.openMultiplayer} />}
      <MenuButton id="settings" text="Settings" onClick={actions.openSettings} />
      <MenuButton id="quit" text="Quit" onClick={actions.quit} />
    </nav>
  );
}
```

In `src/renderer/src/ui/menu/Multiplayer.tsx`, change the first line of `Multiplayer()` to `const menu = useUi((s) => s.menu), online = useUi((s) => s.online), blocked = useUi((s) => s.browser.onlineBlocked), actions = useActions();` and replace `<p data-testid="online-availability">{availabilityText(v)}</p>` with `<p data-testid="online-availability">{blocked ?? availabilityText(v)}</p>`.

In `src/renderer/src/ui/menu/Menu.tsx`, add `note = useUi((s) => s.browser.note),` after `update = useUi((s) => s.browser.update),` in the first line of `Menu()`, and replace `        {!playing && <p data-testid="version" style={VERSION}>{versionText()}</p>}` with:

```tsx
        {!playing && note && <p data-testid="browser-note" style={VERSION}>{note}</p>}
        {!playing && <p data-testid="version" style={VERSION}>{versionText()}</p>}
```

- [ ] **Step 8: Wire start-up in the page.** In `src/renderer/src/main.ts` add these imports after the browserFullscreen import:

```ts
import { checkBrowserSupport, ONE_TAB_TEXT, SAFARI_NOTE, UNSUPPORTED_TEXT, type SupportGlobals } from './app/web/browserSupport';
import { acquireOnlineLock, type OnlineLock } from './app/web/onlineLock';
import { installAudioUnlock } from './app/audioUnlock';
```

Replace (Task 2's lines):

```ts
  // The online session runs in this page (web build spec §3.3): Electron's preload hands it main's resolved config, and
  // the web build bakes its own in (§5.1).
  const onlineConfig = window.ftlite ? window.ftlite.onlineConfig : __FTLITE_WEB_CONFIG__;
  const pageOnline = onlineConfig && validatePageOnlineConfig(onlineConfig) ? createPageOnline(onlineConfig, { window }) : null;
```

with:

```ts
  // The online session runs in this page (web build spec §3.3): Electron's preload hands it main's resolved config, and
  // the web build bakes its own in (§5.1). A browser must have the online APIs (§7.7), and only the tab holding the
  // ftlite-online lock runs the session (§7.5).
  const web = !window.ftlite;
  const support = web ? checkBrowserSupport(globalThis as unknown as SupportGlobals) : null;
  const configured = window.ftlite ? window.ftlite.onlineConfig : support?.ok ? __FTLITE_WEB_CONFIG__ : null;
  const lock: OnlineLock = web && configured ? await acquireOnlineLock(navigator.locks) : { state: 'unavailable' };
  const onlineConfig = configured && (!web || lock.state === 'held') ? configured : null;
  const pageOnline = onlineConfig && validatePageOnlineConfig(onlineConfig)
    ? createPageOnline(onlineConfig, { window, persistStorage: web ? () => navigator.storage?.persist?.() : undefined }) : null;
  // A lock manager that fails or never answers (review R1-F2, R1-F6) leaves online off with the unsupported text, not
  // the "configured local service" one.
  const browserInit = web ? { web: true, unsupported: support?.ok ? null : UNSUPPORTED_TEXT, note: support?.safari ? SAFARI_NOTE : null,
    onlineBlocked: lock.state === 'busy' ? ONE_TAB_TEXT : lock.state === 'unavailable' && configured ? UNSUPPORTED_TEXT : null } : undefined;
```

Change `  const store = createUiStore({ onlineAvailable: !!bridge, settings: {` to `  const store = createUiStore({ onlineAvailable: !!bridge, browser: browserInit, settings: {`. Replace:

```ts
  const unlockOnce = (): void => audio.unlock();   // first gesture (and every focus) resumes a suspended AudioContext; guarded inside
  window.addEventListener('keydown', unlockOnce, { once: true }); window.addEventListener('pointerdown', unlockOnce, { once: true }); window.addEventListener('focus', unlockOnce);
```

with:

```ts
  const offAudio = installAudioUnlock(window, audio);   // web build spec §7.3: the first gesture (and every focus) resumes a suspended AudioContext
```

(`offAudio` joins the teardown in Task 10.)

- [ ] **Step 9: Run and commit.**

```bash
npx vitest run tests/webStartup.test.ts tests/webStartupUi.test.tsx tests/menu.test.tsx tests/pageSession.test.ts tests/pageBoundary.test.ts && npm run typecheck
git add src/renderer/src/app/web/browserSupport.ts src/renderer/src/app/web/onlineLock.ts src/renderer/src/app/audioUnlock.ts src/renderer/src/app/online/pageSession.ts src/renderer/src/ui/menu/Home.tsx src/renderer/src/ui/menu/Multiplayer.tsx src/renderer/src/ui/menu/Menu.tsx src/renderer/src/main.ts tests/webStartup.test.ts tests/webStartupUi.test.tsx
git commit -m "feat(web-ii): unsupported-browser and Safari texts, ftlite-online Web Lock, storage.persist on first online use, tested audio unlock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Duel records in IndexedDB and "Download playtest log" (spec §7.4)

**Files:**
- Modify: `src/renderer/src/net/duelRecord.ts` (day key and day cap)
- Modify: `src/main/network/duelRecords.ts` (use them)
- Modify: `src/network/online/recordStore.ts` (`openFtliteDatabase`, version 2, `duelRecords`)
- Modify: `tests/recordStore.test.ts` (version 2 expectation, upgrade case)
- Create: `src/renderer/src/app/web/duelRecordStore.ts`
- Create: `src/renderer/src/app/web/download.ts`
- Modify: `src/renderer/src/ui/actions.ts`, `src/renderer/src/ui/menu/Settings.tsx`
- Modify: `src/renderer/src/main.ts`
- Test: `tests/webDuelRecords.test.ts`, `tests/webPlaytestLogUi.test.tsx`

**Interfaces:**
- Consumes: `validateDuelRecord`, `DuelPlaytestRecord` (`net/duelRecord.ts`); `NO_PLAYTEST_RECORDS_TEXT`, `PLAYTEST_LOG_FAILED_TEXT`, `BrowserSlice.playtestLog/playtestLogText` (Task 5); `web` (Task 8).
- Produces:
  - `DUEL_RECORD_DAY_MAX_BYTES = 16 * 1024 * 1024`, `duelRecordDay(now: Date): string` (`net/duelRecord.ts`)
  - `ONLINE_RECORD_VERSION = 2`, `DUEL_RECORD_STORE = 'duelRecords'`, `openFtliteDatabase(factory: IDBFactory): Promise<IDBDatabase>` (`recordStore.ts`)
  - `createIndexedDbDuelRecordStore(factory?: IDBFactory, maxDayBytes?: number): DuelRecordStore` with `append(value: unknown, now?: Date): Promise<boolean>` and `exportLog(): Promise<PlaytestLog | null>`; `interface PlaytestLog { name: string; text: string; days: number; records: number }`
  - `downloadText(doc, urls, name, text, later?)`
  - action `downloadPlaytestLog(): void`; dep `downloadPlaytestLog?(): Promise<string | null>`

- [ ] **Step 1: Share the day key and cap.** In `src/renderer/src/net/duelRecord.ts`, after `export const DUEL_RECORD_MAX_BYTES = 8192;` add:

```ts
/** A day's log stops growing here, so a renderer bug looping on round events cannot fill the disk or the browser's storage. */
export const DUEL_RECORD_DAY_MAX_BYTES = 16 * 1024 * 1024;
/** The local date a record is filed under, YYYY-MM-DD (Electron's file name, the browser's duelRecords key). */
export function duelRecordDay(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
```

In `src/main/network/duelRecords.ts`, change the import to `import { DUEL_RECORD_DAY_MAX_BYTES, duelRecordDay, validateDuelRecord } from '../../renderer/src/net/duelRecord';`, replace the body of `duelRecordPath` with `  return join(userData, 'playtest', \`duel-${duelRecordDay(now)}.jsonl\`);`, and replace `export const DUEL_RECORD_FILE_MAX_BYTES = 16 * 1024 * 1024;` with `export const DUEL_RECORD_FILE_MAX_BYTES = DUEL_RECORD_DAY_MAX_BYTES;`.

- [ ] **Step 2: Version 2 of the database.** In `src/network/online/recordStore.ts` replace:

```ts
export const ONLINE_RECORD_DATABASE = 'ftlite', ONLINE_RECORD_VERSION = 1, ONLINE_RECORD_STORE = 'records';
```

with:

```ts
export const ONLINE_RECORD_DATABASE = 'ftlite', ONLINE_RECORD_VERSION = 2, ONLINE_RECORD_STORE = 'records', DUEL_RECORD_STORE = 'duelRecords';
/** Database ftlite (web build spec §3.1, §7.4): version 1 held `records`; version 2 adds `duelRecords`. Every page module
 *  opens it through here, so no two openers ask for different versions. */
export function openFtliteDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(ONLINE_RECORD_DATABASE, ONLINE_RECORD_VERSION);
    r.onupgradeneeded = () => { for (const name of [ONLINE_RECORD_STORE, DUEL_RECORD_STORE]) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? Error('indexeddb-open-failed'));
    r.onblocked = () => reject(Error('indexeddb-blocked'));
  });
}
```

and inside `createIndexedDbRecordStore` replace the `open()` function with:

```ts
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    const work: Promise<IDBDatabase> = openFtliteDatabase(factory).then(db => { db.onversionchange = () => { db.close(); if (opening === work) opening = undefined; }; return db; });
    opening = work; void work.catch(() => { if (opening === work) opening = undefined; });
    return work;
  }
```

In `tests/recordStore.test.ts`, change the import to also take `DUEL_RECORD_STORE`, rename the test `'uses database ftlite version 1 with one records store, and two stores on one factory share it'` to `'uses database ftlite version 2 with the records and duelRecords stores, and two stores on one factory share it'`, and change its last expectation to:

```ts
    expect(db.version).toBe(2); expect(Array.from({ length: db.objectStoreNames.length }, (_, i) => db.objectStoreNames.item(i))).toEqual([DUEL_RECORD_STORE, ONLINE_RECORD_STORE]); db.close();
```

Then add this test after it:

```ts
  it('upgrades a version 1 database and keeps its records', async () => {
    const idb = factory();
    await new Promise<void>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(ONLINE_RECORD_STORE).put(new Uint8Array([5]), 'seat-v1'); };
      r.onsuccess = () => { r.result.close(); resolve(); }; r.onerror = () => reject(r.error); });
    expect(await createIndexedDbRecordStore(idb).get('seat-v1')).toEqual(new Uint8Array([5]));
  });
```

- [ ] **Step 3: Write the failing tests.** `tests/webDuelRecords.test.ts`:

```ts
// The browser's duel playtest log (web build spec §7.4): records go to the IndexedDB store duelRecords, keyed by local
// date, with the same per-record and per-day caps as Electron's files; the log exports as one combined file, oldest first.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createIndexedDbDuelRecordStore } from '../src/renderer/src/app/web/duelRecordStore';
import { downloadText } from '../src/renderer/src/app/web/download';
import { createIndexedDbRecordStore } from '../src/network/online/recordStore';
import { latencyFigure, validateDuelRecord, type DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';

const losses = { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 };
function record(round: number): DuelPlaytestRecord {
  return validateDuelRecord({ version: 1, session: 'online', role: 'host', transport: 'loopback', seat: 0, helmPlayer: 0, seed: 77, round, startedAtIso: '2026-11-16T12:00:00.000Z',
    summary: { outcome: 1, ticks: 14400, terminal: [[], ['laser']], laserReleases: [3, 4], laserHits: [2, 1], missilesLaunched: [1, 1], missileHits: [1, 0], repairsFinished: [0, 1],
      laserMisses: [1, 3], layersStripped: [1, 0], missileLosses: [losses, losses], planetContacts: [0, 1], asteroidContacts: [2, 0], baits: 1, consoleSwaps: 0,
      helmEmptyTicks: 0, weaponsEmptyTicks: 10, enemyInArcTicks: 900, weaponsIdleTicks: 30, repairsStarted: [0, 1], walkingTicks: [0, 200], repairingTicks: [0, 96], round, seed: 77, baseTick: 0 },
    latency: { held: latencyFigure([40, 50]), command: latencyFigure([70]), rttMs: 4 }, jitter: { count: 10, stdMs: 3 }, disconnects: 0, pauses: 0 });
}
const line = (r: DuelPlaytestRecord): string => JSON.stringify(r) + '\n';

describe('the duelRecords store', () => {
  it('appends valid records by local day and exports one combined file, oldest day first', async () => {
    const store = createIndexedDbDuelRecordStore(new IDBFactory());
    expect(await store.exportLog()).toBeNull();
    expect(await store.append(record(2), new Date(2026, 10, 17, 9))).toBe(true);
    expect(await store.append(record(0), new Date(2026, 10, 16, 23, 59))).toBe(true);
    expect(await store.append(record(1), new Date(2026, 10, 16, 8))).toBe(true);
    expect(await store.exportLog()).toEqual({ name: 'ftlite-playtest-2026-11-16-to-2026-11-17.jsonl', text: line(record(0)) + line(record(1)) + line(record(2)), days: 2, records: 3 });
  });
  it('refuses an invalid record and a full day, and shares database ftlite with the seat store', async () => {
    const idb = new IDBFactory(), one = new TextEncoder().encode(line(record(0))).byteLength;
    const store = createIndexedDbDuelRecordStore(idb, one * 2), day = new Date(2026, 10, 16, 12);
    expect(await store.append({ ...record(0), seatToken: 'x' }, day)).toBe(false);
    expect(await store.append(record(0), day)).toBe(true); expect(await store.append(record(1), day)).toBe(true);
    expect(await store.append(record(2), day)).toBe(false);   // the day is full
    expect(await store.append(record(2), new Date(2026, 10, 17))).toBe(true);
    const seats = createIndexedDbRecordStore(idb); await seats.put('seat-v1', new Uint8Array([1])); expect(await seats.get('seat-v1')).toEqual(new Uint8Array([1]));
    expect((await store.exportLog())!.records).toBe(3);
  });
});

describe('downloadText', () => {
  it('saves through a Blob link and revokes it later', async () => {
    const clicks: { href: string; download: string }[] = [];
    const a = { href: '', download: '', style: { display: '' }, click() { clicks.push({ href: a.href, download: a.download }); }, remove: vi.fn() };
    const doc = { createElement: () => a, body: { append: vi.fn() } }, urls = { createObjectURL: vi.fn(() => 'blob:1'), revokeObjectURL: vi.fn() };
    let later: (() => void) | undefined;
    downloadText(doc as never, urls, 'ftlite-playtest-2026-11-16-to-2026-11-16.jsonl', 'x\n', cb => { later = cb; });
    expect(clicks).toEqual([{ href: 'blob:1', download: 'ftlite-playtest-2026-11-16-to-2026-11-16.jsonl' }]);
    const blob = (urls.createObjectURL.mock.calls[0] as unknown as [Blob])[0]; expect(await blob.text()).toBe('x\n');
    expect(urls.revokeObjectURL).not.toHaveBeenCalled(); later!(); expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:1'); expect(a.remove).toHaveBeenCalled();
  });
});
```

`tests/webPlaytestLogUi.test.tsx`:

```tsx
// @vitest-environment jsdom
// Settings' Download playtest log (web build spec §7.4, W-6): browser only; says what it saved, or that there is nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { flush } from './helpers/uiStore';
import { renderUi } from './helpers/uiRender';
import { BROWSER_F11_TEXT } from '../src/renderer/src/ui/menuState';

afterEach(() => { cleanup(); });
describe('Download playtest log', () => {
  it('is absent unless the browser offers it', () => {
    renderUi(); fireEvent.click(screen.getByTestId('settings')); expect(screen.queryByTestId('download-playtest-log')).toBeNull();
    expect(screen.getByTestId('fullscreen-note').textContent).toBe('F11 also toggles fullscreen.');
  });
  it('in a browser, says F11 is the browser’s own fullscreen (review R1-F7)', () => {
    const { store } = renderUi(); act(() => store.setState((s) => ({ browser: { ...s.browser, web: true } }))); fireEvent.click(screen.getByTestId('settings'));
    expect(screen.getByTestId('fullscreen-note').textContent).toBe(BROWSER_F11_TEXT);
  });
  it('saves the log and reports the file, or says there are no records', async () => {
    const run = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce('ftlite-playtest-2026-11-16-to-2026-11-17.jsonl').mockResolvedValueOnce(null).mockRejectedValueOnce(Error('x'));
    const { store } = renderUi({ deps: { downloadPlaytestLog: run } });
    act(() => store.setState((s) => ({ browser: { ...s.browser, playtestLog: true } }))); fireEvent.click(screen.getByTestId('settings'));
    expect(screen.getByTestId('download-playtest-log').textContent).toBe('Download playtest log');
    fireEvent.click(screen.getByTestId('download-playtest-log')); await act(flush);
    expect(screen.getByTestId('playtest-log-status').textContent).toBe('Saved ftlite-playtest-2026-11-16-to-2026-11-17.jsonl.');
    fireEvent.click(screen.getByTestId('download-playtest-log')); await act(flush);
    expect(screen.getByTestId('playtest-log-status').textContent).toBe('No playtest records yet.');
    fireEvent.click(screen.getByTestId('download-playtest-log')); await act(flush);
    expect(screen.getByTestId('playtest-log-status').textContent).toBe('The playtest log could not be read.');
  });
});
```

- [ ] **Step 4: Run them to see them fail.** Run: `npx vitest run tests/webDuelRecords.test.ts tests/webPlaytestLogUi.test.tsx tests/recordStore.test.ts` — Expected: FAIL (modules not found; recordStore passes after Step 2).

- [ ] **Step 5: Write `src/renderer/src/app/web/duelRecordStore.ts`:**

```ts
// The browser's duel playtest log (web build spec §7.4): each validated record is one line in the IndexedDB store
// duelRecords under its local date, with Electron's caps (8 KiB a record, 16 MiB a day). exportLog joins every day,
// oldest first, into one ftlite-playtest-<first>-to-<last>.jsonl in today's per-record format.
import { DUEL_RECORD_STORE, openFtliteDatabase } from '../../../../network/online/recordStore';
import { DUEL_RECORD_DAY_MAX_BYTES, duelRecordDay, validateDuelRecord } from '../../net/duelRecord';

interface DayRecord { bytes: number; lines: string[] }
export interface PlaytestLog { name: string; text: string; days: number; records: number }
export interface DuelRecordStore { append(value: unknown, now?: Date): Promise<boolean>; exportLog(): Promise<PlaytestLog | null> }
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function validDay(value: unknown): DayRecord | null {
  const v = value as DayRecord | null;
  return v && typeof v === 'object' && Number.isSafeInteger(v.bytes) && Array.isArray(v.lines) && v.lines.every(l => typeof l === 'string' && l.endsWith('\n')) ? v : null;
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? Error('indexeddb-request-failed')); });
}
export function createIndexedDbDuelRecordStore(factory: IDBFactory = globalThis.indexedDB, maxDayBytes = DUEL_RECORD_DAY_MAX_BYTES): DuelRecordStore {
  let opening: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    const work: Promise<IDBDatabase> = openFtliteDatabase(factory).then(db => { db.onversionchange = () => { db.close(); if (opening === work) opening = undefined; }; return db; });
    opening = work; void work.catch(() => { if (opening === work) opening = undefined; });
    return work;
  }
  return {
    async append(value, now = new Date()) {
      let line: string;
      try { line = JSON.stringify(validateDuelRecord(value)) + '\n'; } catch { return false; }
      const size = new TextEncoder().encode(line).byteLength, day = duelRecordDay(now);
      try {
        const tx = (await open()).transaction(DUEL_RECORD_STORE, 'readwrite'), store = tx.objectStore(DUEL_RECORD_STORE);
        const done = new Promise<boolean>(resolve => { tx.oncomplete = () => resolve(true); tx.onabort = () => resolve(false); tx.onerror = () => resolve(false); });
        const current = store.get(day);
        current.onsuccess = () => {
          const cur = validDay(current.result) ?? { bytes: 0, lines: [] };
          if (cur.bytes + size > maxDayBytes) { tx.abort(); return; }   // the day is full: nothing written
          store.put({ bytes: cur.bytes + size, lines: [...cur.lines, line] }, day);
        };
        return await done;
      } catch { return false; }
    },
    async exportLog() {
      const tx = (await open()).transaction(DUEL_RECORD_STORE, 'readonly'), store = tx.objectStore(DUEL_RECORD_STORE);
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      const days = keys.map((key, i) => [key, validDay(values[i])] as const)
        .filter((entry): entry is readonly [string, DayRecord] => typeof entry[0] === 'string' && DAY.test(entry[0]) && entry[1] !== null)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (!days.length) return null;
      return { name: `ftlite-playtest-${days[0]![0]}-to-${days.at(-1)![0]}.jsonl`, text: days.map(([, d]) => d.lines.join('')).join(''),
        days: days.length, records: days.reduce((n, [, d]) => n + d.lines.length, 0) };
    }
  };
}
```

- [ ] **Step 6: Write `src/renderer/src/app/web/download.ts`:**

```ts
// A file the browser saves (web build spec §7.4): a Blob link clicked once, revoked a second later (revoking at once can
// cancel the download in some browsers).
export function downloadText(doc: { createElement(tag: 'a'): { href: string; download: string; style: { display: string }; click(): void; remove(): void }; body: { append(node: never): void } },
  urls: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void }, name: string, text: string,
  later: (cb: () => void) => void = cb => { setTimeout(cb, 1000); }): void {
  const url = urls.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const a = doc.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
  doc.body.append(a as never); a.click(); a.remove();
  later(() => urls.revokeObjectURL(url));
}
```

- [ ] **Step 7: The action and the Settings button.** In `src/renderer/src/ui/actions.ts`: change the menuState import to `import { applyStatus, failureText, helmPlayerOf, isDuel, NO_PLAYTEST_RECORDS_TEXT, PLAYTEST_LOG_FAILED_TEXT, ROOM_CODE, type MenuState } from './menuState';`; in `UiActionDeps`, after `reload?(): void;` add:

```ts
  /** Web build spec §7.4: save the browser's playtest log; the saved file's name, or null when there are no records. */
  downloadPlaytestLog?(): Promise<string | null>;
```

and after `reload(): void { deps.reload?.(); },` add:

```ts
    /** Settings' Download playtest log (web build spec §7.4): says what was saved, or that there is nothing yet. */
    downloadPlaytestLog(): void {
      const run = deps.downloadPlaytestLog; if (!run) return;
      const say = (text: string): void => { if (!disposed) store.setState((s) => ({ browser: { ...s.browser, playtestLogText: text } })); };
      void run().then((name) => say(name ? `Saved ${name}.` : NO_PLAYTEST_RECORDS_TEXT), () => say(PLAYTEST_LOG_FAILED_TEXT));
    },
```

In `src/renderer/src/ui/menu/Settings.tsx`, change the first line of `Settings()` to `const settings = useUi((s) => s.settings), fullscreen = useUi((s) => s.menu.fullscreen), browser = useUi((s) => s.browser), actions = useActions();`, add `import { BROWSER_F11_TEXT } from '../menuState';`, and replace the line `      <p data-testid="fullscreen-note">{\`${FULLSCREEN_KEY} also toggles fullscreen.\`}</p>` with (review R1-F7: in a browser F11 is the browser's own fullscreen, which the toggle cannot see):

```tsx
      <p data-testid="fullscreen-note">{browser.web ? BROWSER_F11_TEXT : `${FULLSCREEN_KEY} also toggles fullscreen.`}</p>
      {browser.playtestLog && <>
        <MenuButton id="download-playtest-log" text="Download playtest log" onClick={actions.downloadPlaytestLog} />
        {browser.playtestLogText && <p data-testid="playtest-log-status">{browser.playtestLogText}</p>}
      </>}
```

- [ ] **Step 8: Wire it in the page.** In `src/renderer/src/main.ts` add imports after the audioUnlock import:

```ts
import { createIndexedDbDuelRecordStore } from './app/web/duelRecordStore';
import { downloadText } from './app/web/download';
import type { DuelPlaytestRecord } from './net/duelRecord';
```

After the `const browserInit = …;` statement (Task 8) add:

```ts
  // Web build spec §7.4: the browser keeps duel records in IndexedDB; Electron still writes them to disk through main.
  const duelRecords = web ? createIndexedDbDuelRecordStore() : null;
  const recordDuel = (record: DuelPlaytestRecord): Promise<boolean> | undefined => window.ftlite?.recordDuel ? window.ftlite.recordDuel(record) : duelRecords?.append(record);
```

Change `    onlineBlocked: lock.state === 'busy' ? ONE_TAB_TEXT : lock.state === 'unavailable' && configured ? UNSUPPORTED_TEXT : null } : undefined;` to `    onlineBlocked: lock.state === 'busy' ? ONE_TAB_TEXT : lock.state === 'unavailable' && configured ? UNSUPPORTED_TEXT : null, playtestLog: true } : undefined;`. Replace both occurrences of `recordDuel: record => window.ftlite?.recordDuel?.(record)` with `recordDuel` (one in `single`, one in the online duel). In `createUiActions({ … })`, after `    reload() { location.reload(); },` add:

```ts
    downloadPlaytestLog: duelRecords ? async () => { const log = await duelRecords.exportLog(); if (!log) return null; downloadText(document, URL, log.name, log.text); return log.name; } : undefined,
```

- [ ] **Step 9: Run and commit.**

```bash
npx vitest run tests/webDuelRecords.test.ts tests/webPlaytestLogUi.test.tsx tests/recordStore.test.ts tests/onlineDuel.test.ts tests/pageBoundary.test.ts && npm run typecheck
git add src/renderer/src/net/duelRecord.ts src/main/network/duelRecords.ts src/network/online/recordStore.ts tests/recordStore.test.ts src/renderer/src/app/web/duelRecordStore.ts src/renderer/src/app/web/download.ts src/renderer/src/ui/actions.ts src/renderer/src/ui/menu/Settings.tsx src/renderer/src/main.ts tests/webDuelRecords.test.ts tests/webPlaytestLogUi.test.tsx
git commit -m "feat(web-ii): duel records in IndexedDB duelRecords (database ftlite v2, same caps) and Settings' Download playtest log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The leave prompt, and teardown on pagehide (spec §7.6)

**Files:**
- Create: `src/renderer/src/app/web/leavePrompt.ts`
- Modify: `src/renderer/src/main.ts`
- Test: `tests/webLeavePrompt.test.ts`

**Interfaces:**
- Consumes: `web`, `lock`, `offVersion`, `offGuards`, `pageFullscreen`, `offAudio` (Tasks 5-8).
- Produces: `leaveWanted(s: Pick<UiState, 'menu' | 'online'>): boolean`, `installLeavePrompt(target, wanted: () => boolean): () => void`.

Why the teardown moves: `main.ts` disposes the session, UI and bridge in a `beforeunload` listener. With a leave prompt, a player who answers "Stay" would keep a dead game. Teardown now runs on a `pagehide` that is not persisted (the page is really going); a back-forward-cache `pagehide` only suspends (the page session already handles it).

- [ ] **Step 1: Write the failing test** `tests/webLeavePrompt.test.ts`:

```ts
// Leaving the page (web build spec §7.6, W-4): while hosting, in a lobby or in a match the browser's own leave prompt
// shows; never otherwise; main.ts tears down on a real pagehide, not on beforeunload (a "Stay" keeps the game).
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { installLeavePrompt, leaveWanted } from '../src/renderer/src/app/web/leavePrompt';
import { INITIAL_MENU } from '../src/renderer/src/ui/menuState';
import { idle } from './helpers/uiStore';

const at = (page: typeof INITIAL_MENU.page, phase: typeof idle.phase | null) => ({ menu: { ...INITIAL_MENU, page }, online: { available: true, status: phase ? { ...idle, phase } : null, receivedAt: 0 } });
describe('leaveWanted', () => {
  it('asks while hosting, in a lobby, in an online match or in Single player', () => {
    for (const phase of ['creating', 'joining', 'lobby', 'connecting', 'syncing', 'running', 'paused', 'reconnecting', 'saving', 'rehosting'] as const) expect(leaveWanted(at('session', phase))).toBe(true);
    expect(leaveWanted(at('single', null))).toBe(true);
  });
  it('does not ask on the menu or after a session ended', () => {
    for (const phase of ['idle', 'ended', 'error', 'saved'] as const) expect(leaveWanted(at('home', phase))).toBe(false);
    expect(leaveWanted(at('home', null))).toBe(false);
  });
});
describe('installLeavePrompt', () => {
  it('prompts only when wanted, and disposes', () => {
    let wanted = true; const t = new EventTarget(), off = installLeavePrompt(t, () => wanted);
    // Node's Event.returnValue is a read-only accessor; BeforeUnloadEvent's is a writable string, which this own field stands in for.
    class BeforeUnload extends Event { returnValue: unknown = undefined; constructor() { super('beforeunload', { cancelable: true }); } }
    const ask = (): { prevented: boolean; returnValue: unknown } => { const e = new BeforeUnload(); t.dispatchEvent(e); return { prevented: e.defaultPrevented, returnValue: e.returnValue }; };
    expect(ask()).toEqual({ prevented: true, returnValue: '' });
    wanted = false; expect(ask().prevented).toBe(false);
    wanted = true; off(); expect(ask().prevented).toBe(false);
  });
  it('main.ts tears down on pagehide, not beforeunload, and installs the prompt only in the browser', () => {
    const main = readFileSync('src/renderer/src/main.ts', 'utf8');
    expect(main).not.toMatch(/addEventListener\('beforeunload'/);
    expect(main).toMatch(/const offLeave = web \? installLeavePrompt\(window, \(\) => leaveWanted\(store\.getState\(\)\)\) : undefined;/);
    expect(main).toMatch(/window\.addEventListener\('pagehide', \(event\) => \{\s*if \(event\.persisted \|\| tornDown\) return;/);
    expect(main).toMatch(/if \(lock\.state === 'held'\) lock\.release\(\);/);   // review R1-F2
  });
});
```

- [ ] **Step 2: Run it to see it fail.** Run: `npx vitest run tests/webLeavePrompt.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/renderer/src/app/web/leavePrompt.ts`:**

```ts
// Leaving the page (web build spec §7.6, deviation W-4): while hosting, in a lobby or in a match, beforeunload asks for
// the browser's standard leave prompt (browsers show their own text). Skipped in Electron (main.ts installs it only
// without window.ftlite; Electron main also allows will-prevent-unload).
import type { OnlinePhase } from '../../../../shared/onlineSession';
import type { UiState } from '../../ui/menuState';

const QUIET: readonly OnlinePhase[] = ['idle', 'ended', 'error', 'saved'];
export function leaveWanted(s: Pick<UiState, 'menu' | 'online'>): boolean {
  if (s.menu.page === 'single') return true;
  const phase = s.online.status?.phase;
  return !!phase && !QUIET.includes(phase);
}
export function installLeavePrompt(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, wanted: () => boolean): () => void {
  const listener = (event: Event): void => {
    if (!wanted()) return;
    event.preventDefault();
    try { (event as Event & { returnValue: unknown }).returnValue = ''; } catch { /* the older Chromium form of the same request; read-only outside BeforeUnloadEvent */ }
  };
  target.addEventListener('beforeunload', listener);
  return () => target.removeEventListener('beforeunload', listener);
}
```

- [ ] **Step 4: Wire the prompt and move the teardown.** In `src/renderer/src/main.ts` add `import { installLeavePrompt, leaveWanted } from './app/web/leavePrompt';` after the download import. After the line `  const offAudio = installAudioUnlock(window, audio);   // …` add:

```ts
  const offLeave = web ? installLeavePrompt(window, () => leaveWanted(store.getState())) : undefined;   // web build spec §7.6
```

Replace:

```ts
  window.addEventListener('beforeunload', () => {
    offPrepareExit?.(); offVisibility?.(); offPort?.(); offStatus?.(); offStrip(); setBlocked(true); offBlocked(); actions.dispose(); unmountUi();
    session.dispose(); bridge?.dispose(); keyboard.destroy();
  }, { once: true });
```

with:

```ts
  // Teardown when the page is really going (web build spec §7.6): not on beforeunload, where a "Stay" answer to the leave
  // prompt would keep a dead game; a back-forward-cache pagehide only suspends (the page session handles it).
  let tornDown = false;
  window.addEventListener('pagehide', (event) => {
    if (event.persisted || tornDown) return;
    tornDown = true;
    offLeave?.(); offVersion?.(); offGuards(); pageFullscreen?.dispose(); offAudio();
    offPrepareExit?.(); offVisibility?.(); offPort?.(); offStatus?.(); offStrip(); setBlocked(true); offBlocked(); actions.dispose(); unmountUi();
    session.dispose(); bridge?.dispose(); keyboard.destroy();
    if (lock.state === 'held') lock.release();   // review R1-F2: hand ftlite-online on at once, so a reload gets it
  });
```

- [ ] **Step 5: Run the tests, the build and one Electron app gate** (the teardown runs in Electron too):

```bash
npx vitest run tests/webLeavePrompt.test.ts && npm run typecheck && npm run test:duel-app-runtime
```

Expected: PASS; `test:duel-app-runtime` prints `ACTUAL TWO-PROCESS DUEL APPLICATION PASS` (its close gate proves Electron's close still runs `app:prepare-exit` and leaves no ports or Workers).

- [ ] **Step 6: Commit.**

```bash
git add src/renderer/src/app/web/leavePrompt.ts src/renderer/src/main.ts tests/webLeavePrompt.test.ts
git commit -m "feat(web-ii): leave prompt while hosting, in a lobby or a match (browser only); page teardown moves to a real pagehide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The browser network gates (spec §8 "Browser network gates")

**Files:**
- Create: `scripts/web/net/players.ts`
- Create: `scripts/web/net/scenario.ts`
- Create: `scripts/web/net/web-net-smoke.ts`
- Modify: `package.json` (script `test:web-net`)
- Test: `tests/webNetScenario.test.ts`

**Interfaces:**
- Consumes: `resolveWebBuildPlan` (Task 2), `buildWeb` (Task 3), `buildDuelObservers` (`scripts/network/online-observer-build.ts`: writes `<dir>/observer/observer.js` (the duel observer, `window.onlineAppObservation()`), `page-probe.js` (`window.onlineProbe` with `set`, `counts`, `openPorts`) and `utility.cjs`), `startLocalRuntime(directory, { allowedOrigins })` (`services/signalling/scripts/local-runtime.ts`), `scripts/network/online-app-smoke.cjs` (the Electron driver: `status`, `click`, `type`, `key`, `resource-counts`, `shutdown`), the page test probe `window.__ftliteOnlineTest` (`testProbe`, Web-i D-1).
- Produces: `npm run test:web-net`, report `out/web-ii-net/web-net.json`; `GatePlayer`, `GateView`, `runPairing`, `latestPublication`, `commonPublication`, `parseWebNetArgs`, `electronKey`.

How it runs: one local workerd whose `ALLOWED_ORIGINS` lists the preview origin; one `--test --test-probe --duel-test-seed=351` web build baked with that workerd's loopback origin; `vite preview` of its `static/` on a fixed free port; Playwright Chromium and Firefox **headless** (no hidden tabs are needed here; Web-i D-8 concerned hiding only) with host-candidate obfuscation off (Chromium `--disable-features=WebRtcHideLocalIpsWithMdns`, Firefox `media.peerconnection.ice.obfuscate_host_addresses: false`) so loopback ICE pairs across two browsers; each player is its own browser context (its own IndexedDB and Web Lock). The Electron guest is the built app through `online-app-smoke.cjs`. Each pairing runs the four checks of §8: host and join; a short scripted duel (both walk to their consoles, the guest's Helm holds W, the speed rises on both) whose authority publication matches the guest (same run, sequence, tick and hash); guest reconnect with the saved seat (tab closed, reopened in the same context, reloaded in place to prove the Web Lock is re-taken (review R1-F2), Reconnect saved seat, host Esc resumes); rehost from the IndexedDB mirror after the host tab closes through its leave prompt: the guest's own tab (or app) is then closed and reopened too. Before Reconnect (whose mirror refresh also fetches the service's checkpoint), a browser guest reads `records`/`mirror-v1` straight from database `ftlite` with `page.evaluate` and must find the `FTLNMIR1` magic and a header whose committed `checkpointSequence` and `capturedTick` equal the last committed checkpoint it saw before closing (review R1-F4, R2). Then Reconnect saved seat reaches 'saved' with Re-host offered, and the guest rehosts. The report records the stored mirror as read; the Electron guest's driver has no page evaluate, so its pairing records "not read" and relies on the status check only. The origin-refused injection also requires network evidence of the 403 (review R1-F3). Finally the rehosted guest leaves, and every page port it opened is closed or transferred and its Worker terminated.

- [ ] **Step 1: Write the failing test** `tests/webNetScenario.test.ts`:

```ts
// The browser network gate's pure parts (web build spec §8): argument parsing, the newest publication, the common
// publication the authority and the guest agree on, and the Electron driver's key names.
import { describe, expect, it } from 'vitest';
import { commonPublication, latestPublication, parseWebNetArgs, PAIRINGS } from '../scripts/web/net/scenario';
import { electronKey } from '../scripts/web/net/players';

const view = (pubs: object[]) => ({ status: {} as never, text: '', observations: [{ publications: pubs }] });
describe('the browser network gate', () => {
  it('parses its arguments', () => {
    expect(parseWebNetArgs([])).toEqual({ pairings: PAIRINGS, inject: null, reportPath: 'out/web-ii-net/web-net.json' });
    expect(parseWebNetArgs(['--pairing=firefox-chromium', '--inject=origin-refused', '--report-path=out/x.json'])).toEqual({ pairings: ['firefox-chromium'], inject: 'origin-refused', reportPath: 'out/x.json' });
    expect(() => parseWebNetArgs(['--pairing=safari-chromium'])).toThrow(/unknown pairing/); expect(() => parseWebNetArgs(['--inject=other'])).toThrow(/unknown injection/);
    expect(PAIRINGS).toEqual(['chromium-firefox', 'firefox-chromium', 'chromium-electron']);
  });
  it('takes the highest sequence as the newest publication', () => {
    expect(latestPublication(view([{ sequence: 3 }, { sequence: 9 }, { sequence: 5 }]))).toEqual({ sequence: 9 });
    expect(latestPublication({ status: {} as never, text: '', observations: [] })).toBeUndefined();
  });
  it('finds the newest publication both sides hold with the same run, sequence, tick and hash', () => {
    const host = view([{ runId: 'r', sequence: 1, tick: 3, hash: 'a' }, { runId: 'r', sequence: 2, tick: 6, hash: 'b' }]);
    expect(commonPublication(host, view([{ runId: 'r', sequence: 1, tick: 3, hash: 'a' }, { runId: 'r', sequence: 2, tick: 6, hash: 'x' }]))).toEqual({ runId: 'r', sequence: 1, tick: 3, hash: 'a' });
    expect(commonPublication(host, view([{ runId: 'q', sequence: 2, tick: 6, hash: 'b' }]))).toBeUndefined();
  });
  it('names keys the Electron driver way', () => {
    expect(['KeyD', 'KeyW', 'KeyA', 'KeyE', 'Space', 'Escape'].map(electronKey)).toEqual(['D', 'W', 'A', 'E', 'Space', 'Escape']);
  });
});
```

- [ ] **Step 2: Run it to see it fail.** Run: `npx vitest run tests/webNetScenario.test.ts` — Expected: FAIL, modules not found.

- [ ] **Step 3: Write `scripts/web/net/players.ts`:**

```ts
// TEST ONLY (web build spec §8): one player of the browser network gate. A browser player is a Playwright page in its own
// context (its own IndexedDB and Web Lock) with the Web-i page probe and the duel observer injected before any page
// script; an Electron player is the built app through scripts/network/online-app-smoke.cjs. Every page call is bounded.
import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
import electron from 'electron';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { OnlineStatus } from '../../../src/shared/onlineSession';

export type GateKey = 'KeyD' | 'KeyW' | 'KeyA' | 'KeyE' | 'Space' | 'Escape';
export interface GateView { status: OnlineStatus; observations: any[]; text: string }
export interface GateCounts { workers: number; workerExits: number; workerErrors: number; ports: number }
export interface GatePlayer {
  readonly name: string;
  read(): Promise<GateView>;
  click(id: string): Promise<void>;
  type(id: string, text: string): Promise<void>;
  key(code: GateKey, down: boolean): Promise<void>;
  counts(): Promise<GateCounts>;
  /** Leave as a player would: a browser tab closes (through its leave prompt when `prompt`), Electron is killed. */
  close(options: { prompt: boolean }): Promise<{ prompted: boolean }>;
  /** Open the game again on the same saved data (the same browser context, the same Electron profile). */
  reopen(): Promise<void>;
  /** Browser only (review R1-F2): reload the tab in place; throws unless the online session exists again (the Web Lock was re-taken). */
  reload?(): Promise<void>;
  /** Browser only (review R2-F4): database ftlite's records/mirror-v1 decoded as mirrorStore.ts lays it out (magic at 0-7,
   *  header length uint32 LE at 8, JSON header at 12); null when nothing is stored. */
  storedMirror?(): Promise<StoredMirror | null>;
  dispose(): Promise<void>;
  readonly errors: string[];
  /** Browser only (review R1-F3): every response or failed request to the service origin, as Playwright saw it (CORS hides them from page script). */
  readonly network: NetworkEntry[];
}
export interface NetworkEntry { method: string; path: string; status: number | null; origin: string | null; failure: string | null }
export interface StoredMirror { magic: string; checkpointSequence: number | null; capturedTick: number | null }
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
export async function bounded<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(`${label} timeout`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function ready(read: () => Promise<string>, label: string): Promise<void> {
  const end = performance.now() + 30000;
  while (performance.now() < end) { try { if ((await read()).includes('Single player')) return; } catch { /* still loading */ } await delay(100); }
  throw Error(`${label} ready timeout`);
}

export async function createBrowserPlayer(o: { browser: Browser; name: string; url: string; initScripts: string[]; serviceOrigin: string }): Promise<GatePlayer> {
  const context: BrowserContext = await o.browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (const path of o.initScripts) await context.addInitScript({ path });
  const errors: string[] = [], network: NetworkEntry[] = [];
  const note = (entry: NetworkEntry): void => { if (network.length < 400) network.push(entry); };
  const service = (url: string): string | null => { try { const u = new URL(url); return u.origin === o.serviceOrigin ? u.pathname : null; } catch { return null; } };
  let page!: Page;
  const online = async (): Promise<void> => {
    await ready(() => bounded(page.evaluate(() => document.body.innerText), 4000, `${o.name} text`), o.name);
    // Only the tab holding ftlite-online builds the session the test probe exposes (Task 8).
    if (!(await bounded(page.evaluate(() => typeof (window as any).__ftliteOnlineTest === 'object'), 4000, `${o.name} probe`))) throw Error(`${o.name} has no online session (Web Lock not taken)`);
  };
  const open = async (): Promise<void> => {
    page = await context.newPage();
    page.on('pageerror', error => { if (errors.length < 20) errors.push(String(error.message).slice(0, 200)); });
    page.on('response', response => { const r = response.request(), path = service(r.url()); if (path === null) return;
      void r.allHeaders().then(h => note({ method: r.method(), path, status: response.status(), origin: h.origin ?? null, failure: null }), () => {}); });
    page.on('requestfailed', r => { const path = service(r.url()); if (path === null) return;
      void r.allHeaders().then(h => h.origin ?? null, () => null).then(origin => note({ method: r.method(), path, status: null, origin, failure: r.failure()?.errorText ?? 'failed' })); });
    await bounded(page.goto(o.url), 30000, `${o.name} load`);
    await online();
  };
  await open();
  return {
    name: o.name, errors, network,
    async reload() { await bounded(page.reload(), 30000, `${o.name} reload`); await online(); },
    storedMirror: () => bounded(page.evaluate(async () => {
      // No version: open whatever version the page made (2 after Task 9), so this never triggers an upgrade.
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('ftlite'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try {
        if (!db.objectStoreNames.contains('records')) return null;
        const value = await new Promise<unknown>((resolve, reject) => { const q = db.transaction('records', 'readonly').objectStore('records').get('mirror-v1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
        if (!(value instanceof Uint8Array) || value.length < 12) return null;
        const magic = new TextDecoder().decode(value.subarray(0, 8));
        if (magic !== 'FTLNMIR1') return { magic, checkpointSequence: null, capturedTick: null };
        const length = new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(8, true);
        const header = JSON.parse(new TextDecoder().decode(value.subarray(12, 12 + length))) as { committed: { metadata: { checkpointSequence: number; capturedTick: number } } | null };
        return { magic, checkpointSequence: header.committed?.metadata.checkpointSequence ?? null, capturedTick: header.committed?.metadata.capturedTick ?? null };
      } finally { db.close(); }
    }), 6000, `${o.name} stored mirror`),
    read: () => bounded(page.evaluate(async () => { const w = window as any;
      return { status: (await w.__ftliteOnlineTest.readStatus()).status, observations: w.onlineAppObservation(), text: document.body.innerText }; }), 4000, `${o.name} read`),
    async click(id) {
      await bounded(page.evaluate(() => (window as any).onlineProbe.set({ countPorts: true })), 4000, `${o.name} arm ports`);
      await bounded(page.click(`[data-testid="${id}"]`, { timeout: 5000 }), 6000, `${o.name} click ${id}`);
    },
    async type(id, text) { await bounded(page.fill(`[data-testid="${id}"]`, text, { timeout: 5000 }), 6000, `${o.name} type ${id}`); },
    async key(code, down) {
      await bounded(page.bringToFront(), 4000, `${o.name} front`);
      await bounded(page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()), 4000, `${o.name} blur`);
      await bounded(down ? page.keyboard.down(code) : page.keyboard.up(code), 4000, `${o.name} key ${code}`);
    },
    counts: () => bounded(page.evaluate(() => (window as any).onlineProbe.counts()), 4000, `${o.name} counts`),
    async close({ prompt }) {
      if (!prompt) { await bounded(page.close(), 10000, `${o.name} close`); return { prompted: false }; }
      let prompted = false;
      page.once('dialog', dialog => { prompted = dialog.type() === 'beforeunload'; void dialog.accept(); });
      const closed = page.waitForEvent('close', { timeout: 10000 });
      await bounded(page.close({ runBeforeUnload: true }), 10000, `${o.name} close`);
      await closed;
      return { prompted };
    },
    reopen: open,
    async dispose() { await bounded(context.close(), 10000, `${o.name} dispose`).catch(() => {}); }
  };
}

/** The Electron driver's key names (online-app-smoke.cjs sends them to sendInputEvent). */
export function electronKey(code: GateKey): string { return code.startsWith('Key') ? code.slice(3) : code; }

export async function createElectronPlayer(o: { name: string; directory: string; serviceUrl: string; duelTestSeed: number }): Promise<GatePlayer> {
  const errors: string[] = [];
  let child!: ChildProcess, exited = true, exit: Promise<void> = Promise.resolve();
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>(); let id = 0;
  const request = (command: string, data: object = {}): Promise<any> => {
    if (exited || !child.connected) return Promise.reject(Error(`${o.name} IPC disconnected`));
    return new Promise((resolveRequest, reject) => {
      const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(`${o.name} ${command} driver timeout`)); }, 8000);
      pending.set(key, { resolve: resolveRequest, reject, timer });
      try { child.send({ ...data, requestId: key, command }); } catch { pending.delete(key); clearTimeout(timer); reject(Error(`${o.name} IPC disconnected`)); }
    });
  };
  const launch = async (): Promise<void> => {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: o.serviceUrl, FTLITE_DUEL_TEST_SEED: String(o.duelTestSeed), FTLITE_ONLINE_TEST_PROBE: '1', NODE_PATH: resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL; delete env.FTLITE_SECTOR_ONLINE_TEST;
    child = spawn(electron, [resolve('scripts/network/online-app-smoke.cjs'), `--online-app-dir=${o.directory}`, '--online-app-role=guest', `--user-data-dir=${join(o.directory, 'guest')}`],
      { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    exited = false;
    child.on('message', (message: any) => { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(Error(`app-driver-command-failed (${message.command}: ${message.reason})`)) : item.resolve(message.result); });
    child.stdout!.resume(); child.stderr!.on('data', (chunk: Buffer) => { if (/APP_PAGE_ERROR|APP_DRIVER_UNCAUGHT/.test(String(chunk)) && errors.length < 20) errors.push(String(chunk).trim().slice(0, 200)); });
    exit = new Promise(done => child.once('exit', () => { exited = true; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error(`${o.name} exited`)); } pending.clear(); done(); }));
    await ready(async () => (await request('status')).text, o.name);
  };
  const kill = async (): Promise<void> => {
    if (!exited) {
      if (process.platform === 'win32') await new Promise<void>(done => { const c = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); c.once('error', () => done()); c.once('exit', () => done()); });
      else child.kill('SIGKILL');
    }
    await Promise.race([exit, delay(5000)]);
  };
  await launch();
  return {
    name: o.name, errors, network: [],   // Electron's file:// page is not watched; only the browser host matters to the injection
    async read() { const r = await request('status'); return { status: r.status, observations: r.observations, text: r.text }; },
    async click(target) { await request('click', { id: target }); },
    async type(target, text) { await request('type', { id: target, text }); },
    async key(code, down) { await request('key', { key: electronKey(code), down }); },
    async counts() { const r = await request('resource-counts'); const w = r.workers as { exited: boolean; errored: boolean }[];
      return { workers: w.length, workerExits: w.filter(x => x.exited).length, workerErrors: w.filter(x => x.errored).length, ports: r.ports }; },
    async close() { await kill(); return { prompted: false }; },   // Electron has no leave prompt (spec §3.3); the gate kills it as duel-app does
    reopen: launch,
    async dispose() { if (!exited) { try { await Promise.race([request('shutdown'), delay(6000)]); } catch { /* forced below */ } } await kill(); }
  };
}
```

- [ ] **Step 4: Write `scripts/web/net/scenario.ts`:**

```ts
// TEST ONLY (web build spec §8): one pairing of the browser network gate. Host and join through the real menu; a short
// scripted duel whose authority publication matches the guest; guest reconnect with the saved seat; rehost from the
// IndexedDB mirror after the host tab closes (through its leave prompt); then the rehosted guest leaves and every page
// port it opened is closed and its Worker terminated.
import type { GateKey, GatePlayer, GateView } from './players';

export const PAIRINGS = ['chromium-firefox', 'firefox-chromium', 'chromium-electron'] as const;
export type Pairing = (typeof PAIRINGS)[number];
export const INJECTIONS = ['origin-refused'] as const;
export type Injection = (typeof INJECTIONS)[number];
/** The duel gate's test seed (scripts/network/duel-app-smoke.ts). */
export const DUEL_TEST_SEED = 351;
export function parseWebNetArgs(argv: readonly string[]): { pairings: readonly Pairing[]; inject: Injection | null; reportPath: string } {
  const value = (name: string): string | undefined => argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const pairing = value('pairing'), inject = value('inject');
  if (pairing !== undefined && !(PAIRINGS as readonly string[]).includes(pairing)) throw Error(`unknown pairing ${pairing}`);
  if (inject !== undefined && !(INJECTIONS as readonly string[]).includes(inject)) throw Error(`unknown injection ${inject}`);
  return { pairings: pairing ? [pairing as Pairing] : PAIRINGS, inject: (inject as Injection | undefined) ?? null, reportPath: value('report-path') ?? 'out/web-ii-net/web-net.json' };
}
/** State packets can arrive out of order and a paused host stops publishing: the newest is the highest sequence. */
export function latestPublication(view: GateView): any {
  return (view.observations.at(-1)?.publications as any[] | undefined)?.reduce((a: any, p: any) => (a && a.sequence >= p.sequence ? a : p), undefined);
}
/** The newest publication the authority's own renderer and the guest both received, identical in run, sequence, tick and hash. */
export function commonPublication(host: GateView, guest: GateView): any {
  const hp: any[] = host.observations.at(-1)?.publications ?? [], gp: any[] = guest.observations.at(-1)?.publications ?? [];
  return gp.findLast(p => hp.some(q => q.runId === p.runId && q.sequence === p.sequence && q.tick === p.tick && q.hash === p.hash));
}
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const assert = (value: unknown, message: string): void => { if (!value) throw Error(message); };

export async function runPairing(h: GatePlayer, g: GatePlayer, deps: { step(label: string): void; aborted(): boolean }): Promise<Record<string, unknown>> {
  const proof: Record<string, unknown> = {};
  async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean, label: string, ms = 15000): Promise<T> {
    const end = performance.now() + ms;
    while (performance.now() < end) { if (deps.aborted()) throw Error('launcher timeout'); const v = await read(); if (ok(v)) return v; await delay(100); }
    throw Error(`${label} timeout`);
  }
  const phase = (p: GatePlayer, value: string, ms?: number): Promise<GateView> => until(() => p.read(), v => {
    if (v.status.phase === 'error' && value !== 'error') throw Error(`${p.name} ${value}: online error ${v.status.error}`);
    return v.status.phase === value;
  }, `${p.name} ${value}`, ms);
  const press = async (p: GatePlayer, code: GateKey, hold = 120): Promise<void> => { await p.key(code, true); await delay(hold); await p.key(code, false); };
  const applied = async (p: GatePlayer, seat: number): Promise<number> =>
    Math.max(0, ...((await p.read()).observations.at(-1)?.results ?? []).filter((x: any) => x.status === 'applied' && x.id.player === seat).map((x: any) => x.id.sequence as number));
  async function walkAndSit(p: GatePlayer, seat: number, route: readonly (readonly [GateKey, number])[]): Promise<void> {
    for (const [code, ms] of route) await press(p, code, ms);
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await applied(p, seat); await press(p, 'KeyE');
      try { await until(() => applied(p, seat), n => n > before, `${p.name} sat`, 1500); return; } catch { await press(p, 'KeyA', 120); }
    }
    throw Error(`${p.name} could not reach its console`);
  }

  deps.step('host and join');
  await h.click('multiplayer'); await h.click('host'); await h.click('crew-2'); await h.click('create-room');
  const lobby = await phase(h, 'lobby', 20000);
  assert(lobby.status.snapshot?.compatibility.modeId === 'duel' && lobby.status.snapshot.capacity === 2, `${h.name} made a two-seat duel room`);
  await g.click('multiplayer'); await g.click('join'); await g.type('join-code', lobby.status.snapshot!.joinCode); await g.click('join-room');
  await phase(g, 'lobby');
  await h.click('ready'); await g.click('ready');
  await until(() => h.read(), v => v.status.actions.includes('start'), 'both ready');
  await h.click('start');
  await phase(h, 'running', 20000); await phase(g, 'running', 20000);
  await until(() => g.read(), v => latestPublication(v)?.seed === DUEL_TEST_SEED, `${g.name} sees the round start`);
  proof.hostJoin = { capacity: 2, seed: DUEL_TEST_SEED };

  deps.step('scripted duel');
  // Both start standing in the Hound's mid room: the host walks to Weapons, the guest to the Helm (duel-app-smoke's routes).
  await walkAndSit(h, 0, [['KeyD', 3000], ['KeyW', 1500], ['KeyA', 300]]);
  await walkAndSit(g, 1, [['KeyD', 3000]]);
  const speedBefore = latestPublication(await h.read()).speed as number;
  await g.key('KeyW', true); await delay(2000); await g.key('KeyW', false);
  const fast = await until(async () => [latestPublication(await h.read()), latestPublication(await g.read())], ([a, b]) => a?.speed > speedBefore + 1 && b?.speed > speedBefore + 1, 'the Helm thrust shows on both');
  const agreement = await until(async () => commonPublication(await h.read(), await g.read()), x => !!x, 'the authority publication matches the guest');
  proof.duel = { speedBefore, hostSpeed: fast[0].speed, guestSpeed: fast[1].speed, agreement: { tick: agreement.tick, sequence: agreement.sequence, hash: agreement.hash } };

  deps.step('guest reconnect');
  await g.close({ prompt: false });
  await until(() => h.read(), v => { const p = latestPublication(v); return p?.present[1] === 0 && p?.phase === 'paused' && p?.pauseReason === 'peer-lost'; }, `${h.name} pauses for the lost guest`, 30000);
  await g.reopen();
  // Review R1-F2: a reload in place must get ftlite-online back (reload() throws if the online session is missing).
  if (g.reload) { await g.reload(); proof.reloadKeptOnline = true; }
  await g.click('multiplayer');
  await until(() => g.read(), v => v.status.actions.includes('reconnect'), `${g.name} offers its saved seat`);
  await g.click('reconnect');
  await phase(g, 'paused', 30000);
  await press(h, 'Escape');
  await phase(h, 'running'); await phase(g, 'running');
  await until(() => h.read(), v => latestPublication(v)?.present[1] === 1, 'the guest is present again');
  proof.reconnect = { savedSeat: true, resumedByEscape: true };

  deps.step('rehost');
  // A committed mirror whose local save finished (persistent and nothing pending).
  await until(() => g.read(), v => !!v.status.mirror.committed && !v.status.mirror.localPending && v.status.mirror.persistent, `${g.name} holds a committed, saved mirror`, 60000);
  const closed = await h.close({ prompt: true });
  assert(closed.prompted, `${h.name} closed a running match without the leave prompt`);
  const lost = await until(() => g.read(), v => v.status.phase !== 'running' && v.status.phase !== 'paused', `${g.name} sees the host go`, 30000);
  const last = lost.status.mirror.committed;
  assert(!!last && !lost.status.mirror.localPending, `${g.name} lost its committed mirror`);
  // Review R1-F4: the guest's tab (or app) goes too, so the mirror the rehost uses can only come back from IndexedDB.
  await g.close({ prompt: false });
  await g.reopen();
  // Review R2-F4: Reconnect's mirror refresh also fetches the service's checkpoint, so the status alone cannot show what
  // IndexedDB kept. Read the stored mirror-v1 straight from the database before Reconnect can touch it.
  const stored = g.storedMirror ? await g.storedMirror() : undefined;
  if (stored !== undefined) assert(stored !== null && stored.magic === 'FTLNMIR1' && stored.checkpointSequence === last!.checkpointSequence && stored.capturedTick === last!.capturedTick,
    `${g.name} IndexedDB mirror-v1 does not hold the committed checkpoint: ${JSON.stringify(stored)} vs sequence ${last!.checkpointSequence}, tick ${last!.capturedTick}`);
  await g.click('multiplayer');
  await until(() => g.read(), v => v.status.actions.includes('reconnect'), `${g.name} offers its saved seat after the host went`);
  await g.click('reconnect');
  const restored = await until(() => g.read(), v => v.status.phase === 'saved' && v.status.actions.includes('rehost') && v.status.mirror.committed?.capturedTick === last!.capturedTick,
    `${g.name} may rehost from its IndexedDB mirror (tick ${last!.capturedTick})`, 45000);
  const mirrored = restored;
  await g.click('rehost');
  const rehosted = await until(() => g.read(), v => {
    if (v.status.phase === 'error') throw Error(`${g.name} rehost: online error ${v.status.error}`);
    return v.status.role === 'host' && (v.status.phase === 'paused' || v.status.phase === 'running');
  }, `${g.name} rehosted`, 45000);
  proof.rehost = { mirroredTick: mirrored.status.mirror.committed!.capturedTick, committedSequence: last!.checkpointSequence,
    indexedDbMirror: stored === undefined ? 'not read (Electron page: the driver has no page evaluate)' : stored, phase: rehosted.status.phase, leavePrompt: true };

  deps.step('cleanup');
  await until(() => g.read(), v => v.status.actions.includes('leave'), `${g.name} can leave`);
  await g.click('leave'); await phase(g, 'idle', 20000);
  const counts = await until(() => g.counts(), c => c.ports === 0 && c.workers > 0 && c.workers === c.workerExits, `${g.name} closed its ports and terminated its Worker`, 10000);
  assert(counts.workerErrors === 0, `${g.name} Worker errors: ${counts.workerErrors}`);
  proof.cleanup = counts;
  const errors = [...h.errors, ...g.errors];
  assert(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ')}`);
  return proof;
}
```

- [ ] **Step 5: Write `scripts/web/net/web-net-smoke.ts`:**

```ts
// `npm run test:web-net` (web build spec §8 "Browser network gates"): Playwright Chromium and Firefox against local
// workerd, loopback ICE and a `vite preview` of a --test web build; pairings Chromium host + Firefox guest, Firefox host +
// Chromium guest, Chromium host + Electron guest. `--inject=origin-refused` starts workerd without the preview origin:
// the run must fail at the first pairing's host step for that reason (exit 1 with the INJECTED line; any other failure
// exits 2). The temporary root is removed exactly; no browser, Electron or workerd is killed globally.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium, firefox, type Browser } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { computeContentDigest } from '../../../build/contentDigest';
import { resolveWebBuildPlan } from '../../../build/webBuild';
import { startLocalRuntime } from '../../../services/signalling/scripts/local-runtime';
import { buildDuelObservers } from '../../network/online-observer-build';
import { buildWeb } from '../build-web';
import { createBrowserPlayer, createElectronPlayer, type GatePlayer, type NetworkEntry } from './players';
import { DUEL_TEST_SEED, parseWebNetArgs, runPairing, type Pairing } from './scenario';

function freePort(): Promise<number> {
  return new Promise((done, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const port = (s.address() as { port: number }).port; s.close(() => done(port)); }); });
}
async function main(): Promise<void> {
  const root = process.cwd(), began = performance.now(), args = parseWebNetArgs(process.argv.slice(2));
  const reportPath = resolve(args.reportPath); mkdirSync(resolve(reportPath, '..'), { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'ftlite-web-net-')), digest = computeContentDigest(root);
  const proof: Record<string, unknown> = {};
  let aborted = false; const watchdog = setTimeout(() => { aborted = true; }, 900000);
  let step = 'startup', failure: string | undefined;
  let runtime: Awaited<ReturnType<typeof startLocalRuntime>> | undefined, server: PreviewServer | undefined;
  const browsers: Browser[] = [];
  let hostNetwork: NetworkEntry[] = [], pageOrigin = '', probeStatus: number | null = null;
  try {
    const port = await freePort(), origin = `http://127.0.0.1:${port}`;
    pageOrigin = origin;
    mkdirSync(join(directory, 'service'));
    step = 'workerd';
    runtime = await startLocalRuntime(join(directory, 'service'), { allowedOrigins: args.inject === 'origin-refused' ? 'null' : `null,http://localhost:${port},${origin}` });
    step = 'web build';
    const plan = resolveWebBuildPlan(root, ['--test', '--allow-missing-paid', '--test-probe', `--service-origin=${runtime.baseUrl}`, `--duel-test-seed=${DUEL_TEST_SEED}`, `--out=${join(directory, 'web')}`], {});
    await buildWeb(root, plan);
    await buildDuelObservers(directory, digest);
    step = 'preview';
    server = await preview({ configFile: false, root, logLevel: 'warn', build: { outDir: join(directory, 'web', 'static') }, preview: { host: '127.0.0.1', port, strictPort: true } });
    const initScripts = [join(directory, 'observer', 'page-probe.js'), join(directory, 'observer', 'observer.js')];
    step = 'browsers';
    const chrome = await chromium.launch({ headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] }); browsers.push(chrome);
    const fox = await firefox.launch({ headless: true, firefoxUserPrefs: { 'media.peerconnection.ice.obfuscate_host_addresses': false, 'media.peerconnection.ice.loopback': true } }); browsers.push(fox);
    const browserOf = { chromium: chrome, firefox: fox } as const;
    for (const pairing of args.pairings as readonly Pairing[]) {
      step = pairing;
      const [hostKind, guestKind] = pairing.split('-') as ['chromium' | 'firefox', 'chromium' | 'firefox' | 'electron'];
      const players: GatePlayer[] = [];
      try {
        const host = await createBrowserPlayer({ browser: browserOf[hostKind], name: `${hostKind}-host`, url: `${origin}/`, initScripts, serviceOrigin: runtime.baseUrl }); players.push(host);
        const guest = guestKind === 'electron'
          ? await createElectronPlayer({ name: 'electron-guest', directory, serviceUrl: runtime.baseUrl, duelTestSeed: DUEL_TEST_SEED })
          : await createBrowserPlayer({ browser: browserOf[guestKind], name: `${guestKind}-guest`, url: `${origin}/`, initScripts, serviceOrigin: runtime.baseUrl });
        players.push(guest);
        proof[pairing] = await runPairing(host, guest, { step: label => { step = `${pairing}: ${label}`; console.log(`[web-net] ${step}`); }, aborted: () => aborted });
      } finally {
        if (pairing === args.pairings[0] && players[0]) hostNetwork = players[0].network.slice();   // the injection's evidence (review R1-F3)
        for (const p of players) await p.dispose();
      }
    }
    console.log(`ACTUAL BROWSER NETWORK GATES: ${args.pairings.join(', ')}: host/join, scripted duel with authority agreement, guest reconnect, rehost from the IndexedDB mirror, clean leave`);
  } catch (error) { failure = `${step}: ${String((error as Error)?.message ?? error).slice(0, 200)}`; }
  finally {
    clearTimeout(watchdog);
    for (const b of browsers) await b.close().catch(() => { failure ??= 'browser close failed'; });
    try { await server?.close(); } catch { failure ??= 'preview close failed'; }
    // The injection's service-side evidence: the same create preflight from Node, with the page's Origin, must be refused.
    if (args.inject === 'origin-refused' && runtime) probeStatus = await fetch(`${runtime.baseUrl}/v2/rooms`, { method: 'OPTIONS',
      headers: { Origin: pageOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }).then(r => r.status, () => null);
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-web-net-')) throw Error('invalid exact cleanup target');
    try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { failure ??= 'exact temporary cleanup failed'; }
  }
  // Review R1-F3: the named reason needs network evidence, not only a lobby that never came. The create is a CORS
  // request (JSON body), so the browser may send only its preflight: either Playwright saw a 403 on /v2/rooms carrying the
  // page's Origin, or it saw the create POST fail with that Origin and Node's identical preflight got 403. No create may
  // have succeeded.
  const creates = hostNetwork.filter(e => e.path === '/v2/rooms');
  const refused = creates.some(e => e.status === 403 && e.origin === pageOrigin)
    || (creates.some(e => e.method === 'POST' && e.status === null && e.origin === pageOrigin) && probeStatus === 403);
  const created = creates.some(e => e.method === 'POST' && e.status !== null && e.status >= 200 && e.status < 300);
  const report = { version: 1, digest, inject: args.inject, pairings: args.pairings, elapsedMs: Math.ceil(performance.now() - began), proof, failure: failure ?? null,
    injection: args.inject ? { creates, probeStatus, refused, created } : null, temporaryRemoved: !existsSync(directory) };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (args.inject === 'origin-refused') {
    // The named reason: the first pairing's host cannot create its room because the service refuses the page's Origin.
    // The page sees a refused CORS request either as an online error status or as a create that never reaches the lobby.
    const lobbyFailed = !!failure && /^chromium-firefox: host and join: chromium-host lobby(: online error | timeout)/.test(failure);
    if (lobbyFailed && refused && !created) { console.error(`WEB NET INJECTED FAIL (origin-refused): ${failure} (403 seen for ${pageOrigin})`); process.exitCode = 1; }
    else { console.error(`WEB NET FAIL: injection origin-refused did not fail for its named reason: ${failure ?? 'the run passed'}; refused ${refused}, created ${created}, probe ${probeStatus}`); process.exitCode = 2; }
    return;
  }
  if (failure) { console.error(`WEB NET FAIL: ${failure}`); process.exitCode = 1; return; }
  console.log(`ACTUAL BROWSER NETWORK GATE PASS (${report.elapsedMs} ms)`);
}
void main();
```

- [ ] **Step 6: Add the npm script.** In `package.json` `"scripts"`, after `"test:bg-tab": …,` add:

```json
    "test:web-net": "electron-vite build && tsx scripts/web/net/web-net-smoke.ts",
```

- [ ] **Step 7: Run the unit test and typecheck.** Run: `npx vitest run tests/webNetScenario.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 8: Run the gate.** Run: `npm run test:web-net` (up to 15 minutes) — Expected: three `[web-net] <pairing>: cleanup` lines, then `ACTUAL BROWSER NETWORK GATE PASS (<ms> ms)`, exit 0, and `out/web-ii-net/web-net.json` with `"failure": null` and `"temporaryRemoved": true`. If a pairing fails at `host and join` with an ICE or connect timeout, run that pairing alone (`npx tsx scripts/web/net/web-net-smoke.ts --pairing=<name>`) and check the machine has a non-loopback network interface (loopback ICE pairs over the host's own addresses); do not loosen an assertion.

- [ ] **Step 9: Run the injection.** Run: `npx tsx scripts/web/net/web-net-smoke.ts --inject=origin-refused --pairing=chromium-firefox --report-path=out/web-ii-net/inject-origin.json; echo "exit $?"` — Expected: `WEB NET INJECTED FAIL (origin-refused): chromium-firefox: host and join: chromium-host lobby…` (an `online error <code>` or a `timeout`) `(403 seen for http://127.0.0.1:<port>)` and `exit 1`; `out/web-ii-net/inject-origin.json` has `injection.refused: true`, `injection.created: false`. If the reason differs (exit 2), the gate is not observing what it claims: fix the gate, not the regex.

- [ ] **Step 10: Commit.**

```bash
git add scripts/web/net/players.ts scripts/web/net/scenario.ts scripts/web/net/web-net-smoke.ts package.json tests/webNetScenario.test.ts
git commit -m "test(web-ii): browser network gates (Chromium/Firefox/Electron pairings: host/join, scripted duel agreement, saved-seat reconnect, rehost from the IndexedDB mirror) with an origin-refused injection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The Web-ii gate (spec §8, §9 item 2)

**Files:**
- Modify: `docs/gates.md` (Web-ii results)
- Modify: `docs/superpowers/plans/2026-11-18-web-ii-web-build.md` (the results ledger below)

**Interfaces:**
- Consumes: everything above.
- Produces: the recorded gate.

- [ ] **Step 1: Unit and build gates.** Run, in order, and record each exit code and summary line:

```bash
npm run typecheck
npm test
npm run test:web-output
npm run test:signalling && npm run typecheck:signalling
```

Expected: all exit 0 (`npm test` may show only the known load flakes; rerun each failing file alone and record that it passes).

- [ ] **Step 2: Determinism.** Run: `npm run test:determinism`, then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/` — Expected: Node, Electron and Firefox UA PASS; `git status` clean afterwards. Then `git diff master -- src/renderer/src/sim/tuning.ts` — Expected: no `SIM_VERSION` change.

- [ ] **Step 3: Electron runtime gates** (the renderer's `main.ts` changed under all of them):

```bash
npm run test:worker-boot
npm run test:host-runtime
npm run test:rtc-runtime
npm run test:room-service-runtime
npm run test:online-app-runtime
npm run test:online-recovery-runtime
npm run test:duel-app-runtime
npx vitest run tests/onlineRecoveryInstrumentation.test.ts tests/build-output.test.ts
```

Expected: each exits 0 with its PASS line.

- [ ] **Step 4: Browser gates.** Run: `npm run test:web-net` — Expected: `ACTUAL BROWSER NETWORK GATE PASS`. Run the injection from Task 11 Step 9 — Expected: exit 1 with the `WEB NET INJECTED FAIL (origin-refused)` line.

- [ ] **Step 5: Record the results.** Fill the "Web-ii gate results" ledger at the end of this plan (head commit, versions, every command and its result, known flakes rerun alone). Append to `docs/gates.md`'s Web-ii section:

```markdown
- [x] Web-ii gate (Task 12), head <sha>: `typecheck`; `npm test` (<n> files; flakes rerun alone: <list or none>); `test:web-output` (WEB OUTPUT PASS, <N> static paths need the cookie); `test:determinism` (Node, Electron, Firefox UA); `test:signalling`, `typecheck:signalling`; Electron gates `test:worker-boot`, `test:host-runtime`, `test:rtc-runtime`, `test:room-service-runtime`, `test:online-app-runtime`, `test:online-recovery-runtime`, `test:duel-app-runtime`; browser gates `test:web-net` (chromium-firefox, firefox-chromium, chromium-electron) and the origin-refused injection (fails for its named reason). No SIM_VERSION change.
- [ ] Owner look check in a real browser (Chrome and Firefox), with a production-like local build (`npm run build:web -- --test --service-origin=<https signalling origin> --out=out/web-look` then `npx vite preview --outDir out/web-look/static`): Settings fullscreen on and off; Esc during a match in fullscreen (Chrome: Esc reaches the game, hold Esc exits; Firefox: one Esc exits fullscreen and pauses once); first click starts the menu music; a second tab shows "FTLite is already open in another tab" on Multiplayer; closing a lobby tab asks before leaving; Settings → Download playtest log after a solo round saves `ftlite-playtest-<date>-to-<date>.jsonl`.
```

- [ ] **Step 6: Commit.**

```bash
git add docs/gates.md docs/superpowers/plans/2026-11-18-web-ii-web-build.md
git commit -m "docs(web-ii): gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Web-ii gate results (filled in by Task 12)

| Gate | Command | Result |
|---|---|---|
| (to be filled by Task 12) | | |

---

## Self-review

**Spec coverage (Web-ii = §5.1-§5.4, §7, §8 browser and passcode tests):**
- §5.1 build: `vite.web.config.ts` sharing `build/rendererConfig.ts` with Electron (Task 2); entries `index.html` + the Worker (Task 2, Worker via `new URL`); `networkTransport.html` dropped/refused (Task 3 build and check); both defines (Task 2); `FTLITE_WEB_SERVICE_ORIGIN` exactly one https origin, loopback only for `--test` (Task 2); `PageOnlineConfig` define, test fields only in `--test`, production `packaged: true` (Task 2, W-1); paid-art failure and `--allow-missing-paid` (Task 2, 3); Build Output `static/`, `functions/`, `config.json` (Task 3).
- §5.2 deploy: `deploy:web`, pinned CLI, owner steps documented, no deploy run (Task 4).
- §5.3 passcode: cookie format and attributes, `/__pass` constant time, 1 s delay, only the page and `/__pass` without the cookie, `Cache-Control: private` (Task 1, Task 3 routes, W-2, W-3).
- §5.4 `version.json` no-store, polling at start and every 5 minutes on menu/lobby, banner text, never in a match (Task 3, Task 5).
- §7.1 keys/mouse (Task 6); §7.2 fullscreen + lock-or-fallback with the three conditions (Task 7); §7.3 audio (Task 8, W-7); §7.4 localStorage unchanged, `storage.persist()` on first online use (Task 8), `duelRecords` store with the caps and Download playtest log (Task 9); §7.5 Web Lock and text (Task 8, W-5); §7.6 `beforeunload` prompt, skipped in Electron, pagehide behaviour (Task 10; release and bfcache already in Web-i's page session); §7.7 checks, text, Safari note (Task 8).
- §8 browser network gates, three pairings, four checks (Task 11); passcode unit tests (Task 1) and the vercel-dev-free output check (Task 3); carried-over gates (Task 12).

**Placeholder scan:** the only fill-ins are Task 12's results ledger and the `<sha>`/counts in its gates.md line, which are measurements.

**Type consistency:** `BrowserSlice` fields (`web`, `update`, `unsupported`, `note`, `onlineBlocked`, `playtestLog`, `playtestLogText`) are defined in Task 5 and used with the same names in Tasks 8-9; `inMatch` (Task 6) is used in Task 7; `web`, `offVersion`, `offGuards`, `pageFullscreen`, `offAudio`, `offLeave` are declared in Tasks 5-10 before the Task 10 teardown that uses them; `WebBuildPlan`/`resolveWebBuildPlan`/`buildWeb` signatures match across Tasks 2, 3 and 11; `isNext`/`PASS_PATH`/`WRONG_PASSCODE_TEXT` (Task 1) are what `checkWebOutput` (Task 3) imports.
