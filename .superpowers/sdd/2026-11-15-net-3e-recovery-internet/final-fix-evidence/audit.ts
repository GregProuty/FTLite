import {execFileSync} from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,readdirSync,existsSync } from 'node:fs';
import { normalize,join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validateOnlineRecoveryReport } from '../../../../scripts/network/online-recovery-report';
import { validateOnlineAppReport } from '../../../../scripts/network/online-app-report';
import { validateInternetAppReport,validateLocalInternetDriverRun,validateInternetRun,executableRuntimeArtifacts } from '../../../../scripts/network/internet-app-report';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
const root='.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence/';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const fileHash=(p:string)=>hash(readFileSync(p));
const read=(p:string)=>JSON.parse(readFileSync(root+p,'utf8').replace(/^\uFEFF/,''));
const assert=(condition:unknown)=>{if(!condition)throw Error('task8-audit-failed');};
const candidate=read('candidate.json');
const runtimeBuildRevision='8d0b221a9922bd4e43914f9e45af92a08c1d4d4a';
assert(execFileSync('git',['diff','--name-only',runtimeBuildRevision+'..'+candidate.identity.revision,'--','src','build','electron.vite.config.ts','package.json','package-lock.json'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim()==='');
assert(fileHash(candidate.packagePath)===candidate.identity.packageSha256);
for(const [path,sha] of Object.entries({...candidate.sourceFiles,...candidate.identity.artifacts}))assert(fileHash(path)===sha);
const unpacked='dist/net-3e-final-candidate/win-unpacked/';
assert(fileHash(unpacked+'FTLite.exe')===candidate.package.executableSha256);
assert(fileHash(unpacked+'resources/app.asar')===candidate.package.asarSha256);
const rollbackPath='dist/net-3e-final-rollback-disabled/win-unpacked/resources/app.asar';
const entries:string[]=asar.listPackage(rollbackPath).map((p:string)=>p.replaceAll('\\','/').replace(/^\//,''));
assert(!entries.some(p=>/(^|\/)\.env|(^|\/)\.dev\.vars|(^|\/)(\.superpowers|test-results|scripts|tests|profiles)(\/|$)/i.test(p)));
const packagedMain=(path:string)=>asar.extractFile(path,normalize('out/main/index.js')).toString('utf8') as string;
function executeResolver(main:string,origin:string,extra:object={}) {
  const ast=ts.createSourceFile('packaged-main.js',main,ts.ScriptTarget.ESNext,true);
  const declaration=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='resolveOnlineConfig');assert(declaration);
  return runInNewContext(declaration!.getText(ast)+';resolveOnlineConfig(options)',{URL,options:{packaged:true,packagedServiceOrigin:origin,...extra}});
}
const disabledMain=packagedMain(rollbackPath),enabledMain=packagedMain(unpacked+'resources/app.asar');
assert(disabledMain.includes('packagedServiceOrigin: packaged ? "" : void 0'));
assert(enabledMain.includes('packagedServiceOrigin: packaged ? "'+candidate.serviceOrigin+'" : void 0'));
assert(executeResolver(disabledMain,'').enabled===false);
assert(executeResolver(disabledMain,'',{serviceUrl:'https://override.example'}).enabled===false);
assert(executeResolver(enabledMain,candidate.serviceOrigin).baseUrl===candidate.serviceOrigin);
assert(executeResolver(enabledMain,candidate.serviceOrigin,{serviceUrl:'https://override.example'}).enabled===false);
let compared=0;
for(const [path,sha] of Object.entries(candidate.identity.artifacts))if(path!=='out/main/index.js'){assert(hash(asar.extractFile(rollbackPath,normalize(path)))===sha);compared++;}
const rollback={version:1,origin:null,onlineDisabled:true,compiledResolverExecuted:true,developmentOverrideRejected:true,otherRuntimeFilesMatchingCandidate:compared,entryCount:entries.length,
  files:Object.fromEntries(['dist/net-3e-final-rollback-disabled.zip','dist/net-3e-final-rollback-disabled/win-unpacked/FTLite.exe',rollbackPath].map(p=>[p,fileHash(p)])),mainSha256:hash(disabledMain)};
writeFileSync(root+'rollback.json',JSON.stringify(rollback,null,2)+'\n');
const recovery=[];
for(const scenario of ['skiff','cutter','paused','upload','race','stale']){const report=read('recovery-'+scenario+'.json');validateOnlineRecoveryReport(report);for(const [path,sha]of Object.entries(report.source.artifactHashes))assert(fileHash(path.startsWith('out/')?path:root+'recovery-source/'+path)===sha);recovery.push({scenario,source:report.source.revision,candidateRevision:candidate.identity.revision,executableArtifacts:executableRuntimeArtifacts(report.source.artifactHashes),elapsedMs:report.elapsedMs,sha256:fileHash(root+'recovery-'+scenario+'.json')});}
const online=read('online-app.json');validateOnlineAppReport(online);
const local=read('internet-driver-loopback.json');validateLocalInternetDriverRun(local);
let internetRejected=false;try{validateInternetRun(local);}catch{internetRejected=true;}assert(internetRejected);
const native=read('native-config.json');assert(native.failure===null&&native.temporaryRemoved&&native.cleanupFailed===false);
const negative=read('recovery-unresponsive-cleanup.json');assert(negative.failure&&negative.elapsedMs<20000&&negative.runtime.workerExit&&negative.runtime.temporaryRemoved&&negative.runtimeHelper.exited&&negative.processes.every((p:any)=>p.exited&&p.forcedUtilityExits.every((u:any)=>u.exited)));
const negativeAudits=[];
for(const name of ['git-failure','git-timeout','preparation-read-failure']){const r=read('recovery-'+name+'.json');assert(r.failure&&r.elapsedMs<r.budgetMs&&r.runtime.temporaryRemoved&&r.directoryCleanupAttempted&&!r.nativeAllocated&&!r.cleanupFailed);assert(!existsSync(join(tmpdir(),r.temporaryName)));for(const p of r.preparationProcesses){assert(p.exited);let alive=false;try{process.kill(p.pid,0);alive=true;}catch{}assert(!alive);}negativeAudits.push({name,failure:r.failure,elapsedMs:r.elapsedMs,ownedExits:r.preparationProcesses.length});}
const delayed=read('internet-delayed-shutdown.json');validateLocalInternetDriverRun(delayed);
const host=delayed.peers.find((p:any)=>p.role==='host');assert(host.cleanup.shutdownComplete&&host.cleanup.exitCommitAcknowledged&&host.cleanup.exitCommitDelayMs>=2500&&host.cleanup.shutdownElapsedMs>=2500&&host.cleanup.exitCode===0);
const prior=JSON.parse(readFileSync('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-evidence/fix-1/candidate.json','utf8'));
const changedRuntime=Object.keys(candidate.identity.artifacts).filter(p=>candidate.identity.artifacts[p]!==prior.identity.artifacts[p]);
assert(JSON.stringify(changedRuntime)===JSON.stringify(['out/main/index.js']));
assert(candidate.identity.digest===prior.identity.digest);
assert(candidate.identity.workerBundleSha256===prior.identity.workerBundleSha256&&candidate.identity.workerConfigSha256===prior.identity.workerConfigSha256);
writeFileSync(root+'unchanged-runtime-provenance.json',JSON.stringify({historicalManifestSha256:fileHash('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-evidence/fix-1/candidate.json'),historicalRevision:prior.identity.revision,currentRevision:candidate.identity.revision,changedRuntime,unchangedRuntime:Object.fromEntries(Object.entries(candidate.identity.artifacts).filter(([p])=>!changedRuntime.includes(p))),sameGameplayDigest:true,workerUnchanged:true,serviceSuiteRerun:false,acceptanceRerun:false,enginesRerun:false,note:'Historical service/acceptance/engine results remain historical. Main lifecycle changed; all six recovery reports and actual-app gates below are newly executed.'},null,2)+'\n');
const notRun=()=>({status:'NOT_RUN',evidence:[]});
const ready={version:1,identity:candidate.identity,internetReady:false,localRecovery:{status:'PASS',runtimeProvenance:{reportRevision:read('recovery-skiff.json').source.revision,candidateRevision:candidate.identity.revision,executableArtifacts:executableRuntimeArtifacts(candidate.identity.artifacts)},evidence:[{path:root+'recovery-skiff.json',sha256:fileHash(root+'recovery-skiff.json')}],report:read('recovery-skiff.json')},deployedService:notRun(),forcedRelayGameplay:notRun(),twoMachineGameplay:notRun(),actualOsSuspend:notRun()};
validateInternetAppReport(ready);writeFileSync(root+'readiness.json',JSON.stringify(ready,null,2)+'\n');
const artifacts=Object.fromEntries(readdirSync(root).filter(p=>/\.(json|png|ts)$/.test(p)&&p!=='audit.json'&&p!=='candidate-working.json').sort().map(p=>[p,fileHash(root+p)]));
writeFileSync(root+'audit.json',JSON.stringify({version:1,candidateSource:candidate.identity.revision,runtimeBuildRevision,runtimeSourceUnchangedSinceBuild:true,candidateManifestSha256:fileHash(root+'candidate.json'),delayedShutdown:{source:delayed.identity.revision,elapsedMs:delayed.elapsedMs,cleanup:host.cleanup},sourceFilesChecked:Object.keys(candidate.sourceFiles).length,artifactFilesChecked:Object.keys(candidate.identity.artifacts).length,rollback,recovery,onlineApp:{source:online.source.revision,elapsedMs:online.elapsedMs},localInternetDriver:{source:local.identity.revision,elapsedMs:local.elapsedMs,internetRejected},negativeAudits,artifacts,externalStatus:'NOT_RUN'},null,2)+'\n');
console.log('Final-fix audit PASS: exact candidate/default-disabled rollback, compiled config, six recovery reports, native app, local-only driver, negative cleanup, and incomplete readiness.');
