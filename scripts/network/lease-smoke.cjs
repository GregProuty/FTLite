// TEST ONLY (Web-i Task 9): actual Electron. The owner page runs the production Worker owner over the built production
// Worker; the page's own thread is stalled while the Worker keeps running, as main's thread was stalled before.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const directory = app.commandLine.getSwitchValue('lease-smoke-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
const probe = app.commandLine.getSwitchValue('lease-probe');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated-profile-required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const codes = ['injected-fault', 'native-timeout', 'missing-first-renewal', 'host-command-failed', 'missing-running-evidence', 'lease-deadline-violation',
  'missing-closed-admission-evidence', 'fenced-state-changed', 'held-not-neutral', 'late-matching-grant-accepted', 'late-grant-ticked',
  'fresh-grant-not-paused-or-debt-retained', 'explicit-resume-failed'];
const delay = ms => new Promise(done => setTimeout(done, ms));
function bounded(promise, ms = 6000) {
  let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('native-timeout')), ms); })]).finally(() => clearTimeout(timer));
}
const assert = (condition, code) => { if (!condition) throw Error(code); };
let page;
const js = (source, ms) => bounded(page.webContents.executeJavaScript(source), ms);
async function start(label) {
  const sessionLease = { roomId: randomBytes(16).toString('hex'), runId: init.runId, hostGeneration: 1, hostSeatId: 0, utilityEpoch: randomBytes(16).toString('hex') };
  const index = await js(`window.leaseSmoke.start(${JSON.stringify(label)}, ${JSON.stringify(identity)}, ${JSON.stringify(sessionLease)}, ${JSON.stringify(init)})`);
  return { index, current: () => js(`window.leaseSmoke.current(${index})`) };
}
const grant = (index, renewal) => js(`window.leaseSmoke.applyLease(${index}, ${JSON.stringify(renewal)}, 15000)`);
async function run() {
  await app.whenReady(); let report = { status: 'FAIL', diagnostic: 'native-failure' };
  try {
    page = new BrowserWindow({ show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
    await page.loadFile(join(directory, 'page/lease-smoke.html'), { query: { wrapper: pathToFileURL(join(directory, 'page/worker-wrapper.js')).href } });
    writeFileSync(join(directory, 'owned-pids.json'), JSON.stringify([page.webContents.getOSProcessId()]));
    const running = await start('running');
    if (probe === 'fault') throw Error('injected-fault');
    if (probe === 'timeout' || probe === 'cleanup-timeout') await new Promise(() => {});
    const delayed = await start('delayed'), delayedRequest = await delayed.current();
    await grant(running.index, await running.current()); await js(`window.leaseSmoke.completeBootstrap(${running.index})`);
    await js(`window.leaseSmoke.attach(${running.index})`);
    const stallMs = await js('window.leaseSmoke.stall(16000)', 22000); await delay(100);
    const observed = await js(`window.leaseSmoke.evidence('running')`);
    assert(observed && observed.tick > 100 && observed.publications > 100, 'missing-running-evidence');
    assert(observed.phase === 'paused' && observed.lastGameplayMs <= observed.firstRequestMs + 12000, 'lease-deadline-violation');
    assert(observed.attemptsAfterDeadline > 10 && observed.rejectedAfterDeadline > 10, 'missing-closed-admission-evidence');
    const fenced = await js(`window.leaseSmoke.checkpoint(${running.index})`);
    assert(fenced.snapshot.header.tick === observed.tick && fenced.commandHighWater.every((n, i) => n === observed.highWater[i]), 'fenced-state-changed');
    assert(fenced.held.every(h => h.moveX === 0 && h.moveY === 0 && !h.interactHeld), 'held-not-neutral');
    let delayedMatchingRejected = false;
    try { await grant(delayed.index, delayedRequest); } catch { delayedMatchingRejected = true; }
    assert(delayedMatchingRejected, 'late-matching-grant-accepted');
    const delayedCp = await js(`window.leaseSmoke.checkpoint(${delayed.index})`);
    assert(delayedCp.snapshot.header.tick === 0 && delayedCp.phase === 'paused', 'late-grant-ticked');
    await grant(running.index, await running.current());
    await delay(100); const fresh = await js(`window.leaseSmoke.checkpoint(${running.index})`);
    const freshPaused = fresh.phase === 'paused' && fresh.snapshot.header.tick === observed.tick;
    await js(`window.leaseSmoke.pause(${running.index})`);
    const pausedEvidence = await js(`window.leaseSmoke.evidence('running')`);
    assert(freshPaused && pausedEvidence.lagTicks === 0, 'fresh-grant-not-paused-or-debt-retained');
    await js(`window.leaseSmoke.sendCommand(${JSON.stringify({ runId: init.runId, id: { player: 0, sequence: fresh.commandHighWater[0] + 1 },
      requestedTick: fresh.snapshot.header.tick, command: { kind: 'setPaused', paused: false } })})`);
    await delay(100); const resumed = await js(`window.leaseSmoke.checkpoint(${running.index})`);
    const explicitResume = resumed.phase === 'running' && resumed.snapshot.header.tick > observed.tick && resumed.snapshot.header.tick - observed.tick < 20;
    assert(explicitResume, 'explicit-resume-failed');
    report = { status: 'PASS', diagnostic: 'controlled-grant-proof', electron: process.versions.electron, stallMs, workerEvidence: observed, delayedMatchingRejected,
      delayedProbe: 'renewal timer withheld; matching request aged beyond local lifetime; real Worker clocks',
      freshPaused, freshLagTicks: pausedEvidence.lagTicks, explicitResume, resumedTicks: resumed.snapshot.header.tick - observed.tick };
  } catch (error) { report.diagnostic = codes.find(code => String(error?.message ?? error).includes(code)) ?? 'native-failure'; }
  finally {
    const counts = page && !page.isDestroyed() ? await js('window.leaseSmoke.dispose()', 5000).catch(() => null) : null;
    if (page && !page.isDestroyed()) page.destroy();
    report.workers = counts?.workers ?? 0; report.workerExits = counts?.terminated ?? 0; report.ports = counts?.ports ?? null; report.portsCreated = counts?.portsCreated ?? 0; report.windows = BrowserWindow.getAllWindows().length;
    writeFileSync(join(directory, 'native-report.json'), JSON.stringify(report, null, 2));
    app.exit(report.status === 'PASS' ? 0 : 1);
  }
}
run().catch(() => app.exit(1));
