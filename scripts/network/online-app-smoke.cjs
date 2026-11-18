// TEST ONLY executable wrapper (Web-i). Loads the unchanged compiled production app; every observation of the online
// stack happens in the page (page-probe.js, injected before any page script) and is read back here.
const electron = require('electron');
const { app, BrowserWindow, ipcMain, powerMonitor, session } = electron;
process.on('uncaughtException', e => { console.error('APP_DRIVER_UNCAUGHT', process.env.FTL_DEBUG ? e : ''); app.exit(1); });
const { resolve, join, sep } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const observeNative = require('./rtc-smoke-native.cjs');
const clickVerified = require('./online-app-click.cjs');
const directory = app.commandLine.getSwitchValue('online-app-dir');
const role = app.commandLine.getSwitchValue('online-app-role');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (app.isPackaged || !directory || !['host', 'guest', 'filler', 'incompatible'].includes(role)
  || resolve(profile) !== resolve(directory, role) || !resolve(profile).startsWith(resolve(directory) + sep)) throw Error('isolated test profile required');
app.setPath('userData', profile);
app.disableHardwareAcceleration();
// Multiple real app windows in automation must not be treated as occluded by the harness terminal.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const recoveryObserve = app.commandLine.hasSwitch('recovery-observe-worker');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function checkpointProof(bytes) {
  const b = Buffer.from(bytes), cp = JSON.parse(b.toString());
  return { payloadSha256: hash(b), runId: cp.init.runId, tick: cp.snapshot.header.tick, phase: cp.phase,
    commandHighWater: cp.commandHighWater, heldHighWater: cp.heldHighWater, botMemoryHash: hash(JSON.stringify(cp.botControllers)), botMemory: cp.botControllers,
    reconciledBotMemory: require(join(directory, 'observer/utility.cjs')).reconciledMemory(cp), snapshotHash: hash(JSON.stringify(cp.snapshot)) };
}
// Everything main accumulates from the page probe (onlineProbe.take() drains the page's queues; these keep them).
const recovery = { gets: [], puts: [], restores: [], captures: [], phases: [], invalidations: [], clicks: [], heldUploads: 0 };
const workerRecords = [];   // by creation index
let mirrorReceipts = [], visible, stopping = false, holdQuit = false, ignoreDriver = false, exitSnapshot, exitAnsweredAt;
const delay = ms => new Promise(done => setTimeout(done, ms));
// Every page call has an explicit bound; a caller with a longer documented budget passes its own.
const js = (source, ms = 4000) => Promise.race([visible.webContents.executeJavaScript(source),
  delay(ms).then(() => { throw Error('page-call-timeout'); })]);
