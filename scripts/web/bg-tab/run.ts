// TEST ONLY (web build spec §3.5). Headed Chromium and Firefox: a visible baseline, then the test page and a sibling
// control tab hidden behind a foreground tab for 10 minutes. Exit 0 pass, 1 fail (valid run), 2 invalid run.
//
// No automation protocol is attached to the measured browser: Playwright's Chromium turns on focus emulation for every
// page (which keeps it visible) and Playwright's Firefox (Juggler) sets docShell.forceActiveState on every page, so
// neither can ever hide a tab. The browser is started as a player would start it, on drive.html, which opens the tabs
// itself and posts the measurements back here. Playwright only supplies the pinned Chromium build's path.
import { build } from 'vite';
import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { startEchoRuntime } from './echoRuntime';
import { judge, type BrowserRun, type BrowserVerdict } from './report';
import type { ControlMeasurement, PageMeasurement } from './protocol';

const arg = (name: string, fallback: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const browsers = arg('browser', 'chromium,firefox').split(',') as BrowserRun['browser'][];
const minutes = Number(arg('minutes', '10')), visibleSeconds = Number(arg('visible-seconds', '60'));
const rawOut = resolve(arg('raw-out', '.superpowers/web-i/bg-tab')), evidenceOut = resolve(arg('evidence-out', 'docs/superpowers/reviews/2026-11-18-web-i-bg-tab'));
type Report = { visible: PageMeasurement; hidden: PageMeasurement; control: ControlMeasurement; driveErrors: string[] } | { error: string; driveErrors: string[] };
let pending: { resolve(report: Report): void } | undefined;
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
function serve(root: string): Promise<{ port: number; server: Server }> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://local').pathname;
    if (request.method === 'POST' && (pathname === '/report' || pathname === '/log')) {
      let body = ''; request.setEncoding('utf8'); request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        response.writeHead(204).end();
        if (pathname === '/log') console.log(`BG-TAB page: ${body}`);
        else { try { pending?.resolve(JSON.parse(body) as Report); } catch (error) { pending?.resolve({ error: 'bad report: ' + String(error), driveErrors: [] }); } }
      });
      return;
    }
    const path = normalize(join(root, decodeURIComponent(pathname)));
    if (!path.startsWith(root + sep) || !existsSync(path)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(path));
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done({ port: (server.address() as { port: number }).port, server })));
}
/** The foreground tab is served by a second listener under another host name (localhost, not 127.0.0.1), so it is a
 *  different site from the measured pages and gets its own renderer process. */
