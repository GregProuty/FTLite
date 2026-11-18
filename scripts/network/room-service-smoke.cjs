// Test composition (Web-i): the shipping service client in main; production page transports, the page-owned production
// Worker host and the production sector client in two endpoint pages (rtc-page.html).
const { app, BrowserWindow, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { writeFileSync } = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const observeNative = require('./rtc-smoke-native.cjs');
const directory = app.commandLine.getSwitchValue('room-service-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init: fixtureInit } = require(join(directory, 'client/rtc-smoke-client.cjs'));
const { createRoomServiceClient } = require(join(directory, 'client/service-client.cjs'));
const baseUrl = app.commandLine.getSwitchValue('service-url');
const workerUrl = pathToFileURL(resolve(__dirname, '../../out/renderer/assets/authorityWorker.js')).href;
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: fixtureInit.simVersion, contentDigest: fixtureInit.contentDigest, hostGeneration: 1 };
const compatibility = { ...identity, protocolVersion: 2, layoutHash: fixtureInit.layoutHash }; delete compatibility.hostGeneration;
const assert = (condition, message) => { if (!condition) throw Error(message); };
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const peers = [], pairs = [], timers = [];
let stopping = false, renewTimer, pollTimer, fatalError, rejectFatal, sequence = 0, delayedOffer = false;
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
const call = (window, method, ...args) => js(window, `window.rtcPage.${method}(${args.map(a => JSON.stringify(a === undefined ? null : a)).join(', ')})`);
const native = peer => js(peer.window, 'window.rtcNative.status()');
async function closeAttempt(peer) {
  const attempt = peer.attempt; if (!attempt || attempt.closed) return;
  attempt.closed = true;
  await call(peer.window, 'closeAttempt', 'peer', attempt.link.attemptId);
  await call(peer.window, 'release', 'peer', attempt.link.attemptId);
}
function event(peer, value) {
  if (value.type === 'roster') { peer.snapshot = value.snapshot; if (['lost', 'ended'].includes(value.snapshot.phase)) void closeAttempt(peer).catch(fail); }
  else if (value.type === 'link-issued') {
    assert(!peer.attempt || peer.attempt.closed, 'live native attempt overwritten');
    const attempt = { link: value.link, started: ++sequence, closed: false, ready: 0 };
    peer.attempt = attempt; peer.attempts.push(attempt);
    // Registration and start are issued in order; readiness must NOT block later signal delivery.
    attempt.registered = call(peer.window, 'startAttempt', 'peer', { ...value.link, iceServers: [] });
    void attempt.registered.then(() => call(peer.window, 'readiness', 'peer', value.link.attemptId)).then(outcome => {
      if (attempt.closed || stopping) return;
      if (!outcome.ok) throw Error('native attempt failed: ' + outcome.error);
      attempt.cap = outcome.value; attempt.ready = ++sequence;
      return peer.service.request({ type: 'link-ready', attemptId: value.link.attemptId });
    }).catch(error => { if (!attempt.closed && !stopping) fail(error); });
  } else if (value.type === 'signal') {
    const attempt = peer.attempt;
    assert(attempt && !attempt.closed && value.signal.attemptId === attempt.link.attemptId, 'signal arrived before registered native attempt');
    assert(++peer.receivedSignals <= 512, 'signal observation budget');
    void attempt.registered.then(() => call(peer.window, 'receiveSignal', 'peer', value.signal)).then(applied => {
      if (!applied.ok && !attempt.closed && !stopping) fail(Error('native signal application failed: ' + applied.error));
    }, error => { if (!attempt.closed && !stopping) fail(error); });
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
          // Labelled adversarial wire injection only; replies still come from the actual Worker.
          if (peer.mutateSignal) {
            const frame = JSON.parse(text);
            if (frame.type === 'signal') { frame.signal = peer.mutateSignal(frame.signal); peer.mutateSignal = undefined; text = JSON.stringify(frame); }
          }
          socket.send(text);
        } };
    } });
  peer.off = peer.service.onEvent(value => { try { event(peer, value); } catch (error) { fail(error); } });
}
async function makePeer(guest) {
  const window = new BrowserWindow({ show: guest, width: 640, height: 240, webPreferences: { nodeIntegration: false, contextIsolation: true,
    sandbox: true, backgroundThrottling: false, webSecurity: true, preload: join(__dirname, 'rtc-smoke-preload.cjs') } });
  const peer = { window, attempts: [], receivedSignals: 0, events: [] };
  const receive = (e, value) => {
    if (e.sender !== window.webContents || e.senderFrame !== window.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error('endpoint page exception')); else peer.events.push(value);
  };
  ipcMain.on('rtc-smoke-event', receive); window.once('closed', () => ipcMain.off('rtc-smoke-event', receive));
  window.webContents.on('render-process-gone', () => { if (!stopping) fail(Error('endpoint renderer exited')); });
  await window.loadFile(join(directory, 'page/rtc-page.html'), { query: { worker: workerUrl } });
  await js(window, `(${observeNative.toString()})()`);
  await call(window, 'createTransport', 'peer', identity);
  peers.push(peer); service(peer);
  return peer;
}
// Each page's transport signals reach the service in issue order; the first offer is delayed 75 ms once.
async function pollSignals() {
  for (const peer of peers) {
    if (stopping || peer.window.isDestroyed()) continue;
    for (const { signal } of await call(peer.window, 'takeSignals')) {
      const attempt = peer.attempt;
      if (stopping || !attempt || attempt.closed || signal.attemptId !== attempt.link.attemptId) continue;
      const send = () => { if (!attempt.closed && !stopping) void peer.service.request({ type: 'signal', signal }).catch(fail); };
      if (!delayedOffer && signal.kind === 'description' && signal.description.type === 'offer') { delayedOffer = true; timers.push(setTimeout(send, 75)); }
      else send();
    }
  }
}
async function issue(h, g) {
  h.serviceReady = g.serviceReady = 0;
  const result = await h.service.request({ type: 'link-request', guestSeatId: g.session.seatId });
  await until(async () => h.serviceReady && g.serviceReady, Boolean, 'both native/service ready');
  assert(h.attempt.link.attemptId === result.attemptId && g.attempt.link.attemptId === result.attemptId, 'pair correlation');
  assert(h.attempt.link.identity.seatGeneration === g.session.seatGeneration && g.attempt.link.identity.seatGeneration === g.session.seatGeneration, 'guest-generation mapping');
  assert((await call(h.window, 'counts')).workers === 0, 'authority created before committed start');
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
  const h = await makePeer(false), g = await makePeer(true);
  pollTimer = setInterval(() => { void pollSignals().catch(fail); }, 5);
  const original = await h.service.create(compatibility, 2);
  g.session = await g.service.join(original.snapshot.joinCode, compatibility);
  h.session = await h.service.join(original.snapshot.joinCode, compatibility, original.seatToken);
  assert(h.session.seatGeneration === 2 && g.session.seatGeneration === 1, 'unequal initial generations missing');
  h.snapshot = await h.service.connect(h.session); g.snapshot = await g.service.connect(g.session);
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
  assert((await call(h.window, 'startHost', identity)).ok, 'Worker host start failed'); order.authorityCreated = ++sequence;
  const started = await call(h.window, 'hostRequest', { kind: 'start', initBytes: Buffer.from(bytes(init)).toString('base64') });
  assert(started.ok && started.value.ok, 'actual authority start failed');
  await call(g.window, 'attachClient', 'peer', g.attempt.link.attemptId, 1, init.runId);
  const subscribed = await until(async () => g.events.find(value => value.kind === 'subscribed'), Boolean, 'guest subscription');
  assert(subscribed.canAllocate === false, 'guest input enabled before full ACK');
  assert((await js(g.window, 'window.rtcSmoke.status()')).publication === null, 'publication before authority attachment');
  const attached = await call(h.window, 'relayToHost', 'peer', h.attempt.link.attemptId, 'service-guest', [1], h.attempt.cap.latestPayloadLimit);
  assert(attached.ok, 'authority attachment failed'); order.attached = ++sequence;
  await until(() => js(g.window, 'window.rtcSmoke.status()'), s => s.canAllocate && s.controls.ack > 0 && s.controls['full-received'] > 0, 'actual guest full ACK');
  if (process.argv.includes('--inject-page-failure')) { await js(g.window, 'window.rtcSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'page fault'); }
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});
  const command = await js(g.window, 'window.rtcSmoke.pause(false)');
  assert(command?.id.player === 1, 'owned guest command missing');
  const applied = await until(() => js(g.window, 'window.rtcSmoke.status()'), s => s.results.some(r => r.id.player === 1 && r.id.sequence === command.id.sequence && r.status === 'applied'), 'applied owned command');
  const publication = applied.publication;
  const authoritative = await call(h.window, 'observerCall', 'peer', h.attempt.link.attemptId, 'publication', publication.publicationSequence);
  assert(authoritative && JSON.stringify(authoritative) === JSON.stringify(publication), 'guest/authority publication mismatch');
  const checkpoint = await call(h.window, 'hostRequest', { kind: 'checkpoint' }); assert(checkpoint.ok && checkpoint.value.ok, 'authority checkpoint failed');
  const saved = JSON.parse(Buffer.from(checkpoint.value.checkpointBytes, 'base64').toString('utf8'));
  assert(saved.init.runId === init.runId && publication.runId === init.runId, 'service/authority/guest runId mismatch');
  const statuses = await Promise.all(peers.map(native));
  assert(statuses.every(s => s.connections.at(-1).selected && s.connections.at(-1).direct), 'actual selected direct route missing');
  const observed = await call(h.window, 'observerCall', 'peer', h.attempt.link.attemptId, 'stats');
  const gameplay = { fullReceipts: observed.fullReceipts, validatedAcks: observed.validatedAcks, appliedCommands: 1, matchedPublications: 1, runIdentity: true, direct: true };
  await js(g.window, 'window.rtcSmoke.dispose()');
  for (const peer of peers) { peer.off(); peer.service.close(); await closeAttempt(peer); }
  const closed = await until(async () => Promise.all(peers.map(native)), all => all.every(s => s.timers === 0 && s.connections.every(pc => pc.state === 'closed'
    && pc.listeners === 0 && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0))), 'native resource cleanup');
  stopping = true; clearInterval(renewTimer); clearInterval(pollTimer); for (const timer of timers) clearTimeout(timer);
  const hostCounts = await call(h.window, 'dispose'), guestCounts = await call(g.window, 'dispose');
  // Shared gate rule (Tasks 9-11): every page MessagePort the endpoint pages created ends closed or transferred.
  const portsOpen = hostCounts.ports.open + guestCounts.ports.open, portsCreated = hostCounts.ports.created + guestCounts.ports.created;
  assert(portsOpen === 0 && hostCounts.ports.created > 0 && guestCounts.ports.created > 0, 'endpoint page port left open');
  for (const peer of peers) peer.window.destroy();
  assert(BrowserWindow.getAllWindows().length === 0 && ipcMain.listenerCount('rtc-smoke-event') === 0, 'owner resource leak');
  const report = { electron: process.versions.electron,
    composition: { pairs: pairs.length, hostSeatGeneration: 2, guestSeatGeneration: 1, pairSeatGeneration: pairs[0][0].link.identity.seatGeneration,
      delayedOffer, staleSignalRejected: true, crossSeatRejected: true, staleTicketCloseCode }, order, replacements, gameplay,
    cleanup: { pcs: closed.reduce((n, s) => n + s.connections.length, 0), closedPcs: closed.reduce((n, s) => n + s.connections.filter(pc => pc.state === 'closed').length, 0),
      timers: 0, listeners: 0, workers: hostCounts.workers, workerExits: hostCounts.workerExits, windows: BrowserWindow.getAllWindows().length, ports: portsOpen, portsCreated } };
  if (process.argv.includes('--inject-missing-evidence')) delete report.gameplay;
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report));
}
app.whenReady().then(async () => {
  let code = 0;
  try { await bounded(run(), 'whole local service native gate', process.argv.includes('--inject-timeout') ? 4000 : 35000); }
  catch (error) { code = 1; console.error(error.stack ?? error); }
  finally {
    stopping = true; clearInterval(renewTimer); clearInterval(pollTimer); for (const timer of timers) clearTimeout(timer);
    for (const peer of peers) { peer.off?.(); peer.service?.close(); }
    let workers = 0, workerExits = 0;
    for (const window of BrowserWindow.getAllWindows()) {
      try { const counts = await bounded(js(window, 'window.rtcPage?.dispose()'), 'failure page dispose', 3000, true); workers += counts?.workers ?? 0; workerExits += counts?.workerExits ?? 0; }
      catch { code = 1; }
      window.destroy();
    }
    console.log(`LOCAL SERVICE native cleanup: workerExits=${workerExits}/${workers}, windows=${BrowserWindow.getAllWindows().length}`);
    app.exit(code);
  }
});
