import { build } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { startLocalRuntime } from '../../services/signalling/scripts/local-runtime';
import { validateRoomServiceReport } from './room-service-report';

async function main() {
  const began = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-room-service-'));
  let runtime: Awaited<ReturnType<typeof startLocalRuntime>> | undefined, child: ChildProcess | undefined;
  let exit: Promise<void> | undefined, electronExited = false, hibernated = false, report: any;
  try {
    runtime = await startLocalRuntime(directory);
    const digest = computeContentDigest(process.cwd());
    await build({ configFile: false, envDir: false, logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(directory, 'client'), emptyOutDir: false, lib: { name: 'RtcSmoke', entry: resolve('scripts/network/rtc-smoke-client.ts'),
        formats: ['cjs', 'iife'], fileName: format => `rtc-smoke-client.${format === 'cjs' ? 'cjs' : 'js'}` } } });
    await build({ configFile: false, envDir: false, logLevel: 'warn', build: { outDir: join(directory, 'client'), emptyOutDir: false,
      lib: { entry: resolve('src/network/session/serviceClient.ts'), formats: ['cjs'], fileName: () => 'service-client.cjs' } } });
    writeFileSync(join(directory, 'client/index.html'), '<!doctype html><meta charset="utf-8"><title>Local Worker/native RTC gate</title><p>Actual local service and native RTC guest</p><script src="rtc-smoke-client.js"></script>');
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    child = spawn(electron, [resolve('scripts/network/room-service-smoke.cjs'), `--room-service-dir=${directory}`,
      `--service-url=${runtime.baseUrl}`, `--user-data-dir=${join(directory, 'profile')}`, ...process.argv.slice(2)],
    { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout!.on('data', data => process.stdout.write(data)); child.stderr!.on('data', data => process.stderr.write(data));
    exit = new Promise(done => child!.once('exit', () => { electronExited = true; done(); }));
    let requested = false;
    child.on('message', async message => {
      if (message !== 'hibernate' || requested) return;
      requested = true;
      try {
        await runtime!.hibernate(); hibernated = true;
        if (process.argv.includes('--inject-worker-failure')) runtime!.kill();
        child!.send('hibernated');
      } catch { child!.send('runtime-failed'); }
    });
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(Error('local service native child timeout')), 45000);
      child!.once('error', () => { clearTimeout(timer); reject(Error('Electron launch failed')); });
      child!.once('exit', (code, signal) => { clearTimeout(timer); code === 0 && !signal ? done() : reject(Error(`native service child failed: ${code}/${signal}`)); });
    });
    report = JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8'));
    const files = readdirSync(join(directory, 'sqlite'), { recursive: true });
    report.workerd = runtime.workerdVersion;
    report.runtime = { sqlite: files.some(file => String(file).endsWith('.sqlite')), hibernated, electronExit: electronExited };
  } finally {
    if (child?.pid && !electronExited) {
      if (process.platform === 'win32') await new Promise<void>(done => {
        const cleanup = spawn('taskkill', ['/PID', String(child!.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        cleanup.once('error', () => done()); cleanup.once('exit', () => done());
      }); else child.kill('SIGKILL');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (exit) await Promise.race([exit, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Electron exit not observed')), 5000); })]);
    } finally {
      clearTimeout(timer);
      try { await runtime?.dispose(); }
      finally {
        const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
        if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-room-service-')) throw Error('invalid cleanup target');
        rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
        if (existsSync(target)) throw Error('local service temporary removal failed');
        console.log(`LOCAL SERVICE cleanup: workerdExit=${runtime?.exited() ?? false}, electronExit=${electronExited}, temporaryRemoved=true`);
      }
    }
  }
  report.runtime.workerExit = runtime!.exited(); report.runtime.temporaryRemoved = !existsSync(directory);
  const reportPath = process.argv.find(arg => arg.startsWith('--report-path='))?.slice('--report-path='.length);
  if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
  validateRoomServiceReport(report);
  console.log(`ACTUAL LOCAL SERVICE/native RTC PASS: ${(performance.now() - began).toFixed(0)}ms; workerd ${report.workerd}; Electron ${report.electron}.`);
  console.log('TURN provider requests/WAN/forced relay/two physical computers/utility lease gate: NOT RUN.');
}
main().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
