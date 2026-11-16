// Review fix provenance only: no native process or endpoint is started here.
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { normalize,join } from 'node:path';
import { tmpdir } from 'node:os';
import { executableRuntimeArtifacts,validateInternetAppReport,validateLocalInternetDriverRun,validateInternetRun } from '../../../../../scripts/network/internet-app-report';
import { assertCandidateServiceOrigin } from '../../../../../scripts/network/internet-app-manifest';
import { validateOnlineRecoveryReport } from '../../../../../scripts/network/online-recovery-report';
const root='.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-evidence/',destination=root+'fix-1/';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const fileHash=(path:string)=>hash(readFileSync(path));
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const assert=(value:unknown)=>{if(!value)throw Error('task8-fix-audit-invalid');};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const candidate=read(destination+'candidate.json'),historicalCandidate=read(root+'candidate.json');
const runtime=executableRuntimeArtifacts(candidate.identity.artifacts);
assert(same(runtime,executableRuntimeArtifacts(historicalCandidate.identity.artifacts)));
assert(same(candidate.identity.artifacts,historicalCandidate.identity.artifacts));
assert(candidate.identity.packageSha256===historicalCandidate.identity.packageSha256&&fileHash(candidate.packagePath)===candidate.identity.packageSha256);
for(const [path,sha]of Object.entries({...candidate.identity.artifacts,...candidate.sourceFiles}))assert(fileHash(path)===sha);
const asar=createRequire(import.meta.url)('@electron/asar'),app='dist/net-3e-candidate/win-unpacked/';
assert(fileHash(app+'FTLite.exe')===candidate.package.executableSha256&&candidate.package.executableSha256===historicalCandidate.package.executableSha256);
assert(fileHash(app+'resources/app.asar')===candidate.package.asarSha256&&candidate.package.asarSha256===historicalCandidate.package.asarSha256);
assertCandidateServiceOrigin(candidate,candidate.identity.serviceOrigin,asar.extractFile(app+'resources/app.asar',normalize('out/main/index.js')).toString('utf8'));
const histories=[];
for(const scenario of ['skiff','cutter','paused','upload','race','stale']) {
  const path=root+'recovery-'+scenario+'.json',report=read(path);validateOnlineRecoveryReport(report);
  assert(same(executableRuntimeArtifacts(report.source.artifactHashes),runtime));
  histories.push({path,sha256:fileHash(path),reportRevision:report.source.revision,candidateRevision:candidate.identity.revision,executableArtifacts:runtime,nativeRerun:false});
}
const recoveryPath=root+'recovery-skiff.json',recovery=read(recoveryPath),notRun=()=>({status:'NOT_RUN',evidence:[]});
const readiness={version:1,identity:candidate.identity,internetReady:false,localRecovery:{status:'PASS',evidence:[{path:recoveryPath,sha256:fileHash(recoveryPath)}],report:recovery,
  runtimeProvenance:{reportRevision:recovery.source.revision,candidateRevision:candidate.identity.revision,executableArtifacts:runtime}},deployedService:notRun(),forcedRelayGameplay:notRun(),twoMachineGameplay:notRun(),actualOsSuspend:notRun()};
validateInternetAppReport(readiness);writeFileSync(destination+'readiness.json',JSON.stringify(readiness,null,2)+'\n');
// Preserve the actual native result/source. Supply only the newly required origin
// from the old, hashed manifest for in-memory compatibility validation, not a rerun.
const driverPath=root+'internet-driver-loopback.json',driver=read(driverPath);
assert(driver.identity.revision===historicalCandidate.identity.revision&&same(executableRuntimeArtifacts(driver.identity.artifacts),runtime));
const view={...driver,identity:{...driver.identity,serviceOrigin:historicalCandidate.serviceOrigin}};
assert(view.identity.serviceOrigin===candidate.identity.serviceOrigin);validateLocalInternetDriverRun(view);
let rejected=false;try{validateInternetRun(view);}catch{rejected=true;}assert(rejected);
const negative=[];
for(const name of ['mismatch','relabelled']) {
  const path=destination+'manifest-origin-'+name+'.json',r=read(path);
  assert(r.failure==='preparation-failed'&&r.temporaryRemoved&&r.directoryCleanupAttempted&&!r.cleanupFailed&&r.peers.length===0&&r.ownedProcesses.length===1&&r.elapsedMs<r.budgetMs);
  assert(!existsSync(join(tmpdir(),r.temporaryName)));
  for(const p of r.ownedProcesses){assert(p.kind==='preparation'&&p.exited);let alive=false;try{process.kill(p.pid,0);alive=true;}catch{}assert(!alive);}
  negative.push({path,sha256:fileHash(path),elapsedMs:r.elapsedMs,ownedExits:r.ownedProcesses.length,nativeAllocated:false});
}
const audit={version:1,candidateRevision:candidate.identity.revision,candidateManifestSha256:fileHash(destination+'candidate.json'),intendedServiceOrigin:candidate.identity.serviceOrigin,
  executableArtifacts:runtime,executableCount:Object.keys(runtime).length,allRuntimeFilesChecked:Object.keys(candidate.identity.artifacts).length,sourceFilesChecked:Object.keys(candidate.sourceFiles).length,
  runtimePackageUnchanged:{archiveSha256:candidate.identity.packageSha256,asarSha256:candidate.package.asarSha256,executableSha256:candidate.package.executableSha256},recoveryProvenance:histories,
  historicalDriver:{path:driverPath,sha256:fileHash(driverPath),observedSourceRevision:driver.identity.revision,sourceManifestPath:root+'candidate.json',sourceManifestSha256:fileHash(root+'candidate.json'),
    schemaAdapter:{addedIdentityServiceOrigin:historicalCandidate.serviceOrigin},validation:'PASS',internetEvidenceRejected:true,nativeRerun:false},negative,readinessSha256:fileHash(destination+'readiness.json'),externalStatus:'NOT_RUN'};
writeFileSync(destination+'audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(`Review-fix audit PASS: ${audit.executableCount} executable hashes equal across candidate/historical reports; canonical compiled origin; two early-rejection cleanup probes; no native rerun.`);
