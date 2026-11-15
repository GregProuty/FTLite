// Actual Electron main harness. All control/observation hooks live here, outside
// production bundles. Production createHostPlatform supplies every real owner.
const { app, BrowserWindow, MessageChannelMain, ipcMain, utilityProcess, powerMonitor } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { startHostProcess } = require('../../out/main/hostProcess.js');
const { createHostPlatform } = require('../../out/main/transportWindow.js');
const directory = app.commandLine.getSwitchValue('host-smoke-dir');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated smoke profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const { init, checkpoint: fixture, offsets } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const options = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const decode = value => JSON.parse(new TextDecoder().decode(value));
const assert = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(done => setTimeout(done, ms));
const checks = [], details = {}, natives = [], hosts = [], expectedGone = new Set();
let visible, lastNative, fatalError, rejectFatal;
const fatal = new Promise((_, reject) => { rejectFatal = reject; });
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

// Observe native spawn/kill/exit without substituting their results or timing.
const originalFork = utilityProcess.fork;
utilityProcess.fork = (...args) => {
  const child = originalFork(...args), kill = child.kill.bind(child);
  const record = { child, kills: [], messages: [], spawned: false, exited: false, intercept: null };
  child.kill = () => { record.killRequested = true; const pid = child.pid, result = kill(); record.kills.push({ pid, result }); return result; };
  child.once('spawn', () => { record.spawned = true; record.pid = child.pid; });
  const observe = message => record.messages.push(message);
  child.on('message', observe);
  child.stderr?.on('data', value => { record.stderr = (record.stderr ?? '') + value.toString(); });
  record.exit = new Promise(done => child.once('exit', code => {
    record.exited = true; record.exitCode = code; child.off('message', observe); done();
    if (!record.killRequested) fail(Error(`unexpected native utility exit: ${code}; ${record.stderr ?? ''}`));
  }));
  natives.push(record); lastNative = record; return child;
};

