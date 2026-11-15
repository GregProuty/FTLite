// Native loopback gate: production owners/utility/hidden bridge/peer/streams.
// The only broker is a trusted, bounded local test provider; no service/WAN claim.
const { app, BrowserWindow, MessageChannelMain, utilityProcess, ipcMain, powerMonitor } = require('electron');
const { join, resolve } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { startHostProcess } = require('../../out/main/hostProcess.js');
const { createHostPlatform } = require('../../out/main/transportWindow.js');
const { startGuestTransport } = require('../../out/main/rtcTransport.js');
const observeNative = require('./rtc-smoke-native.cjs');
const directory = app.commandLine.getSwitchValue('rtc-smoke-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init, createObserver, createProbe } = require(join(directory, 'client/rtc-smoke-client.cjs'));
const { checkpoint: fixture, offsets } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const crewX = checkpoint => checkpoint.snapshot.values[offsets['crew.0.x']];
const vote = checkpoint => checkpoint.snapshot.values[offsets['run.vote']];
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const assert = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(done => setTimeout(done, ms));
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const natives = [], pairs = [], visibles = [], checks = [], details = {}, ports = new Set(), removers = [];
let host, hostWindow, stopping = false, fatalError, rejectFatal;
const fatal = new Promise((_, reject) => { rejectFatal = reject; }); void fatal.catch(() => {});
function fail(error) { if (!stopping && !fatalError) { fatalError = error; rejectFatal(error); } }
function evidence(name, value) { checks.push(name); details[name] = value; console.log(`ACTUAL RTC ${name}: ${JSON.stringify(value)}`); }
async function bounded(promise, label, ms = 5000, ignoreFatal = false) {
  let timer;
  try { return await Promise.race([promise, ...(ignoreFatal ? [] : [fatal]), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function until(read, predicate, label, ms = 5000) {
  const deadline = performance.now() + ms; let value;
  while (performance.now() < deadline) { if (fatalError) throw fatalError; value = await read(); if (predicate(value)) return value; await delay(10); }
  // Do not dump arbitrary reports/signals/native stats, which can contain secrets.
  throw Error(label + ' timeout');
}
const originalFork = utilityProcess.fork;
utilityProcess.fork = (...args) => {
  const child = originalFork(...args), kill = child.kill.bind(child), record = { child, exited: false, kills: [], spawned: false };
  child.kill = () => { record.killRequested = true; const pid = child.pid, result = kill(); record.kills.push({ pid, result }); return result; };
  child.once('spawn', () => { record.spawned = true; record.pid = child.pid; });
  record.exit = new Promise(done => child.once('exit', () => { record.exited = true; done(); if (!record.killRequested) fail(Error('unexpected authority utility exit')); }));
  natives.push(record); return child;
};
const baseline = () => [powerMonitor.listenerCount('suspend'), ipcMain.listenerCount('net:rtc-response'), ipcMain.listenerCount('net:transport-ready')];
let listenerBaseline;
const js = (window, source) => bounded(window.webContents.executeJavaScript(source), 'renderer call');
const status = pair => js(pair.visible, 'window.rtcSmoke.status()');
const nativeStatus = window => js(window, 'window.rtcNative.status()');
async function request(command) { const result = await host.request(command); assert(result.ok, 'authority request failed'); return result; }
async function checkpoint() { return JSON.parse(new TextDecoder().decode((await request({ kind: 'checkpoint' })).checkpointBytes)); }
async function instrument(window) { await js(window, `(${observeNative.toString()})()`); }
function channel() { const pair = new MessageChannelMain(); ports.add(pair.port1); ports.add(pair.port2); return pair; }
function relay(from, to, observer, incoming) {
  const receive = event => { try { if (event.data?.type === 'data') observer.observe(new Uint8Array(event.data.bytes), incoming); to.postMessage(event.data); } catch { fail(Error('passive relay failed')); } };
  from.on('message', receive); from.start(); removers.push(() => from.off('message', receive));
}
async function visible(player) {
  const window = new BrowserWindow({ show: true, width: 640, height: 240, webPreferences: { nodeIntegration: false, contextIsolation: true,
    sandbox: true, backgroundThrottling: false, preload: join(__dirname, 'rtc-smoke-preload.cjs') } });
  visibles.push(window); const events = [];
  const receive = (event, value) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error('visible RTC producer page exception'));
    else { if (events.length >= 128) fail(Error('page event budget')); events.push(value); }
  };
  ipcMain.on('rtc-smoke-event', receive); removers.push(() => ipcMain.off('rtc-smoke-event', receive));
  window.webContents.on('render-process-gone', () => { if (!stopping) fail(Error('visible renderer exited')); });
  await window.loadFile(join(directory, 'client/index.html')); window.show();
  assert(await js(window, 'typeof process === "undefined" && typeof require === "undefined"'), 'visible has Node');
  return { window, events, player };
}
let nextAttempt = 0;
async function pair(options = {}) {
  const before = new Set(BrowserWindow.getAllWindows()), controller = await startGuestTransport(identity);
  const hidden = BrowserWindow.getAllWindows().find(window => !before.has(window)); await instrument(hidden);
  assert(natives.length === 3, 'guest created authority');
  const id = `loopback-${++nextAttempt}`, localTicket = randomBytes(32).toString('hex'), remoteTicket = randomBytes(32).toString('hex');
  const hostPorts = channel(), guestPorts = channel(), observer = createObserver();
  const record = { id, controller, hidden, observer, hostPorts, guestPorts, signals: 0, ready: false, routes: [], ...options };
  pairs.push(record);
  if (options.player !== undefined) {
    const page = await visible(options.player); record.visible = page.window; record.events = page.events;
    record.visible.webContents.postMessage('rtc-smoke-port', { player: options.player }, [guestPorts.port2]); ports.delete(guestPorts.port2);
    await until(async () => record.events.find(event => event.kind === 'subscribed'), Boolean, 'visible subscription');
    assert(record.events[0].canAllocate === false, 'producer enabled before validated state');
  }
  const rtcIdentity = { ...identity, protocolVersion: 2, runId: init.runId, roomId: 'local-test-room', layoutHash: init.layoutHash,
    seatGeneration: 1, localConnectionId: 'host', remoteConnectionId: `guest-${nextAttempt}` };
  // Provider validates exact route/identity and bounds lifetime signal work.
  const route = (destination, from, to) => signal => {
    if (stopping || record.closed || options.cancel) return;
    if (++record.signals > 512 || signal.attemptId !== id || signal.roomId !== rtcIdentity.roomId || signal.hostGeneration !== 1
      || signal.seatGeneration !== 1 || signal.from !== from || signal.to !== to) { fail(Error('local broker identity rejected')); return; }
    void destination.receiveSignal(signal).catch(error => {
      if (stopping || record.closed) return;
      if (!(options.wrongTicket || options.staleGeneration) || error.message !== 'rtc-attempt-failed') fail(Error('local broker application failed'));
    });
  };
  record.routes.push(host.transport.onSignal(signal => { if (signal.attemptId === id) route(controller, 'host', rtcIdentity.remoteConnectionId)(signal); }));
  record.routes.push(controller.onSignal(route(host.transport, rtcIdentity.remoteConnectionId, 'host')));
  const base = { attemptId: id, identity: rtcIdentity, ticketExpiresAtEpochMs: Date.now() + 30000, iceServers: [], localTicket, expectedRemoteTicket: remoteTicket };
  const guestReady = controller.startAttempt({ ...base, role: 'answerer', localTicket: remoteTicket,
    expectedRemoteTicket: options.wrongTicket ? randomBytes(32).toString('hex') : localTicket,
    identity: { ...rtcIdentity, localConnectionId: rtcIdentity.remoteConnectionId, remoteConnectionId: 'host' } }, guestPorts.port1);
  ports.delete(guestPorts.port1);
  const hostReady = host.transport.startAttempt({ ...base, role: 'offerer' }, hostPorts.port1); ports.delete(hostPorts.port1);
  record.readiness = Promise.all([hostReady, guestReady]); void record.readiness.catch(() => {});
  if (options.cancel) {
    await Promise.all([host.transport.closeAttempt(id), controller.closeAttempt(id)]);
    await record.readiness.then(() => { throw Error('cancelled pair became ready'); }, error => assert(error.message === 'rtc-cancelled', 'wrong cancellation rejection'));
    record.closed = true; return record;
  }
  if (options.staleGeneration) {
    await controller.receiveSignal({ attemptId: id, roomId: rtcIdentity.roomId, seatGeneration: 1, from: 'host', to: rtcIdentity.remoteConnectionId,
      hostGeneration: 2, kind: 'candidate', candidate: null }).catch(error => assert(error.message === 'rtc-attempt-failed', 'wrong stale rejection'));
  }
  if (options.wrongTicket || options.staleGeneration) {
    await bounded(record.readiness.then(() => { throw Error('invalid pair became ready'); }, error => assert(error.message === 'rtc-attempt-failed', 'wrong native rejection')), 'invalid native admission');
    return record;
  }
  const caps = await bounded(record.readiness, 'native RTC readiness', 31000);
  assert(caps.every(cap => cap.latestPayloadLimit === 16088), 'negotiated cap missing'); record.ready = true;
  if (record.visible) {
    assert((await status(record)).publication === null, 'authority attached before readiness');
    const authorityPorts = channel(); record.authorityPorts = authorityPorts;
    // Raw, unmodified forward of data, storage ACK and close frames. Inspection
    // receives copies and cannot satisfy readiness or any ACK itself.
    relay(authorityPorts.port1, hostPorts.port2, observer, true); relay(hostPorts.port2, authorityPorts.port1, observer, false);
    await host.attachPeer(`native-${record.player}`, [record.player], authorityPorts.port2, { streamed: true, latestPayloadLimit: caps[0].latestPayloadLimit });
    ports.delete(authorityPorts.port2);
    const first = await until(() => status(record), value => value.canAllocate && value.publication?.publicationSequence > 0, 'first validated full/ACK');
    assert(first.controls['full-received'] > 0 && first.controls.ack > 0, 'receipt and validated ACK not independent');
  }
  return record;
}
async function closePair(record) {
  record.closed = true;
  for (const off of record.routes.splice(0)) off();
  await Promise.all([host.transport.closeAttempt(record.id), record.controller.closeAttempt(record.id)]);
  if (record.visible && !record.visible.isDestroyed()) await js(record.visible, 'window.rtcSmoke.dispose()');
  record.probe?.close('disposed');
  await until(() => nativeStatus(record.hidden), value => value.connections.every(pc => pc.state === 'closed' && pc.listeners === 0
    && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0)) && value.timers === 0 && !value.held, 'closed guest native resources');
  await record.controller.dispose(); record.observer.dispose();
}
async function match(record) {
  const value = await status(record), remote = value.publication, authoritative = record.observer.publication(remote?.publicationSequence);
  assert(remote && authoritative && remote.tick === authoritative.tick && remote.hash === authoritative.hash, 'matched authority identity missing');
  assert(JSON.stringify(remote.snapshot) === JSON.stringify(authoritative.snapshot), 'matched canonical image differs');
  assert(JSON.stringify(remote.commandHighWater) === JSON.stringify(authoritative.commandHighWater), 'matched input watermarks differ');
  assert(JSON.stringify(remote) === JSON.stringify(authoritative), 'matched complete publication differs');
  return remote;
}
async function applied(record, command) {
  assert(command, 'producer did not allocate command');
  const value = await until(() => status(record), state => state.results.some(result => result.id.player === command.id.player && result.id.sequence === command.id.sequence), 'real command result');
  const result = value.results.find(result => result.id.player === command.id.player && result.id.sequence === command.id.sequence);
  assert(result.status === 'applied' && result.admission?.disposition === 'terminal', 'production command was not applied'); return { value, result };
}
async function run() {
  assert(process.versions.electron === '37.10.3', 'wrong Electron'); listenerBaseline = baseline();
  // Same pre-spawn cancellation/kill=false regression as the host gate, using
  // the real native platform and child. No substituted spawn/kill outcomes.
  for (const label of ['cancel', 'construction-failure']) {
    const platform = createHostPlatform();
    if (label === 'construction-failure') platform.createTransport = () => { throw Error('early construction failure'); };
    const abort = new AbortController(), starting = startHostProcess({ ...identity, signal: abort.signal }, platform);
    if (label === 'cancel') abort.abort();
    await starting.then(() => { throw Error('early host became ready'); }, error => assert(error.message === (label === 'cancel' ? 'cancelled' : 'early construction failure'), 'wrong early failure'));
    const record = natives.at(-1); await bounded(record.exit, 'early actual utility exit');
    assert(record.spawned && record.kills.length === 2 && record.kills[0].pid === undefined && record.kills[0].result === false
      && record.kills[1].result === true && BrowserWindow.getAllWindows().length === 0, 'pre-spawn cancellation regression');
    assert(JSON.stringify(baseline()) === JSON.stringify(listenerBaseline), 'early listeners leaked');
  }
  evidence('early-cleanup', 'two real pre-spawn kill=false/retry=true exits');
  host = await startHostProcess(identity); hostWindow = BrowserWindow.getAllWindows()[0]; await instrument(hostWindow);
  await request({ kind: 'start', initBytes: bytes(init) });
  await request({ kind: 'restore', checkpointBytes: bytes(fixture) });
  const first = await pair({ player: 0 }), second = await pair({ player: 1 });
  const windows = [hostWindow, first.hidden, first.visible, second.hidden, second.visible], pids = windows.map(window => window.webContents.getOSProcessId());
  assert(new Set([...pids, natives.at(-1).pid]).size === 6 && natives.length === 3, 'renderers/utility not separate');
  for (const window of windows) {
    const preferences = window.webContents.getLastWebPreferences();
    assert(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration && preferences.webSecurity
      && !window.webContents.getBackgroundThrottling(), 'unsafe topology');
  }
  assert(!hostWindow.isVisible() && !first.hidden.isVisible() && !second.hidden.isVisible() && first.visible.isVisible() && second.visible.isVisible(), 'wrong visible topology');
  evidence('topology', { distinctProcesses: 6, hiddenRenderers: 3, visibleGuests: 2, liveUtilities: 1, guestAuthorities: 0 });
  if (process.argv.includes('--inject-page-failure')) { await js(first.visible, 'window.rtcSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'page failure'); }
  if (process.argv.includes('--inject-child-failure')) throw Error('injected Electron child failure');
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});
  evidence('first-full-ack', { first: (await status(first)).controls, second: (await status(second)).controls });
  assert(first.observer.stats().maxInputBytes === 0 && second.observer.stats().maxInputBytes === 0, 'input preceded first full/ACK');
  // Initial authority is paused; real player control opens the run.
  await applied(first, await js(first.visible, 'window.rtcSmoke.pause(false)'));
  await js(first.visible, 'window.rtcSmoke.produce(0)'); await js(second.visible, 'window.rtcSmoke.produce(0)');
  await until(checkpoint, cp => cp.snapshot.header.tick >= 9, 'authority running');
  const held = await js(first.visible, 'window.rtcSmoke.primeHeld()');
  const before = await until(checkpoint, cp => cp.held[0].moveX === 1 && cp.heldHighWater[0] >= held.sequence, 'held admission');
  const nativeBefore = (await nativeStatus(first.hidden)).connections[0].channels.reduce((sum, dc) => sum + dc.received, 0);
  const stall = js(first.visible, 'window.rtcSmoke.stall()'); void stall.catch(fail);
  const start = await until(async () => first.events.find(event => event.kind === 'stall-start'), Boolean, 'stall start');
  await delay(300); const duringA = await checkpoint();
  await delay(90); const duringB = await checkpoint(), nativeDuring = await nativeStatus(first.hidden);
  assert(!first.events.some(event => event.kind === 'stall-end'), 'watchdog observation occurred after stall');
  assert(duringA.snapshot.header.tick > before.snapshot.header.tick && duringB.snapshot.header.tick > duringA.snapshot.header.tick, 'utility blocked by guest');
  assert(duringA.held[0].moveX === 0 && duringB.held[0].moveX === 0, 'receipt watchdog did not neutralize');
  // Snapshot field offset is obtained from validated layout metadata in fixture helper.
  assert(crewX(duringA) === crewX(duringB) && crewX(duringA) > crewX(before), 'watchdog position was not stable');
  assert(nativeDuring.connections[0].channels.reduce((sum, dc) => sum + dc.received, 0) > nativeBefore, 'hidden RTC blocked with visible guest');
  const delayed = await stall, end = first.events.find(event => event.kind === 'stall-end');
  assert(end.milliseconds >= 500 && end.observedTick === start.tick, 'visible stall missing');
  const command = await applied(first, delayed), after = await checkpoint();
  assert(command.result.tick > delayed.requestedTick + 15, 'delayed command did not execute later');
  assert(vote(after) === 0, 'delayed vote did not change authority');
  await until(checkpoint, value => value.held[0].moveX === -1 && crewX(value) < crewX(duringB), 'delayed held movement');
  assert(after.heldHighWater[1] > 0 && after.commandHighWater[1] === 0, 'peer input ownership crossed');
  evidence('stall-watchdog-command', { busyMs: end.milliseconds, ticks: [before.snapshot.header.tick, duringA.snapshot.header.tick, duringB.snapshot.header.tick],
    commandRequestedTick: delayed.requestedTick, commandAppliedTick: command.result.tick, hiddenRtcContinued: true, watchdogStable: true });
  // Sustained ordinary traffic, matched canonical image and presentation separation.
  await js(first.visible, 'window.rtcSmoke.produce(-1)');
  let matches = 0;
  for (let i = 0; i < 16; i++) { await delay(35); await match(first); await match(second); matches += 2; }
  assert((await status(first)).sawInterpolation, 'presentation never differed from confirmed position');
  evidence('canonical-presentation', { matchedPublications: matches, interpolationSeparate: true });
  await js(hostWindow, 'window.rtcNative.fault("drop")');
  await until(() => nativeStatus(hostWindow), value => value.faults.dropped === 1, 'harness latest drop');
  await js(hostWindow, 'window.rtcNative.fault("reorder")');
  await until(() => nativeStatus(hostWindow), value => value.faults.reordered === 1, 'harness latest reorder');
  await delay(100); await match(first); await match(second);
  evidence('harness-latest-loss-reorder', { boundary: 'native RTCDataChannel.send, state latest only', dropped: 1, reversedPairs: 1, canonicalRecovered: true, measuredWanLoss: false });
  // Pin sender's last validated baseline while receiver accepts >64 fresh
  // images, evicts it, requests reliable refresh, then resumes actual ACKs.
  const recoveryBefore = first.observer.stats();
  await js(first.visible, 'window.rtcSmoke.suppressAcks(true); window.rtcSmoke.produce(0)');
  const evicted = await until(() => status(first), value => value.stream.resyncs > 0 && value.suppressedAcks >= 64 && value.controls.refresh > 0, 'real baseline eviction/full refresh', 8000);
  await js(first.visible, 'window.rtcSmoke.suppressAcks(false)');
  await until(() => status(first), value => value.controls.ack > evicted.controls.ack + 2 && value.canAllocate, 'post-refresh validated ACK');
  const recoveryAfter = first.observer.stats();
  assert(recoveryAfter.refreshes > recoveryBefore.refreshes && recoveryAfter.fullReceipts > recoveryBefore.fullReceipts, 'refresh/receipt missing on authority path');
  await match(first); evidence('harness-base-eviction-refresh', { boundary: 'guest client Link validated ACK suppression', suppressed: evicted.suppressedAcks,
    receiverResyncs: evicted.stream.resyncs, reliableFullReceipts: recoveryAfter.fullReceipts, canonicalRecovered: true });
  const stats = first.observer.stats(), ordinary = stats.packets.filter(packet => packet.kind === 'delta');
  assert(ordinary.length >= 80 && ordinary.every(packet => packet.tick % 3 === 0), 'ordinary stream did not obey 20Hz tick cadence');
  assert(ordinary.every((packet, index) => index === 0 || packet.tick - ordinary[index - 1].tick >= 3), 'ordinary cadence exceeded 20Hz');
  assert(ordinary.every(packet => packet.bytes < packet.fullBytes && packet.bytes <= 16088), 'delta was not smaller/capped');
  assert(stats.maxImageBytes > 0 && stats.maxImageBytes <= 131072 && stats.maxInputBytes > 0 && stats.maxInputBytes <= 4096, 'actual framed byte caps');
  evidence('cadence-byte-caps', { deltas: ordinary.length, tickModulo: 3, maxImageBytes: stats.maxImageBytes, maxInputBytes: stats.maxInputBytes });
  // A real same-tick pause must publish full immediately and release the
  // result/event only with the covering publication sequence.
  const pausedCommand = await js(first.visible, 'window.rtcSmoke.pause(true)'), paused = await applied(first, pausedCommand);
  const cp = await checkpoint(), matched = await match(first);
  assert(cp.paused && matched.phase === 'paused' && matched.tick === cp.snapshot.header.tick && JSON.stringify(matched.snapshot) === JSON.stringify(cp.snapshot), 'paused checkpoint differs');
  assert(paused.value.events.some(event => event.payload.kind === 'pause' && event.payload.paused && event.tick === matched.tick), 'covering pause event missing');
  const pausePacket = first.observer.stats().packets.find(packet => packet.sequence === matched.publicationSequence);
  assert(pausePacket?.kind === 'full' && pausePacket.tick === paused.result.tick, 'pause was not immediate full');
  const points = (await status(first)).presentation; await delay(80); assert(JSON.stringify((await status(first)).presentation) === JSON.stringify(points), 'paused presentation moved');
  // A second trusted control while paused advances the publication sequence
  // without advancing any tick. It must still traverse RTC as an immediate full.
  await request({ kind: 'pause', reason: 'rtc-gate-same-tick' });
  const sameTick = await until(() => status(first), value => value.publication?.controlRevision > matched.controlRevision, 'same-tick control publication');
  const sameTickPacket = first.observer.stats().packets.find(packet => packet.sequence === sameTick.publication.publicationSequence);
  assert(sameTick.publication.tick === matched.tick && sameTickPacket?.kind === 'full' && sameTick.publication.publicationSequence > matched.publicationSequence,
    'same-tick control did not publish immediate full');
  await match(first);
  evidence('pause-full-checkpoint', { tick: matched.tick, sequence: matched.publicationSequence, sameTickControlSequence: sameTick.publication.publicationSequence,
    sameTickControlFull: true, coveringResultEvent: true, canonicalCheckpointExact: true, presentationSnapped: true });
  const selected = await Promise.all([nativeStatus(hostWindow), nativeStatus(first.hidden), nativeStatus(second.hidden)]);
  for (const report of selected) for (const pc of report.connections) {
    assert(pc.state === 'connected' && pc.selected && pc.direct && pc.channels.length === 2, 'selected direct native route missing');
    assert(pc.channels.some(dc => dc.label === 'ftl-reliable-v1' && dc.ordered && dc.maxRetransmits === null)
      && pc.channels.some(dc => dc.label === 'ftl-latest-v1' && !dc.ordered && dc.maxRetransmits === 0)
      && pc.channels.every(dc => dc.maxPacketLifeTime === null && dc.maxBytes <= 16384), 'native channel policy wrong');
  }
  evidence('native-channels-route', { nativePcs: 4, channelsPerPc: 2, selectedRoute: 'direct', addresses: 'redacted', lossZeroMeans: 'unavailable' });
  // Closing one peer must leave the other's actual stream/commands usable.
  await js(first.visible, 'window.rtcSmoke.disconnect()'); const disconnected = await status(first);
  await delay(80); const disconnectedLater = await status(first);
  assert(disconnected.closed && !disconnectedLater.canAllocate && !disconnectedLater.producer && JSON.stringify(disconnected.presentation) === JSON.stringify(disconnectedLater.presentation), 'disconnect extrapolation/producer leak');
  await closePair(first);
  const resume = await js(second.visible, 'window.rtcSmoke.pause(false)'); await applied(second, resume);
  const isolatedTick = (await match(second)).tick; await delay(100); assert((await match(second)).tick > isolatedTick, 'first peer close broke second');
  evidence('two-peer-isolation-disconnect', { ownershipIsolated: true, survivorAdvanced: true, disconnectedPresentationFrozen: true });
  for (const [label, flags] of [['wrong-ticket', { wrongTicket: true }], ['stale-generation', { staleGeneration: true }], ['cancel-attempt', { cancel: true }]]) {
    const invalid = await pair(flags); await closePair(invalid); await match(second); evidence(label, 'native rejected/cancelled; survivor canonical; native resources closed');
  }
  const transfer = await pair();
  await js(hostWindow, 'window.rtcNative.fault("mid-transfer")');
  transfer.probe = createProbe(transfer.hostPorts.port2); transfer.probe.send();
  await until(() => nativeStatus(hostWindow), value => value.faults.closedMidTransfer === 1, 'actual fragmented send close');
  await closePair(transfer); await match(second);
  evidence('mid-transfer-close', 'actual production framing, first fragment sent, native PC closed, survivor canonical');
  await closePair(second);
  const closed = await until(() => nativeStatus(hostWindow), value => value.connections.every(pc => pc.state === 'closed' && pc.listeners === 0
    && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0)) && value.timers === 0, 'all host native PCs/listeners/timers closed');
  assert(closed.connections.length === 6, 'native attempts missing');
  assert(closed.connections.every(pc => pc.channels.every(dc => dc.maxBytes <= 16384)), 'native fragment exceeded packet cap');
  evidence('native-resource-cleanup', { hostPcsClosed: closed.connections.length, productionListeners: 0, productionTimers: 0 });
  stopping = true;
  const reason = new Promise(done => host.onExit(done)); await host.transport.dispose(); assert(await reason === 'transport-exit', 'host controller did not stop utility');
  await host.dispose(); await bounded(Promise.all(natives.map(record => record.exit)), 'actual utility exits', 5000, true);
  for (const window of visibles) window.destroy();
  for (const off of removers.splice(0)) off(); for (const port of ports) port.close(); ports.clear();
  assert(natives.every(record => record.exited) && BrowserWindow.getAllWindows().length === 0, 'native owner leak');
  assert(JSON.stringify(baseline()) === JSON.stringify(listenerBaseline) && ipcMain.listenerCount('rtc-smoke-event') === 0, 'owner listeners leaked');
  assert(natives.every(record => record.child.listenerCount('message') === 0 && record.child.listenerCount('spawn') === 0 && record.child.listenerCount('exit') === 0), 'native lifecycle listeners leaked');
  evidence('owner-cleanup', { utilities: natives.length, actualExits: natives.filter(record => record.exited).length, windows: 0, listeners: 0, relayPorts: ports.size });
  if (process.argv.includes('--inject-missing-evidence')) checks.splice(checks.indexOf('cadence-byte-caps'), 1);
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ electron: process.versions.electron, checks, details }));
}
app.whenReady().then(async () => {
  let code = 0; const watchdog = setTimeout(() => fail(Error('fixed native RTC gate timeout')), process.argv.includes('--inject-timeout') ? 2500 : 35000);
  try { await bounded(run(), 'whole native RTC gate', 36000); } catch (error) { code = 1; console.error(error.stack ?? error); }
  finally {
    stopping = true; clearTimeout(watchdog);
    for (const off of removers.splice(0)) off();
    await Promise.allSettled(pairs.map(record => record.controller.dispose())); await host?.dispose().catch(() => {});
    for (const port of ports) { try { port.close(); } catch {} } ports.clear();
    for (const record of natives) if (!record.exited) record.child.kill();
    try { await bounded(Promise.all(natives.map(record => record.exit)), 'failure cleanup actual exits', 5000, true); } catch (error) { code = 1; console.error(error.message); }
    for (const window of BrowserWindow.getAllWindows()) window.destroy(); utilityProcess.fork = originalFork; app.exit(code);
  }
});
