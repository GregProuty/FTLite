import { build } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { createAuthority } from '../../src/renderer/src/authority/authority';
import { validateCheckpoint } from '../../src/renderer/src/authority/checkpoint';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { loadSnapshot, saveSnapshot } from '../../src/renderer/src/sim/snapshot';
import { Position } from '../../src/renderer/src/sim/components';
import { disposeSimState } from '../../src/renderer/src/sim/state';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { canonicalFields } from '../../src/renderer/src/sim/canonicalFields';
import { validateRtcReport } from './rtc-smoke-report';

async function main() {
  const started = performance.now();
  const temporary = mkdtempSync(join(tmpdir(), 'ftlite-rtc-smoke-'));
  let child: ChildProcess | undefined, exited: Promise<void> | undefined, observedChildExit = false;
  try {
    const digest = computeContentDigest(process.cwd()), layout = parseShip(starter);
    const init = { runId: 'rtc-runtime', layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash,
      simVersion: SIM_VERSION, contentDigest: digest, seed: 7, playerCount: 2, characters: [0, 1], unlocked: [] };
    const authority = createAuthority({ clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, resolveLayout: () => layout,
      contentDigest: digest, onCrash: () => { throw Error('fixture authority crashed'); } });
    authority.start(init); const checkpoint = authority.checkpoint([]); authority.dispose();
    const state = loadSnapshot(layout, checkpoint.snapshot, digest);
    try {
      state.run.event = 0; state.run.eventChoice = -1; state.run.eventOpenTick = -1;
      state.run.voteTick = -1; state.run.vote.fill(-1); state.director.nextSpawnTick = 1e9;
      Position.x[state.crew[0]!] = 5.5; Position.y[state.crew[0]!] = 5.5;
      checkpoint.snapshot = saveSnapshot(state, digest);
    } finally { disposeSimState(state); }
    validateCheckpoint(layout, checkpoint, digest);
    writeFileSync(join(temporary, 'fixture.json'), JSON.stringify({ checkpoint,
      offsets: Object.fromEntries(canonicalFields(layout, 2).map(field => [field.name, field.offset])) }));
    await build({ configFile: false, logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(temporary, 'client'), emptyOutDir: false, lib: { name: 'RtcSmoke', entry: resolve('scripts/network/rtc-smoke-client.ts'),
        formats: ['cjs', 'iife'], fileName: format => `rtc-smoke-client.${format === 'cjs' ? 'cjs' : 'js'}` } } });
    writeFileSync(join(temporary, 'client/index.html'), '<!doctype html><meta charset="utf-8"><title>FTLite native RTC gate</title><p>Visible guest producer — native local RTC regression gate</p><script src="rtc-smoke-client.js"></script>');
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    child = spawn(electron, [resolve('scripts/network/rtc-smoke.cjs'), `--rtc-smoke-dir=${temporary}`, `--user-data-dir=${join(temporary, 'profile')}`, ...process.argv.slice(2)],
      { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', data => process.stdout.write(data)); child.stderr!.on('data', data => process.stderr.write(data));
    exited = new Promise<void>(done => child!.once('exit', () => { observedChildExit = true; done(); }));
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(Error('native pair child timeout')), 45000);
      child!.once('error', error => { clearTimeout(timer); reject(error); });
      child!.once('exit', (code, signal) => { clearTimeout(timer); code === 0 && !signal ? done() : reject(Error(`native pair child failed: ${code}/${signal}`)); });
    });
    const report = JSON.parse(readFileSync(join(temporary, 'report.json'), 'utf8'));
    const reportPath = process.argv.find(argument => argument.startsWith('--report-path='))?.slice('--report-path='.length);
    if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
    validateRtcReport(report);
    console.log(`ACTUAL RTC runtime PASS: ${report.checks.length} required checks; Electron child exit=0 observed; ${(performance.now() - started).toFixed(0)}ms.`);
    console.log('Internet/WAN/forced TURN/two physical computers/actual OS suspend: NOT RUN. Injected loss is harness loss; stats loss=0 means unavailable.');
  } finally {
    // Only this invocation's child tree is eligible for timeout cleanup.
    if (child?.pid && child.exitCode === null && !child.signalCode) {
      if (process.platform === 'win32') await new Promise<void>(done => {
        const cleanup = spawn('taskkill', ['/PID', String(child!.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        cleanup.once('error', () => done()); cleanup.once('exit', () => done());
      }); else child.kill('SIGKILL');
    }
    if (child?.pid && !observedChildExit) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('cleanup did not observe actual Electron child exit')), 5000); })]); }
      finally { clearTimeout(timer); }
    }
    const target = resolve(temporary), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-rtc-smoke-')) throw Error('invalid cleanup target');
    rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    if (existsSync(target)) throw Error('isolated profile cleanup failed');
    console.log('ACTUAL RTC isolated profile removed: true');
  }
}
main().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