function serveFront(root: string): Promise<{ origin: string; server: Server }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(readFileSync(join(root, 'front.html')));
  });
  return new Promise(done => server.listen(0, 'localhost', () => done({ origin: `http://localhost:${(server.address() as { port: number }).port}`, server })));
}
function firefoxBinary(): string {
  const candidates = [process.env.FIREFOX_BINARY, 'C:/Program Files/Mozilla Firefox/firefox.exe', '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'].filter((x): x is string => !!x);
  const found = candidates.find(existsSync);
  if (!found) throw Error('no Firefox binary found (set FIREFOX_BINARY)');
  return found;
}
// Firefox's own throttling defaults, stated so a profile preference cannot silently switch throttling off; the rest only
// silence first-run pages and let drive.html open its tabs without a user gesture.
const FIREFOX_PREFS: Record<string, string | number | boolean> = {
  'dom.min_background_timeout_value': 1000, 'dom.timeout.enable_budget_timer_throttling': true, 'dom.timeout.throttling_delay': 30000,
  'dom.disable_open_during_load': false, 'browser.link.open_newwindow': 3, 'browser.link.open_newwindow.restriction': 0,
  'browser.shell.checkDefaultBrowser': false, 'browser.startup.homepage_override.mstone': 'ignore', 'startup.homepage_welcome_url': '',
  'startup.homepage_welcome_url.additional': '', 'browser.aboutwelcome.enabled': false, 'browser.startup.firstrunSkipsHomepage': true,
  'datareporting.policy.dataSubmissionPolicyBypassNotification': true, 'datareporting.policy.dataSubmissionEnabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false, 'termsofuse.bypassNotification': true, 'app.update.disabledForTesting': true,
  'browser.sessionstore.resume_from_crash': false, 'browser.tabs.warnOnClose': false, 'datareporting.policy.firstRunURL': '',
  'browser.uitour.enabled': false, 'browser.messaging-system.whatsNewPanel.enabled': false, 'browser.startup.upgradeDialog.enabled': false,
  'browser.aboutwelcome.showModal': false, 'trailhead.firstrun.didSeeAboutWelcome': true
};
function launch(name: BrowserRun['browser'], profile: string, url: string): ChildProcess {
  mkdirSync(profile, { recursive: true });
  if (name === 'chromium') {
    // No --disable-background-timer-throttling / --disable-renderer-backgrounding / --disable-backgrounding-occluded-windows:
    // the browser throttles as a player's does. --disable-popup-blocking only lets drive.html open its tabs.
    return spawn(chromium.executablePath(), [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-popup-blocking', '--new-window', url],
      { stdio: 'ignore' });
  }
  writeFileSync(join(profile, 'user.js'), Object.entries(FIREFOX_PREFS).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n') + '\n');
  // -wait-for-browser keeps Firefox's launcher process alive as the browser's parent, so stop() can end the whole tree.
  return spawn(firefoxBinary(), ['-no-remote', '-new-instance', '-wait-for-browser', '-profile', profile, url], { stdio: 'ignore' });
}
const run = (command: string, args: string[]) => new Promise<void>(done => {
  const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' }); child.once('exit', () => done()); child.once('error', () => done());
});
async function stop(child: ChildProcess, profile: string): Promise<void> {
  if (process.platform !== 'win32') { if (child.exitCode === null) child.kill('SIGTERM'); return; }
  if (child.exitCode === null && child.pid) await run('taskkill', ['/PID', String(child.pid), '/T', '/F']);
  // A browser that detached from its launcher anyway: end only the processes started on this run's own temporary
  // profile (the machine's everyday browser is never touched).
  const quoted = profile.replace(/'/g, "''");
  await run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains('${quoted}') } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`]);
}
async function measure(name: BrowserRun['browser'], port: number, front: string, wsUrl: string, work: string): Promise<BrowserVerdict & { run: BrowserRun }> {
  const url = `http://127.0.0.1:${port}/drive.html?ws=${encodeURIComponent(wsUrl)}&front=${encodeURIComponent(front + '/front.html')}&minutes=${minutes}&visibleSeconds=${visibleSeconds}`;
  let timer: ReturnType<typeof setTimeout> | undefined, settle!: (report: Report) => void;
  const report = new Promise<Report>(done => {
    settle = done; pending = { resolve: done };
    // Every run is bounded: a page that never answers fails the run instead of hanging it.
    timer = setTimeout(() => done({ error: 'no report from the browser', driveErrors: [] }), (visibleSeconds + minutes * 60 + 240) * 1000);
  });
  const profile = join(work, `profile-${name}`), child = launch(name, profile, url);
  // Bound to this run only: the exit our own stop() causes must not settle the next browser's run.
  child.once('exit', code => { if (code) settle({ error: `${name} exited ${code}`, driveErrors: [] }); });
  try {
    const result = await report;
    if ('error' in result) throw Error(`${name}: ${result.error} ${JSON.stringify(result.driveErrors)}`);
    // Orchestrator errors are page errors of the run.
    const visible = { ...result.visible, errors: [...result.visible.errors, ...result.driveErrors.map(e => 'drive: ' + e)] };
    const run: BrowserRun = { browser: name, headless: false, visible, hidden: result.hidden, control: result.control };
    return { ...judge(run), run };
  } finally { clearTimeout(timer); pending = undefined; await stop(child, profile); }
}
async function main(): Promise<void> {
  mkdirSync(rawOut, { recursive: true }); mkdirSync(evidenceOut, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'ftlite-bg-tab-'));
  let server: Server | undefined, frontServer: Server | undefined, echo: Awaited<ReturnType<typeof startEchoRuntime>> | undefined;
  try {
    const root = resolve('scripts/web/bg-tab');
    await build({ configFile: false, envDir: false, logLevel: 'warn', root, base: './', worker: { format: 'es' },
      build: { outDir: join(work, 'site'), emptyOutDir: true, rollupOptions: { input: { index: join(root, 'index.html'), control: join(root, 'control.html'), front: join(root, 'front.html'), drive: join(root, 'drive.html') } } } });
    const site = await serve(resolve(work, 'site')); server = site.server;
    const frontSite = await serveFront(resolve(work, 'site')); frontServer = frontSite.server;
    echo = await startEchoRuntime(join(work, 'echo'));
    const verdicts: BrowserVerdict[] = [];
    for (const name of browsers) {
      console.log(`BG-TAB ${name}: started (${visibleSeconds} s visible baseline, then ${minutes} minutes hidden).`);
      const { run, ...verdict } = await measure(name, site.port, frontSite.origin, echo.wsUrl, work);
      writeFileSync(join(rawOut, `${name}.json`), JSON.stringify({ ...verdict, run }) + '\n');
      writeFileSync(join(evidenceOut, `${name}.json`), JSON.stringify({ ...verdict, minutes, visibleSeconds, recordedAt: new Date().toISOString() }, null, 2) + '\n');
      console.log(`BG-TAB ${name}: valid=${verdict.valid} pass=${verdict.pass} invalid=[${verdict.invalid}] failures=[${verdict.failures}] ${JSON.stringify(verdict.figures)}`);
      verdicts.push(verdict);
    }
    process.exitCode = verdicts.some(v => !v.valid) ? 2 : verdicts.some(v => !v.pass) ? 1 : 0;
  } finally {
    server?.close(); frontServer?.close(); await echo?.dispose();
    // A killed browser can hold its profile files for a moment; a leftover temp directory never changes the verdict.
    try { rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (error) { console.warn(`BG-TAB cleanup: ${String(error)}`); }
  }
}
main().catch(error => { console.error(error?.stack ?? error); process.exitCode = 2; });