const baseline = () => ({ suspend: powerMonitor.listenerCount('suspend'), ready: ipcMain.listenerCount('net:transport-ready') });
let listeners;
function platform() {
  const native = createHostPlatform(), originalSpawn = native.spawn, originalTransport = native.createTransport,
    originalSuspend = native.onSuspend;
  const observation = { platform: native, record: null, transport: null, transportDisposals: 0, suspend: null };
  native.spawn = () => {
    const adapter = originalSpawn(); observation.record = lastNative;
    const onMessage = adapter.onMessage;
    adapter.onMessage = callback => {
      observation.record.dispatch = callback;
      return onMessage(message => {
        const probe = observation.record.intercept;
        // Only this explicitly injected uncorrelated reply is consumed by the
        // harness. All ordinary/malformed/unknown responses still reach the owner.
        if (probe && message?.kind === 'response' && message.response?.requestId === probe.id) {
          assert(message.response.hostGeneration === probe.generation && message.response.ok === false
            && message.response.error?.code === 'stale-generation', 'wrong obsolete-command reply');
          observation.record.intercept = null; probe.resolve(message.response); return;
        }
        callback(message);
      });
    };
    return adapter;
  };
  native.createTransport = identity => {
    const before = new Set(BrowserWindow.getAllWindows());
    const transport = originalTransport(identity);
    observation.transport = BrowserWindow.getAllWindows().find(window => !before.has(window));
    const dispose = transport.dispose;
    transport.dispose = () => { observation.transportDisposals++; dispose(); };
    return transport;
  };
  native.onSuspend = callback => {
    observation.suspend = callback;
    const off = originalSuspend(callback);
    return () => { observation.suspend = null; off(); };
  };
  return observation;
}
async function ready(generation = 1, overrides = {}) {
  const observation = platform();
  const host = await bounded(startHostProcess({ ...options, hostGeneration: generation, ...overrides }, observation.platform), 'host ready', 6000);
  hosts.push(host); observation.host = host;
  observation.reason = new Promise(done => host.onExit(done));
  return observation;
}
async function request(host, command) {
  const response = await host.request(command);
  assert(response.ok, `${command.kind} rejected: ${JSON.stringify(response)}`); return response;
}
async function checkpoint(host) { return decode((await request(host, { kind: 'checkpoint' })).checkpointBytes); }
function tick(cp) { return cp.snapshot.header.tick; }
function x(cp) { return cp.snapshot.values[offsets['crew.0.x']]; }
async function released(observation, label) {
  await bounded(observation.record.exit, `${label} native utility exit`);
  assert(observation.record.exited && observation.record.spawned, `${label} missing native spawn/exit`);
  assert(!observation.transport || observation.transport.isDestroyed(), `${label} transport leaked`);
  assert(observation.record.child.listenerCount('message') === 0, `${label} utility message listener leaked`);
  assert(observation.record.child.listenerCount('spawn') === 0 && observation.record.child.listenerCount('exit') === 0,
    `${label} native lifecycle listeners leaked`);
  assert(JSON.stringify(baseline()) === JSON.stringify(listeners), `${label} owner listeners leaked`);
  assert(BrowserWindow.getAllWindows().length === (visible && !visible.isDestroyed() ? 1 : 0), `${label} extra window leaked`);
}
async function dispose(observation, label) {
  await observation.host.dispose();
  assert(await bounded(observation.reason, `${label} disposal notification`) === 'disposed', `${label} exited unexpectedly before disposal`);
  await released(observation, label);
}
async function js(source) { return bounded(visible.webContents.executeJavaScript(source), 'visible renderer call'); }
const status = () => js('window.hostSmoke.status()');
async function attach(observation) {
  const { port1, port2 } = new MessageChannelMain();
  await observation.host.attachPeer('visible-human', [0], port2);
  visible.webContents.postMessage('host-smoke-port', {}, [port1]);
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

async function early(label, action) {
  const observation = platform();
  await action(observation);
  const record = observation.record;
  assert(record.kills[0]?.pid === undefined && record.kills[0]?.result === false, `${label} failed to exercise native pre-spawn kill=false`);
  await released(observation, label);
  assert(record.kills.length === 2 && record.kills[1].result === true, `${label} spawn kill retry missing`);
  evidence(label, 'first kill=false pid=undefined; retry=true after spawn; native exit observed; zero owners');
}

async function run() {
  listeners = baseline();
  await early('early-abort', async observation => {
    const abort = new AbortController();
    const starting = startHostProcess({ ...options, signal: abort.signal }, observation.platform);
    abort.abort();
    await starting.then(() => { throw Error('aborted host became ready'); }, error => assert(error.message === 'cancelled', String(error)));
  });
  await early('early-transport-failure', async observation => {
    observation.platform.createTransport = () => { throw Error('injected early transport construction'); };
    await startHostProcess(options, observation.platform).then(() => { throw Error('failed transport became ready'); },
      error => assert(error.message === 'injected early transport construction', String(error)));
  });
  for (const [label, overrides] of [['mode-mismatch', { modeId: 'unshipped-mode' }], ['content-mismatch', { contentDigest: '0'.repeat(64) }]]) {
    const observation = platform();
    await startHostProcess({ ...options, ...overrides }, observation.platform).then(() => { throw Error(`${label} accepted`); },
      error => assert(error.message === 'utility-protocol-failure', `${label}: ${error.message}`));
    await released(observation, label); evidence(label, 'actual utility rejected initialization and exited; transport destroyed');
  }

  visible = new BrowserWindow({ show: true, width: 640, height: 240, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false,
    preload: join(__dirname, 'host-smoke-preload.cjs') } });
  const events = [];
  const observePage = (event, value) => {
    if (event.sender !== visible.webContents || event.senderFrame !== visible.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error(`page exception: ${value.message}`)); else events.push(value);
  };
  ipcMain.on('host-smoke-event', observePage);
  await visible.loadFile(join(directory, 'page/index.html'));
  visible.show();
  await until(async () => visible.isVisible(), value => value, 'visible producer window');
  assert(await js('typeof process === "undefined" && typeof require === "undefined"'), 'visible renderer has Node access');
  if (process.argv.includes('--inject-page-failure')) {
    await js('window.hostSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'injected page failure');
  }
  if (process.argv.includes('--inject-child-failure')) throw Error('injected Electron child failure');
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});

  const first = await ready();
  await request(first.host, { kind: 'start', initBytes: bytes(init) });
  await request(first.host, { kind: 'restore', checkpointBytes: bytes(fixture) });
  const preferences = first.transport.webContents.getLastWebPreferences();
  assert(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration && !first.transport.webContents.getBackgroundThrottling()
    && preferences.webSecurity && !first.transport.isVisible() && visible.isVisible(), `native topology preferences wrong: ${JSON.stringify({
      sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration,
      backgroundThrottling: preferences.backgroundThrottling, webSecurity: preferences.webSecurity,
      transportVisible: first.transport.isVisible(), producerVisible: visible.isVisible() })}`);
  assert(first.transport.webContents.getOSProcessId() !== visible.webContents.getOSProcessId(), 'visible and transport share a renderer process');
  assert(first.record.pid !== first.transport.webContents.getOSProcessId(), 'utility and transport share a process');
  evidence('sandbox-topology', `utility pid=${first.record.pid}; hidden sandbox renderer pid=${first.transport.webContents.getOSProcessId()}; visible producer pid=${visible.webContents.getOSProcessId()}; Node off`);
  await attach(first);
  const initialResume = await js('window.hostSmoke.resume()'); await commandResult(initialResume.id.sequence);
  await js('window.hostSmoke.neutralProducer()');
  await until(() => checkpoint(first.host), cp => tick(cp) >= 4, 'initial authority ticks');
  const held = await js('window.hostSmoke.primeHeld()');
  const before = await until(() => checkpoint(first.host), cp => cp.held[0].moveX === 1 && cp.heldHighWater[0] >= held.sequence, 'primed held admission');
  const stallPromise = js('window.hostSmoke.stall()');
  // Attach a rejection handler immediately; the outer fatal race still reports it.
  stallPromise.catch(fail);
  const start = await until(async () => events.find(event => event.kind === 'stall-start'), value => !!value, 'stall start');
  const during = [];
  // Main and utility continue independently while the visible renderer is blocked.
  await delay(300); during.push(await checkpoint(first.host));
  await delay(90); during.push(await checkpoint(first.host));
  assert(!events.some(event => event.kind === 'stall-end'), 'watchdog inspected after producer resumed');
  assert(tick(during[0]) >= tick(before) + 12 && tick(during[1]) > tick(during[0]), 'authority waited for visible input');
  assert(during.every(cp => cp.held[0].moveX === 0 && cp.held[0].moveY === 0 && !cp.held[0].interactHeld), '250ms watchdog did not neutralize stalled held');
  assert(x(during[0]) > x(before) && x(during[1]) === x(during[0]), 'held movement/watchdog position evidence absent');
  const delayed = await stallPromise;
  const end = await until(async () => events.find(event => event.kind === 'stall-end'), value => !!value, 'stall end');
  assert(end.milliseconds >= 500 && end.observedTick === start.tick, 'renderer did not actually stall for 500ms');
  const result = await commandResult(delayed.sequence);
  assert(result.status === 'applied' && result.tick >= delayed.requestedTick + 20, `delayed semantic input did not execute at receive time: ${JSON.stringify(result)}`);
  const after = await checkpoint(first.host);
  assert(after.heldHighWater[0] === start.held.sequence && after.held[0].moveX === -1 && x(after) < x(during[1]), 'delayed valid held input did not apply');
  assert(after.snapshot.values[offsets['run.vote']] === 0, 'translated vote had no authoritative effect');
  const resumed = await status(); assert(resumed.largestGap >= 500, 'renderer callback gap missing');
  evidence('renderer-stall', `busy=${end.milliseconds.toFixed(1)}ms; renderer callback gap=${resumed.largestGap.toFixed(1)}ms; utility ticks ${tick(before)} -> ${tick(during[0])} -> ${tick(during[1])} while blocked; no input wait`);
  evidence('watchdog', `held right moved x=${x(before).toFixed(3)} -> ${x(during[0]).toFixed(3)}; at 300/390ms held neutral and x unchanged before renderer resumed (250ms host receipt watchdog)`);
  evidence('delayed-input', `original requestedTick=${delayed.requestedTick}; translated vote id=${delayed.sequence}, applied tick=${result.tick}, admission=${result.admission.disposition}; held sequence=${start.held.sequence} moved left x=${x(after).toFixed(3)}`);

  // Explicitly detach both transport/client producer generations before restore.
  await js('window.hostSmoke.detach()'); await delay(30);
  const saved = await checkpoint(first.host);
  await request(first.host, { kind: 'restore', checkpointBytes: bytes(saved) });
  const replacement = await attach(first);
  assert(replacement.command === saved.commandHighWater[0] + 1 && replacement.held === saved.heldHighWater[0], 'restored producer sequences did not seed from full sync');
  assert(replacement.phase === 'paused' && replacement.commandStatus.state === 'ready', 'restore must remain paused with a fresh ready outbox');
  const resume = await js('window.hostSmoke.resume()'); const resumeResult = await commandResult(resume.id.sequence);
  assert(resume.id.sequence === saved.commandHighWater[0] + 1, 'new client reused or skipped command ID');
  await js('window.hostSmoke.neutralProducer()');
  const continued = await until(() => checkpoint(first.host), cp => tick(cp) > tick(saved) + 3 && cp.heldHighWater[0] > saved.heldHighWater[0], 'restored producer continuation');
  evidence('restore-producer', `checkpoint tick=${tick(saved)}; detached/recreated client command=${resume.id.sequence} (${resumeResult.status}); held ${saved.heldHighWater[0]} -> ${continued.heldHighWater[0]}; continued tick=${tick(continued)}`);
  assert(first.suspend, 'trusted suspend hook absent'); first.suspend();
  const paused = await until(() => checkpoint(first.host), cp => cp.paused && cp.pauseReason === 'system-suspend', 'trusted suspend pause');
  await delay(90); const stillPaused = await checkpoint(first.host);
  assert(tick(stillPaused) === tick(paused) && stillPaused.paused, 'suspend hook auto-resumed authority');
  evidence('suspend-hook', `trusted platform callback -> system-suspend pause at tick=${tick(paused)}; remains paused; actual OS suspend NOT RUN`);
  await js('window.hostSmoke.detach()');
  const oldResponse = first.record.messages.find(message => message.kind === 'response' && message.response?.ok);
  assert(oldResponse, 'missing utility output from first generation');
  await dispose(first, 'first host');

  const second = await ready(2); await request(second.host, { kind: 'start', initBytes: bytes(init) });
  // Replay a real old response at the main seam; separately send an obsolete
  // command to the actual new utility and observe its narrowly intercepted reply.
  second.record.dispatch(oldResponse);
  const id = 900001;
  const obsolete = new Promise(done => { second.record.intercept = { id, generation: 2, resolve: done }; });
  second.record.child.postMessage({ kind: 'command', command: { kind: 'pause', reason: 'obsolete-generation', requestId: id, hostGeneration: 1 } });
  await bounded(obsolete, 'actual obsolete generation rejection');
  const healthy = await checkpoint(second.host); assert(!healthy.paused, 'stale generation mutated restarted host');
  await delay(45); assert(tick(await checkpoint(second.host)) > tick(healthy), 'stale response stopped second host');
  evidence('stale-generation', 'captured real generation-1 response replayed at main callback ignored; actual generation-1 command to generation-2 utility rejected stale-generation; new host continued');
  await dispose(second, 'second host');
  evidence('successive-hosts', 'two successive ready/start/dispose hosts; both actual utility exits observed, transport windows destroyed, owner listeners released between hosts');

  const killedUtility = await ready(3); await request(killedUtility.host, { kind: 'start', initBytes: bytes(init) });
  killedUtility.record.child.kill();
  assert(await bounded(killedUtility.reason, 'utility crash notification') === 'utility-exit', 'wrong utility crash reason');
  await released(killedUtility, 'utility kill');
  await killedUtility.host.request({ kind: 'checkpoint' }).then(() => { throw Error('dead utility accepted request'); }, error => assert(error.message === 'disposed', String(error)));
  evidence('utility-kill', 'actual native utility killed; utility-exit; paired transport destroyed; new requests rejected');
  const killedTransport = await ready(4); await request(killedTransport.host, { kind: 'start', initBytes: bytes(init) });
  expectedGone.add(killedTransport.transport.webContents);
  killedTransport.transport.webContents.forcefullyCrashRenderer();
  const reason = await bounded(killedTransport.reason, 'transport crash notification');
  assert(['transport-exit', 'utility-protocol-failure'].includes(reason), `wrong transport crash reason ${reason}`);
  await released(killedTransport, 'transport kill');
  evidence('transport-kill', `actual hidden renderer process crashed; ${reason}; paired native utility exit observed`);

  ipcMain.off('host-smoke-event', observePage); visible.destroy();
  assert(natives.every(record => record.exited) && BrowserWindow.getAllWindows().length === 0, 'owned processes/windows survived');
  assert(JSON.stringify(baseline()) === JSON.stringify(listeners), 'owned listeners survived');
  evidence('cleanup', `${natives.length}/${natives.length} native utility exits observed; zero windows/owner listeners; exact profile cleanup checked by launcher`);
  if (process.argv.includes('--inject-missing-evidence')) checks.splice(checks.indexOf('watchdog'), 1);
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ electron: process.versions.electron, checks, details,
    utilities: natives.length, exits: natives.filter(record => record.exited).length, windows: BrowserWindow.getAllWindows().length, osSuspend: 'NOT RUN' }));
}

