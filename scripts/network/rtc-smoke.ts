import { build } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';

async function main() {
  const temporary = mkdtempSync(join(tmpdir(), 'ftlite-rtc-smoke-'));
  let child: ChildProcess | undefined;
  try {
    await build({ configFile: false, logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(computeContentDigest(process.cwd())) },
      build: { outDir: join(temporary, 'client'), lib: { entry: resolve('scripts/network/rtc-smoke-client.ts'), formats: ['cjs'], fileName: () => 'rtc-smoke-client.cjs' } } });
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    child = spawn(electron, [resolve('scripts/network/rtc-smoke.cjs'), `--rtc-smoke-dir=${temporary}`, `--user-data-dir=${join(temporary, 'profile')}`],
      { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', data => process.stdout.write(data)); child.stderr!.on('data', data => process.stderr.write(data));
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(Error('native pair child timeout')), 45000);
      child!.once('error', error => { clearTimeout(timer); reject(error); });
      child!.once('exit', (code, signal) => { clearTimeout(timer); code === 0 && !signal ? done() : reject(Error(`native pair child failed: ${code}/${signal}`)); });
    });
    const report = JSON.parse(readFileSync(join(temporary, 'report.json'), 'utf8'));
    if (report.electron !== '37.10.3' || report.publicationSequence < 1 || report.utilities !== 1 || report.exits !== 1 || report.windows !== 0
      || report.caps.join(',') !== '16088,16088') throw Error('missing actual native proof');
    console.log('ACTUAL RTC pair PASS; Electron child exit=0 observed. Internet/TURN/WAN: NOT RUN.');
  } finally {
    // Only this invocation's child tree is eligible for timeout cleanup.
    if (child?.pid && child.exitCode === null && !child.signalCode) {
      if (process.platform === 'win32') await new Promise<void>(done => {
        const cleanup = spawn('taskkill', ['/PID', String(child!.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        cleanup.once('error', () => done()); cleanup.once('exit', () => done());
      }); else child.kill('SIGKILL');
    }
    const target = resolve(temporary), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-rtc-smoke-')) throw Error('invalid cleanup target');
    rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    if (existsSync(target)) throw Error('isolated profile cleanup failed');
    console.log('ACTUAL RTC isolated profile removed: true');
  }
}
main().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
