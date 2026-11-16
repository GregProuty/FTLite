import { describe, expect, it } from 'vitest';
import { ONLINE_APP_ARTIFACTS, validateOnlineAppReport } from '../scripts/network/online-app-report';

const fixture = () => ({ version: 1, source: { revision: 'a'.repeat(40), digest: 'b'.repeat(16), dirty: true, artifactHashes: Object.fromEntries(ONLINE_APP_ARTIFACTS.map(k => [k, 'c'.repeat(64)])) },
  runtime: { electron: '37.10.3', workerd: '1.20261023.1', workerExit: true, temporaryRemoved: true },
  processes: [{ pid: 12, profile: 'host', exited: true, termination:'shutdown',exitCode:0,cleanup:{} }, { pid: 13, profile: 'guest', exited: true,termination:'restart',exitCode:1,resourcesBeforeForcedExit:{} }, { pid: 14, profile: 'guest', exited: true,termination:'shutdown',exitCode:0,cleanup:{} }],
  cleanup: { utilities: 1, utilityExits: 1, windows: 0, ports: 0, listeners: 0, peers: 0,nativeWindows:2,nativeWindowExits:2,nativePeersObserved:2,nativePeerCloses:1,nativePeersEndedWithWindow:1,observedMainPorts:8 },
  scenarios: [{ capacity: 2, seat: 1, layout: 'skiff', fullReceipts: 2, acks: 2, commands: 2, matched: 2, ownership: true,
    mirrors: { initialCommittedTick: 0, initialBeforeBootstrap: true, periodicCapturedTick: 300, periodicCommittedTick: 300, guestReceived: true }, ackBeforeInput: true, generationBefore: 1, generationAfter: 2, botTakeover: true, pausedReconnect: true, blurNeutral: true },
    { capacity: 4, seat: 2, layout: 'cutter', fullReceipts: 2, acks: 2, commands: 2, matched: 2, ownership: true,
    mirrors: { initialCommittedTick: 0, initialBeforeBootstrap: true, periodicCapturedTick: 300, periodicCommittedTick: 300, guestReceived: true }, ackBeforeInput: true, generationBefore: 1, generationAfter: 2, botTakeover: true, pausedReconnect: true, blurNeutral: true }],
  checks: ['bad-code', 'incompatible', 'cancel-couch'], elapsedMs: 50000,
  limits: ['loopback-only', 'no-TURN', 'no-rehost', 'no-WAN', 'no-two-machine'] });
describe('actual online app report admission', () => {
  it.each(['initialCommittedTick', 'initialBeforeBootstrap', 'periodicCapturedTick', 'periodicCommittedTick', 'guestReceived'])('requires actual %s mirror proof', key => {
    const r: any = fixture(); r.scenarios[0].mirrors = { initialCommittedTick: 0, initialBeforeBootstrap: true, periodicCapturedTick: 300, periodicCommittedTick: 300, guestReceived: true };
    delete r.scenarios[0].mirrors[key]; expect(() => validateOnlineAppReport(r)).toThrow();
  });
  it.each([undefined, NaN, Infinity, 2.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid post-rejoin generation %s', generation => {
    const r: any = fixture(); r.scenarios[0].generationAfter = generation;
    expect(() => validateOnlineAppReport(r)).toThrow();
  });
  it('rejects a report declaring failure despite complete observations', () => {
    expect(() => validateOnlineAppReport({ ...fixture(), failure: 'launcher timeout' })).toThrow();
  });
  it('requires hashes for the actual application and launcher artifacts', () => {
    const r: any = fixture(); delete r.source.artifactHashes; expect(() => validateOnlineAppReport(r)).toThrow();
  });
  it.each(['out/main/index.js', 'scripts/network/online-app-smoke.ts'])('rejects missing or malformed hash %s', key => {
    const r: any = fixture(); delete r.source.artifactHashes[key]; expect(() => validateOnlineAppReport(r)).toThrow();
    r.source.artifactHashes[key] = 'not-a-hash'; expect(() => validateOnlineAppReport(r)).toThrow();
  });
  it('accepts complete observed evidence', () => expect(() => validateOnlineAppReport(fixture())).not.toThrow());
  it.each(['source', 'processes', 'cleanup', 'scenarios', 'runtime'])('rejects missing %s', key => {
    const report: any = fixture(); delete report[key]; expect(() => validateOnlineAppReport(report)).toThrow();
  });
  it.each(['acks', 'commands', 'matched', 'fullReceipts'])('rejects missing %s proof', key => {
    const report: any = fixture(); report.scenarios[0][key] = 0; expect(() => validateOnlineAppReport(report)).toThrow();
  });
  it.each(['ownership', 'ackBeforeInput', 'botTakeover', 'pausedReconnect', 'blurNeutral'])('rejects false %s', key => {
    const report: any = fixture(); report.scenarios[0][key] = false; expect(() => validateOnlineAppReport(report)).toThrow();
  });
  it('exit zero alone is insufficient', () => expect(() => validateOnlineAppReport({ exitCode: 0 })).toThrow());
  it('rejects missing actual cleanup', () => { const r = fixture(); r.runtime.workerExit = false; expect(() => validateOnlineAppReport(r)).toThrow(); });
  it('rejects shared processes', () => { const r = fixture(); r.processes[1]!.pid = 12; expect(() => validateOnlineAppReport(r)).toThrow(); });
  it('rejects unchanged seat generation', () => { const r = fixture(); r.scenarios[0]!.generationAfter = 1; expect(() => validateOnlineAppReport(r)).toThrow(); });
  it('rejects an unexpected process exit',()=>{const r=fixture();r.processes[0]!.exitCode=1;expect(()=>validateOnlineAppReport(r)).toThrow();});
  it('rejects unobserved native window exits',()=>{const r=fixture();r.cleanup.nativeWindowExits=1;expect(()=>validateOnlineAppReport(r)).toThrow();});
  it('rejects native peers with no closure or owning-window destruction',()=>{const r=fixture();r.cleanup.nativePeerCloses=0;expect(()=>validateOnlineAppReport(r)).toThrow();});
});