app.on('web-contents-created', (_, contents) => {
  contents.on('render-process-gone', (_, details) => {
    if (!expectedGone.has(contents)) fail(Error(`unexpected renderer exit: ${details.reason}`));
  });
  contents.on('did-fail-load', (_, code, description) => fail(Error(`page load failed: ${code} ${description}`)));
  contents.on('console-message', event => {
    if (event.level === 'error') fail(Error(`page console error: ${event.message}`));
  });
});
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
app.whenReady().then(async () => {
  let status = 0;
  try { await bounded(run(), 'whole actual-process smoke', 30_000); }
  catch (error) { status = 1; console.error(error.stack ?? error); }
  finally {
    // Also clean up partial startup and injected-failure paths. The Node launcher
    // has a final named process-tree fallback if Electron cannot complete this.
    await Promise.allSettled(hosts.map(host => host.dispose()));
    for (const record of natives) if (!record.exited) { try { record.child.kill(); } catch {} }
    // Do not race cleanup against the already-rejected fatal promise: even an
    // injected page exception must wait for observed native child exits.
    const cleanup = await Promise.allSettled(natives.map(record => {
      let timer;
      return Promise.race([record.exit, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('failure cleanup utility exit timeout')), 3000);
      })]).finally(() => clearTimeout(timer));
    }));
    for (const result of cleanup) if (result.status === 'rejected') { status = 1; console.error(result.reason); }
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    utilityProcess.fork = originalFork;
    app.exit(status);
  }
}).catch(error => { console.error(error); app.exit(1); });
