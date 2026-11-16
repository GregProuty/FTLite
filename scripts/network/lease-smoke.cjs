// Test-only native wrapper: the real built authority entry owns the gate and sim.
// Observation/continuous ingress stays inside the utility while main is blocked.
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { performance } = require('node:perf_hooks');
const { randomBytes } = require('node:crypto');
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const decode = value => JSON.parse(new TextDecoder().decode(value));

if (process.parentPort) {
  const directory = arg('lease-smoke-dir'), label = arg('utility-label'), parent = process.parentPort;
  const evidence = { firstRequestMs: null, lastGameplayMs: null, tick: 0, highWater: [0, 0], attemptsAfterDeadline: 0, rejectedAfterDeadline: 0, publications: 0, phase: 'paused' };
  const save = () => writeFileSync(join(directory, `${label}-evidence.json`), JSON.stringify(evidence));
  const sendParent = parent.postMessage.bind(parent);
  parent.postMessage = message => {
    if (message.kind === 'lease-request' && evidence.firstRequestMs === null) { evidence.firstRequestMs = performance.now(); save(); }
    return sendParent(message);
  };
  // A second controlled probe deliberately withholds subsequent renewal timer
  // opportunities so the FIRST request is still matching after >12s. Clocks and
  // gate arithmetic remain the unmodified production implementation.
  if (label === 'delayed') {
    const schedule = global.setTimeout;
    global.setTimeout = (callback, ms, ...args) => schedule(callback, ms === 5000 ? 50000 : ms, ...args);
  }
  let runId, incoming = 0;
  parent.on('message', event => {
    if (event.data.kind === 'initialize') runId = event.data.sessionLease.runId;
    if (event.data.kind !== 'attach' || label !== 'running') return;
    const port = event.ports[0], post = port.postMessage.bind(port);
    port.postMessage = frame => {
      if (frame.type === 'data') {
        const message = decode(frame.bytes), now = performance.now();
        if (message.kind === 'state') {
          const state = message.state; evidence.publications++;
          if (state.tick > evidence.tick || state.commandHighWater.some((n, i) => n > evidence.highWater[i])) evidence.lastGameplayMs = now;
          evidence.tick = state.tick; evidence.highWater = state.commandHighWater; evidence.phase = state.phase;
          evidence.lagTicks = state.lagTicks; evidence.lastTickDeadlineMs = state.tickTimeMs;
          save();
        } else if (message.kind === 'result' && now >= evidence.firstRequestMs + 12000 && message.result.reason === 'unavailable') {
          evidence.rejectedAfterDeadline++; save();
        }
        // Release real PortLink backpressure independently of main's event loop.
        queueMicrotask(() => port.emit('message', { data: { version: 1, type: 'ack', id: frame.id } }));
      }
      return post(frame);
    };
    const timer = setInterval(() => {
      const now = performance.now();
      if (now >= evidence.firstRequestMs + 16000) { clearInterval(timer); save(); return; }
      if (now >= evidence.firstRequestMs + 12000) evidence.attemptsAfterDeadline++;
      port.emit('message', { data: { version: 1, type: 'data', id: ++incoming, kind: 'reliable-ordered', bytes: bytes({ kind: 'command', envelope: {
        runId, id: { player: 0, sequence: evidence.highWater[0] + 1 }, requestedTick: evidence.tick,
        command: incoming % 2 ? { kind: 'stand' } : { kind: 'setPaused', paused: false }
      } }) } });
    }, 100);
    port.on('close', () => clearInterval(timer));
  });
  require(resolve(__dirname, '../../out/main/authorityHost.js'));
} else {
  const { app, BrowserWindow, utilityProcess, MessageChannelMain } = require('electron');
  const { startHostProcess } = require('../../out/main/hostProcess.js');
  const { createHostPlatform } = require('../../out/main/transportWindow.js');
  const directory = app.commandLine.getSwitchValue('lease-smoke-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
  const probe = app.commandLine.getSwitchValue('lease-probe');
  if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated-profile-required');
  app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
  const { init } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
  const identity = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
  const natives = [], hosts = [], ports = []; let label = 'running';
  const originalFork = utilityProcess.fork;
  utilityProcess.fork = (_entry, _args, options) => {
    const child = originalFork(resolve(__filename), [`--lease-smoke-dir=${directory}`, `--utility-label=${label}`], options);
    const native = { child, label, exited: false };
    native.exit = new Promise(done => child.once('exit', () => { native.exited = true; done(); }));
    child.once('spawn', () => { native.pid = child.pid; writeFileSync(join(directory, 'owned-pids.json'), JSON.stringify(natives.map(n => n.pid).filter(Boolean))); });
    natives.push(native); return child;
  };
  const delay = ms => new Promise(done => setTimeout(done, ms));
  function bounded(promise, ms = 6000) {
    let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('native-timeout')), ms); })]).finally(() => clearTimeout(timer));
  }
  const assert = (condition, code) => { if (!condition) throw Error(code); };
  async function request(host, command) { const response = await host.request(command); assert(response.ok, 'host-command-failed'); return response; }
  const checkpoint = async host => decode((await request(host, { kind: 'checkpoint' })).checkpointBytes);
  async function start(name) {
    label = name;
    const sessionLease = { roomId: randomBytes(16).toString('hex'), runId: init.runId, hostGeneration: 1, hostSeatId: 0, utilityEpoch: randomBytes(16).toString('hex') };
    const host = await bounded(startHostProcess({ ...identity, sessionLease }, createHostPlatform())); hosts.push(host);
    const record = { host, current: null }; host.onLeaseRequest(r => { record.current = r; });
    assert(record.current, 'missing-first-renewal');
    await request(host, { kind: 'start', initBytes: bytes(init) }); return record;
  }
  const grant = request => ({ roomId: request.roomId, hostGeneration: request.hostGeneration, hostSeatId: request.hostSeatId, nonce: request.nonce, expiresAtEpochMs: Date.now() + 15000 });
  async function run() {
    await app.whenReady(); let report = { status: 'FAIL', diagnostic: 'native-failure' };
    try {
      const running = await start('running');
      if (probe === 'fault') throw Error('injected-fault');
      if (probe === 'timeout' || probe === 'cleanup-timeout') await new Promise(() => {});
      const delayed = await start('delayed'), delayedRequest = delayed.current;
      await running.host.applyLease(running.current, grant(running.current)); await running.host.completeBootstrap();
      const channel = new MessageChannelMain(); ports.push(channel.port1);
      await running.host.attachPeer('controlled-human', [0], channel.port2); channel.port1.start();
      const startMs = performance.now();
      // Actual main-thread stall: utility threads/processes continue running.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 16000);
      const stallMs = performance.now() - startMs; await delay(100);
      const observed = JSON.parse(readFileSync(join(directory, 'running-evidence.json'), 'utf8'));
      assert(observed.tick > 100 && observed.publications > 100, 'missing-running-evidence');
      assert(observed.phase === 'paused' && observed.lastGameplayMs <= observed.firstRequestMs + 12000, 'lease-deadline-violation');
      assert(observed.attemptsAfterDeadline > 10 && observed.rejectedAfterDeadline > 10, 'missing-closed-admission-evidence');
      const fenced = await checkpoint(running.host);
      assert(fenced.snapshot.header.tick === observed.tick && fenced.commandHighWater.every((n, i) => n === observed.highWater[i]), 'fenced-state-changed');
      assert(fenced.held.every(h => h.moveX === 0 && h.moveY === 0 && !h.interactHeld), 'held-not-neutral');
      let delayedMatchingRejected = false;
      try { await delayed.host.applyLease(delayedRequest, grant(delayedRequest)); } catch { delayedMatchingRejected = true; }
      assert(delayedMatchingRejected, 'late-matching-grant-accepted');
      const delayedCp = await checkpoint(delayed.host); assert(delayedCp.snapshot.header.tick === 0 && delayedCp.phase === 'paused', 'late-grant-ticked');
      await running.host.applyLease(running.current, grant(running.current));
      await delay(100); const fresh = await checkpoint(running.host);
      const freshPaused = fresh.phase === 'paused' && fresh.snapshot.header.tick === observed.tick;
      // Force a harmless paused publication to expose the new clock epoch's debt.
      await request(running.host, { kind: 'pause', reason: 'fresh-grant-observation' });
      const pausedEvidence = JSON.parse(readFileSync(join(directory, 'running-evidence.json'), 'utf8'));
      assert(freshPaused && pausedEvidence.lagTicks === 0, 'fresh-grant-not-paused-or-debt-retained');
      channel.port1.postMessage({ version: 1, type: 'data', id: 10000, kind: 'reliable-ordered', bytes: bytes({ kind: 'command', envelope: {
        runId: init.runId, id: { player: 0, sequence: fresh.commandHighWater[0] + 1 }, requestedTick: fresh.snapshot.header.tick, command: { kind: 'setPaused', paused: false }
      } }) });
      await delay(100); const resumed = await checkpoint(running.host);
      const explicitResume = resumed.phase === 'running' && resumed.snapshot.header.tick > observed.tick && resumed.snapshot.header.tick - observed.tick < 20;
      assert(explicitResume, 'explicit-resume-failed');
      report = { status: 'PASS', diagnostic: 'controlled-grant-proof', electron: process.versions.electron, stallMs,
        utilityEvidence: observed, delayedMatchingRejected, delayedRequestAgeLowerBoundMs: performance.now() - startMs,
        delayedProbe: 'renewal timer withheld; matching request aged beyond local lifetime; real utility clocks',
        freshPaused, freshLagTicks: pausedEvidence.lagTicks, explicitResume, resumedTicks: resumed.snapshot.header.tick - observed.tick };
    } catch (error) { report.diagnostic = ['injected-fault', 'native-timeout', 'missing-first-renewal', 'host-command-failed', 'missing-running-evidence', 'lease-deadline-violation', 'missing-closed-admission-evidence', 'fenced-state-changed', 'held-not-neutral', 'late-matching-grant-accepted', 'late-grant-ticked', 'fresh-grant-not-paused-or-debt-retained', 'explicit-resume-failed'].includes(error.message) ? error.message : 'native-failure'; }
    finally {
      for (const port of ports) port.close();
      for (const host of hosts) await host.dispose();
      for (const native of natives) { if (!native.exited) native.child.kill(); await bounded(native.exit, 3000); }
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
      report.utilities = natives.length; report.exits = natives.filter(n => n.exited).length; report.windows = BrowserWindow.getAllWindows().length;
      writeFileSync(join(directory, 'native-report.json'), JSON.stringify(report, null, 2));
      app.exit(report.status === 'PASS' ? 0 : 1);
    }
  }
  run().catch(() => app.exit(1));
}
