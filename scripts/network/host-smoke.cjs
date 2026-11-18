// Actual Electron harness (Web-i). The owner page runs production Worker owners over the built production Worker; the
// producer page runs the production client. All control and observation hooks live here and in host-smoke-page.ts.
const { app, BrowserWindow, ipcMain } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const directory = app.commandLine.getSwitchValue('host-smoke-dir');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated smoke profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const { init, checkpoint: fixture, offsets } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const options = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const workerUrl = pathToFileURL(resolve(__dirname, '../../out/renderer/assets/authorityWorker.js')).href;
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const decode = value => JSON.parse(new TextDecoder().decode(value));
const b64 = value => Buffer.from(value).toString('base64');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(done => setTimeout(done, ms));
const checks = [], details = {}, hosts = [];
let owner, visible, fatalError, rejectFatal;
const fatal = new Promise((_, reject) => { rejectFatal = reject; }); void fatal.catch(() => {});
function fail(error) { if (!fatalError) { fatalError = error instanceof Error ? error : Error(String(error)); rejectFatal(fatalError); } }
function evidence(check, detail) { checks.push(check); details[check] = detail; console.log(`ACTUAL ${check}: ${detail}`); }
function bounded(promise, label, milliseconds = 3000) {
  let timer;
  return Promise.race([promise, fatal, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} timeout`)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}
async function until(read, predicate, label, milliseconds = 2500) {
  const deadline = performance.now() + milliseconds;
  let value;
  while (performance.now() < deadline) {
    if (fatalError) throw fatalError;
    value = await read(); if (predicate(value)) return value;
    await delay(10);
  }
  throw Error(`${label} timeout; last=${JSON.stringify(value)}`);
}
const ownerJs = source => bounded(owner.webContents.executeJavaScript(source), 'owner page call', 8000);
const js = source => bounded(visible.webContents.executeJavaScript(source), 'producer page call');
const counts = () => ownerJs('window.hostSmoke.owner.counts()');
/** One owner-page Worker host, with the HostProcessHandle method names the checks use. */
async function startHost(overrides = {}, mode = 'normal') {
  const id = await ownerJs(`window.hostSmoke.owner.start(${JSON.stringify({ ...options, ...overrides })}, ${JSON.stringify(mode)})`);
  const call = (method, ...args) => ownerJs(`window.hostSmoke.owner.${method}(${[id, ...args].map(a => JSON.stringify(a)).join(', ')})`);
  const host = {
    id,
    settled: () => call('settled'),
    exit: () => call('exit'),
    reason: () => until(() => call('exit'), value => value !== null, `host ${id} exit`, 4000),
    async request(command) {
      const wire = command.kind === 'start' ? { ...command, initBytes: b64(command.initBytes) } : command.kind === 'restore' ? { ...command, checkpointBytes: b64(command.checkpointBytes) } : command;
      const response = await call('request', wire);
      return response.ok && response.checkpointBytes ? { ...response, checkpointBytes: Buffer.from(response.checkpointBytes, 'base64') } : response;
    },
    attachLocal: (peer, players, attach) => call('attachLocal', peer, players, attach ?? null),
    dispose: () => call('dispose'),
    killTransport: () => call('killTransport'),
    crashWorker: () => call('crashWorker'),
    intercept: requestId => call('intercept', requestId),
    rawCommand: command => call('rawCommand', command)
  };
  hosts.push(host); return host;
}
async function ready(generation = 1) {
  const host = await startHost({ hostGeneration: generation });
  const settled = await bounded(host.settled(), 'host ready', 6000);
  assert(settled.ready, `host ${generation} did not become ready: ${settled.exit}`);
  return host;
}
async function request(host, command) {
  const response = await host.request(command);
  assert(response.ok, `${command.kind} rejected: ${JSON.stringify(response)}`); return response;
}
async function checkpoint(host) { return decode((await request(host, { kind: 'checkpoint' })).checkpointBytes); }
function tick(cp) { return cp.snapshot.header.tick; }
function x(cp) { return cp.snapshot.values[offsets['crew.0.x']]; }
async function released(host, label) {
  const state = await until(counts, value => value.byHost[host.id]?.created === false || value.byHost[host.id]?.terminated, `${label} Worker termination`);
  assert(state.byHost[host.id], `${label} host unknown`);
  assert(BrowserWindow.getAllWindows().length === (visible && !visible.isDestroyed() ? 2 : 1), `${label} extra window leaked`);
}
async function dispose(host, label) {
  await host.dispose();
  assert(await host.reason() === 'disposed', `${label} exited unexpectedly before disposal`);
  await released(host, label);
}
const status = () => js('window.hostSmoke.status()');
async function attach(host) {
  await host.attachLocal('visible-human', [0]);
  return until(status, value => value.ready, 'human full sync');
}
async function commandResult(sequence) {
  let found;
  await until(async () => {
    const value = await status(); found = value.results.find(result => result.id.sequence === sequence) ?? found; return value;
  }, () => !!found, `command ${sequence} result`);
  assert(found.status === 'applied' || found.status === 'noop', `semantic command rejected: ${JSON.stringify(found)}`);
  assert(found.admission?.disposition === 'terminal', 'receive-time acknowledgement absent');
  return found;
}
async function page(role, preload) {
  const window = new BrowserWindow({ show: true, width: 640, height: 240, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, webSecurity: true, preload } });
  await window.loadFile(join(directory, 'page/index.html'), { query: role === 'owner' ? { role, worker: workerUrl } : { role } });
  return window;
}

async function run() {
  const preload = join(__dirname, 'host-smoke-preload.cjs');
  owner = await page('owner', preload);
  // A game port the owner page posts to itself reaches main, which hands it to the producer page.
  const forward = event => {
    if (event.sender !== owner.webContents || event.ports.length !== 1 || !visible || visible.isDestroyed()) { for (const p of event.ports) p.close(); return; }
    visible.webContents.postMessage('host-smoke-port', {}, event.ports);
  };
  ipcMain.on('host-smoke-port-out', forward);
  const events = [];
  const observePage = (event, value) => {
    if (!visible || event.sender !== visible.webContents || event.senderFrame !== visible.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error(`page exception: ${value.message}`)); else events.push(value);
  };
  ipcMain.on('host-smoke-event', observePage);

  // Early startup failures, each injected inside the spawn task itself (Web-i rewrite of the pre-spawn checks).
  const before = await startHost({}, 'abort-before');
  assert((await before.settled()).exit === 'cancelled' && (await counts()).byHost[before.id].created === false, 'already-cancelled start spawned a Worker');
  const aborted = await startHost({}, 'abort-after-spawn');
  assert(JSON.stringify(await aborted.settled()) === JSON.stringify({ ready: false, exit: 'cancelled' }), 'aborted host became ready');
  await released(aborted, 'early-abort');
  evidence('early-abort', 'already-aborted start spawned nothing; abort inside the spawn task rejected cancelled and terminated the Worker');
  const crashed = await startHost({}, 'crash-on-spawn');
  assert(JSON.stringify(await crashed.settled()) === JSON.stringify({ ready: false, exit: 'worker-exit' }), 'crashed host became ready');
  await released(crashed, 'early-worker-failure');
  evidence('early-worker-failure', 'Worker error before readiness: worker-exit, never ready, Worker terminated');
  for (const [label, overrides] of [['mode-mismatch', { modeId: 'unshipped-mode' }], ['content-mismatch', { contentDigest: '0'.repeat(64) }]]) {
    const host = await startHost(overrides);
    const settled = await host.settled();
    assert(!settled.ready && settled.exit === 'worker-protocol-failure', `${label}: ${settled.exit}`);
    await released(host, label); evidence(label, 'actual Worker rejected initialization; owner stopped and terminated it; page transport disposed');
  }

  visible = await page('producer', preload);
  await until(async () => visible.isVisible(), value => value, 'visible producer window');
  assert(await js('typeof process === "undefined" && typeof require === "undefined"'), 'producer page has Node access');
  if (process.argv.includes('--inject-page-failure')) {
    await js('window.hostSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'injected page failure');
  }
  if (process.argv.includes('--inject-child-failure')) throw Error('injected Electron child failure');
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});

  const first = await ready();
  await request(first, { kind: 'start', initBytes: bytes(init) });
  await request(first, { kind: 'restore', checkpointBytes: bytes(fixture) });
  for (const window of [owner, visible]) {
    const preferences = window.webContents.getLastWebPreferences();
    assert(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration && preferences.webSecurity && !window.webContents.getBackgroundThrottling(),
      'harness page preferences wrong');
  }
  assert(await ownerJs('typeof process === "undefined" && typeof require === "undefined"'), 'owner page has Node access');
  assert(owner.webContents.getOSProcessId() !== visible.webContents.getOSProcessId(), 'owner and producer share a renderer process');
  assert((await counts()).byHost[first.id].created, 'host Worker missing');
  evidence('sandbox-topology', `owner page pid=${owner.webContents.getOSProcessId()} hosts the Worker; producer page pid=${visible.webContents.getOSProcessId()}; both sandboxed; Node off`);
  await attach(first);
  const initialResume = await js('window.hostSmoke.resume()'); await commandResult(initialResume.id.sequence);
  await js('window.hostSmoke.neutralProducer()');
  await until(() => checkpoint(first), cp => tick(cp) >= 4, 'initial authority ticks');
  const held = await js('window.hostSmoke.primeHeld()');
  const beforeStall = await until(() => checkpoint(first), cp => cp.held[0].moveX === 1 && cp.heldHighWater[0] >= held.sequence, 'primed held admission');
  const stallPromise = js('window.hostSmoke.stall()');
  stallPromise.catch(fail);
  const start = await until(async () => events.find(event => event.kind === 'stall-start'), value => !!value, 'stall start');
  const during = [];
  // The owner page and the Worker continue while the producer page is blocked.
  await delay(300); during.push(await checkpoint(first));
  await delay(90); during.push(await checkpoint(first));
  assert(!events.some(event => event.kind === 'stall-end'), 'watchdog inspected after producer resumed');
  assert(tick(during[0]) >= tick(beforeStall) + 12 && tick(during[1]) > tick(during[0]), 'authority waited for visible input');
  assert(during.every(cp => cp.held[0].moveX === 0 && cp.held[0].moveY === 0 && !cp.held[0].interactHeld), '250ms watchdog did not neutralize stalled held');
  assert(x(during[0]) > x(beforeStall) && x(during[1]) === x(during[0]), 'held movement/watchdog position evidence absent');
  const delayed = await stallPromise;
  const end = await until(async () => events.find(event => event.kind === 'stall-end'), value => !!value, 'stall end');
  assert(end.milliseconds >= 500 && end.observedTick === start.tick, 'renderer did not actually stall for 500ms');
  const result = await commandResult(delayed.sequence);
  assert(result.status === 'applied' && result.tick >= delayed.requestedTick + 20, `delayed semantic input did not execute at receive time: ${JSON.stringify(result)}`);
  const after = await checkpoint(first);
  assert(after.heldHighWater[0] === start.held.sequence && after.held[0].moveX === -1 && x(after) < x(during[1]), 'delayed valid held input did not apply');
  assert(after.snapshot.values[offsets['run.vote']] === 0, 'translated vote had no authoritative effect');
  const resumed = await status(); assert(resumed.largestGap >= 500, 'renderer callback gap missing');
  evidence('renderer-stall', `busy=${end.milliseconds.toFixed(1)}ms; renderer callback gap=${resumed.largestGap.toFixed(1)}ms; Worker ticks ${tick(beforeStall)} -> ${tick(during[0])} -> ${tick(during[1])} while blocked; no input wait`);
  evidence('watchdog', `held right moved x=${x(beforeStall).toFixed(3)} -> ${x(during[0]).toFixed(3)}; at 300/390ms held neutral and x unchanged before renderer resumed (250ms host receipt watchdog)`);
  evidence('delayed-input', `original requestedTick=${delayed.requestedTick}; translated vote id=${delayed.sequence}, applied tick=${result.tick}, admission=${result.admission.disposition}; held sequence=${start.held.sequence} moved left x=${x(after).toFixed(3)}`);

  await js('window.hostSmoke.detach()'); await delay(30);
  const saved = await checkpoint(first);
  await request(first, { kind: 'restore', checkpointBytes: bytes(saved) });
  const replacement = await attach(first);
  assert(replacement.command === saved.commandHighWater[0] + 1 && replacement.held === saved.heldHighWater[0], 'restored producer sequences did not seed from full sync');
  assert(replacement.phase === 'paused' && replacement.commandStatus.state === 'ready', 'restore must remain paused with a fresh ready outbox');
  const resume = await js('window.hostSmoke.resume()'); const resumeResult = await commandResult(resume.id.sequence);
  assert(resume.id.sequence === saved.commandHighWater[0] + 1, 'new client reused or skipped command ID');
  await js('window.hostSmoke.neutralProducer()');
  const continued = await until(() => checkpoint(first), cp => tick(cp) > tick(saved) + 3 && cp.heldHighWater[0] > saved.heldHighWater[0], 'restored producer continuation');
  evidence('restore-producer', `checkpoint tick=${tick(saved)}; detached/recreated client command=${resume.id.sequence} (${resumeResult.status}); held ${saved.heldHighWater[0]} -> ${continued.heldHighWater[0]}; continued tick=${tick(continued)}`);
  await ownerJs('window.hostSmoke.owner.suspend()');
  const paused = await until(() => checkpoint(first), cp => cp.paused && cp.pauseReason === 'system-suspend', 'trusted suspend pause');
  await delay(90); const stillPaused = await checkpoint(first);
  assert(tick(stillPaused) === tick(paused) && stillPaused.paused, 'suspend hook auto-resumed authority');
  evidence('suspend-hook', `page lifecycle suspend -> system-suspend pause at tick=${tick(paused)}; remains paused; actual OS suspend NOT RUN`);
  await js('window.hostSmoke.detach()');
  const oldResponse = await ownerJs(`window.hostSmoke.owner.lastOkResponse(${first.id})`);
  assert(oldResponse, 'missing Worker output from first generation');
  await dispose(first, 'first host');

  const second = await ready(2); await request(second, { kind: 'start', initBytes: bytes(init) });
  // Replay a real generation-1 response into the generation-2 owner (ignored), then send an obsolete generation-1 command
  // to the actual generation-2 Worker and consume its reply with the interception armed ON THE GENERATION-2 HOST.
  await ownerJs(`window.hostSmoke.owner.inject(${second.id}, ${JSON.stringify(oldResponse)})`);
  const id = 900001;
  const obsolete = second.intercept(id);
  await second.rawCommand({ kind: 'pause', reason: 'obsolete-generation', requestId: id, hostGeneration: 1 });
  const reply = await bounded(obsolete, 'actual obsolete generation rejection');
  assert(reply.hostGeneration === 2 && reply.ok === false && reply.error?.code === 'stale-generation', 'wrong obsolete-command reply');
  const healthy = await checkpoint(second); assert(!healthy.paused, 'stale generation mutated restarted host');
  await delay(45); assert(tick(await checkpoint(second)) > tick(healthy), 'stale response stopped second host');
  evidence('stale-generation', 'real generation-1 response replayed into the generation-2 owner ignored; actual generation-1 command to the generation-2 Worker rejected stale-generation; new host continued');
  await dispose(second, 'second host');
  evidence('successive-hosts', 'two successive ready/start/dispose hosts; both Workers terminated, page transports disposed between hosts');

  const crashedHost = await ready(3); await request(crashedHost, { kind: 'start', initBytes: bytes(init) });
  await crashedHost.crashWorker();
  assert(await crashedHost.reason() === 'worker-exit', 'wrong Worker crash reason');
  await released(crashedHost, 'worker crash');
  const late = await ownerJs(`window.hostSmoke.owner.request(${crashedHost.id}, { kind: 'checkpoint' }).then(() => 'accepted', error => String(error.message))`);
  assert(late === 'disposed', `dead Worker request outcome: ${late}`);
  evidence('worker-crash', 'Worker error event; worker-exit; page transport disposed; new requests rejected');
  const killedTransport = await ready(4); await request(killedTransport, { kind: 'start', initBytes: bytes(init) });
  await killedTransport.killTransport();
  const reason = await killedTransport.reason();
  assert(reason === 'transport-exit', `wrong transport loss reason ${reason}`);
  await released(killedTransport, 'transport kill');
  evidence('transport-kill', `page transport controller disposed; ${reason}; Worker terminated by its owner`);

  const final = await counts();
  ipcMain.off('host-smoke-event', observePage); ipcMain.off('host-smoke-port-out', forward);
  visible.destroy(); owner.destroy();
  assert(final.workers === final.terminated && BrowserWindow.getAllWindows().length === 0, 'owned Workers/windows survived');
  assert(ipcMain.listenerCount('host-smoke-event') === 0 && ipcMain.listenerCount('host-smoke-port-out') === 0, 'owned listeners survived');
  evidence('cleanup', `${final.terminated}/${final.workers} host Workers terminated; zero windows/harness listeners; exact profile cleanup checked by launcher`);
  if (process.argv.includes('--inject-missing-evidence')) checks.splice(checks.indexOf('watchdog'), 1);
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ electron: process.versions.electron, checks, details,
    workers: final.workers, workerExits: final.terminated, windows: BrowserWindow.getAllWindows().length, osSuspend: 'NOT RUN' }));
}

app.on('web-contents-created', (_, contents) => {
  contents.on('render-process-gone', (_, details) => fail(Error(`unexpected renderer exit: ${details.reason}`)));
  contents.on('did-fail-load', (_, code, description) => fail(Error(`page load failed: ${code} ${description}`)));
  contents.on('console-message', event => { if (event.level === 'error' && !String(event.message).includes('injected worker crash')) fail(Error(`page console error: ${event.message}`)); });
});
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
app.whenReady().then(async () => {
  let status = 0;
  try { await bounded(run(), 'whole actual-process smoke', 30_000); }
  catch (error) { status = 1; console.error(error.stack ?? error); }
  finally {
    // Also clean up partial startup and injected-failure paths; the launcher has a process-tree fallback.
    if (owner && !owner.isDestroyed()) {
      await Promise.allSettled(hosts.map(host => host.dispose()));
      try {
        const final = await bounded(counts(), 'failure cleanup counts', 3000);
        if (final.workers !== final.terminated) { status = 1; console.error('failure cleanup left a Worker running'); }
      } catch (error) { status = 1; console.error(error.message); }
    }
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(status);
  }
}).catch(error => { console.error(error); app.exit(1); });
