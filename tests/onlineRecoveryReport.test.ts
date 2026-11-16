import { expect, it } from 'vitest';
import { ONLINE_RECOVERY_ARTIFACTS, validateOnlineRecoveryReport } from '../scripts/network/online-recovery-report';
const fixture = (): any => ({ version: 1, scenario: 'stale', source: { revision: 'a'.repeat(40), dirty: true, digest: 'b'.repeat(64), artifactHashes: Object.fromEntries(ONLINE_RECOVERY_ARTIFACTS.map(k => [k, 'c'.repeat(64)])) },
  instrumentation:[{sourceSha256:'c'.repeat(64),observedSha256:'d'.repeat(64),transformSha256:'c'.repeat(64)}],
  runtime: { electron: '37.10.3', workerd: '1.20261023.1', workerPid: 55, workerExit: true, temporaryRemoved: true }, runtimeHelper: { pid: 54, exited: true, exitCode: 0 },
  processes: [{ pid: 10, profile: 'host', exited: true, termination: 'shutdown', exitCode: 0, cleanup: {} }, { pid: 11, profile: 'guest', exited: true, termination: 'shutdown', exitCode: 0, cleanup: {} }],
  cleanup: { utilities: 2, utilityExits: 2, windows: 0, ports: 0, listeners: 0, peers: 0, nativeWindows: 2, nativeWindowExits: 2, nativePeersObserved: 2, nativePeerCloses: 2, nativePeersEndedWithWindow: 0, observedMainPorts: 8 },
  elapsedMs: 40000, limits: ['loopback-only', 'no-TURN', 'no-WAN', 'no-two-machine', 'OS-suspend-NOT-RUN'],
  proof: { runId: 'a'.repeat(32), hostGenerationBefore: 1, hostGenerationAfter: 2, utilityEpochBefore: 'b'.repeat(32), utilityEpochAfter: 'c'.repeat(32),
    committed: { hostGeneration: 1, checkpointSequence: 2, capturedTick: 300, payloadSha256: 'd'.repeat(64) },
    restored: { tick: 300, commandHighWater: [2, 3], heldHighWater: [4, 5], botMemoryHash: 'e'.repeat(64) },
    serviceBytesRestored: true, fullAck: true, ackBeforeInput: true, ownership: true, pausedBaselineCommitted: true, explicitResume: true, autoResume: false,
    agreement: { runId: 'a'.repeat(32), hash: 'f'.repeat(16), tick: 320 },
    oldHostFence: { utilityAlive: true, mainBlockedMs: 20000, lastAdvanceBeforeDeadline: true, closedAdmission: true, noOldCommit: true, lateReplyRejected: true, serverExpired: true,
      evidence:{deadlineMs:12000,permissions:Object.fromEntries(['tick','ingress','control'].map(k=>[k,{allowed:3,denied:2,lastAllowedMs:11999,postDeadlineAllowed:0}]))} },
    contenders: [{ seat: 0, outcome: 'loser', utilitiesCreated: 0 }, { seat: 1, outcome: 'winner', utilitiesCreated: 1 }] } });
it('accepts complete independently observed recovery evidence', () => expect(() => validateOnlineRecoveryReport(fixture())).not.toThrow());
it('rejects fabricated exit zero', () => expect(() => validateOnlineRecoveryReport({ exitCode: 0 })).toThrow());
it.each(['source', 'runtime', 'runtimeHelper', 'processes', 'cleanup', 'proof'])('rejects absent %s', key => { const r = fixture(); delete r[key]; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it.each(['committed', 'oldHostFence', 'contenders', 'fullAck', 'ownership', 'pausedBaselineCommitted', 'serviceBytesRestored'])('rejects missing %s', key => { const r = fixture(); delete r.proof[key]; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects auto-resume', () => { const r = fixture(); r.proof.autoResume = true; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects stale ownership', () => { const r = fixture(); r.proof.hostGenerationAfter = 1; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it.each(['workerExit', 'temporaryRemoved'])('rejects absent %s', key => { const r = fixture(); delete r.runtime[key]; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects missing process exit', () => { const r = fixture(); r.processes[0].exited = false; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects declared failure', () => { const r = fixture(); r.failure = 'failure'; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects missing artifact provenance', () => { const r = fixture(); r.source.artifactHashes = {}; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects a contender with no observed outcome', () => { const r = fixture(); delete r.proof.contenders[0].outcome; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects socket loss substituted for live utility fencing', () => { const r = fixture(); r.proof.oldHostFence.utilityAlive = false; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects unbounded scenario duration', () => { const r = fixture(); r.elapsedMs = 90001; expect(() => validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects unpinned passive instrumentation', () => { const r=fixture(); delete r.instrumentation; expect(()=>validateOnlineRecoveryReport(r)).toThrow(); });
it('rejects overdue catch-up admitted after expiry despite an old scheduled deadline',()=>{const r=fixture(); r.proof.oldHostFence.evidence={deadlineMs:12000,permissions:{tick:{allowed:4,denied:1,lastAllowedMs:12001,postDeadlineAllowed:1},ingress:{allowed:4,denied:1,lastAllowedMs:10000,postDeadlineAllowed:0},control:{allowed:4,denied:1,lastAllowedMs:10000,postDeadlineAllowed:0}}}; expect(()=>validateOnlineRecoveryReport(r)).toThrow();});
