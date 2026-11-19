// Configuration-only native test driver (Web-i): the production page transport in one page. Answerers receive no SDP
// and never gather ICE; the native RTCPeerConnection configuration is inspected in the same page.
const { app, BrowserWindow } = require('electron');
const { resolve, join } = require('node:path');
const { writeFileSync } = require('node:fs');
const directory = app.commandLine.getSwitchValue('rtc-config-dir');
if (!directory || resolve(app.commandLine.getSwitchValue('user-data-dir')) !== resolve(directory, 'profile')) throw Error('invalid-test-profile');
app.setPath('userData', join(directory, 'profile')); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: app.commandLine.getSwitchValue('content-digest'), hostGeneration: 1 };
let page, failure;
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { failure = 'native-config-timeout'; app.exit(1); }, 12000);
  try {
    page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
    await page.loadFile(join(directory, 'page/rtc-page.html'));
    const js = source => page.webContents.executeJavaScript(source);
    await js(`(() => { const Original = RTCPeerConnection; window.configProbes = [];
      window.RTCPeerConnection = new Proxy(Original, { construct(Target, args) { const pc = Reflect.construct(Target, args); window.configProbes.push(pc); return pc; } });
      window.rtcPage.createTransport('guest', ${JSON.stringify(identity)}); })()`);
    const checks = [];
    for (const policy of ['all', 'relay']) {
      const attemptId = 'config-' + policy;
      const options = { attemptId, role: 'answerer', identity: { ...identity, protocolVersion: 2, runId: 'config-test', roomId: 'config-test', layoutHash: '12345678', seatGeneration: 1,
        localConnectionId: 'answerer', remoteConnectionId: 'offerer' }, localTicket: 'local-test', expectedRemoteTicket: 'remote-test', ticketExpiresAtEpochMs: Date.now() + 30000,
        iceServers: [{ urls: ['turn:127.0.0.1:9?transport=udp', 'turns:127.0.0.1:9?transport=tcp'], username: 'synthetic', credential: 'synthetic' }], iceTransportPolicy: policy };
      await js(`window.rtcPage.startAttempt('guest', ${JSON.stringify(options)}); window.configSettled = window.rtcPage.readiness('guest', ${JSON.stringify(attemptId)}).then(r => !r.ok); true`);
      let result;
      for (let tries = 0; tries < 100; tries++) {
        result = await js(`(() => { const pc = window.configProbes.at(-1); if (!pc || pc.connectionState === 'closed') return null;
          const c = pc.getConfiguration(); return { policy: c.iceTransportPolicy, servers: c.iceServers.length, urls: c.iceServers[0].urls.length,
            credentialsPreserved: c.iceServers[0].username === 'synthetic' && c.iceServers[0].credential === 'synthetic',
            noGathering: pc.iceGatheringState === 'new', noDescription: pc.localDescription === null && pc.remoteDescription === null }; })()`);
        if (result) break; await new Promise(done => setTimeout(done, 10));
      }
      if (!result || result.policy !== policy || result.servers !== 1 || result.urls !== 2 || !result.credentialsPreserved || !result.noGathering || !result.noDescription) throw Error('native-config-mismatch');
      await js(`window.rtcPage.closeAttempt('guest', ${JSON.stringify(attemptId)})`);
      if (!await js('window.configSettled')) throw Error('unexpected-native-route');
      checks.push(result);
    }
    const peersClosed = await js('window.configProbes.length === 2 && window.configProbes.every(pc => pc.connectionState === "closed")');
    if (!peersClosed) throw Error('native-config-cleanup');
    const disposed = await js('window.rtcPage.dispose()'); page.destroy();
    // Shared gate rule (Tasks 9-11): the disposed page transport left no page MessagePort open.
    if (disposed.ports.open !== 0 || disposed.ports.created === 0) throw Error('native-port-leak');
    if (BrowserWindow.getAllWindows().length !== 0) throw Error('native-window-leak');
    writeFileSync(join(directory, 'proof.json'), JSON.stringify({ electron: process.versions.electron, checks, peersClosed: 2, windows: 0, routeEstablished: false,
      ports: disposed.ports.open, portsCreated: disposed.ports.created }));
  } catch (error) { failure = failure ?? 'native-config-failed'; console.error(String(error?.message ?? error)); }
  finally {
    clearTimeout(watchdog);
    if (page && !page.isDestroyed()) page.destroy();
    if (failure) console.error(failure); app.exit(failure ? 1 : 0);
  }
});
