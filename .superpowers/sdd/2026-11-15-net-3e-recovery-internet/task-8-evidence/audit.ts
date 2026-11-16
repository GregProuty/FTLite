import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,readdirSync,existsSync } from 'node:fs';
import { normalize,join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validateOnlineRecoveryReport } from '../../../../scripts/network/online-recovery-report';
import { validateOnlineAppReport } from '../../../../scripts/network/online-app-report';
import { validateInternetAppReport,validateLocalInternetDriverRun,validateInternetRun } from '../../../../scripts/network/internet-app-report';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
const root='.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-evidence/';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const fileHash=(p:string)=>hash(readFileSync(p));
const read=(p:string)=>JSON.parse(readFileSync(root+p,'utf8').replace(/^\uFEFF/,''));
const assert=(condition:unknown)=>{if(!condition)throw Error('task8-audit-failed');};
const candidate=read('candidate.json');
assert(fileHash(candidate.packagePath)===candidate.identity.packageSha256);
for(const [path,sha] of Object.entries({...candidate.sourceFiles,...candidate.identity.artifacts}))assert(fileHash(path)===sha);
const unpacked='dist/net-3e-candidate/win-unpacked/';
assert(fileHash(unpacked+'FTLite.exe')===candidate.package.executableSha256);
assert(fileHash(unpacked+'resources/app.asar')===candidate.package.asarSha256);
const rollbackPath='dist/net-3e-rollback-disabled/win-unpacked/resources/app.asar';
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
  files:Object.fromEntries(['dist/net-3e-rollback-disabled.zip','dist/net-3e-rollback-disabled/win-unpacked/FTLite.exe',rollbackPath].map(p=>[p,fileHash(p)])),mainSha256:hash(disabledMain)};
writeFileSync(root+'rollback.json',JSON.stringify(rollback,null,2)+'\n');
const recovery=[];
for(const scenario of ['skiff','cutter','paused','upload','race','stale']){const report=read('recovery-'+scenario+'.json');validateOnlineRecoveryReport(report);for(const [path,sha]of Object.entries(report.source.artifactHashes))assert(fileHash(path)===sha);recovery.push({scenario,source:report.source.revision,elapsedMs:report.elapsedMs,sha256:fileHash(root+'recovery-'+scenario+'.json')});}
const online=read('online-app.json');validateOnlineAppReport(online);
const local=read('internet-driver-loopback.json');validateLocalInternetDriverRun(local);
let internetRejected=false;try{validateInternetRun(local);}catch{internetRejected=true;}assert(internetRejected);
const native=read('native-config.json');assert(native.failure===null&&native.temporaryRemoved&&native.cleanupFailed===false);
const negative=read('recovery-unresponsive-cleanup.json');assert(negative.failure&&negative.elapsedMs<20000&&negative.runtime.workerExit&&negative.runtime.temporaryRemoved&&negative.runtimeHelper.exited&&negative.processes.every((p:any)=>p.exited&&p.forcedUtilityExits.every((u:any)=>u.exited)));
const negativeAudits=[];
for(const name of ['preparation-read-failure','preparation-timeout','cleanup-stop-failure']){const r=read('internet-'+name+'.json');assert(r.failure&&r.elapsedMs<r.budgetMs&&r.temporaryRemoved&&r.directoryCleanupAttempted);assert(!existsSync(join(tmpdir(),r.temporaryName)));for(const p of r.ownedProcesses){assert(p.exited);let alive=false;try{process.kill(p.pid,0);alive=true;}catch{}assert(!alive);}negativeAudits.push({name,failure:r.failure,cleanupFailed:r.cleanupFailed,elapsedMs:r.elapsedMs,ownedExits:r.ownedProcesses.length});}
const notRun=()=>({status:'NOT_RUN',evidence:[]});
const ready={version:1,identity:candidate.identity,internetReady:false,localRecovery:{status:'PASS',evidence:[{path:root+'recovery-skiff.json',sha256:fileHash(root+'recovery-skiff.json')}],report:read('recovery-skiff.json')},deployedService:notRun(),forcedRelayGameplay:notRun(),twoMachineGameplay:notRun(),actualOsSuspend:notRun()};
validateInternetAppReport(ready);writeFileSync(root+'readiness.json',JSON.stringify(ready,null,2)+'\n');
const artifacts=Object.fromEntries(readdirSync(root).filter(p=>/\.(json|png|ts)$/.test(p)&&p!=='audit.json'&&p!=='candidate-working.json').sort().map(p=>[p,fileHash(root+p)]));
writeFileSync(root+'audit.json',JSON.stringify({version:1,candidateSource:candidate.identity.revision,candidateManifestSha256:fileHash(root+'candidate.json'),sourceFilesChecked:Object.keys(candidate.sourceFiles).length,artifactFilesChecked:Object.keys(candidate.identity.artifacts).length,rollback,recovery,onlineApp:{source:online.source.revision,elapsedMs:online.elapsedMs},localInternetDriver:{source:local.identity.revision,elapsedMs:local.elapsedMs,internetRejected},negativeAudits,artifacts,externalStatus:'NOT_RUN'},null,2)+'\n');
console.log('Task8 audit PASS: exact candidate/default-disabled rollback, compiled config, six recovery reports, native app, local-only driver, negative cleanup, and incomplete readiness.');
