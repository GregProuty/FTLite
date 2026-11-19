// `npm run test:web-live-local`: the live duel runner (duel.ts, mode 'local') against the stack test:web-net starts
// (local workerd, `vite preview` of a --test web build, loopback ICE). It proves the real-menu driving, the phase reads,
// the 60 s play and the leave before the owner's live run, and runs the relay hook (not forcing) and the getStats read in
// real Chromium and Firefox: each side needs a connected selected pair with traffic (review R1-F2). It cannot prove TURN
// (loopback ICE) and has no passcode gate (vite preview serves no middleware). The build has no test probe, as a
// production page has none.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { LocalWebStack } from '../net/stack';
import { runLiveDuel } from './duel';

const REPORT_PATH = 'out/web-iii-live/local-smoke.json', TEMP_PREFIX = 'ftlite-web-live-local-';

async function main(): Promise<void> {
  const root = process.cwd(), began = performance.now(), reportPath = resolve(REPORT_PATH);
  mkdirSync(resolve(reportPath, '..'), { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), TEMP_PREFIX)), stack = new LocalWebStack();
  let aborted = false; const watchdog = setTimeout(() => { aborted = true; }, 600000);
  let step = 'startup', failure: string | undefined, duel: Awaited<ReturnType<typeof runLiveDuel>> | undefined;
  const say = (label: string): void => { step = label; console.log(`[web-live-local] ${label}`); };
  try {
    await stack.start({ root, directory, step: say, buildArgs: service => ['--test', '--allow-missing-paid', `--service-origin=${service}`] });
    duel = await runLiveDuel({ url: stack.origin, passcode: '', mode: 'local', step: label => say(`duel: ${label}`), aborted: () => aborted });
    if (duel.problems.length) failure = `problems: ${duel.problems.join('; ')}`;
  } catch (error) { failure = `${step}: ${String((error as Error)?.message ?? error).slice(0, 700)}`; }
  finally {
    clearTimeout(watchdog);
    const previewClosed = await stack.closePreview(); if (previewClosed) failure ??= previewClosed;
    const runtimeClosed = await stack.closeRuntime(); if (runtimeClosed) failure ??= runtimeClosed;
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith(TEMP_PREFIX)) throw Error('invalid exact cleanup target');
    try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { failure ??= 'exact temporary cleanup failed'; }
  }
  const report = { version: 1, elapsedMs: Math.ceil(performance.now() - began), duel: duel ?? null, failure: failure ?? null, temporaryRemoved: !existsSync(directory) };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (failure) { console.error(`WEB LIVE LOCAL FAIL: ${failure}`); process.exitCode = 1; return; }
  console.log(`WEB LIVE LOCAL PASS (${report.elapsedMs} ms): ${duel!.hostBrowser} host + ${duel!.guestBrowser} guest, played ${duel!.playedMs} ms${duel!.endedEarly ? ' (round ended)' : ''}; selected pairs host ${duel!.candidates.host.join(',')}, guest ${duel!.candidates.guest.join(',')} (loopback ICE, relay not forced)`);
}
void main();
