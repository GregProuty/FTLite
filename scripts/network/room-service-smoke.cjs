// Test composition: shipping service client, native controllers, utility and sector client.
const { app, BrowserWindow, MessageChannelMain, utilityProcess, ipcMain, powerMonitor } = require('electron');
const { join, resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const { startHostProcess } = require('../../out/main/hostProcess.js');
const { startGuestTransport } = require('../../out/main/rtcTransport.js');
const observeNative = require('./rtc-smoke-native.cjs');
const directory = app.commandLine.getSwitchValue('room-service-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init: fixtureInit, createObserver } = require(join(directory, 'client/rtc-smoke-client.cjs'));
const { createRoomServiceClient } = require(join(directory, 'client/service-client.cjs'));
const baseUrl = app.commandLine.getSwitchValue('service-url');
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: fixtureInit.simVersion, contentDigest: fixtureInit.contentDigest, hostGeneration: 1 };
const compatibility = { ...identity, protocolVersion: 2, layoutHash: fixtureInit.layoutHash }; delete compatibility.hostGeneration;
const assert = (condition, message) => { if (!condition) throw Error(message); };
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const peers = [], pairs = [], ports = new Set(), removers = [], utilities = [];
let stopping = false, host, visible, renewTimer, fatalError, rejectFatal, sequence = 0, delayedOffer = false;
const fatal = new Promise((_, reject) => { rejectFatal = reject; }); void fatal.catch(() => {});
const fail = error => { if (!stopping && !fatalError) { fatalError = error; rejectFatal(error); } };
const delay = ms => new Promise(done => setTimeout(done, ms));
async function bounded(promise, label, ms = 5000, ignoreFatal = false) {
  let timer;
  try { return await Promise.race([promise, ...(ignoreFatal ? [] : [fatal]), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function until(read, predicate, label) {
  return bounded((async () => { for (;;) { if (fatalError) throw fatalError; const value = await read(); if (predicate(value)) return value; await delay(10); } })(), label);
}
const js = (window, source) => bounded(window.webContents.executeJavaScript(source), 'page call');
const native = peer => js(peer.window, 'window.rtcNative.status()');
const baseline = () => [powerMonitor.listenerCount('suspend'), ipcMain.listenerCount('net:rtc-response'), ipcMain.listenerCount('net:transport-ready')];
const originalFork = utilityProcess.fork;
utilityProcess.fork = (...args) => {
  const child = originalFork(...args), record = { child, exited: false };
  record.exit = new Promise(done => child.once('exit', () => { record.exited = true; done(); if (!stopping) fail(Error('unexpected utility exit')); }));
  utilities.push(record); return child;
};
function channel() { const value = new MessageChannelMain(); ports.add(value.port1); ports.add(value.port2); return value; }
async function closeAttempt(peer) {
  const attempt = peer.attempt; if (!attempt || attempt.closed) return;
  attempt.closed = true; await peer.controller.closeAttempt(attempt.link.attemptId);
  attempt.port.port2.close(); ports.delete(attempt.port.port2);
}
function event(peer, value) {
  if (value.type === 'roster') { peer.snapshot = value.snapshot; if (['lost', 'ended'].includes(value.snapshot.phase)) void closeAttempt(peer).catch(fail); }
  else if (value.type === 'link-issued') {
    assert(!peer.attempt || peer.attempt.closed, 'live native attempt overwritten');
    const port = channel(), attempt = { link: value.link, port, started: ++sequence, closed: false, ready: 0 };
    peer.attempt = attempt; peer.attempts.push(attempt);
    // Synchronous registration and start IPC; readiness must NOT block later signal IPC.
    attempt.readiness = peer.controller.startAttempt({ ...value.link, iceServers: [] }, port.port1); ports.delete(port.port1);
    void attempt.readiness.then(cap => {
      if (attempt.closed || stopping) return;
      attempt.cap = cap; attempt.ready = ++sequence;
      return peer.service.request({ type: 'link-ready', attemptId: value.link.attemptId });
    }).catch(error => { if (!attempt.closed && !stopping) fail(error); });
  } else if (value.type === 'signal') {
    const attempt = peer.attempt;
    assert(attempt && !attempt.closed && value.signal.attemptId === attempt.link.attemptId, 'signal arrived before registered native attempt');
    assert(++peer.receivedSignals <= 512, 'signal observation budget');
    void peer.controller.receiveSignal(value.signal).catch(error => { if (!attempt.closed && !stopping) fail(error); });
  } else if (value.type === 'link-state') {
    if (value.state === 'ready') {
      assert(peers.every(p => p.attempt?.ready > 0), 'service ready preceded native authentication');
      peer.serviceReady = ++sequence;
    } else {
      peer.closedEvent = value.attemptId;
      if (peer.attempt?.link.attemptId === value.attemptId) void closeAttempt(peer).catch(fail);
    }
  } else if (['host-departed', 'host-changed', 'error'].includes(value.type)) {
    void closeAttempt(peer).catch(fail);
    if (value.type === 'error' && !peer.replacing) fail(Error('service terminal ' + value.error.code));
  }
}
function service(peer) {
  peer.service = createRoomServiceClient({ baseUrl, allowInsecureLocalhost: true,
    clock: { nowMs: Date.now, setTimeout, clearTimeout },
    async fetch(url, init) {
      const response = await fetch(url, init);
      if (url.endsWith('/socket-ticket') && response.ok) peer.socketTicket = await response.clone().json();
      return response;
    },
    createWebSocket(url) {
      const socket = new WebSocket(url); peer.socket = socket;
      return { get readyState() { return socket.readyState; }, get bufferedAmount() { return socket.bufferedAmount; }, close: () => socket.close(),
        addEventListener: (type, callback) => socket.addEventListener(type, callback), removeEventListener: (type, callback) => socket.removeEventListener(type, callback),
        send(text) {
          // Labelled adversarial wire injection only; replies still come from actual Worker.
          if (peer.mutateSignal) {
            const frame = JSON.parse(text);
            if (frame.type === 'signal') { frame.signal = peer.mutateSignal(frame.signal); peer.mutateSignal = undefined; text = JSON.stringify(frame); }
          }
          socket.send(text);
        } };
    } });
  peer.off = peer.service.onEvent(value => { try { event(peer, value); } catch (error) { fail(error); } });
}
async function makePeer() {
  const before = new Set(BrowserWindow.getAllWindows()), controller = await startGuestTransport(identity);
  const window = BrowserWindow.getAllWindows().find(w => !before.has(w));
  await js(window, `(${observeNative.toString()})()`);
  const peer = { controller, window, attempts: [], receivedSignals: 0 }; peers.push(peer); service(peer);
  removers.push(controller.onSignal(signal => {
    const attempt = peer.attempt;
    if (stopping || !attempt || attempt.closed || signal.attemptId !== attempt.link.attemptId) return;
    const send = () => { if (!attempt.closed && !stopping) void peer.service.request({ type: 'signal', signal }).catch(fail); };
    if (!delayedOffer && signal.kind === 'description' && signal.description.type === 'offer') {
      delayedOffer = true; const timer = setTimeout(send, 75); removers.push(() => clearTimeout(timer));
    } else send();
  }));
  return peer;
}
async function issue(h, g) {
  h.serviceReady = g.serviceReady = 0;
  const result = await h.service.request({ type: 'link-request', guestSeatId: g.session.seatId });
  await until(async () => h.serviceReady && g.serviceReady, Boolean, 'both native/service ready');
  assert(h.attempt.link.attemptId === result.attemptId && g.attempt.link.attemptId === result.attemptId, 'pair correlation');
  assert(h.attempt.link.identity.seatGeneration === g.session.seatGeneration && g.attempt.link.identity.seatGeneration === g.session.seatGeneration, 'guest-generation mapping');
  assert(utilities.length === 0, 'authority created before committed start');
  pairs.push([h.attempt, g.attempt]);
  console.log('LOCAL SERVICE native pair ready:', pairs.length);
}
async function replace(peer, other) {
  const old = peer.attempt, otherOld = other.attempt, from = peer.session.seatGeneration;
  peer.replacing = true; peer.off(); peer.service.close(); await closeAttempt(peer); service(peer);
  const session = await peer.service.join(peer.session.snapshot.joinCode, compatibility, peer.session.seatToken);
  peer.session = session; peer.snapshot = await peer.service.connect(session); peer.replacing = false;
  await until(async () => other.closedEvent === otherOld.link.attemptId, Boolean, 'old attempt service invalidation');
  await until(async () => (await Promise.all(peers.map(native))).every(s => s.connections.every(pc => pc.state === 'closed')), Boolean, 'old native PCs closed');
  assert(old.closed && otherOld.closed, 'replacement left old native route live');
  return { seat: peer === peers[0] ? 'host' : 'guest', from, to: session.seatGeneration, closedPcs: 2, ready: false };
}
async function rejectedRequest(peer, mutate, code) {
  peer.mutateSignal = mutate;
  const link = peer.attempt.link;
  const signal = { attemptId: link.attemptId, roomId: link.identity.roomId, hostGeneration: link.identity.hostGeneration,
    seatGeneration: link.identity.seatGeneration, from: link.identity.localConnectionId, to: link.identity.remoteConnectionId, kind: 'candidate', candidate: null };
  await peer.service.request({ type: 'signal', signal }).then(() => { throw Error('invalid wire signal accepted'); }, error => assert(error.code === code, 'wrong rejection ' + error.code));
  console.log('LOCAL SERVICE rejected wire signal:', code);
}
async function replayTicket(peer) {
  const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + `/v2/rooms/${peer.session.snapshot.roomId}/socket`);
  try {
    return await bounded(new Promise((done, reject) => {
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'auth', ...peer.socketTicket, expiresAtEpochMs: undefined })));
      socket.addEventListener('message', () => reject(Error('replayed socket ticket admitted')));
      socket.addEventListener('close', e => done(e.code)); socket.addEventListener('error', () => reject(Error('replay socket transport failed')));
    }), 'ticket replay');
  } finally { socket.close(); }
}
async function run() {
  assert(process.versions.electron === '37.10.3', 'wrong Electron');
  const initialListeners = baseline(), h = await makePeer(), g = await makePeer();
  const original = await h.service.create(compatibility, 2);
  g.session = await g.service.join(original.snapshot.joinCode, compatibility);
  h.session = await h.service.join(original.snapshot.joinCode, compatibility, original.seatToken);
  assert(h.session.seatGeneration === 2 && g.session.seatGeneration === 1, 'unequal initial generations missing');
  h.snapshot = await h.service.connect(h.session); g.snapshot = await g.service.connect(g.session);
  // Parent invokes installed runtime's actual supported hibernation between auth/signalling.
  await bounded(new Promise((done, reject) => { process.once('message', message => message === 'hibernated' ? done() : reject(Error('runtime hibernation failed'))); process.send('hibernate'); }), 'actual hibernation');
  await issue(h, g);
  const staleTicketCloseCode = await replayTicket(g); assert(staleTicketCloseCode === 1008, 'stale ticket not rejected');
  const oldLink = h.attempt.link;
  const replacements = [await replace(g, h)]; await issue(h, g); replacements[0].ready = true;
  replacements.push(await replace(h, g)); await issue(h, g); replacements[1].ready = true;
  await rejectedRequest(h, signal => ({ ...signal, attemptId: oldLink.attemptId, seatGeneration: oldLink.identity.seatGeneration,
    from: oldLink.identity.localConnectionId, to: oldLink.identity.remoteConnectionId }), 'invalid-state');
  await rejectedRequest(g, signal => ({ ...signal, to: oldLink.identity.remoteConnectionId }), 'forbidden');
  const order = { hostNativeReady: h.attempt.ready, guestNativeReady: g.attempt.ready, serviceReady: Math.min(h.serviceReady, g.serviceReady) };
  const init = { ...fixtureInit, runId: h.session.snapshot.runId };
  const initBase64 = Buffer.from(bytes(init)).toString('base64'), initHash = createHash('sha256').update(bytes(init)).digest('hex');
  await h.service.request({ type: 'ready', ready: true }); await g.service.request({ type: 'ready', ready: true });
  await until(async () => h.snapshot.seats.every(seat => seat.ready), Boolean, 'ready roster');
  const revision = h.snapshot.rosterRevision;
  const proposal = await h.service.request({ type: 'start-propose', expectedRosterRevision: revision, initBase64, initHash });
  const committed = await h.service.request({ type: 'start-commit', proposalId: proposal.proposalId, expectedRosterRevision: revision });
  assert(committed.initBase64 === initBase64 && committed.initHash === initHash, 'committed init mismatch'); order.committed = ++sequence;
  const renew = () => h.service.request({ type: 'lease-renew', nonce: randomBytes(16).toString('hex') });
  await renew(); renewTimer = setInterval(() => { void renew().catch(fail); }, 5000);
  host = await startHostProcess(identity); order.authorityCreated = ++sequence;
  const started = await host.request({ kind: 'start', initBytes: bytes(init) }); assert(started.ok, 'actual authority start failed');
  visible = new BrowserWindow({ show: true, width: 640, height: 240, webPreferences: { nodeIntegration: false, contextIsolation: true,
    sandbox: true, backgroundThrottling: false, preload: join(__dirname, 'rtc-smoke-preload.cjs') } });
  let subscribed = false;
  const receive = (event, value) => {
    if (event.sender !== visible.webContents || event.senderFrame !== visible.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error('visible service guest page exception'));
    if (value?.kind === 'subscribed') { subscribed = true; assert(value.canAllocate === false, 'guest input enabled before full ACK'); }
  };
  ipcMain.on('rtc-smoke-event', receive); removers.push(() => ipcMain.off('rtc-smoke-event', receive));
  visible.webContents.on('render-process-gone', () => { if (!stopping) fail(Error('guest renderer exited')); });
  await visible.loadFile(join(directory, 'client/index.html'));
  visible.webContents.postMessage('rtc-smoke-port', { player: 1, runId: init.runId }, [g.attempt.port.port2]); ports.delete(g.attempt.port.port2);
  await until(async () => subscribed, Boolean, 'guest subscription');
  assert((await js(visible, 'window.rtcSmoke.status()')).publication === null, 'publication before authority attachment');
  const observer = createObserver(), authorityPorts = channel(); removers.push(() => observer.dispose());
  const relay = (from, to, incoming) => {
    const receive = event => { try { if (event.data?.type === 'data') observer.observe(new Uint8Array(event.data.bytes), incoming); to.postMessage(event.data); } catch { fail(Error('passive observation failed')); } };
    from.on('message', receive); from.start(); removers.push(() => from.off('message', receive));
  };
  relay(authorityPorts.port1, h.attempt.port.port2, true); relay(h.attempt.port.port2, authorityPorts.port1, false);
  await host.attachPeer('service-guest', [1], authorityPorts.port2, { streamed: true, latestPayloadLimit: h.attempt.cap.latestPayloadLimit });
  ports.delete(authorityPorts.port2); order.attached = ++sequence;
  const state = await until(() => js(visible, 'window.rtcSmoke.status()'), s => s.canAllocate && s.controls.ack > 0 && s.controls['full-received'] > 0, 'actual guest full ACK');
  if (process.argv.includes('--inject-page-failure')) { await js(visible, 'window.rtcSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'page fault'); }
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});
  const command = await js(visible, 'window.rtcSmoke.pause(false)');
  assert(command?.id.player === 1, 'owned guest command missing');
  const applied = await until(() => js(visible, 'window.rtcSmoke.status()'), s => s.results.some(r => r.id.player === 1 && r.id.sequence === command.id.sequence && r.status === 'applied'), 'applied owned command');
  const publication = applied.publication, authoritative = observer.publication(publication.publicationSequence);
  assert(authoritative && JSON.stringify(authoritative) === JSON.stringify(publication), 'guest/authority publication mismatch');
  const checkpoint = await host.request({ kind: 'checkpoint' }); assert(checkpoint.ok, 'authority checkpoint failed');
  const saved = JSON.parse(new TextDecoder().decode(checkpoint.checkpointBytes));
  assert(saved.init.runId === init.runId && publication.runId === init.runId, 'service/authority/guest runId mismatch');
  const statuses = await Promise.all(peers.map(native));
  assert(statuses.every(s => s.connections.at(-1).selected && s.connections.at(-1).direct), 'actual selected direct route missing');
  const gameplay = { fullReceipts: observer.stats().fullReceipts, validatedAcks: observer.stats().validatedAcks,
    appliedCommands: 1, matchedPublications: 1, runIdentity: true, direct: true };
  await js(visible, 'window.rtcSmoke.dispose()');
  for (const peer of peers) { peer.off(); peer.service.close(); await closeAttempt(peer); }
  const closed = await until(async () => Promise.all(peers.map(native)), all => all.every(s => s.timers === 0 && s.connections.every(pc => pc.state === 'closed'
    && pc.listeners === 0 && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0))), 'native resource cleanup');
  stopping = true; clearInterval(renewTimer);
  await host.dispose(); await bounded(Promise.all(utilities.map(r => r.exit)), 'actual utility exit', 5000, true);
  for (const peer of peers) await peer.controller.dispose();
  visible.destroy(); for (const off of removers.splice(0)) off(); for (const port of ports) port.close(); ports.clear();
  assert(BrowserWindow.getAllWindows().length === 0 && JSON.stringify(baseline()) === JSON.stringify(initialListeners)
    && ipcMain.listenerCount('rtc-smoke-event') === 0, 'owner resource leak');
  const report = { electron: process.versions.electron,
    composition: { pairs: pairs.length, hostSeatGeneration: 2, guestSeatGeneration: 1, pairSeatGeneration: pairs[0][0].link.identity.seatGeneration,
      delayedOffer, staleSignalRejected: true, crossSeatRejected: true, staleTicketCloseCode }, order, replacements, gameplay,
    cleanup: { pcs: closed.reduce((n, s) => n + s.connections.length, 0), closedPcs: closed.reduce((n, s) => n + s.connections.filter(pc => pc.state === 'closed').length, 0),
      timers: 0, listeners: 0, utilities: utilities.length, utilityExits: utilities.filter(r => r.exited).length, windows: BrowserWindow.getAllWindows().length, ports: ports.size } };
  if (process.argv.includes('--inject-missing-evidence')) delete report.gameplay;
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report));
}
app.whenReady().then(async () => {
  let code = 0;
  try { await bounded(run(), 'whole local service native gate', process.argv.includes('--inject-timeout') ? 4000 : 35000); }
  catch (error) { code = 1; console.error(error.stack ?? error); }
  finally {
    stopping = true; clearInterval(renewTimer);
    for (const peer of peers) { peer.off?.(); peer.service?.close(); }
    for (const off of removers.splice(0)) off();
    await Promise.allSettled(peers.map(peer => peer.controller.dispose())); await host?.dispose().catch(() => {});
    for (const port of ports) { try { port.close(); } catch {} } ports.clear();
    for (const record of utilities) if (!record.exited) record.child.kill();
    try { await bounded(Promise.all(utilities.map(r => r.exit)), 'failure utility cleanup', 5000, true); } catch { code = 1; }
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    console.log(`LOCAL SERVICE native cleanup: utilityExits=${utilities.filter(r => r.exited).length}/${utilities.length}, windows=${BrowserWindow.getAllWindows().length}, ports=${ports.size}`);
    utilityProcess.fork = originalFork; app.exit(code);
  }
});
