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

const required = ['early-abort', 'early-transport-failure', 'sandbox-topology', 'renderer-stall',
  'watchdog', 'delayed-input', 'restore-producer', 'suspend-hook', 'successive-hosts',
  'stale-generation', 'utility-kill', 'transport-kill', 'mode-mismatch', 'content-mismatch', 'cleanup'];

async function stopTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode || !child.pid) return;
  // Only the process tree launched by this invocation, never a name/global taskkill.
  if (process.platform === 'win32') await new Promise<void>(done => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('error', () => done()); killer.once('exit', () => done());
  });
  else child.kill('SIGKILL');
}

async function main(): Promise<void> {
  const started = performance.now(), temporary = mkdtempSync(join(tmpdir(), 'ftlite-host-smoke-'));
  let child: ChildProcess | undefined;
  try {
    const digest = computeContentDigest(process.cwd()), layout = parseShip(starter);
    const init = { runId: 'host-smoke', layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash,
      simVersion: SIM_VERSION, contentDigest: digest, seed: 7, playerCount: 2, characters: [0, 0], unlocked: [] };
    // A portable, validated scenario: an open event and a crew member in the corridor.
    // This fixture is generated in the private temporary directory; no golden is rewritten.
    const authority = createAuthority({ clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} },
      resolveLayout: () => layout, contentDigest: digest, onCrash: () => { throw Error('fixture authority crashed'); } });
    authority.start(init);
    const checkpoint = authority.checkpoint([]); authority.dispose();
    const state = loadSnapshot(layout, checkpoint.snapshot, digest);
    try {
      state.run.event = 0; state.run.eventChoice = -1; state.run.eventOpenTick = -1;
      state.run.voteTick = -1; state.run.vote.fill(-1); state.director.nextSpawnTick = 1e9;
      Position.x[state.crew[0]!] = 5.5; Position.y[state.crew[0]!] = 5.5;
      checkpoint.snapshot = saveSnapshot(state, digest);
    } finally { disposeSimState(state); }
    validateCheckpoint(layout, checkpoint, digest);
    const offsets = Object.fromEntries(canonicalFields(layout, init.playerCount).map(field => [field.name, field.offset]));
    writeFileSync(join(temporary, 'fixture.json'), JSON.stringify({ init, checkpoint, offsets }));
    await build({ configFile: false, root: resolve('scripts/network'), base: './', logLevel: 'warn',
      define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(temporary, 'page'), emptyOutDir: true } });
    if (typeof electron !== 'string' || !existsSync(electron)) throw Error('mandatory Electron executable missing');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME;
    // Always exercise the fixed built production paths, even in a development shell.
    delete env.ELECTRON_RENDERER_URL;
    child = spawn(electron, [resolve('scripts/network/host-smoke.cjs'), `--host-smoke-dir=${temporary}`,
      `--user-data-dir=${join(temporary, 'profile')}`, ...process.argv.slice(2)],
    { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', bytes => process.stdout.write(bytes));
    child.stderr!.on('data', bytes => process.stderr.write(bytes));
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(Error('host smoke child timeout (40 seconds)')), 40_000);
      child!.once('error', error => { clearTimeout(timer); reject(error); });
      child!.once('exit', (code, signal) => {
        clearTimeout(timer);
        if (code !== 0 || signal) reject(Error(`host smoke child failed: code=${code} signal=${signal}`)); else done();
      });
    });
    const report = JSON.parse(readFileSync(join(temporary, 'report.json'), 'utf8'));
    if (!report || report.electron !== '37.10.3' || !Array.isArray(report.checks)
      || required.some(check => !report.checks.includes(check)) || report.osSuspend !== 'NOT RUN'
      || report.utilities !== report.exits || report.windows !== 0) throw Error('missing/invalid actual-process evidence');
    console.log(`ACTUAL host runtime PASS: Electron ${report.electron}; ${report.checks.length} checks; ${report.exits}/${report.utilities} utility exits; ${(performance.now() - started).toFixed(0)}ms`);
    console.log('Actual OS suspension: NOT RUN (trusted suspend hook exercised). WebRTC/internet: NOT RUN.');
  } finally {
    if (child) await stopTree(child);
    // Resolve and verify the exact mkdtemp target before removing our own artifacts/profile.
    const target = resolve(temporary), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-host-smoke-')) throw Error('invalid cleanup target');
    rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    if (existsSync(target)) throw Error('isolated profile cleanup failed');
    console.log('ACTUAL isolated profile removed: true');
  }
}
main().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