const bound = (list, value) => { list.push(value); if (list.length > 64) list.shift(); };
async function absorb() {
  if (!visible || visible.isDestroyed()) return;
  const taken = await js('window.onlineProbe.take()');
  for (const body of taken.bodies) bound(body.method === 'PUT' ? recovery.puts : recovery.gets, checkpointProof(Buffer.from(body.bytes, 'base64')));
  if (taken.pendingBody) recovery.pending = checkpointProof(Buffer.from(taken.pendingBody, 'base64'));
  for (const w of taken.workers) {
    const record = workerRecords[w.index] ??= { index: w.index, producerChanges: [], evidence: null };
    Object.assign(record, { exited: w.terminated, errored: w.errored, runId: w.runId, utilityEpoch: w.utilityEpoch, hostGeneration: w.hostGeneration,
      initialCaptureTick: w.initialCaptureTick, periodicCapturedTick: w.periodicCapturedTick, bootstrapAfterCommit: w.bootstrapAfterCommit });
    record.producerChanges.push(...w.producerChanges);
    for (const capture of w.captures) bound(recovery.captures, { cause: capture.cause, ...checkpointProof(Buffer.from(capture.bytes, 'base64')) });
    for (const restore of w.restores) bound(recovery.restores, checkpointProof(Buffer.from(restore, 'base64')));
    recovery.invalidations.push(...w.invalidations);
    if (w.evidence.length) {
      record.evidence = w.evidence.at(-1); const path = join(directory, `${role}-utility-${w.index}.json`);
      writeFileSync(path, JSON.stringify(record.evidence));
      if (record.evidence.lateReplyRejected > 0) writeFileSync(path + '.late.json', JSON.stringify(record.evidence));
    }
  }
  Object.assign(recovery, { heldUploads: taken.heldUploads, mainBlockedMs: taken.mainBlockedMs || undefined,
    exitCommitDelayMs: taken.exitCommitDelayMs, exitCommitAcknowledged: taken.exitCommitAcknowledged, phases: taken.phases });
  mirrorReceipts = taken.mirrorReceipts;
}
const workerView = () => workerRecords.map(({ index, exited, errored, producerChanges }) => ({ index, exited: !!exited, errored: !!errored, producerChanges }));
// The recovery gate's Worker: the observer prelude, then the exactly-instrumented production chunk (page-probe.ts runs
// it from a blob in place of the production URL). The hashes of both sides are written for the report.
function recoveryWorkerSource() {
  const source = readFileSync(resolve(__dirname, '../../out/renderer/assets/authorityWorker.js'), 'utf8'), transformed = require('./online-recovery-instrument.cjs')(source);
  writeFileSync(join(directory, `${role}.instrumentation.json`), JSON.stringify({ sourceSha256: hash(source), observedSha256: hash(transformed),
    transformSha256: hash(readFileSync(require.resolve('./online-recovery-instrument.cjs'))) }));
  return readFileSync(join(directory, 'observer/recovery-worker.js'), 'utf8') + '\n' + transformed;
}
// Instrument before the page loads: rtcNative, the probe and the observer run in the page's main world before any page
// script, from a session preload (online-app-probe-preload.cjs) that fetches this source synchronously. (A CDP
// Page.addScriptToEvaluateOnNewDocument sent before the first navigation never answers in Electron 37.)
const probeSource = [`(${observeNative.toString()})({forceRelay:${app.commandLine.hasSwitch('internet-force-relay')}});`,
  readFileSync(join(directory, 'observer/page-probe.js'), 'utf8'),
  recoveryObserve ? `window.onlineProbe.set({ recoveryObserve: true }); window.onlineProbe.recoveryWorkerSource = ${JSON.stringify(recoveryWorkerSource())};` : '',
  readFileSync(join(directory, 'observer/observer.js'), 'utf8')].join('\n');
