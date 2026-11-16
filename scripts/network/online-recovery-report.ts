import { ONLINE_APP_ARTIFACTS } from './online-app-report';
export function validateRecoveryMemory(before:any,after:any): string[] {
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  if(!Array.isArray(before?.botMemory)||!Array.isArray(after?.botMemory)||before.botMemory.length!==after.botMemory.length) throw Error('missing bot memory');
  return before.botMemory.map((ui:any,index:number)=>{
    const next=after.botMemory[index];
    if(same(ui,next)) return 'unchanged';
    const dormant=ui.stations.length===0 && ui.groupBar.length===0 && ui.navigationVisit===null
      && ui.players.every((p:any)=>p.heldDir===0 && p.repeat===0 && p.lastTick===-1 && (p.botDecisionTick??-1)===-1 && p.seat===-1 && p.pendingVote===null);
    if(!next || next.players.length!==ui.players.length || next.players.some((p:any,i:number)=>p.nextSequence!==before.commandHighWater[i]+1 || p.heldSequence!==before.heldHighWater[i])) throw Error('invalid reconciled producer counters');
    if(dormant) {
      if(!same(next,before.reconciledBotMemory?.[index])) throw Error('unexplained dormant memory change');
      return 'reconciled-dormant';
    }
    const withCounters=structuredClone(ui);
    for(let i=0;i<withCounters.players.length;i++) { withCounters.players[i].nextSequence=before.commandHighWater[i]+1; withCounters.players[i].heldSequence=before.heldHighWater[i]; }
    if(!same(next,withCounters)) throw Error('populated bot memory changed');
    return 'reconciled-counters';
  });
}
export const ONLINE_RECOVERY_ARTIFACTS = [...ONLINE_APP_ARTIFACTS, 'scripts/network/online-app-click.cjs', 'scripts/network/online-recovery-smoke.ts', 'scripts/network/online-recovery-report.ts', 'scripts/network/online-recovery-utility.ts', 'scripts/network/online-recovery-utility.cjs', 'scripts/network/online-recovery-instrument.cjs', 'src/main/network/onlineExit.ts'];
/** Individual, bounded real-app passes. The validation document must list every required scenario. */
export function validateOnlineRecoveryReport(value: unknown): void {
  const r = value as any, fail = () => { throw Error('missing or invalid actual recovery evidence'); };
  const positive = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
  const natural = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
  const same = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (!r || r.version !== 1 || r.failure != null || r.driverFailure != null || !['skiff','cutter','paused','upload','race','stale'].includes(r.scenario)
    || !/^[a-f0-9]{40}$/.test(r.source?.revision ?? '') || !hash(r.source?.digest) || typeof r.source?.dirty !== 'boolean'
    || ONLINE_RECOVERY_ARTIFACTS.some(k => !hash(r.source?.artifactHashes?.[k]))
    || r.runtime?.electron !== '37.10.3' || r.runtime?.workerd !== '1.20261023.1' || !positive(r.runtime.workerPid)
    || r.runtime.workerExit !== true || r.runtime.temporaryRemoved !== true || !positive(r.runtimeHelper?.pid) || r.runtimeHelper.exited !== true || r.runtimeHelper.exitCode!==0
    || !positive(r.elapsedMs) || r.elapsedMs > 90000) fail();
  if (!Array.isArray(r.processes) || r.processes.length < 2 || new Set(r.processes.map((p: any) => p.pid)).size !== r.processes.length
    || r.processes.some((p: any) => !positive(p.pid) || p.exited !== true || !Number.isInteger(p.exitCode)
      || !['shutdown','restart'].includes(p.termination) || p.termination === 'shutdown' && (p.exitCode !== 0 || !p.cleanup)
      || p.termination === 'restart' && (p.cleanup!=null || !Array.isArray(p.resourcesBeforeForcedExit?.utilities) || !Array.isArray(p.forcedUtilityExits)
        || p.resourcesBeforeForcedExit.utilities.some((u:any)=>!positive(u.pid)||!p.forcedUtilityExits.some((e:any)=>e.pid===u.pid&&e.exited===true))))) fail();
  const c = r.cleanup;
  const counters = ['utilities','utilityExits','windows','ports','listeners','peers','nativeWindows','nativeWindowExits','nativePeersObserved','nativePeerCloses','nativePeersEndedWithWindow','observedMainPorts'];
  const processCleanups = r.processes.filter((p:any)=>p.termination==='shutdown').map((p:any)=>p.cleanup);
  for(const q of processCleanups) {
    if(counters.some(k=>!natural(q[k])) || ['windows','ports','listeners','peers'].some(k=>q[k]!==0)
      || q.utilities!==q.utilityExits || q.nativeWindows!==q.nativeWindowExits
      || q.nativePeersObserved!==q.nativePeerCloses+q.nativePeersEndedWithWindow
      || !Array.isArray(q.utilityPids) || q.utilityPids.length!==q.utilities || q.utilityPids.some((pid:any)=>!positive(pid))
      || new Set(q.utilityPids).size!==q.utilityPids.length) fail();
  }
  if(!c || counters.some(k=>!natural(c[k]) || c[k]!==processCleanups.reduce((sum:number,q:any)=>sum+q[k],0))) fail();
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
  if(p.committed.hostGeneration!==p.hostGenerationBefore || p.restored.payloadSha256!==p.committed.payloadSha256 || p.restored.runId!==p.runId
    || !hash(p.restored.snapshotHash) || p.pausedBaseline?.snapshotHash!==p.restored.snapshotHash
    || p.pausedBaseline.runId!==p.runId || p.pausedBaseline.tick!==p.restored.tick || p.pausedBaseline.phase!=='paused'
    || ['commandHighWater','heldHighWater'].some(k=>!same(p.pausedBaseline[k],p.restored[k]))
    || ![2,4].includes(p.capacity) || !positive(p.seat) || p.seat>=p.capacity || p.restored.commandHighWater.length!==p.capacity || p.restored.heldHighWater.length!==p.capacity
    || p.initialCommittedTick!==0 || p.periodicCapturedTick!==300 || p.oldHostRejoinedSeat!==0
    || !positive(p.seatGenerationBefore) || !positive(p.seatGenerationAfter) || p.seatGenerationAfter<=p.seatGenerationBefore) fail();
  const observations=p.observations?.afterResume;
  if(!Array.isArray(observations) || observations.length!==2 || observations.some((o:any,index:number)=>!positive(o.firstAckOrder)
    || !positive(o.firstInputOrder) || o.firstInputOrder<=o.firstAckOrder || !Array.isArray(o.inputs) || !o.inputs.length
    || o.inputs.some((i:any)=>i.player!==(index===0?p.seat:0) || !positive(i.order) || i.order<=o.firstAckOrder)
    || Math.min(...o.inputs.map((i:any)=>i.order))!==o.firstInputOrder)) fail();
  validateRecoveryMemory(p.restored,p.pausedBaseline);
  if(r.scenario==='upload') {
    const rollback=p.pendingRollback;
    if(!rollback || rollback.restoredTick!==p.restored.tick || !positive(rollback.pending?.tick) || rollback.pending.tick<=p.restored.tick
      || !hash(rollback.pending.payloadSha256) || rollback.pending.payloadSha256===p.committed.payloadSha256 || rollback.pending.runId!==p.runId) fail();
  }
  if (r.scenario === 'stale') {
    const f = p.oldHostFence;
    if (p.suspendHook!==true || !f || !Number.isFinite(f.mainBlockedMs) || f.mainBlockedMs <= 12000 || ['utilityAlive','lastAdvanceBeforeDeadline','closedAdmission','noOldCommit','lateReplyRejected','serverExpired'].some(k => f[k] !== true)) fail();
    if(!Array.isArray(r.instrumentation)||!r.instrumentation.length || r.instrumentation.some((i:any)=>i.sourceSha256!==r.source.artifactHashes['out/main/authorityHost.js'] || !hash(i.observedSha256) || i.transformSha256!==r.source.artifactHashes['scripts/network/online-recovery-instrument.cjs'])) fail();
    const e=f.evidence;
    const lease=e?.acceptedLease;
    if(!lease || ['startedMs','acceptedMs','acceptedEpochMs','expiresAtEpochMs','deadlineMs'].some(k=>!Number.isFinite(lease[k]))
      || lease.startedMs<0 || lease.acceptedMs<lease.startedMs || lease.acceptedMs>=lease.deadlineMs
      || lease.deadlineMs!==Math.min(lease.startedMs+12000,lease.acceptedMs+lease.expiresAtEpochMs-lease.acceptedEpochMs)
      || e.deadlineMs!==lease.deadlineMs) fail();
    if(e?.errors!==0 || !Number.isFinite(e?.deadlineMs) || ['tick','ingress','control'].some(k=>!positive(e.permissions?.[k]?.allowed) || !Number.isFinite(e.permissions[k].lastAllowedMs) || e.permissions[k].lastAllowedMs>=e.deadlineMs || e.permissions[k].postDeadlineAllowed!==0)
      || !positive(e.permissions.ingress.denied) || !positive(e.permissions.control.denied)) fail();
  }
  if (['stale','race'].includes(r.scenario)) {
    if (!Array.isArray(p.contenders) || p.contenders.length !== 2 || p.contenders.filter((v: any) => v.outcome === 'winner' && v.utilitiesCreated === 1).length !== 1
      || p.contenders.filter((v: any) => v.outcome === 'loser' && v.utilitiesCreated === 0).length !== 1) fail();
  }
  if (!['loopback-only','no-TURN','no-WAN','no-two-machine','OS-suspend-NOT-RUN'].every(k => r.limits?.includes(k))) fail();
}
