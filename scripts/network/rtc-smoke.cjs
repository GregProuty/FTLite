// Minimal real Electron pair proof. Production owners, preload, RTCPeerConnection,
// MessagePorts, authority utility and sector remote client; injected local broker only.
const { app, BrowserWindow, MessageChannelMain, utilityProcess, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const { startHostProcess } = require('../../out/main/hostProcess.js');
const { startGuestTransport } = require('../../out/main/rtcTransport.js');
const directory = app.commandLine.getSwitchValue('rtc-smoke-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init, createClient } = require(join(directory, 'client/rtc-smoke-client.cjs'));
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const assert = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(done => setTimeout(done, ms));
async function bounded(promise, label, ms = 5000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}
const native = [], originalFork = utilityProcess.fork;
utilityProcess.fork = (...args) => {
  const child = originalFork(...args), record = { child, exited: false };
  record.exit = new Promise(done => child.once('exit', () => { record.exited = true; done(); })); native.push(record); return child;
};
let host, guest, remote, brokerFailure, stopping = false;
async function run() {
  assert(process.versions.electron === '37.10.3', 'wrong Electron');
  host = await startHostProcess(identity);
  assert(BrowserWindow.getAllWindows().length === 1 && native.length === 1, 'host must reuse its single hidden window');
  guest = await startGuestTransport(identity);
  assert(BrowserWindow.getAllWindows().length === 2 && native.length === 1, 'guest spawned utility or extra window');
  for (const window of BrowserWindow.getAllWindows()) {
    const p = window.webContents.getLastWebPreferences();
    assert(!window.isVisible() && p.sandbox && p.contextIsolation && !p.nodeIntegration && !window.webContents.getBackgroundThrottling(), 'unsafe topology');
  }
  const result = await host.request({ kind: 'start', initBytes: new TextEncoder().encode(JSON.stringify(init)) }); assert(result.ok, 'authority start failed');
  const hostPorts = new MessageChannelMain(), guestPorts = new MessageChannelMain();
  // Install the real guest client BEFORE either port transfer or synchronous authority attachment.
  remote = createClient(guestPorts.port2);
  const relay = controller => signal => { void controller.receiveSignal(signal).catch(error => { if (!stopping) brokerFailure = error; }); };
  host.transport.onSignal(relay(guest)); guest.onSignal(relay(host.transport));
  const base = { attemptId: 'native-pair', identity: { ...identity, protocolVersion: 2, runId: init.runId, roomId: 'local-room',
    layoutHash: init.layoutHash, seatGeneration: 1, localConnectionId: 'host', remoteConnectionId: 'guest' },
    ticketExpiresAtEpochMs: Date.now() + 30000, iceServers: [], localTicket: 'native-host', expectedRemoteTicket: 'native-guest' };
  // Answerer starts first so the injected main broker never needs an unbounded signal queue.
  const guestReady = guest.startAttempt({ ...base, role: 'answerer', localTicket: 'native-guest', expectedRemoteTicket: 'native-host',
    identity: { ...base.identity, localConnectionId: 'guest', remoteConnectionId: 'host' } }, guestPorts.port1);
  const hostReady = host.transport.startAttempt({ ...base, role: 'offerer' }, hostPorts.port1);
  const [a, b] = await bounded(Promise.all([hostReady, guestReady]), 'native RTC ready', 31000);
  assert(!brokerFailure, 'broker failure'); assert(a.latestPayloadLimit === 16088 && b.latestPayloadLimit === 16088, 'actual cap missing');
  assert(remote.client.publication() === null, 'authority attached before RTC ready');
  await host.attachPeer('native-guest', [0], hostPorts.port2, { streamed: true, latestPayloadLimit: a.latestPayloadLimit });
  const deadline = performance.now() + 5000;
  while (!remote.client.commandStatus(0).canAllocate && performance.now() < deadline) { if (brokerFailure) throw brokerFailure; await delay(10); }
  assert(remote.client.publication()?.publicationSequence > 0 && remote.client.state() && remote.client.commandStatus(0).canAllocate,
    'real first state/validated ACK did not enable guest');
  const sequence = remote.client.publication().publicationSequence;
  console.log(`ACTUAL RTC pair: Electron ${process.versions.electron}; two hidden native PCs; caps=${a.latestPayloadLimit}/${b.latestPayloadLimit}; guest first publication=${sequence}; validated ACK enabled input; utilities=1`);
  stopping = true;
  await Promise.all([host.transport.closeAttempt('native-pair'), guest.closeAttempt('native-pair')]);
  remote.client.dispose(); remote.link.close('disposed');
  await guest.dispose();
  // Exercise public host-controller disposal as a real paired utility shutdown.
  const hostExit = new Promise(done => host.onExit(done));
  await host.transport.dispose(); assert(await hostExit === 'transport-exit', 'exposed controller did not notify host owner');
  await host.dispose(); await bounded(Promise.all(native.map(record => record.exit)), 'native utility exit');
  assert(native.every(record => record.exited) && BrowserWindow.getAllWindows().length === 0, 'native owners leaked');
  assert(ipcMain.listenerCount('net:rtc-response') === 0 && ipcMain.listenerCount('net:transport-ready') === 0, 'IPC listeners leaked');
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ electron: process.versions.electron, caps: [a.latestPayloadLimit, b.latestPayloadLimit],
    publicationSequence: sequence, utilities: native.length, exits: native.filter(record => record.exited).length, windows: BrowserWindow.getAllWindows().length }));
  console.log('ACTUAL RTC cleanup: 1/1 utility exit observed; zero windows and owner IPC listeners');
}
app.whenReady().then(async () => {
  let code = 0;
  try { await run(); } catch (error) { code = 1; console.error(error.stack ?? error); }
  finally {
    stopping = true;
    // A partial pair also owns both attempts, transferred endpoints and windows.
    remote?.client.dispose(); remote?.link.close('disposed');
    await Promise.allSettled([guest?.dispose(), host?.dispose()]);
    for (const record of native) if (!record.exited) record.child.kill();
    try { await bounded(Promise.all(native.map(record => record.exit)), 'failure cleanup exit'); } catch (error) { code = 1; console.error(error.message); }
    for (const window of BrowserWindow.getAllWindows()) window.destroy(); utilityProcess.fork = originalFork; app.exit(code);
  }
});
