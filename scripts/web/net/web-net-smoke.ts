// `npm run test:web-net` (web build spec §8 "Browser network gates"): Playwright Chromium and Firefox against local
// workerd, loopback ICE and a `vite preview` of a --test web build; pairings Chromium host + Firefox guest, Firefox host +
// Chromium guest, Chromium host + Electron guest. `--inject=origin-refused` starts workerd without the preview origin:
// the run must fail at the first pairing's host step for that reason (exit 1 with the INJECTED line; any other failure
// exits 2). The temporary root is removed exactly; no browser, Electron or workerd is killed globally.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium, firefox, type Browser } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { computeContentDigest } from '../../../build/contentDigest';
import { resolveWebBuildPlan } from '../../../build/webBuild';
import { startLocalRuntime } from '../../../services/signalling/scripts/local-runtime';
import { buildDuelObservers } from '../../network/online-observer-build';
import { buildWeb } from '../build-web';
import { createBrowserPlayer, createElectronPlayer, type GatePlayer, type NetworkEntry } from './players';
import { DUEL_TEST_SEED, parseWebNetArgs, runPairing, type Pairing } from './scenario';

function freePort(): Promise<number> {
  return new Promise((done, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const port = (s.address() as { port: number }).port; s.close(() => done(port)); }); });
}
async function main(): Promise<void> {
  const root = process.cwd(), began = performance.now(), args = parseWebNetArgs(process.argv.slice(2));
  const reportPath = resolve(args.reportPath); mkdirSync(resolve(reportPath, '..'), { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'ftlite-web-net-')), digest = computeContentDigest(root);
  const proof: Record<string, unknown> = {};
  let aborted = false; const watchdog = setTimeout(() => { aborted = true; }, 900000);
  let step = 'startup', failure: string | undefined;
  let runtime: Awaited<ReturnType<typeof startLocalRuntime>> | undefined, server: PreviewServer | undefined;
  const browsers: Browser[] = [];
  let hostNetwork: NetworkEntry[] = [], pageOrigin = '', probeStatus: number | null = null;
  try {
    const port = await freePort(), origin = `http://127.0.0.1:${port}`;
    pageOrigin = origin;
    mkdirSync(join(directory, 'service'));
    step = 'workerd';
    runtime = await startLocalRuntime(join(directory, 'service'), { allowedOrigins: args.inject === 'origin-refused' ? 'null' : `null,http://localhost:${port},${origin}` });
    step = 'web build';
    const plan = resolveWebBuildPlan(root, ['--test', '--allow-missing-paid', '--test-probe', `--service-origin=${runtime.baseUrl}`, `--duel-test-seed=${DUEL_TEST_SEED}`, `--out=${join(directory, 'web')}`], {});
    await buildWeb(root, plan);
    await buildDuelObservers(directory, digest);
    step = 'preview';
    server = await preview({ configFile: false, root, logLevel: 'warn', build: { outDir: join(directory, 'web', 'static') }, preview: { host: '127.0.0.1', port, strictPort: true } });
    const initScripts = [join(directory, 'observer', 'page-probe.js'), join(directory, 'observer', 'observer.js')];
    step = 'browsers';
    const chrome = await chromium.launch({ headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] }); browsers.push(chrome);
    const fox = await firefox.launch({ headless: true, firefoxUserPrefs: { 'media.peerconnection.ice.obfuscate_host_addresses': false, 'media.peerconnection.ice.loopback': true } }); browsers.push(fox);
    const browserOf = { chromium: chrome, firefox: fox } as const;
    for (const pairing of args.pairings as readonly Pairing[]) {
      step = pairing;
      const [hostKind, guestKind] = pairing.split('-') as ['chromium' | 'firefox', 'chromium' | 'firefox' | 'electron'];
      const players: GatePlayer[] = [];
      try {
        const host = await createBrowserPlayer({ browser: browserOf[hostKind], name: `${hostKind}-host`, url: `${origin}/`, initScripts, serviceOrigin: runtime.baseUrl }); players.push(host);
        const guest = guestKind === 'electron'
          ? await createElectronPlayer({ name: 'electron-guest', directory, serviceUrl: runtime.baseUrl, duelTestSeed: DUEL_TEST_SEED })
          : await createBrowserPlayer({ browser: browserOf[guestKind], name: `${guestKind}-guest`, url: `${origin}/`, initScripts, serviceOrigin: runtime.baseUrl });
        players.push(guest);
        proof[pairing] = await runPairing(host, guest, { step: label => { step = `${pairing}: ${label}`; console.log(`[web-net] ${step}`); }, aborted: () => aborted });
        if (guest.consoleErrors?.length) (proof[pairing] as Record<string, unknown>).guestConsoleErrors = guest.consoleErrors.slice();
      } finally {
        if (pairing === args.pairings[0] && players[0]) hostNetwork = players[0].network.slice();   // the injection's evidence (review R1-F3)
        for (const p of players) await p.dispose();
      }
    }
    console.log(`ACTUAL BROWSER NETWORK GATES: ${args.pairings.join(', ')}: host/join, scripted duel with authority agreement, guest reconnect, rehost from the IndexedDB mirror, clean leave`);
  } catch (error) { failure = `${step}: ${String((error as Error)?.message ?? error).slice(0, 700)}`; }
  finally {
    clearTimeout(watchdog);
    for (const b of browsers) await b.close().catch(() => { failure ??= 'browser close failed'; });
    try { await server?.close(); } catch { failure ??= 'preview close failed'; }
    // The injection's service-side evidence: the same create preflight from Node, with the page's Origin, must be refused.
    if (args.inject === 'origin-refused' && runtime) probeStatus = await fetch(`${runtime.baseUrl}/v2/rooms`, { method: 'OPTIONS',
      headers: { Origin: pageOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }).then(r => r.status, () => null);
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-web-net-')) throw Error('invalid exact cleanup target');
    try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { failure ??= 'exact temporary cleanup failed'; }
  }
  // Review R1-F3: the named reason needs network evidence, not only a lobby that never came. The create is a CORS
  // request (JSON body), so the browser may send only its preflight: either Playwright saw a 403 on /v2/rooms carrying the
  // page's Origin, or it saw the create POST fail with that Origin and Node's identical preflight got 403. No create may
  // have succeeded.
  const creates = hostNetwork.filter(e => e.path === '/v2/rooms');
  const refused = creates.some(e => e.status === 403 && e.origin === pageOrigin)
    || (creates.some(e => e.method === 'POST' && e.status === null && e.origin === pageOrigin) && probeStatus === 403);
  const created = creates.some(e => e.method === 'POST' && e.status !== null && e.status >= 200 && e.status < 300);
  const report = { version: 1, digest, inject: args.inject, pairings: args.pairings, elapsedMs: Math.ceil(performance.now() - began), proof, failure: failure ?? null,
    injection: args.inject ? { creates, probeStatus, refused, created } : null, temporaryRemoved: !existsSync(directory) };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (args.inject === 'origin-refused') {
    // The named reason: the first pairing's host cannot create its room because the service refuses the page's Origin.
    // The page sees a refused CORS request either as an online error status or as a create that never reaches the lobby.
    const lobbyFailed = !!failure && /^chromium-firefox: host and join: chromium-host lobby(: online error | timeout)/.test(failure);
    if (lobbyFailed && refused && !created) { console.error(`WEB NET INJECTED FAIL (origin-refused): ${failure} (403 seen for ${pageOrigin})`); process.exitCode = 1; }
    else { console.error(`WEB NET FAIL: injection origin-refused did not fail for its named reason: ${failure ?? 'the run passed'}; refused ${refused}, created ${created}, probe ${probeStatus}`); process.exitCode = 2; }
    return;
  }
  if (failure) { console.error(`WEB NET FAIL: ${failure}`); process.exitCode = 1; return; }
  console.log(`ACTUAL BROWSER NETWORK GATE PASS (${report.elapsedMs} ms)`);
}
void main();
