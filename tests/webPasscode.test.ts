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
