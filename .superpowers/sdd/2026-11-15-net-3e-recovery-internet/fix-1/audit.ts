import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { validateOnlineRecoveryReport } from '../../../../scripts/network/online-recovery-report';
import { validateOnlineAppReport } from '../../../../scripts/network/online-app-report';
const root='.superpowers/sdd/2026-11-15-net-3e-recovery-internet';
const read=(path:string)=>JSON.parse(readFileSync(`${root}/${path}.json`,'utf8').replace(/^\uFEFF/,''));
const assert=(ok:unknown)=>{if(!ok)throw Error('fix audit failed');};
const hash=(bytes:any)=>createHash('sha256').update(bytes).digest('hex');
const accepted=['recovery-skiff','recovery-cutter','recovery-paused','recovery-upload','recovery-race','fix-1/recovery-stale'];
const passes=accepted.map(path=>{const r=read(path);validateOnlineRecoveryReport(r);
  for(const [artifact,sha] of Object.entries(r.source.artifactHashes))if(artifact.startsWith('out/'))assert(hash(readFileSync(artifact))===sha);
  return {path,revision:r.source.revision,elapsedMs:r.elapsedMs};});
const faultPaths=['timeout','guest-failure','transport-failure','worker-death','startup-timeout','build-timeout'].map(name=>'recovery-'+name);
const rejected=['recovery-stale','recovery-race-failed-leave','recovery-stale-failed-leave','recovery-transport-failed-observation','recovery-upload-diagnostic-1','recovery-upload-diagnostic-5',...faultPaths,'fix-1/recovery-unresponsive-cleanup'];
for(const path of rejected){let failed=false;try{validateOnlineRecoveryReport(read(path));}catch{failed=true;}assert(failed);}
const stale=read('fix-1/recovery-stale');
const instrument=createRequire(import.meta.url)('../../../../scripts/network/online-recovery-instrument.cjs');
const transformed=hash(instrument(readFileSync('out/main/authorityHost.js','utf8')));
assert(stale.instrumentation.every((i:any)=>i.observedSha256===transformed));
for(const [artifact,sha] of Object.entries(stale.source.artifactHashes)) {
  if(artifact==='scripts/network/online-recovery-report.ts') assert(hash(execFileSync('git',['show',`${stale.source.revision}:${artifact}`]))===sha);
  else assert(hash(readFileSync(artifact))===sha);
}
const app=read('fix-1/online-app');validateOnlineAppReport(app);
const fault=read('fix-1/recovery-unresponsive-cleanup');
assert(fault.failure && fault.budgetMs===20000 && fault.elapsedMs<fault.budgetMs && fault.stage==='unresponsive-cleanup');
assert(fault.processes.length===2 && fault.processes.every((p:any)=>p.exited && p.termination==='fault' && p.exitCode===1
  && p.resourcesBeforeForcedExit && Array.isArray(p.forcedUtilityExits)
  && p.resourcesBeforeForcedExit.utilities.every((u:any)=>p.forcedUtilityExits.some((e:any)=>e.pid===u.pid&&e.exited))));
assert(fault.runtimeHelper.exited && fault.runtime.workerExit && fault.runtime.temporaryRemoved);
for(const r of faultPaths.map(read)) {
  assert(r.failure && r.runtimeHelper.exited && r.runtime.temporaryRemoved && (!r.runtime.workerPid||r.runtime.workerExit));
  assert(r.processes.every((p:any)=>p.exited && (p.forcedUtilityExits??[]).every((u:any)=>u.exited)));
  assert(r.cleanup.utilities===r.cleanup.utilityExits && ['windows','ports','listeners','peers'].every(k=>r.cleanup[k]===0));
}
const reports=[...accepted.map(read),app,fault,...faultPaths.map(read)];
const pids=[...new Set(reports.flatMap(r=>[...r.processes.map((p:any)=>p.pid),...r.processes.flatMap((p:any)=>p.cleanup?.utilityPids??p.forcedUtilityExits?.map((u:any)=>u.pid)??[]),r.runtimeHelper?.pid,r.runtime.workerPid].filter(Boolean)))];
const live=pids.filter(pid=>{try{process.kill(pid as number,0);return true;}catch{return false;}});assert(live.length===0);
const result={passes,rejected,app:{revision:app.source.revision,elapsedMs:app.elapsedMs},fault:{revision:fault.source.revision,elapsedMs:fault.elapsedMs,budgetMs:fault.budgetMs},instrumentedAuthoritySha256:transformed,uniqueObservedPids:pids.length,livePidCandidates:live};
writeFileSync(`${root}/fix-1/audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