app.on('browser-window-created', (_, window) => {
  if (visible) return;   // the production app opens exactly one window
  visible = window;
  const diagnosticContext = { role, page: 'application' };
  window.webContents.on('preload-error', (_e, p, err) => console.error('APP_PRELOAD_ERROR', diagnosticContext, process.env.FTL_DEBUG ? err : ''));
  // Local debugging only (FTL_DEBUG=1, never set by the gates): page lifecycle and console lines on stderr.
  if (process.env.FTL_DEBUG) { window.webContents.on('did-finish-load', () => console.error('DBG loaded', window.webContents.getURL())); window.webContents.on('did-fail-load', (...a) => console.error('DBG fail', a.slice(1,4))); window.webContents.on('console-message', d => console.error('DBG console', d.level, String(d.message).slice(0,300))); window.webContents.on('render-process-gone', (_e,d) => console.error('DBG gone', d)); }
  window.webContents.on('console-message', details => { if (details.level === 'error') console.error('APP_PAGE_ERROR', diagnosticContext); });
});
// The close handshake: snapshot the page after its session's exit save and disposal, just before the window closes.
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) => handle(channel, channel !== 'app:prepare-exit' ? fn : async (event, ...args) => {
  try { await absorb(); exitSnapshot = { ...(await js('window.onlineProbe.counts()', 1000)), native: await js('window.rtcNative?.status()', 1000) }; } catch { /* page already gone */ }
  const answered = fn(event, ...args); if (answered === true) exitAnsweredAt = Date.now(); return answered;
});
const checkpointPuts = [];
const header = (headers, name) => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null;
app.whenReady().then(() => {
  ipcMain.on('online-test:probe-source', event => { event.returnValue = event.sender === visible?.webContents ? probeSource : ''; });
  session.defaultSession.registerPreloadScript({ type: 'frame', filePath: resolve(__dirname, 'online-app-probe-preload.cjs') });
  session.defaultSession.webRequest.onSendHeaders({ urls: ['*://*/v2/rooms/*/checkpoint'] }, details => {
    if (details.method === 'PUT') bound(checkpointPuts, { id: details.id, sentAt: Date.now(), header: header(details.requestHeaders, 'X-FTL-Checkpoint') });
  });
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/v2/rooms/*/checkpoint'] }, details => {
    const put = checkpointPuts.find(p => p.id === details.id); if (put) { put.status = details.statusCode; put.completedAt = Date.now(); }
  });
});
const decodeHeader = value => { try { return JSON.parse(Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')); } catch { return null; } };
async function closeWindow() {
  const closeAt = Date.now(), closed = new Promise(done => visible.once('closed', done));
  visible.close();   // the production close: app:prepare-exit, the page's exit save, then close
  await Promise.race([closed, delay(5000)]);
  return { closeAt, exitAnsweredAt: exitAnsweredAt ?? null, closed: visible.isDestroyed(), snapshot: exitSnapshot ?? null,
    puts: checkpointPuts.filter(p => p.sentAt >= closeAt).map(p => ({ status: p.status ?? null, elapsedMs: (p.completedAt ?? Infinity) - closeAt, metadata: p.header && decodeHeader(p.header) })) };
}
const armPorts = () => js('window.onlineProbe.set({ countPorts: true })');
async function click(id) {
  await armPorts();
  const attempts = await clickVerified({
    prepare: async () => {
      visible.focus();
      return js(`(() => { const id=${JSON.stringify(id)}, e=document.querySelector('[data-testid="'+id+'"]'); if(!e||e.disabled) throw Error('unavailable control');
        window.onlineDriverHit='miss'; const listener=event=>{const target=event.target.closest?.('[data-testid]'); window.onlineDriverHit=target?.dataset.testid===id?'target':event.target.closest?.('button,input,select')?'other':'miss';};
        window.onlineDriverClickListener=listener;document.addEventListener('click',listener,true);
        const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    },
    send: point => { visible.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); visible.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 }); },
    settle: () => delay(60),
    observed: () => js(`(() => {document.removeEventListener('click',window.onlineDriverClickListener,true);delete window.onlineDriverClickListener;return window.onlineDriverHit;})()`)
  });
  bound(recovery.clicks, { id, attempts });
}
async function resources() {
  await absorb();
  return { bounds: visible.getBounds(), minimized: visible.isMinimized(), visible: visible.isVisible(), focused: visible.isFocused(),
    rendererPid: visible.webContents.getOSProcessId(), workers: workerView(), windows: BrowserWindow.getAllWindows().length,
    ports: await js('window.onlineProbe.openPorts()'), native: [await js('window.rtcNative.status()')], listeners: ipcMain.listenerCount('app:online-config') };
}
async function command(message) {
  switch (message.command) {
    case 'status': {
      const page = await js(`(async () => ({status:(await window.__ftliteOnlineTest.readStatus()).status, observations:window.onlineAppObservation(), keys:window.onlineAppKeys, text:document.body.innerText, hidden:document.hidden, focused:document.hasFocus()}))()`);
      await absorb();
      return { ...page, electron: process.versions.electron, recovery,
        mirrorProof: { receipts: mirrorReceipts, workers: workerRecords.map(({ runId, utilityEpoch, hostGeneration, initialCaptureTick, periodicCapturedTick, bootstrapAfterCommit }) =>
          ({ runId, utilityEpoch, hostGeneration, initialCaptureTick, periodicCapturedTick, bootstrapAfterCommit })) } };
    }
    case 'delay-exit-commit': return js('window.onlineProbe.set({ delayExitCommit: true })');
    case 'hold-upload': return js('window.onlineProbe.set({ holdUploads: true })');
    case 'block-next-grant': return js('window.onlineProbe.set({ blockNextGrant: true })');
    case 'hold-restore': return js('window.onlineProbe.set({ holdRestore: true })');
    case 'release-restore': return js('window.onlineProbe.releaseRestore()');
    // The real Electron path (spec §8): main's production powerMonitor handler pushes app:suspend to the page.
    case 'suspend-hook': powerMonitor.emit('suspend'); return true;
    case 'ignore-driver': ignoreDriver = true; return true;
    case 'resize': {
      if (![[1280, 720], [640, 480]].some(([w, h]) => message.width === w && message.height === h)) throw Error('invalid test size');
      visible.setMinimumSize(640, 480); visible.setContentSize(message.width, message.height); await delay(150); return true;
    }
    case 'layout': return js(`(() => { const rect = e => { const r=e.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}; }; return {width:innerWidth,height:innerHeight,menu:rect(document.querySelector('[data-testid="session-menu"]')),canvas:rect(document.querySelector('canvas'))}; })()`);
    case 'click': await click(message.id); return true;
    case 'open-multiplayer': await click('multiplayer'); return true;
    // The sector's test-only entry (H-2 spec §10) through the test facade (Web-i deviation D-1).
    case 'host-sector': if (!Number.isSafeInteger(message.capacity)) throw Error('invalid test capacity');
      await armPorts(); await js(`void window.__ftliteOnlineTest.host({mode:'sector',capacity:${message.capacity}}); true`); return true;
    case 'join-sector': if (!/^[0-9A-Z]{8}$/.test(String(message.code))) throw Error('invalid test code');
      await armPorts(); await js(`void window.__ftliteOnlineTest.join(${JSON.stringify(message.code)},'sector'); true`); return true;
    case 'type': await click(message.id); visible.webContents.insertText(message.text); return true;
    case 'capacity': await click('capacity'); visible.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' }); visible.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home' });
      for (let i = 1; i < message.value; i++) { visible.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); visible.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' }); }
      visible.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); visible.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); return true;
    case 'key': visible.restore(); visible.show(); visible.focus(); visible.webContents.focus(); await js('document.activeElement?.blur()'); visible.webContents.sendInputEvent({ type: message.down ? 'keyDown' : 'keyUp', keyCode: message.key }); return true;
    case 'focus': visible.restore(); visible.show(); visible.focus(); visible.webContents.focus(); return true;
    case 'blur': visible.blur(); visible.minimize(); return true;
    case 'screenshot': {
      visible.show(); visible.focus(); await delay(300);
      if (!visible.webContents.debugger.isAttached()) visible.webContents.debugger.attach('1.3');
      const capture = await visible.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const bytes = Buffer.from(capture.data, 'base64'); if (bytes.length < 1000) throw Error('empty screenshot');
      writeFileSync(message.path, bytes); return { bytes: bytes.length };
    }
    case 'resources': return resources();
    case 'resource-counts': { const r = await resources(); return { workers: r.workers, windows: r.windows, ports: r.ports, listeners: r.listeners, rendererPid: r.rendererPid }; }
    // Only --inject-transport-failure uses this; the run must then fail. Every native peer connection in the page closes.
    case 'transport-death': return js('window.rtcNative.closeAll()');
    // The next lobby request waits 1.2 s: the window the old slow hidden-window load gave the cancel case.
    case 'delay-next-transport': return js('window.onlineProbe.set({ delayNextFetch: true })');
    // The close gate: hold the quit that follows the last window until this reply is sent (see the message handler).
    case 'close-window': { holdQuit = true; await js('window.onlineProbe.set({ stopping: true })').catch(() => {}); return closeWindow(); }
    case 'shutdown': {
      stopping = true;
      const budget = Number.isFinite(message.shutdownBudgetMs) ? Math.max(0, Math.min(4500, message.shutdownBudgetMs)) : 4500, began = performance.now();
      let closedResult = { snapshot: null };
      if (visible && !visible.isDestroyed()) {
        await js('window.onlineProbe.set({ stopping: true })', 500).catch(() => {});
        closedResult = await Promise.race([closeWindow(), delay(budget).then(() => ({ snapshot: exitSnapshot ?? null }))]);
      }
      if (visible && !visible.isDestroyed()) visible.destroy();
      // No exit snapshot (the page never answered app:prepare-exit): ports are unobserved, so the result cannot pass.
      const s = closedResult.snapshot ?? { workers: workerRecords.length, workerExits: workerRecords.filter(w => w.exited).length, workerErrors: workerRecords.filter(w => w.errored).length,
        ports: null, observedPagePorts: 0, native: { connections: [] } };
      const connections = s.native?.connections ?? [];
      const result = { workers: s.workers, workerExits: s.workerExits, workerErrors: s.workerErrors, workerIds: workerRecords.map(w => w.index),
        windows: BrowserWindow.getAllWindows().length, ports: s.ports, listeners: ipcMain.listenerCount('app:online-config'),
        peers: connections.filter(c => c.state !== 'closed').length, nativePeersObserved: connections.length,
        nativePeerCloses: connections.filter(c => c.state === 'closed').length, nativePeersEndedWithPage: 0, observedPagePorts: s.observedPagePorts };
      result.shutdownComplete = result.workers === result.workerExits && result.windows === 0 && result.ports === 0 && result.listeners === 0 && result.peers === 0;
      if (recovery.exitCommitAcknowledged !== undefined) result.exitCommitAcknowledged = recovery.exitCommitAcknowledged;
      result.exitCommitDelayMs = recovery.exitCommitDelayMs ?? 0;
      result.shutdownElapsedMs = Math.min(budget, performance.now() - began);
      process.send?.({ id: message.requestId, result }, () => app.exit(result.shutdownComplete ? 0 : 1)); return;
    }
    default: throw Error('unknown driver command');
  }
}
// Hold the wrapper alive long enough to report the shutdown (or close-gate) result.
app.on('window-all-closed', event => { if (stopping || holdQuit) event?.preventDefault?.(); });
app.on('before-quit', event => { if (stopping || holdQuit) event.preventDefault(); });
const diagnosticCommands = new Set(['status', 'click', 'open-multiplayer', 'host-sector', 'join-sector', 'type', 'capacity', 'key', 'focus', 'blur', 'resize', 'layout', 'screenshot',
  'resources', 'resource-counts', 'transport-death', 'delay-next-transport', 'shutdown', 'close-window', 'delay-exit-commit', 'hold-upload', 'hold-restore', 'release-restore', 'block-next-grant', 'suspend-hook']);
process.on('message', message => { if (ignoreDriver) return; void command(message).then(result => {
  if (message.command === 'shutdown') return;
  // After the close gate the window is gone: reply, then exit as the production app's window-all-closed would have.
  if (message.command === 'close-window') { process.send?.({ id: message.requestId, result }, () => app.exit(0)); return; }
  process.send?.({ id: message.requestId, result }); })
  .catch(error => { if (process.env.FTL_DEBUG) console.error('CMD_ERR', message?.command, error); return process.send?.({ id: Number.isSafeInteger(message?.requestId) ? message.requestId : 0, error: 'app-driver-command-failed',
    command: diagnosticCommands.has(message?.command) ? message.command : 'unknown', reason: ['native-click-not-delivered', 'native-click-wrong-control'].includes(error?.message) ? error.message : 'command-failed' }); }); });
require(role === 'incompatible' ? join(directory, 'incompatible-build/main/index.js') : '../../out/main/index.js');
