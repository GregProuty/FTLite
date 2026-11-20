import { build } from 'vite';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { executeFixture, unpackFixture } from './fixture';
import { duelRestoreCheck } from './duelRestore';
import { browserExecutable, compareReports, receiveBrowser } from './protocol';
async function main() {
  const digest = computeContentDigest(process.cwd()), fixtureBytes = readFileSync('tests/fixtures/determinism-v2.json'), fixture = unpackFixture(JSON.parse(fixtureBytes.toString()));
  const output = resolve(process.argv.find(arg => arg.startsWith('--output-dir='))?.slice('--output-dir='.length)
    ?? '.superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs'); mkdirSync(output, { recursive: true });
  const began = performance.now();
  const expected = executeFixture(fixture, digest); compareReports(fixture.expected, expected);
  const duelExpected = duelRestoreCheck(digest, { seed: 2, ticks: 1800, bursts: true });   // Net-4a G2 on Node
  console.log(`Node: duel restore ${duelExpected.checks} checks PASS (${duelExpected.finalHash})`);
  const evidence: any = { platform: `${process.platform}/${process.arch}`, digest, node: process.version, samples: expected.samples.length, runs: fixture.runs.map(r => ({ ship: r.ship, runId: r.checkpoint.init.runId, seed: r.checkpoint.init.seed, ticks: r.ticks, ended: r.ended })), engines: [{ engine: `Node ${process.version}; V8 ${process.versions.v8}`, seconds: (performance.now() - began) / 1000 }] };
  console.log(`Node ${process.version}: ${expected.samples.length} canonical samples, ${expected.boundaries.length} result/event boundaries PASS (${evidence.engines[0].seconds.toFixed(2)}s)`);
  const temporary = mkdtempSync(join(tmpdir(), 'ftlite-determinism-')), bundle = join(temporary, 'bundle');
  let active: ReturnType<typeof receiveBrowser> | undefined, token = '', child: ChildProcess | undefined;
  const server = createServer((request, response) => {
    if (request.method === 'POST' && request.url === `/result/${token}`) {
      let bytes = 0, body = '';
      request.on('data', chunk => { bytes += chunk.length; if (bytes > 32 * 1024 * 1024) request.destroy(); else body += chunk; });
      request.on('end', () => { try { active?.report(JSON.parse(body)); response.writeHead(200).end('ok'); } catch { active?.report({ error: 'invalid browser JSON' }); response.writeHead(400).end(); } }); return;
    }
    const pathname = new URL(request.url!, 'http://localhost').pathname;
    if (pathname === '/fixture.json') { response.setHeader('Content-Type', 'application/json'); response.end(fixtureBytes); return; }
    const path = resolve(bundle, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(bundle + sep) || !existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', extname(path) === '.js' ? 'application/javascript' : 'text/html'); response.end(readFileSync(path));
  });
  async function stopChild() {
    if (!child || child.exitCode !== null || !child.pid) return;
    if (process.platform === 'win32') await new Promise<void>(done => { const killer = spawn('taskkill', ['/PID', String(child!.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('exit', () => done()); killer.once('error', () => done()); });
    else child.kill('SIGTERM');
  }
  try {
    await build({ configFile: false, root: resolve('scripts/determinism'), logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) }, build: { outDir: bundle, emptyOutDir: true } });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address() as { port: number };
    const firefoxCandidates = [process.env.FIREFOX_BINARY, 'C:/Program Files/Mozilla Firefox/firefox.exe', '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'].filter((x): x is string => !!x);
    const firefox = firefoxCandidates.find(existsSync);
    const chromium = browserExecutable('Chromium', typeof electron === 'string' && existsSync(electron) ? electron : undefined, true);
    for (const engine of ['Chromium', 'Firefox']) {
      if (engine === 'Firefox' && !firefox) { const reason = browserExecutable('Firefox', undefined, false); console.log(reason); evidence.engines.push({ engine, status: reason }); continue; }
      token = randomUUID(); active = receiveBrowser(120_000);
      const started = performance.now(), profile = join(temporary, engine); mkdirSync(profile);
      const url = `http://127.0.0.1:${address.port}/?token=${token}${process.argv.includes('--inject-page-failure') ? '&fault=page' : ''}`;
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      // A host Chromium crashpad pipe belongs to its process tree, never this isolated Electron instance.
      delete env.CHROME_CRASHPAD_PIPE_NAME;
      child = spawn(engine === 'Chromium' ? chromium : firefox!, engine === 'Chromium' ? [resolve('scripts/determinism/electron.cjs'), url, `--user-data-dir=${profile}`] : ['-headless', '-no-remote', '-profile', profile, url], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let diagnostics = ''; child.stdout?.on('data', b => { diagnostics += b; }); child.stderr?.on('data', b => { diagnostics += b; });
      child.once('error', error => active?.report({ error: String(error) }));
      child.once('exit', code => { if (code && code !== 0) active?.report({ error: `${engine} exited ${code}: ${diagnostics}` }); });
      const result = await active.promise; compareReports(expected, result.report);
      if (result.duelRestore.checks !== duelExpected.checks || result.duelRestore.finalHash !== duelExpected.finalHash) throw Error(`${engine}: duel restore differs from Node (${JSON.stringify(result.duelRestore)})`);
      const seconds = (performance.now() - started) / 1000; evidence.engines.push({ engine: result.engine, seconds, status: 'PASS' });
      writeFileSync(join(output, `${engine.toLowerCase()}.log`), `${result.engine}\n${diagnostics}\n1800 samples; ${result.report.boundaries.length} boundaries; first difference: none\n`);
      console.log(`${result.engine}: ${result.report.samples.length} samples PASS (${seconds.toFixed(2)}s); duel restore ${result.duelRestore.checks} checks`);
      await stopChild(); child = undefined;
    }
    evidence.gaps = ['Safari/JSC not run', 'ARM not run']; writeFileSync(join(output, 'engines.json'), JSON.stringify(evidence, null, 2));
  } finally {
    await stopChild(); await new Promise<void>(done => server.close(() => done()));
    // Only the exact mkdtemp directory allocated by this process is removed.
    if (resolve(temporary).startsWith(resolve(tmpdir()) + sep) && temporary.includes('ftlite-determinism-')) rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
