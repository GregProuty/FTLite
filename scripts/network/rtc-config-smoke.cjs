// Configuration-only native test driver. Answerers receive no SDP and never gather ICE.
const { app, BrowserWindow, MessageChannelMain } = require('electron');
const { resolve, join } = require('node:path');
const { writeFileSync } = require('node:fs');
const { startGuestTransport } = require('../../out/main/rtcTransport.js');
const directory = app.commandLine.getSwitchValue('rtc-config-dir');
if (!directory || resolve(app.commandLine.getSwitchValue('user-data-dir')) !== resolve(directory, 'profile')) throw Error('invalid-test-profile');
app.setPath('userData', join(directory, 'profile')); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: app.commandLine.getSwitchValue('content-digest'), hostGeneration: 1 };
let controller; const ports = []; let failure;
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { failure = 'native-config-timeout'; app.exit(1); }, 12000);
  try {
    controller = await startGuestTransport(identity);
    const window = BrowserWindow.getAllWindows()[0];
    await window.webContents.executeJavaScript(`(() => {
      const Original = RTCPeerConnection; window.configProbes = [];
      window.RTCPeerConnection = new Proxy(Original, { construct(Target, args) {
        const pc = Reflect.construct(Target, args); window.configProbes.push(pc); return pc;
      } });
    })()`);
    const checks = [];
    for (const policy of ['all', 'relay']) {
      const pair = new MessageChannelMain(); ports.push(pair.port1, pair.port2);
      const attemptId = 'config-' + policy;
      const ready = controller.startAttempt({ attemptId, role: 'answerer', identity: { ...identity, protocolVersion: 2, runId: 'config-test', roomId: 'config-test', layoutHash: '12345678', seatGeneration: 1, localConnectionId: 'answerer', remoteConnectionId: 'offerer' },
        localTicket: 'local-test', expectedRemoteTicket: 'remote-test', ticketExpiresAtEpochMs: Date.now() + 30000,
        iceServers: [{ urls: ['turn:127.0.0.1:9?transport=udp', 'turns:127.0.0.1:9?transport=tcp'], username: 'synthetic', credential: 'synthetic' }], iceTransportPolicy: policy }, pair.port1);
      const settled = ready.then(() => false, () => true);
      let result;
      for (let tries = 0; tries < 100; tries++) {
        result = await window.webContents.executeJavaScript(`(() => { const pc = window.configProbes.at(-1); if (!pc || pc.connectionState === 'closed') return null;
          const c = pc.getConfiguration(); return { policy: c.iceTransportPolicy, servers: c.iceServers.length, urls: c.iceServers[0].urls.length,
            credentialsPreserved: c.iceServers[0].username === 'synthetic' && c.iceServers[0].credential === 'synthetic',
            noGathering: pc.iceGatheringState === 'new', noDescription: pc.localDescription === null && pc.remoteDescription === null }; })()`);
        if (result) break; await new Promise(done => setTimeout(done, 10));
      }
      if (!result || result.policy !== policy || result.servers !== 1 || result.urls !== 2 || !result.credentialsPreserved || !result.noGathering || !result.noDescription) throw Error('native-config-mismatch');
      await controller.closeAttempt(attemptId); if (!await settled) throw Error('unexpected-native-route');
      checks.push(result);
    }
    const closed = await window.webContents.executeJavaScript('window.configProbes.length === 2 && window.configProbes.every(pc => pc.connectionState === "closed")');
    if (!closed) throw Error('native-config-cleanup');
    await controller.dispose();
    for (const port of ports) port.close();
    if (BrowserWindow.getAllWindows().length !== 0) throw Error('native-window-leak');
    writeFileSync(join(directory, 'proof.json'), JSON.stringify({ electron: process.versions.electron, checks, peersClosed: 2, windows: 0, routeEstablished: false }));
  } catch { failure = failure ?? 'native-config-failed'; }
  finally {
    clearTimeout(watchdog); await controller?.dispose().catch(() => {}); for (const port of ports) { try { port.close(); } catch {} }
    for (const window of BrowserWindow.getAllWindows()) window.destroy(); if (failure) console.error(failure); app.exit(failure ? 1 : 0);
  }
});
