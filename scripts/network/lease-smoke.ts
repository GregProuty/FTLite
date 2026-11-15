import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';

const arg = (key: string) => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const reportPath = arg('report-path');
const probe = arg('probe') ?? 'normal';
if (!['normal', 'fault', 'timeout'].includes(probe)) throw Error('invalid-probe');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function killOwned(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode) return;
  if (process.platform === 'win32') await new Promise<void>((resolveKill, reject) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('error', reject); killer.once('exit', () => resolveKill());
  }); else child.kill('SIGKILL');
  if (child.exitCode === null && !child.signalCode) await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(Error('owned-process-exit-timeout')), 3000);
    child.once('exit', () => { clearTimeout(timer); done(); });
  });
}
async function main(): Promise<void> {
  const started = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-lease-smoke-'));
  let child: ChildProcess | undefined, status = 'FAIL', diagnostic = 'launcher-failure', details: any = null;
  let processCleanup = false, tempCleanup = false;
  try {
    const layout = parseShip(starter), contentDigest = computeContentDigest(process.cwd());
    const init = { runId: randomBytes(16).toString('hex'), layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash,
      simVersion: SIM_VERSION, contentDigest, seed: 7, playerCount: 2, characters: [0, 0], unlocked: [] };
    writeFileSync(join(directory, 'fixture.json'), JSON.stringify({ init }));
    if (typeof electron !== 'string' || !existsSync(resolve('out/main/authorityHost.js'))) throw Error('missing-built-runtime');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    child = spawn(electron, [resolve('scripts/network/lease-smoke.cjs'), `--lease-smoke-dir=${directory}`,
      `--user-data-dir=${join(directory, 'profile')}`, `--lease-probe=${probe}`], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    await new Promise<void>((done, reject) => {
      const budget = probe === 'timeout' ? 2500 : Math.max(1, 55000 - (performance.now() - started));
      const timer = setTimeout(() => reject(Error('launcher-timeout')), budget);
      child!.once('error', () => { clearTimeout(timer); reject(Error('native-launch-failed')); });
      child!.once('exit', (code, signal) => { clearTimeout(timer); code === 0 && !signal ? done() : reject(Error('native-probe-failed')); });
    });
    details = JSON.parse(readFileSync(join(directory, 'native-report.json'), 'utf8'));
    if (probe !== 'normal' || details.status !== 'PASS' || details.utilities !== 2 || details.exits !== 2 || details.windows !== 0
      || details.stallMs < 16000 || !details.delayedMatchingRejected || !details.freshPaused || !details.explicitResume) throw Error('missing-native-evidence');
    status = 'PASS'; diagnostic = 'controlled-grant-proof';
  } catch (error) {
    const allowed = ['launcher-timeout', 'native-launch-failed', 'native-probe-failed', 'missing-built-runtime', 'missing-native-evidence'];
    diagnostic = error instanceof Error && allowed.includes(error.message) ? error.message : 'launcher-failure';
    if (existsSync(join(directory, 'native-report.json'))) details = JSON.parse(readFileSync(join(directory, 'native-report.json'), 'utf8'));
  } finally {
    if (child) await killOwned(child);
    const pids: number[] = existsSync(join(directory, 'owned-pids.json')) ? JSON.parse(readFileSync(join(directory, 'owned-pids.json'), 'utf8')) : [];
    processCleanup = (!child?.pid || !alive(child.pid)) && pids.every(pid => !alive(pid));
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-lease-smoke-')) throw Error('invalid-owned-cleanup');
    if (!processCleanup) throw Error('owned-process-leak');
    rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); tempCleanup = !existsSync(target);
    const report = { status, diagnostic, kind: 'controlled-grant-injection', realService: 'NOT RUN', osSuspend: 'NOT RUN',
      sourceDigest: computeContentDigest(process.cwd()), probe, durationMs: Math.round(performance.now() - started), processCleanup, tempCleanup, details };
    if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status, diagnostic, probe, processCleanup, tempCleanup, durationMs: report.durationMs }));
    if (status !== 'PASS' || !processCleanup || !tempCleanup) process.exitCode = 1;
  }
}
main().catch(() => { console.error('lease-smoke-cleanup-failure'); process.exitCode = 1; });
