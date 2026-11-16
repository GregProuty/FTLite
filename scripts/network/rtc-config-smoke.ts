import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { createLauncherDeadline, removeOwnedDirectory, stopOwnedProcess } from './lease-smoke-lifecycle';

type Owned = { child: ChildProcess; kind: 'git' | 'native'; pid?: number; exited: boolean; forced: boolean; code: number | null; done: Promise<void> };
async function main() {
  const began = performance.now(), budgetMs = 20000, deadline = createLauncherDeadline(began + budgetMs);
  const directory = mkdtempSync(join(tmpdir(), 'ftlite-rtc-config-'));
  const processes: Owned[] = [];
  let source: unknown = null, proof: any, failure: string | undefined, directoryCleanupAttempted = false, cleanupFailed = false, stage = 'preparation';
  function own(command: string, args: string[], kind: Owned['kind'], env = process.env) {
    const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const owned: Owned = { child, kind, pid: child.pid, exited: false, forced: false, code: null, done: undefined as unknown as Promise<void> };
    owned.done = new Promise<void>((done, reject) => {
      child.once('error', () => reject(Error('owned-start-failed')));
      child.once('exit', code => { owned.exited = true; owned.code = code; });
      child.once('close', () => done());
    });
    void owned.done.catch(() => {}); processes.push(owned); return owned;
  }
  async function git(args: string[]) {
    if (!deadline.remaining(5000)) throw Error('preparation-timeout');
    const slow = process.argv.includes('--inject-git-timeout') && processes.length === 0;
    const owned = slow ? own(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 'git') : own('git', args, 'git');
    let output = '', tooLarge = false;
    owned.child.stdout!.on('data', (chunk: Buffer) => { if (Buffer.byteLength(output) + chunk.byteLength > 1048576) tooLarge = true; else if (!tooLarge) output += chunk.toString('utf8'); });
    await deadline.wait(owned.done, 'preparation-timeout', 5000);
    if (owned.code !== 0 || tooLarge) throw Error('preparation-failed');
    return output.trim();
  }
  try {
    const revision = await git(['rev-parse', 'HEAD']), dirty = !!await git(['status', '--porcelain']);
    // Safely reproduce missing/unreadable build preparation without changing repository artifacts.
    if (process.argv.includes('--inject-preparation-read-failure')) readFileSync(join(directory, 'missing-build-artifact.js'));
    const hashes = Object.fromEntries(['scripts/network/rtc-config-smoke.cjs', 'scripts/network/rtc-config-smoke.ts', ...readdirSync('out', { recursive: true }).filter(p => /\.(js|html)$/.test(String(p))).map(p => 'out/' + String(p).replaceAll('\\', '/'))]
      .map(path => { if (!deadline.remaining(5000)) throw Error('preparation-timeout'); return [path, createHash('sha256').update(readFileSync(path)).digest('hex')]; }));
    source = { revision, dirty, hashes };
    if (typeof electron !== 'string') throw Error('native-executable-missing');
    const digest = computeContentDigest(process.cwd());
    if (!deadline.remaining(5000)) throw Error('preparation-timeout');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL; delete env.CHROME_CRASHPAD_PIPE_NAME;
    stage = 'native';
    const owned = own(electron, [resolve('scripts/network/rtc-config-smoke.cjs'), `--rtc-config-dir=${directory}`, `--user-data-dir=${join(directory, 'profile')}`, `--content-digest=${digest}`], 'native', env);
    owned.child.stdout!.resume();
    await deadline.wait(owned.done, 'native-config-timeout', 5000);
    if (owned.code !== 0) throw Error('native-config-failed');
    proof = JSON.parse(readFileSync(join(directory, 'proof.json'), 'utf8'));
    if (proof.electron !== '37.10.3' || proof.peersClosed !== 2 || proof.windows !== 0 || proof.routeEstablished !== false
      || proof.checks?.length !== 2 || !['all', 'relay'].every(policy => proof.checks.some((c: any) => c.policy === policy && c.servers === 1 && c.urls === 2 && c.credentialsPreserved && c.noGathering && c.noDescription))) throw Error('native-proof-invalid');
  } catch (error) {
    failure = stage === 'preparation' ? (error instanceof Error && error.message === 'preparation-timeout' ? 'preparation-timeout' : 'preparation-failed') : 'native-config-failed';
  } finally {
    try {
      for (const owned of processes) {
        try {
          owned.forced = !!owned.pid && !owned.exited;
          await stopOwnedProcess(owned.child, deadline);
          if (owned.pid) await deadline.wait(owned.done, 'cleanup-timeout', 1000);
          // Exercise a rejected stop operation safely, after the real process has exited.
          if (owned === processes[0] && process.argv.includes('--inject-cleanup-stop-failure')) throw Error('injected-stop-failure');
        } catch { cleanupFailed = true; failure ??= 'cleanup-failed'; }
      }
    } catch { cleanupFailed = true; failure ??= 'cleanup-failed'; }
    finally {
      directoryCleanupAttempted = true;
      try {
        const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
        if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-rtc-config-')) throw Error('cleanup-target-invalid');
        await removeOwnedDirectory(target, deadline);
      } catch { cleanupFailed = true; failure ??= 'cleanup-failed'; }
    }
  }
  const report = { ...proof, source, failure: failure ?? null, budgetMs,
    processes: processes.map(({ kind, pid, exited, forced, code }) => ({ kind, pid, exited, forced, code })),
    nativeAllocated: processes.some(p => p.kind === 'native'), processExitObserved: processes.some(p => p.kind === 'native' && p.exited),
    temporaryName: basename(directory), directoryCleanupAttempted, cleanupFailed, temporaryRemoved: !existsSync(directory), elapsedMs: Math.round(performance.now() - began) };
  const reportPath = process.argv.find(a => a.startsWith('--report-path='))?.slice(14);
  if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
  if (failure) { console.error(failure); process.exitCode = 1; }
  else console.log('Native ICE configuration PASS; no gathering/provider/relay route attempted; owned children exited and profile removed.');
}
main().catch(() => { console.error('native-config-probe-failed'); process.exitCode = 1; });
