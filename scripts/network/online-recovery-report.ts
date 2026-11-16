import { ONLINE_APP_ARTIFACTS } from './online-app-report';
export const ONLINE_RECOVERY_ARTIFACTS = [...ONLINE_APP_ARTIFACTS, 'scripts/network/online-recovery-smoke.ts', 'scripts/network/online-recovery-report.ts', 'scripts/network/online-recovery-utility.ts', 'scripts/network/online-recovery-utility.cjs', 'scripts/network/online-recovery-instrument.cjs', 'src/main/network/onlineExit.ts'];
/** Individual, bounded real-app passes. The validation document must list every required scenario. */
export function validateOnlineRecoveryReport(value: unknown): void {
  const r = value as any, fail = () => { throw Error('missing or invalid actual recovery evidence'); };
  const positive = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (!r || r.version !== 1 || r.failure != null || r.driverFailure != null || !['skiff','cutter','paused','upload','race','stale'].includes(r.scenario)
    || !/^[a-f0-9]{40}$/.test(r.source?.revision ?? '') || !hash(r.source?.digest) || typeof r.source?.dirty !== 'boolean'
    || ONLINE_RECOVERY_ARTIFACTS.some(k => !hash(r.source?.artifactHashes?.[k]))
    || r.runtime?.electron !== '37.10.3' || r.runtime?.workerd !== '1.20261023.1' || !positive(r.runtime.workerPid)
    || r.runtime.workerExit !== true || r.runtime.temporaryRemoved !== true || !positive(r.runtimeHelper?.pid) || r.runtimeHelper.exited !== true
    || !positive(r.elapsedMs) || r.elapsedMs > 90000) fail();
  if (!Array.isArray(r.processes) || r.processes.length < 2 || new Set(r.processes.map((p: any) => p.pid)).size !== r.processes.length
    || r.processes.some((p: any) => !positive(p.pid) || p.exited !== true || !Number.isInteger(p.exitCode)
      || !['shutdown','restart'].includes(p.termination) || p.termination === 'shutdown' && (p.exitCode !== 0 || !p.cleanup)
      || p.termination === 'restart' && !p.resourcesBeforeForcedExit)) fail();
  const c = r.cleanup;
  if (!c || !positive(c.utilities) || c.utilities !== c.utilityExits || ['windows','ports','listeners','peers'].some(k => c[k] !== 0)
    || !positive(c.nativeWindows) || c.nativeWindows !== c.nativeWindowExits || !positive(c.nativePeersObserved)
    || c.nativePeerCloses + c.nativePeersEndedWithWindow !== c.nativePeersObserved || !positive(c.observedMainPorts)) fail();
  const p = r.proof;
  if (!p || !/^[a-f0-9]{32}$/.test(p.runId ?? '') || !positive(p.hostGenerationBefore) || !positive(p.hostGenerationAfter) || p.hostGenerationAfter <= p.hostGenerationBefore
    || !/^[a-f0-9]{32}$/.test(p.utilityEpochBefore ?? '') || !/^[a-f0-9]{32}$/.test(p.utilityEpochAfter ?? '') || p.utilityEpochBefore === p.utilityEpochAfter
    || !positive(p.committed?.hostGeneration) || !positive(p.committed?.checkpointSequence) || !hash(p.committed?.payloadSha256)
    || !Number.isSafeInteger(p.committed?.capturedTick) || p.committed.capturedTick < 0 || p.restored?.tick !== p.committed.capturedTick
    || !hash(p.restored?.botMemoryHash) || ['commandHighWater','heldHighWater'].some(k => !Array.isArray(p.restored[k]) || p.restored[k].length < 2 || p.restored[k].some((n: any) => !Number.isSafeInteger(n) || n < 0))
    || ['serviceBytesRestored','fullAck','ackBeforeInput','ownership','pausedBaselineCommitted','explicitResume'].some(k => p[k] !== true) || p.autoResume !== false
    || p.agreement?.runId !== p.runId || typeof p.agreement?.hash !== 'string' || !positive(p.agreement?.tick)) fail();
  if (r.scenario === 'stale') {
    const f = p.oldHostFence;
    if (!f || !Number.isFinite(f.mainBlockedMs) || f.mainBlockedMs <= 12000 || ['utilityAlive','lastAdvanceBeforeDeadline','closedAdmission','noOldCommit','lateReplyRejected','serverExpired'].some(k => f[k] !== true)) fail();
    if(!Array.isArray(r.instrumentation)||!r.instrumentation.length || r.instrumentation.some((i:any)=>i.sourceSha256!==r.source.artifactHashes['out/main/authorityHost.js'] || !hash(i.observedSha256) || i.transformSha256!==r.source.artifactHashes['scripts/network/online-recovery-instrument.cjs'])) fail();
    const e=f.evidence;
    if(!Number.isFinite(e?.deadlineMs) || ['tick','ingress','control'].some(k=>!positive(e.permissions?.[k]?.allowed) || !Number.isFinite(e.permissions[k].lastAllowedMs) || e.permissions[k].lastAllowedMs>=e.deadlineMs || e.permissions[k].postDeadlineAllowed!==0)
      || !positive(e.permissions.ingress.denied) || !positive(e.permissions.control.denied)) fail();
  }
  if (['stale','race'].includes(r.scenario)) {
    if (!Array.isArray(p.contenders) || p.contenders.length !== 2 || p.contenders.filter((v: any) => v.outcome === 'winner' && v.utilitiesCreated === 1).length !== 1
      || p.contenders.filter((v: any) => v.outcome === 'loser' && v.utilitiesCreated === 0).length !== 1) fail();
  }
  if (!['loopback-only','no-TURN','no-WAN','no-two-machine','OS-suspend-NOT-RUN'].every(k => r.limits?.includes(k))) fail();
}
