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
