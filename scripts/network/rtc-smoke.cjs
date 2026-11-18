// Native loopback gate (Web-i): production page transports, the page-owned production Worker host, native peers and
// streams. The only broker is a trusted, bounded local test relay in main; no service/WAN claim.
const { app, BrowserWindow, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const observeNative = require('./rtc-smoke-native.cjs');
const directory = app.commandLine.getSwitchValue('rtc-smoke-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init } = require(join(directory, 'client/rtc-smoke-client.cjs'));
const { checkpoint: fixture, offsets } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const workerUrl = pathToFileURL(resolve(__dirname, '../../out/renderer/assets/authorityWorker.js')).href;
const crewX = checkpoint => checkpoint.snapshot.values[offsets['crew.0.x']];
const vote = checkpoint => checkpoint.snapshot.values[offsets['run.vote']];
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const assert = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(done => setTimeout(done, ms));
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const b64 = value => Buffer.from(value).toString('base64');
const pairs = [], checks = [], details = {}, guestPorts = { created: 0, open: 0 };
let hostPage, router, pumping = false, stopping = false, fatalError, rejectFatal;
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
const js = (window, source, ms = 5000) => bounded(window.webContents.executeJavaScript(source), 'renderer call', ms);
const source = (method, args) => `window.rtcPage.${method}(${args.map(a => JSON.stringify(a === undefined ? null : a)).join(', ')})`;
const call = (window, method, ...args) => js(window, source(method, args));
/** A page call with its own budget (readiness keeps the old 31 s native budget instead of the 5 s renderer-call cap). */
const callWithin = (ms, window, method, ...args) => js(window, source(method, args), ms);
const host = (method, ...args) => call(hostPage, method, ...args);
const nativeStatus = window => js(window, 'window.rtcNative.status()');
async function request(command) {
  const wire = command.kind === 'start' ? { ...command, initBytes: b64(command.initBytes) } : command.kind === 'restore' ? { ...command, checkpointBytes: b64(command.checkpointBytes) } : command;
  const result = await host('hostRequest', wire); assert(result.ok && result.value.ok, 'authority request failed'); return result.value;
}
async function checkpoint() { return JSON.parse(Buffer.from((await request({ kind: 'checkpoint' })).checkpointBytes, 'base64').toString('utf8')); }
/** The first failed readiness of a pair, or its readiness when both succeed (as Promise.all over the old two promises). */
function firstOutcome(settled) {
  return new Promise((done, reject) => {
    // A page call that itself rejects (a timed-out js()) rejects the outcome instead of escaping as an unhandled rejection.
    for (const promise of settled) promise.then(value => { if (!value.ok) done(value); }, reject);
    Promise.all(settled).then(values => done(values.find(value => !value.ok) ?? { ok: true, value: values.map(value => value.value) }), reject);
  });
}
async function status(record) {
  const value = await js(record.guest, 'window.rtcSmoke.status()');
  if (record.observed) {
    const notifications = await host('observerCall', 'host', record.id, 'notifications');
    for (const delivery of value.deliveries) {
      const actual = notifications.find(note => note.key === delivery.key && note.floor === delivery.floor && note.tick === delivery.tick);
      assert(actual && delivery.confirmedSequence >= actual.floor && delivery.confirmedTick >= actual.tick, 'actual notification floor violated at dequeue');
    }
  }
  return value;
}
function exactPositions(points, confirmed, label) {
  assert(points.length === confirmed.length && points.length > 0 && new Set(points.map(point => point.id)).size === points.length, label + ' identities');
  for (const point of points) {
    const canonical = confirmed.find(value => value.id === point.id);
    assert(canonical && Object.is(point.x, canonical.x) && Object.is(point.y, canonical.y), label + ' canonical coordinates');
  }
}
function canonicalPositions(value) {
  return Array.from({ length: value.snapshot.header.playerCount }, (_, player) => ({ id: `crew:${player}`,
    x: value.snapshot.values[offsets[`crew.${player}.x`]], y: value.snapshot.values[offsets[`crew.${player}.y`]] }));
}
async function page(guest) {
  const window = new BrowserWindow({ show: guest, width: 640, height: 240, webPreferences: { nodeIntegration: false, contextIsolation: true,
    sandbox: true, backgroundThrottling: false, webSecurity: true, preload: join(__dirname, 'rtc-smoke-preload.cjs') } });
  const events = [];
  const receive = (event, value) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error('RTC page exception'));
    else { if (events.length >= 128) fail(Error('page event budget')); events.push(value); }
  };
  ipcMain.on('rtc-smoke-event', receive); window.once('closed', () => ipcMain.off('rtc-smoke-event', receive));
  window.webContents.on('render-process-gone', () => { if (!stopping) fail(Error('RTC page renderer exited')); });
  await window.loadFile(join(directory, 'page/rtc-page.html'), { query: { worker: workerUrl } });
  await js(window, `(${observeNative.toString()})()`);   // installed before the page's first RTCPeerConnection
  assert(await js(window, 'typeof process === "undefined" && typeof require === "undefined"'), 'RTC page has Node');
  if (guest) window.show();
  return { window, events };
}
// The bounded local broker: exact route and identity validation, then delivery in issue order.
function deliver(record, destination, name, signal, from, to) {
  if (stopping || record.closed || record.cancel) return;
  if (++record.signals > 512 || signal.attemptId !== record.id || signal.roomId !== record.rtcIdentity.roomId || signal.hostGeneration !== 1
    || signal.seatGeneration !== 1 || signal.from !== from || signal.to !== to) { fail(Error('local broker identity rejected')); return; }
  void call(destination, 'receiveSignal', name, signal).then(applied => {
    if (applied.ok || stopping || record.closed) return;
    if (!(record.wrongTicket || record.staleGeneration) || applied.error !== 'rtc-attempt-failed') fail(Error('local broker application failed'));
  }, error => { if (!stopping && !record.closed) fail(error); });
}
async function pump() {
  if (pumping || stopping || !hostPage) return; pumping = true;
  try {
    for (const { signal } of await host('takeSignals')) {
      const record = pairs.find(r => r.id === signal.attemptId && !r.guest.isDestroyed());
      if (record) deliver(record, record.guest, 'guest', signal, 'host', record.rtcIdentity.remoteConnectionId);
    }
    for (const record of pairs) {
      if (record.guest.isDestroyed()) continue;
      for (const { signal } of await call(record.guest, 'takeSignals')) deliver(record, hostPage, 'host', signal, record.rtcIdentity.remoteConnectionId, 'host');
    }
  } catch (error) { fail(error); } finally { pumping = false; }
}
let nextAttempt = 0;
async function pair(options = {}) {
  const guest = await page(options.player !== undefined);
  await call(guest.window, 'createTransport', 'guest', identity);
  assert((await call(guest.window, 'counts')).workers === 0 && (await host('counts')).workers === 3, 'guest created authority');
  const id = `loopback-${++nextAttempt}`, localTicket = randomBytes(32).toString('hex'), remoteTicket = randomBytes(32).toString('hex');
  const rtcIdentity = { ...identity, protocolVersion: 2, runId: init.runId, roomId: 'local-test-room', layoutHash: init.layoutHash,
    seatGeneration: 1, localConnectionId: 'host', remoteConnectionId: `guest-${nextAttempt}` };
  const record = { id, guest: guest.window, events: guest.events, rtcIdentity, signals: 0, ready: false, closed: false, observed: false, ...options };
  pairs.push(record);
  const base = { attemptId: id, identity: rtcIdentity, ticketExpiresAtEpochMs: Date.now() + 30000, iceServers: [], localTicket, expectedRemoteTicket: remoteTicket };
  await call(guest.window, 'startAttempt', 'guest', { ...base, role: 'answerer', localTicket: remoteTicket,
    expectedRemoteTicket: options.wrongTicket ? randomBytes(32).toString('hex') : localTicket,
    identity: { ...rtcIdentity, localConnectionId: rtcIdentity.remoteConnectionId, remoteConnectionId: 'host' } });
  if (options.player !== undefined) {
    // The production client on the guest's own attempt port, in the same page as its transport (the app's topology).
    await call(guest.window, 'attachClient', 'guest', id, options.player);
    const subscribed = await until(async () => record.events.find(event => event.kind === 'subscribed'), Boolean, 'visible subscription');
    assert(subscribed.canAllocate === false, 'producer enabled before validated state');
  }
  await host('startAttempt', 'host', { ...base, role: 'offerer' });
  const readiness = (ms = 5000) => [callWithin(ms, hostPage, 'readiness', 'host', id), callWithin(ms, guest.window, 'readiness', 'guest', id)];
  if (options.cancel) {
    await Promise.all([host('closeAttempt', 'host', id), call(guest.window, 'closeAttempt', 'guest', id)]);
    const outcome = await bounded(firstOutcome(readiness()), 'cancelled readiness');
    assert(!outcome.ok && outcome.error === 'rtc-cancelled', 'wrong cancellation rejection');
    record.closed = true; return record;
  }
  if (options.staleGeneration) {
    const stale = await call(guest.window, 'receiveSignal', 'guest', { attemptId: id, roomId: rtcIdentity.roomId, seatGeneration: 1, from: 'host', to: rtcIdentity.remoteConnectionId,
      hostGeneration: 2, kind: 'candidate', candidate: null });
    assert(stale.ok || stale.error === 'rtc-attempt-failed', 'wrong stale rejection');
  }
  if (options.wrongTicket || options.staleGeneration) {
    const outcome = await bounded(firstOutcome(readiness()), 'invalid native admission');
    assert(!outcome.ok && outcome.error === 'rtc-attempt-failed', 'wrong native rejection');
    return record;
  }
  const caps = await bounded(Promise.all(readiness(31000)), 'native RTC readiness', 31000);
  assert(caps.every(cap => cap.ok && cap.value.latestPayloadLimit === 16088), 'negotiated cap missing'); record.ready = true;
  if (options.player !== undefined) {
    assert((await status(record)).publication === null, 'authority attached before readiness');
    const attached = await host('relayToHost', 'host', id, `native-${record.player}`, [record.player], caps[0].value.latestPayloadLimit);
    assert(attached.ok, 'authority attachment failed'); record.observed = true;
    const first = await until(() => status(record), value => value.canAllocate && value.publication?.publicationSequence > 0, 'first validated full/ACK');
    assert(first.controls['full-received'] > 0 && first.controls.ack > 0, 'receipt and validated ACK not independent');
  }
  return record;
}
async function closePair(record) {
  record.closed = true;
  await Promise.all([host('closeAttempt', 'host', record.id), call(record.guest, 'closeAttempt', 'guest', record.id)]);
  if (record.player !== undefined) await js(record.guest, 'window.rtcSmoke.dispose()');
  await host('release', 'host', record.id);
  await until(() => nativeStatus(record.guest), value => value.connections.every(pc => pc.state === 'closed' && pc.listeners === 0
    && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0)) && value.timers === 0 && !value.held, 'closed guest native resources');
  await call(record.guest, 'release', 'guest', record.id); await call(record.guest, 'disposeTransport', 'guest');
  // Shared gate rule (Tasks 9-11): the disposed page transport left no page MessagePort open.
  const ports = await call(record.guest, 'ports');
  assert(ports.created > 0 && ports.open === 0, 'guest page port left open');
  guestPorts.created += ports.created; guestPorts.open += ports.open;
  record.guest.destroy();
}
async function match(record) {
  const value = await status(record), remote = value.publication;
  const authoritative = await host('observerCall', 'host', record.id, 'publication', remote?.publicationSequence ?? 0);
  assert(remote && authoritative && remote.tick === authoritative.tick && remote.hash === authoritative.hash, 'matched authority identity missing');
  assert(JSON.stringify(remote.snapshot) === JSON.stringify(authoritative.snapshot), 'matched canonical image differs');
  assert(JSON.stringify(remote.commandHighWater) === JSON.stringify(authoritative.commandHighWater), 'matched input watermarks differ');
  assert(JSON.stringify(remote) === JSON.stringify(authoritative), 'matched complete publication differs');
  return remote;
}
const stats = record => host('observerCall', 'host', record.id, 'stats');
async function applied(record, command) {
  assert(command, 'producer did not allocate command');
  const value = await until(() => status(record), state => state.results.some(result => result.id.player === command.id.player && result.id.sequence === command.id.sequence), 'real command result');
  const result = value.results.find(result => result.id.player === command.id.player && result.id.sequence === command.id.sequence);
  const delivery = value.deliveries.find(note => note.key === `result:${command.id.player}:${command.id.sequence}`);
  assert(result.status === 'applied' && result.admission?.disposition === 'terminal' && delivery, 'production command was not applied/dequeued'); return { value, result, delivery };
}
async function run() {
  assert(process.versions.electron === '37.10.3', 'wrong Electron');
  hostPage = (await page(false)).window;
  router = setInterval(() => { void pump(); }, 5);
  // Early startup failures, each injected inside the spawn task (Web-i rewrite of the pre-spawn kill=false checks).
  for (const [mode, reason] of [['abort-after-spawn', 'cancelled'], ['crash-on-spawn', 'worker-exit']]) {
    const settled = await host('startHost', identity, mode);
    assert(!settled.ok && settled.error === reason, 'wrong early failure');
  }
  await until(() => host('counts'), value => value.workers === 2 && value.workerExits === 2 && value.workerErrors === 1, 'early Worker terminations');
  evidence('early-cleanup', 'abort inside the spawn task and a Worker error before readiness both rejected; both Workers terminated');
  assert((await host('startHost', identity)).ok, 'host start failed');
  await request({ kind: 'start', initBytes: bytes(init) });
  await request({ kind: 'restore', checkpointBytes: bytes(fixture) });
  const first = await pair({ player: 0 }), second = await pair({ player: 1 });
  const windows = [hostPage, first.guest, second.guest], pids = windows.map(window => window.webContents.getOSProcessId());
  assert(new Set(pids).size === 3 && (await host('counts')).workers === 3, 'renderers not separate');
  for (const window of windows) {
    const preferences = window.webContents.getLastWebPreferences();
    assert(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration && preferences.webSecurity
      && !window.webContents.getBackgroundThrottling(), 'unsafe topology');
  }
  assert(!hostPage.isVisible() && first.guest.isVisible() && second.guest.isVisible(), 'wrong visible topology');
  evidence('topology', { pages: 3, distinctRenderers: 3, liveWorkers: 1, guestAuthorities: 0 });
  if (process.argv.includes('--inject-page-failure')) { await js(first.guest, 'window.rtcSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'page failure'); }
  if (process.argv.includes('--inject-child-failure')) throw Error('injected Electron child failure');
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});
  evidence('first-full-ack', { first: (await status(first)).controls, second: (await status(second)).controls });
  assert((await stats(first)).maxInputBytes === 0 && (await stats(second)).maxInputBytes === 0, 'input preceded first full/ACK');
  // Initial authority is paused; real player control opens the run.
  await applied(first, await js(first.guest, 'window.rtcSmoke.pause(false)'));
  await js(first.guest, 'window.rtcSmoke.produce(0)'); await js(second.guest, 'window.rtcSmoke.produce(0)');
  await until(checkpoint, cp => cp.snapshot.header.tick >= 9, 'authority running');
  const held = await js(first.guest, 'window.rtcSmoke.primeHeld()');
  const before = await until(checkpoint, cp => cp.held[0].moveX === 1 && cp.heldHighWater[0] >= held.sequence, 'held admission');
  // The first guest's page (its client AND its transport) stalls; the host page and the other guest keep running.
  const otherBefore = (await nativeStatus(second.guest)).connections[0].channels.reduce((sum, dc) => sum + dc.received, 0);
  const stall = js(first.guest, 'window.rtcSmoke.stall()'); void stall.catch(fail);
  const start = await until(async () => first.events.find(event => event.kind === 'stall-start'), Boolean, 'stall start');
  await delay(300); const duringA = await checkpoint();
  await delay(90); const duringB = await checkpoint(), otherDuring = await nativeStatus(second.guest);
  assert(!first.events.some(event => event.kind === 'stall-end'), 'watchdog observation occurred after stall');
  assert(duringA.snapshot.header.tick > before.snapshot.header.tick && duringB.snapshot.header.tick > duringA.snapshot.header.tick, 'Worker blocked by guest');
  assert(duringA.held[0].moveX === 0 && duringB.held[0].moveX === 0, 'receipt watchdog did not neutralize');
  assert(crewX(duringA) === crewX(duringB) && crewX(duringA) > crewX(before), 'watchdog position was not stable');
  assert(otherDuring.connections[0].channels.reduce((sum, dc) => sum + dc.received, 0) > otherBefore, 'the other guest RTC blocked with the stalled guest');
  const delayed = await stall, end = first.events.find(event => event.kind === 'stall-end');
  assert(end.milliseconds >= 500 && end.observedTick === start.tick, 'visible stall missing');
  const command = await applied(first, delayed), after = await checkpoint();
  assert(command.result.tick > delayed.requestedTick + 15, 'delayed command did not execute later');
  assert(vote(after) === 0, 'delayed vote did not change authority');
  await until(checkpoint, value => value.held[0].moveX === -1 && crewX(value) < crewX(duringB), 'delayed held movement');
  assert(after.heldHighWater[1] > 0 && after.commandHighWater[1] === 0, 'peer input ownership crossed');
  evidence('stall-watchdog-command', { busyMs: end.milliseconds, ticks: [before.snapshot.header.tick, duringA.snapshot.header.tick, duringB.snapshot.header.tick],
    commandRequestedTick: delayed.requestedTick, commandAppliedTick: command.result.tick, hostContinued: true, otherGuestRtcContinued: true, watchdogStable: true });
  await js(first.guest, 'window.rtcSmoke.produce(-1)');
  let matches = 0;
  for (let i = 0; i < 16; i++) { await delay(35); await match(first); await match(second); matches += 2; }
  assert((await status(first)).sawInterpolation, 'presentation never differed from confirmed position');
  evidence('canonical-presentation', { matchedPublications: matches, interpolationSeparate: true });
  await js(hostPage, 'window.rtcNative.fault("drop")');
  await until(() => nativeStatus(hostPage), value => value.faults.dropped === 1, 'harness latest drop');
  await js(hostPage, 'window.rtcNative.fault("reorder")');
  await until(() => nativeStatus(hostPage), value => value.faults.reordered === 1, 'harness latest reorder');
  await delay(100); await match(first); await match(second);
  evidence('harness-latest-loss-reorder', { boundary: 'native RTCDataChannel.send, state latest only', dropped: 1, reversedPairs: 1, canonicalRecovered: true, measuredWanLoss: false });
  const recoveryBefore = await stats(first);
  await js(first.guest, 'window.rtcSmoke.suppressAcks(true); window.rtcSmoke.produce(0)');
  const evicted = await until(() => status(first), value => value.stream.resyncs > 0 && value.suppressedAcks >= 64 && value.controls.refresh > 0, 'real baseline eviction/full refresh', 8000);
  await js(first.guest, 'window.rtcSmoke.suppressAcks(false)');
  await until(() => status(first), value => value.controls.ack > evicted.controls.ack + 2 && value.canAllocate, 'post-refresh validated ACK');
  const recoveryAfter = await stats(first);
  assert(recoveryAfter.refreshes > recoveryBefore.refreshes && recoveryAfter.fullReceipts > recoveryBefore.fullReceipts, 'refresh/receipt missing on authority path');
  await match(first); evidence('harness-base-eviction-refresh', { boundary: 'guest client Link validated ACK suppression', suppressed: evicted.suppressedAcks,
    receiverResyncs: evicted.stream.resyncs, reliableFullReceipts: recoveryAfter.fullReceipts, canonicalRecovered: true });
  const cadence = await stats(first), ordinary = cadence.packets.filter(packet => packet.kind === 'delta');
  assert(ordinary.length >= 80 && ordinary.every(packet => packet.tick % 3 === 0), 'ordinary stream did not obey 20Hz tick cadence');
  assert(ordinary.every((packet, index) => index === 0 || packet.tick - ordinary[index - 1].tick >= 3), 'ordinary cadence exceeded 20Hz');
  assert(ordinary.every(packet => packet.bytes < packet.fullBytes && packet.bytes <= 16088), 'delta was not smaller/capped');
  assert(cadence.maxImageBytes > 0 && cadence.maxImageBytes <= 131072 && cadence.maxInputBytes > 0 && cadence.maxInputBytes <= 4096, 'actual framed byte caps');
  evidence('cadence-byte-caps', { deltas: ordinary.length, tickModulo: 3, maxImageBytes: cadence.maxImageBytes, maxInputBytes: cadence.maxInputBytes });
  await js(first.guest, 'window.rtcSmoke.produce(1)');
  const pauseAction = await js(first.guest, 'window.rtcSmoke.pauseDuringInterpolation()');
  assert(pauseAction.before.publication.phase === 'running' && pauseAction.before.interpolationLag > 1e-4, 'pause did not begin during active interpolation');
  const paused = await applied(first, pauseAction.command);
  const cp = await checkpoint(), matched = await match(first);
  assert(cp.paused && matched.phase === 'paused' && matched.tick === cp.snapshot.header.tick && JSON.stringify(matched.snapshot) === JSON.stringify(cp.snapshot), 'paused checkpoint differs');
  assert(paused.value.events.some(event => event.payload.kind === 'pause' && event.payload.paused && event.tick === matched.tick), 'covering pause event missing');
  const pausePacket = (await stats(first)).packets.find(packet => packet.sequence === matched.publicationSequence);
  assert(pausePacket?.kind === 'full' && pausePacket.tick === paused.result.tick, 'pause was not immediate full');
  const snapped = await status(first), pausedCanonicalPositions = canonicalPositions(cp);
  exactPositions(snapped.confirmedPositions, pausedCanonicalPositions, 'paused replica');
  exactPositions(snapped.presentation, pausedCanonicalPositions, 'pause snap');
  await delay(80); exactPositions((await status(first)).presentation, pausedCanonicalPositions, 'paused future sample');
  // LABELLED INJECTION: hold the actual covering state at the guest client Link boundary after real RTC/PortLink receipt.
  await js(first.guest, 'window.rtcSmoke.holdStates()');
  const heldCommand = await js(first.guest, 'window.rtcSmoke.pause(true)');
  const heldKey = `result:${heldCommand.id.player}:${heldCommand.id.sequence}`;
  const heldView = await until(() => status(first), value => value.heldPublications.length === 1
    && value.notifications.some(note => note.key === heldKey)
    && value.notifications.some(note => note.kind === 'event' && note.floor === value.heldPublications[0].sequence), 'held covering full and original notifications');
  const heldSequence = heldView.heldPublications[0].sequence;
  const heldNotifications = heldView.notifications.filter(note => note.floor === heldSequence);
  assert(heldNotifications.some(note => note.key === heldKey) && heldNotifications.some(note => note.kind === 'event')
    && heldNotifications.every(note => note.tick === matched.tick) && heldSequence > matched.publicationSequence,
    'same-tick result/event wire floors missing');
  for (let poll = 0; poll < 5; poll++) {
    const withheld = await status(first);
    assert(withheld.publication.publicationSequence === matched.publicationSequence && withheld.publication.tick === matched.tick
      && !withheld.deliveries.some(note => heldNotifications.some(expected => expected.key === note.key)), 'same-tick notification escaped before covering full');
    await delay(20);
  }
  assert(await js(first.guest, 'window.rtcSmoke.releaseStates()') === 1, 'covering full release missing');
  const covered = await applied(first, heldCommand);
  const sameTick = await until(() => status(first), value => value.publication?.controlRevision > matched.controlRevision
    && heldNotifications.every(note => value.deliveries.some(delivery => delivery.key === note.key && delivery.floor === heldSequence)), 'covering full result/event dequeue');
  const sameTickPacket = (await stats(first)).packets.find(packet => packet.sequence === sameTick.publication.publicationSequence);
  assert(sameTick.publication.tick === matched.tick && sameTickPacket?.kind === 'full' && sameTick.publication.publicationSequence > matched.publicationSequence,
    'same-tick control did not publish immediate full');
  await match(first);
  evidence('pause-full-checkpoint', { tick: matched.tick, sequence: matched.publicationSequence, sameTickControlSequence: sameTick.publication.publicationSequence,
    sameTickControlFull: true, coveringResultEvent: true, canonicalCheckpointExact: true, presentationSnapped: true,
    pauseFromInterpolation: true, pauseLag: pauseAction.before.interpolationLag, sameTickNotificationWithheld: true, withheldPolls: 5,
    notificationFloorsChecked: true, heldFloor: heldSequence, resultDequeuedAtSequence: covered.delivery.confirmedSequence,
    heldDeliveries: sameTick.deliveries.filter(note => note.floor === heldSequence) });
  const selected = await Promise.all([nativeStatus(hostPage), nativeStatus(first.guest), nativeStatus(second.guest)]);
  for (const report of selected) for (const pc of report.connections) {
    assert(pc.state === 'connected' && pc.selected && pc.direct && pc.channels.length === 2, 'selected direct native route missing');
    assert(pc.channels.some(dc => dc.label === 'ftl-reliable-v1' && dc.ordered && dc.maxRetransmits === null)
      && pc.channels.some(dc => dc.label === 'ftl-latest-v1' && !dc.ordered && dc.maxRetransmits === 0)
      && pc.channels.every(dc => dc.maxPacketLifeTime === null && dc.maxBytes <= 16384), 'native channel policy wrong');
  }
  evidence('native-channels-route', { nativePcs: 4, channelsPerPc: 2, selectedRoute: 'direct', addresses: 'redacted', lossZeroMeans: 'unavailable' });
  const resume = await js(second.guest, 'window.rtcSmoke.pause(false)'); await applied(second, resume);
  await js(first.guest, 'window.rtcSmoke.produce(-1)');
  const disconnect = await js(first.guest, 'window.rtcSmoke.disconnectDuringInterpolation()');
  assert(disconnect.before.publication.phase === 'running' && disconnect.before.interpolationLag > 1e-4, 'disconnect did not begin during active interpolation');
  const lastConfirmed = await host('observerCall', 'host', first.id, 'publication', disconnect.before.publication.publicationSequence);
  assert(lastConfirmed && JSON.stringify(lastConfirmed) === JSON.stringify(disconnect.before.publication), 'disconnect confirmed state differs from authority');
  const frozenCanonicalPositions = canonicalPositions(lastConfirmed);
  exactPositions(disconnect.before.confirmedPositions, frozenCanonicalPositions, 'disconnect replica');
  for (const sample of disconnect.samples) exactPositions(sample.points, frozenCanonicalPositions, `disconnect +${sample.offsetMs}ms`);
  const disconnected = await status(first); exactPositions(disconnected.presentation, frozenCanonicalPositions, 'disconnect immediate status');
  await delay(80); const disconnectedLater = await status(first); exactPositions(disconnectedLater.presentation, frozenCanonicalPositions, 'disconnect later status');
  assert(disconnected.closed && !disconnectedLater.canAllocate && !disconnectedLater.producer, 'disconnect producer leak');
  await closePair(first);
  const isolatedTick = (await match(second)).tick; await delay(100); assert((await match(second)).tick > isolatedTick, 'first peer close broke second');
  evidence('two-peer-isolation-disconnect', { ownershipIsolated: true, survivorAdvanced: true, disconnectedPresentationFrozen: true,
    activeInterpolationAtDisconnect: true, frozenAtConfirmedPositions: true, disconnectLag: disconnect.before.interpolationLag,
    confirmedSequence: disconnect.before.publication.publicationSequence, futureSampleOffsetsMs: disconnect.samples.map(sample => sample.offsetMs) });
  for (const [label, flags] of [['wrong-ticket', { wrongTicket: true }], ['stale-generation', { staleGeneration: true }], ['cancel-attempt', { cancel: true }]]) {
    const invalid = await pair(flags); await closePair(invalid); await match(second); evidence(label, 'native rejected/cancelled; survivor canonical; native resources closed');
  }
  const transfer = await pair();
  await js(hostPage, 'window.rtcNative.fault("mid-transfer")');
  await host('probe', 'host', transfer.id);
  await until(() => nativeStatus(hostPage), value => value.faults.closedMidTransfer === 1, 'actual fragmented send close');
  await closePair(transfer); await match(second);
  evidence('mid-transfer-close', 'actual production framing, first fragment sent, native PC closed, survivor canonical');
  await closePair(second);
  const closed = await until(() => nativeStatus(hostPage), value => value.connections.every(pc => pc.state === 'closed' && pc.listeners === 0
    && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0)) && value.timers === 0, 'all host native PCs/listeners/timers closed');
  assert(closed.connections.length === 6, 'native attempts missing');
  assert(closed.connections.every(pc => pc.channels.every(dc => dc.maxBytes <= 16384)), 'native fragment exceeded packet cap');
  evidence('native-resource-cleanup', { hostPcsClosed: closed.connections.length, productionListeners: 0, productionTimers: 0 });
  stopping = true; clearInterval(router);
  assert((await host('killHostTransport')).ok, 'host transport disposal failed');
  assert(await until(() => host('hostExit'), value => value !== null, 'host exit') === 'transport-exit', 'host controller did not stop the Worker');
  const final = await host('dispose'); hostPage.destroy();
  assert(final.workers === 3 && final.workerExits === 3 && BrowserWindow.getAllWindows().length === 0, 'owner leak');
  assert(final.ports.created > 0 && final.ports.open === 0, 'host page port left open');
  assert(ipcMain.listenerCount('rtc-smoke-event') === 0, 'owner listeners leaked');
  evidence('owner-cleanup', { workers: final.workers, workerExits: final.workerExits, windows: 0, listeners: 0, relayPorts: 0,
    ports: final.ports.open + guestPorts.open, portsCreated: final.ports.created + guestPorts.created });
  if (process.argv.includes('--inject-missing-evidence')) checks.splice(checks.indexOf('cadence-byte-caps'), 1);
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ electron: process.versions.electron, checks, details }));
}
app.whenReady().then(async () => {
  let code = 0; const watchdog = setTimeout(() => fail(Error('fixed native RTC gate timeout')), process.argv.includes('--inject-timeout') ? 2500 : 35000);
  try { await bounded(run(), 'whole native RTC gate', 36000); } catch (error) { code = 1; console.error(error.stack ?? error); }
  finally {
    stopping = true; clearTimeout(watchdog); clearInterval(router);
    for (const window of BrowserWindow.getAllWindows()) {
      try { await bounded(js(window, 'window.rtcPage?.dispose()'), 'failure page dispose', 3000, true); } catch (error) { code = 1; console.error(error.message); }
      window.destroy();
    }
    app.exit(code);
  }
});
