// Continuous deployment's paid-art step (owner 2026-11-19): it fails closed and never shows the token.
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artTarballUrl, fetchPaidArt, resolveArtSource } from '../scripts/web/fetch-paid-art';

const TOKEN = 'github_pat_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3';
const dirs: string[] = [];
const tempDir = (): string => { const d = mkdtempSync(join(tmpdir(), 'ftlite-art-test-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A GitHub-style tarball: everything under one <owner>-<repo>-<sha>/ directory. */
function tarball(): Buffer {
  const src = tempDir(), top = join(src, 'me-FTLite-art-abc1234');
  mkdirSync(join(top, '2mt'), { recursive: true }); writeFileSync(join(top, '2mt', 'ship.png'), 'png');
  writeFileSync(join(top, 'README.md'), 'readme');
  return execFileSync('tar', ['-czf', '-', '-C', src, 'me-FTLite-art-abc1234']);
}

describe('resolveArtSource', () => {
  it('reads the repo, the ref (default main) and the token', () => {
    expect(resolveArtSource({ FTLITE_ART_REPO: 'me/FTLite-art', FTLITE_ART_TOKEN: TOKEN })).toEqual({ repo: 'me/FTLite-art', ref: 'main', token: TOKEN });
    expect(resolveArtSource({ FTLITE_ART_REPO: 'me/FTLite-art', FTLITE_ART_TOKEN: TOKEN, FTLITE_ART_REF: 'v2' }).ref).toBe('v2');
  });
  it('refuses a missing or malformed repo, ref or token without echoing the token', () => {
    for (const env of [{ FTLITE_ART_TOKEN: TOKEN }, { FTLITE_ART_REPO: 'me', FTLITE_ART_TOKEN: TOKEN }, { FTLITE_ART_REPO: 'me/a/b', FTLITE_ART_TOKEN: TOKEN },
      { FTLITE_ART_REPO: 'me/a', FTLITE_ART_TOKEN: TOKEN, FTLITE_ART_REF: '../x' }, { FTLITE_ART_REPO: 'me/a' }, { FTLITE_ART_REPO: 'me/a', FTLITE_ART_TOKEN: 'short' },
      { FTLITE_ART_REPO: 'me/a', FTLITE_ART_TOKEN: TOKEN + ' x' }]) {
      let message = '';
      try { resolveArtSource(env); } catch (e) { message = (e as Error).message; }
      expect(message).toMatch(/^fetch-paid-art: /);
      expect(message).not.toContain(TOKEN);
    }
  });
  it('builds the GitHub tarball URL', () => {
    expect(artTarballUrl({ repo: 'me/FTLite-art', ref: 'main' })).toBe('https://api.github.com/repos/me/FTLite-art/tarball/main');
  });
});

describe('fetchPaidArt', () => {
  it('downloads with the token, strips the top directory and drops the README', async () => {
    const root = tempDir(), body = tarball();
    let seen: { url: string; auth: string | null } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get('authorization') };
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchPaidArt(root, { repo: 'me/FTLite-art', ref: 'main', token: TOKEN }, fake)).toBe('fetched');
    expect(seen).toEqual({ url: 'https://api.github.com/repos/me/FTLite-art/tarball/main', auth: `Bearer ${TOKEN}` });
    expect(readFileSync(join(root, 'public/assets/paid/2mt/ship.png'), 'utf8')).toBe('png');
    expect(existsSync(join(root, 'public/assets/paid/README.md'))).toBe(false);
  });
  it('keeps art that is already there and downloads nothing', async () => {
    const root = tempDir(); mkdirSync(join(root, 'public/assets/paid/maru'), { recursive: true });
    const fake = (async () => { throw Error('must not fetch'); }) as unknown as typeof fetch;
    expect(await fetchPaidArt(root, { repo: 'me/a', ref: 'main', token: TOKEN }, fake)).toBe('present');
  });
  it('fails closed on a refused download, naming the status but never the token', async () => {
    const root = tempDir();
    const fake = (async () => new Response('Bad credentials ' + TOKEN, { status: 401 })) as unknown as typeof fetch;
    const error = await fetchPaidArt(root, { repo: 'me/a', ref: 'main', token: TOKEN }, fake).catch(e => e as Error);
    expect((error as Error).message).toMatch(/GitHub answered 401/);
    expect((error as Error).message).not.toContain(TOKEN);
    expect(existsSync(join(root, 'public/assets/paid'))).toBe(false);
  });
});
