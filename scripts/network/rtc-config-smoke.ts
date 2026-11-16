import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { createLauncherDeadline, removeOwnedDirectory, stopOwnedProcess } from './lease-smoke-lifecycle';

async function main() {
  const began = performance.now(), deadline = createLauncherDeadline(began + 20000);
  const directory = mkdtempSync(join(tmpdir(), 'ftlite-rtc-config-'));
  let child: ChildProcess | undefined, observedExit = false, proof: any;
  const source = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim(),
    hashes: Object.fromEntries(['scripts/network/rtc-config-smoke.cjs', 'scripts/network/rtc-config-smoke.ts', ...readdirSync('out', { recursive: true }).filter(p => /\.(js|html)$/.test(String(p))).map(p => 'out/' + String(p).replaceAll('\\', '/'))]
      .map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])) };
  try {
    if (typeof electron !== 'string') throw Error('native-executable-missing');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL; delete env.CHROME_CRASHPAD_PIPE_NAME;
    child = spawn(electron, [resolve('scripts/network/rtc-config-smoke.cjs'), `--rtc-config-dir=${directory}`, `--user-data-dir=${join(directory, 'profile')}`, `--content-digest=${computeContentDigest(process.cwd())}`], { env, windowsHide: true, stdio: 'ignore' });
    await deadline.wait(new Promise<void>((done, reject) => {
      child!.once('error', () => reject(Error('native-start-failed')));
      child!.once('exit', (code, signal) => { observedExit = true; code === 0 && !signal ? done() : reject(Error('native-config-failed')); });
    }), 'native-config-timeout', 5000);
    proof = JSON.parse(readFileSync(join(directory, 'proof.json'), 'utf8'));
    if (proof.electron !== '37.10.3' || proof.peersClosed !== 2 || proof.windows !== 0 || proof.routeEstablished !== false
      || proof.checks?.length !== 2 || !['all', 'relay'].every(policy => proof.checks.some((c: any) => c.policy === policy && c.servers === 1 && c.urls === 2 && c.credentialsPreserved && c.noGathering && c.noDescription))) throw Error('native-proof-invalid');
  } finally {
    if (child) await stopOwnedProcess(child, deadline);
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-rtc-config-')) throw Error('cleanup-target-invalid');
    await removeOwnedDirectory(target, deadline);
  }
  const report = { ...proof, source, processExitObserved: observedExit, temporaryRemoved: !existsSync(directory), elapsedMs: Math.round(performance.now() - began) };
  const reportPath = process.argv.find(a => a.startsWith('--report-path='))?.slice(14);
  if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
  console.log('Native ICE configuration PASS; no gathering/provider/relay route attempted; owned child exited and profile removed.');
}
main().catch(() => { console.error('native-config-probe-failed'); process.exitCode = 1; });
