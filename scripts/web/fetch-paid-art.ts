// Continuous deployment (owner 2026-11-19, amending web build spec D2): a Git-triggered Vercel build has no paid art,
// because the game repo is public and public/assets/paid is gitignored. This step downloads it from a private GitHub
// repo (its root holds what public/assets/paid holds: 2mt/, limezu/, maru/, pimen/) before `build:web` runs.
//   FTLITE_ART_REPO   owner/name of the private art repo
//   FTLITE_ART_TOKEN  a fine-grained GitHub token with read-only Contents access to that repo only
//   FTLITE_ART_REF    optional branch, tag or commit (default main)
// It fails closed: no token, a bad repo name, a failed download or an empty result stops the build, and build:web's
// own paid-art check stops it again. The token never reaches stdout, stderr or an error message.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ArtSource { repo: string; ref: string; token: string }

export function resolveArtSource(env: Readonly<Record<string, string | undefined>>): ArtSource {
  const repo = env.FTLITE_ART_REPO ?? '', ref = env.FTLITE_ART_REF || 'main', token = env.FTLITE_ART_TOKEN ?? '';
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw Error('fetch-paid-art: FTLITE_ART_REPO must be owner/name of the private art repo');
  if (!/^[A-Za-z0-9._\/-]+$/.test(ref) || ref.includes('..')) throw Error('fetch-paid-art: FTLITE_ART_REF must be a plain branch, tag or commit');
  if (!/^[A-Za-z0-9_]{20,}$/.test(token)) throw Error('fetch-paid-art: FTLITE_ART_TOKEN is missing or not a GitHub token');
  return { repo, ref, token };
}

export function artTarballUrl(source: Pick<ArtSource, 'repo' | 'ref'>): string {
  return `https://api.github.com/repos/${source.repo}/tarball/${source.ref.split('/').map(encodeURIComponent).join('/')}`;
}

/** True when the directory exists and has entries: a local checkout keeps its own art and nothing is downloaded. */
export function paidArtPresent(dir: string): boolean { return existsSync(dir) && readdirSync(dir).length > 0; }

export async function fetchPaidArt(root: string, source: ArtSource, fetchImpl: typeof fetch = fetch): Promise<'present' | 'fetched'> {
  const dest = join(root, 'public', 'assets', 'paid');
  if (paidArtPresent(dest)) return 'present';
  const response = await fetchImpl(artTarballUrl(source), { headers: {
    Authorization: `Bearer ${source.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ftlite-build' } });
  if (!response.ok) throw Error(`fetch-paid-art: GitHub answered ${response.status} for ${source.repo}@${source.ref} (check the repo name, the ref and the token's access)`);
  const archive = Buffer.from(await response.arrayBuffer());
  mkdirSync(dest, { recursive: true });
  // GitHub's tarball wraps everything in one <owner>-<repo>-<sha>/ directory. The archive goes in on stdin: GNU tar reads
  // a C: path given to -f or -C as a remote host, so it reads stdin and unpacks in dest as its working directory.
  execFileSync('tar', ['-xzf', '-', '--strip-components=1'], { cwd: dest, input: archive, stdio: ['pipe', 'ignore', 'inherit'] });
  for (const name of ['README.md', 'README.txt', '.gitignore', '.gitattributes']) rmSync(join(dest, name), { force: true });
  if (!paidArtPresent(dest)) throw Error(`fetch-paid-art: ${source.repo}@${source.ref} unpacked to nothing`);
  return 'fetched';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  void (async () => {
    if (paidArtPresent(join(root, 'public', 'assets', 'paid'))) { console.log('PAID ART: already present, nothing downloaded'); return; }
    const source = resolveArtSource(process.env);
    await fetchPaidArt(root, source);
    console.log(`PAID ART: fetched ${source.repo}@${source.ref} into public/assets/paid (${readdirSync(join(root, 'public', 'assets', 'paid')).join(', ')})`);
  })().catch(error => { console.error(String((error as Error)?.message ?? error)); process.exitCode = 1; });
}
