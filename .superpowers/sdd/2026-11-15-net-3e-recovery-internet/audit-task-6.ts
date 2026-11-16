import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateOnlineRecoveryReport } from '../../../scripts/network/online-recovery-report';
const root='.superpowers/sdd/2026-11-15-net-3e-recovery-internet';
const read=(name:string)=>JSON.parse(readFileSync(`${root}/${name}.json`,'utf8').replace(/^\uFEFF/,''));
const check=(v:unknown,message:string)=>{if(!v)throw Error(message);};
const normal=['skiff','cutter','paused','upload','race','stale'].map(name=>{
  const r=read(`recovery-${name}`);validateOnlineRecoveryReport(r);
  for(const [path,hash] of Object.entries(r.source.artifactHashes)) if(path.startsWith('out/')) check(createHash('sha256').update(readFileSync(path)).digest('hex')===hash,'built artifact changed');
  return {name,revision:r.source.revision,elapsedMs:r.elapsedMs,tick:r.proof.restored.tick,generation:r.proof.hostGenerationAfter,
    apps:r.processes.length,utilityExits:r.cleanup.utilityExits,forcedUtilityExits:r.processes.flatMap((p:any)=>p.forcedUtilityExits??[]).length,
    workerExit:r.runtime.workerExit,tempRemoved:r.runtime.temporaryRemoved,memory:r.proof.memoryReconciliation,
    clickRetries:r.proof.menuClicks.flatMap((p:any)=>p.clicks).filter((c:any)=>c.attempts>1),
    pids:[...r.processes.map((p:any)=>p.pid),...r.processes.flatMap((p:any)=>p.cleanup?.utilityPids??p.forcedUtilityExits?.map((u:any)=>u.pid)??[]),r.runtimeHelper.pid,r.runtime.workerPid]};
});
const faults=['timeout','guest-failure','transport-failure','worker-death','startup-timeout','build-timeout'].map(name=>{
  const r=read(`recovery-${name}`);check(r.failure,'fault was accepted');check(r.runtime.temporaryRemoved&&r.runtimeHelper.exited,'fault cleanup omitted');
  check(!r.runtime.workerPid||r.runtime.workerExit,'workerd exit omitted');
  for(const p of r.processes) {check(p.exited,'app exit omitted');for(const u of p.forcedUtilityExits??[])check(u.exited,'forced utility exit omitted');}
  check(r.cleanup.utilities===r.cleanup.utilityExits,'utility cleanup incomplete');
  check(['windows','ports','listeners','peers'].every(k=>r.cleanup[k]===0),'fault retained resource');
  return {name,failure:r.failure,elapsedMs:r.elapsedMs,apps:r.processes.length,utilityExits:r.cleanup.utilityExits,workerAllocated:!!r.runtime.workerPid,
    workerExit:r.runtime.workerExit,helperExit:r.runtimeHelper.exited,helperForced:r.runtimeHelper.forced,tempRemoved:r.runtime.temporaryRemoved,
    pids:[...r.processes.map((p:any)=>p.pid),...r.processes.flatMap((p:any)=>p.cleanup?.utilityPids??p.forcedUtilityExits?.map((u:any)=>u.pid)??[]),r.runtimeHelper.pid,r.runtime.workerPid].filter(Boolean)};
});
const pids=[...new Set([...normal,...faults].flatMap(r=>r.pids))];
const livePidCandidates=pids.filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});
const result={normal,faults,uniqueObservedPids:pids.length,livePidCandidates};
writeFileSync(`${root}/task-6-audit.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
