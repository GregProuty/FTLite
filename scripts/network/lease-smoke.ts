import { build } from 'vite';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { createLauncherDeadline, stopOwnedProcess, removeOwnedDirectory } from './lease-smoke-lifecycle';

const arg = (key: string) => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const reportPath = arg('report-path');
const probe = arg('probe') ?? 'normal';
if (!['normal', 'fault', 'timeout', 'cleanup-timeout'].includes(probe)) throw Error('invalid-probe');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function association() {
  const source = ['src/worker/authorityWorker.ts', 'src/worker/authorityWorkerMain.ts', 'src/network/utilityHost.ts', 'src/network/hostRuntime.ts', 'src/network/session/leaseGate.ts',
    'src/network/modes/sector.ts', 'src/network/modes/contracts.ts', 'src/shared/sessionLease.ts', 'src/shared/hostProcessProtocol.ts',
    'src/network/host/workerHost.ts', 'src/network/transport/pageTransport.ts', 'scripts/network/lease-smoke-page.ts', 'scripts/network/lease-smoke-observer.ts', 'scripts/network/lease-smoke.html',
    'src/renderer/src/authority/core.ts', 'src/renderer/src/authority/tickDriver.ts', 'src/renderer/src/authority/authority.ts',
    'src/renderer/src/authority/replay.ts', 'src/renderer/src/sim/replay.ts', 'electron.vite.config.ts', 'build/contentDigest.ts',
    'scripts/network/lease-smoke.ts', 'scripts/network/lease-smoke.cjs', 'scripts/network/lease-smoke-lifecycle.ts'];
  const artifacts = readdirSync('out/renderer/assets').filter(name => name.endsWith('.js')).map(name => `out/renderer/assets/${name}`);
  artifacts.push('out/renderer/index.html');
  const hashes = (paths: string[]) => Object.fromEntries(paths.sort().map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 1000, windowsHide: true }).trim(),
    sourceFiles: hashes(source), artifactFiles: hashes(artifacts) };
}
async function main(): Promise<void> {
  const started = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-lease-smoke-'));
  const budgetMs = probe === 'cleanup-timeout' ? 5000 : 60000, deadline = createLauncherDeadline(started + budgetMs);
  let child: ChildProcess | undefined, status = 'FAIL', diagnostic = 'launcher-failure', details: any = null;
  let processCleanup = false, tempCleanup = false;
  let provenance: ReturnType<typeof association> | undefined, sourceDigest: string | undefined;
  const ownedPids = (): number[] => existsSync(join(directory, 'owned-pids.json')) ? JSON.parse(readFileSync(join(directory, 'owned-pids.json'), 'utf8')) : [];
  function report(): void {
    const value = { status, diagnostic, kind: 'controlled-grant-injection', realService: 'NOT RUN', osSuspend: 'NOT RUN',
      sourceDigest, provenance, probe, budgetMs, durationMs: Math.round(performance.now() - started), processCleanup, tempCleanup, details };
    if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(value, null, 2) + '\n');
    console.log(JSON.stringify({ status, diagnostic, probe, processCleanup, tempCleanup, durationMs: value.durationMs }));
  }
  // Last-resort whole-launcher bound also covers unexpected async cleanup hangs.
  const watchdog = setTimeout(() => {
    status = 'FAIL'; diagnostic = 'launcher-deadline';
    try { child?.kill('SIGKILL'); for (const pid of ownedPids()) if (Number.isSafeInteger(pid) && pid > 0) { try { process.kill(pid, 'SIGKILL'); } catch {} } } catch {}
    try { report(); } finally { process.exit(1); }
  }, deadline.remaining());
  try {
    const layout = parseShip(starter), contentDigest = computeContentDigest(process.cwd());
    sourceDigest = contentDigest; provenance = association();
    const init = { runId: randomBytes(16).toString('hex'), layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash,
      simVersion: SIM_VERSION, contentDigest, seed: 7, playerCount: 2, characters: [0, 0], unlocked: [] };
    writeFileSync(join(directory, 'fixture.json'), JSON.stringify({ init }));
    await build({ configFile: false, envDir: false, logLevel: 'warn', root: resolve('scripts/network'), base: './', worker: { format: 'es' },
      define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(contentDigest) },
      build: { outDir: join(directory, 'page'), emptyOutDir: true, rollupOptions: { input: { lease: resolve('scripts/network/lease-smoke.html') } } } });
    await build({ configFile: false, envDir: false, logLevel: 'warn', build: { outDir: join(directory, 'page'), emptyOutDir: false,
      lib: { entry: resolve('scripts/network/lease-smoke-observer.ts'), formats: ['es'], fileName: () => 'lease-observer.js' } } });
    writeFileSync(join(directory, 'page/worker-wrapper.js'), `import './lease-observer.js';\nimport ${JSON.stringify(pathToFileURL(resolve('out/renderer/assets/authorityWorker.js')).href)};\n`);
    if (typeof electron !== 'string' || !existsSync(resolve('out/renderer/assets/authorityWorker.js'))) throw Error('missing-built-runtime');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    child = spawn(electron, [resolve('scripts/network/lease-smoke.cjs'), `--lease-smoke-dir=${directory}`,
      `--user-data-dir=${join(directory, 'profile')}`, `--lease-probe=${probe}`], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    await new Promise<void>((done, reject) => {
      const budget = probe === 'timeout' || probe === 'cleanup-timeout' ? Math.min(2500, deadline.remaining(2000)) : deadline.remaining(10000);
      const timer = setTimeout(() => reject(Error('launcher-timeout')), budget);
      child!.once('error', () => { clearTimeout(timer); reject(Error('native-launch-failed')); });
      child!.once('exit', (code, signal) => { clearTimeout(timer); code === 0 && !signal ? done() : reject(Error('native-probe-failed')); });
    });
    details = JSON.parse(readFileSync(join(directory, 'native-report.json'), 'utf8'));
    if (probe !== 'normal' || details.status !== 'PASS' || details.workers !== 2 || details.workerExits !== 2 || details.windows !== 0
      || details.stallMs < 16000 || !details.delayedMatchingRejected || !details.freshPaused || !details.explicitResume) throw Error('missing-native-evidence');
    status = 'PASS'; diagnostic = 'controlled-grant-proof';
  } catch (error) {
    const allowed = ['launcher-timeout', 'native-launch-failed', 'native-probe-failed', 'missing-built-runtime', 'missing-native-evidence'];
    diagnostic = error instanceof Error && allowed.includes(error.message) ? error.message : 'launcher-failure';
    if (existsSync(join(directory, 'native-report.json'))) details = JSON.parse(readFileSync(join(directory, 'native-report.json'), 'utf8'));
  } finally {
    try {
      if (child) try {
        await stopOwnedProcess(child, deadline, probe !== 'cleanup-timeout' ? undefined : target => {
          // Test-only slow killer: do the real owned-tree kill, then deliberately
          // keep its wrapper alive to prove the killer's own wait is bounded.
          if (process.platform !== 'win32') target.kill('SIGKILL');
          return spawn(process.execPath, ['-e', process.platform === 'win32'
            ? "require('node:child_process').spawn('taskkill',['/PID',process.argv[1],'/T','/F'],{windowsHide:true,stdio:'ignore'}).once('exit',()=>setInterval(()=>{},1000))"
            : 'setInterval(()=>{},1000)', String(target.pid)], { windowsHide: true, stdio: 'ignore' });
        });
      } catch { status = 'FAIL'; diagnostic = 'cleanup-timeout'; }
      processCleanup = (!child?.pid || !alive(child.pid)) && ownedPids().every(pid => !alive(pid));
      const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
      if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-lease-smoke-')) throw Error('invalid-owned-cleanup');
      if (!processCleanup) throw Error('owned-process-leak');
      await removeOwnedDirectory(target, deadline); tempCleanup = !existsSync(target);
    } catch (error) {
      status = 'FAIL'; diagnostic = error instanceof Error && ['invalid-owned-cleanup', 'owned-process-leak', 'cleanup-timeout'].includes(error.message) ? error.message : 'cleanup-failure';
    }
    // Do not disarm the absolute deadline: a timed-out filesystem operation or
    // child handle may still be alive. Unref lets a fully cleaned launcher exit
    // immediately, while any remaining owned handle is still bounded by it.
    report(); watchdog.unref();
    if (status !== 'PASS' || !processCleanup || !tempCleanup) process.exitCode = 1;
  }
}
main().catch(() => { console.error('lease-smoke-cleanup-failure'); process.exitCode = 1; });
