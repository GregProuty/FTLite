import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename,dirname,join,resolve,sep } from 'node:path';
import electron from 'electron';
import { resolveOnlineConfig } from '../../src/main/network/onlineConfig';
import { createLauncherDeadline,removeOwnedDirectory,stopOwnedProcess } from './lease-smoke-lifecycle';
import { startOnlineAppRuntime,waitForAppRequest } from './online-app-runtime';
import { INTERNET_ARTIFACTS,validateInternetRun,validateLocalInternetDriverRun } from './internet-app-report';
import { assertCandidateServiceOrigin } from './internet-app-manifest';

const pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
type Owned={child:ChildProcess,pid:number,exited:boolean,exitCode:number|null,done:Promise<void>,kind:'preparation'|'host'|'guest',request?:(command:string,data?:object)=>Promise<any>,cleanup?:any};
async function main() {
  const args=new Map<string,string>();
  for(const arg of process.argv.slice(2)) {const at=arg.indexOf('=');const key=at<0?arg:arg.slice(0,at),value=at<0?'true':arg.slice(at+1);if(args.has(key))throw Error('arguments-invalid');args.set(key,value);}
  const allowed=['--service-origin','--force-relay','--report-path','--candidate-manifest','--role','--machine-label','--network-label','--capture-after-ms','--local-verification','--local-delayed-shutdown','--inject-preparation-read-failure','--inject-preparation-timeout','--inject-cleanup-stop-failure'];
  if([...args.keys()].some(k=>!allowed.includes(k)))throw Error('arguments-invalid');
  const origin=args.get('--service-origin'),config=resolveOnlineConfig({packaged:false,serviceUrl:origin});
  if(!config.enabled || !args.get('--report-path') || args.has('--force-relay')&&args.get('--force-relay')!=='true')throw Error('arguments-invalid');
  const role=args.get('--role'),manual=role!==undefined;
  const machineLabel=args.get('--machine-label')??'local-pair',networkLabel=args.get('--network-label')??'local-network';
  if(role&&!['host','guest'].includes(role)||![machineLabel,networkLabel].every(s=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s))||manual&&(!args.has('--machine-label')||!args.has('--network-label')))throw Error('arguments-invalid');
  const captureAfter=Number(args.get('--capture-after-ms')??180000);
  if(!Number.isSafeInteger(captureAfter)||captureAfter<30000||captureAfter>540000)throw Error('arguments-invalid');
  const injected=[...args.keys()].some(k=>k.startsWith('--inject-'));
  const local=args.has('--local-verification');if(args.has('--local-delayed-shutdown')&&!local)throw Error('arguments-invalid');if(local&&(manual||args.has('--force-relay')))throw Error('arguments-invalid');
  const began=performance.now(),budgetMs=injected?20000:manual?captureAfter+30000:90000,deadline=createLauncherDeadline(began+budgetMs);
  const reportPath=resolve(args.get('--report-path')!);mkdirSync(dirname(reportPath),{recursive:true});
  const directory=mkdtempSync(join(tmpdir(),'ftlite-internet-app-')),owned:Owned[]=[],peers:any[]=[];
  let failure:string|null=null,cleanupFailed=false,directoryCleanupAttempted=false,identity:any=null,stage='preparation',cleaning=false;
  let runtime:ReturnType<typeof startOnlineAppRuntime>|undefined;const abort=new AbortController();
  function own(command:string,argv:string[],kind:Owned['kind'],env=process.env) {
    const child=spawn(command,argv,{env,windowsHide:kind==='preparation',stdio:['ignore','pipe','pipe',...(kind==='preparation'?[]:['ipc'])] as any});
    const p:Owned={child,pid:child.pid!,kind,exited:false,exitCode:null,done:Promise.resolve()};owned.push(p);
    child.stderr?.resume();p.done=new Promise<void>((done,reject)=>{child.once('error',()=>reject(Error('child-failed')));child.once('exit',code=>{p.exited=true;p.exitCode=code;});child.once('close',()=>done());});void p.done.catch(()=>{});return p;
  }
  async function preparation(command:string,argv:string[],collect=false) {
    const p=own(command,argv,'preparation');let output='';let overflow=false;
    p.child.stdout?.on('data',(chunk:Buffer)=>{if(!collect)return;if(Buffer.byteLength(output)+chunk.length>1048576)overflow=true;else if(!overflow)output+=chunk.toString();});
    await deadline.wait(p.done,'preparation-timeout',10000);if(p.exitCode!==0||overflow)throw Error('preparation-failed');return output.trim();
  }
  async function until(read:()=>Promise<any>,accept:(value:any)=>boolean) {
    const end=Math.min(performance.now()+15000,began+budgetMs-10000);
    while(performance.now()<end){const result=await read();if(accept(result))return result;await pause(60);}throw Error('driver-timeout');
  }
  async function launch(kind:'host'|'guest') {
    if(typeof electron!=='string')throw Error('native-failed');
    const env={...process.env,FTLITE_SERVICE_URL:config.enabled?config.baseUrl:'',NODE_PATH:resolve('node_modules')};
    for(const key of ['FTLITE_LOCAL_SERVICE_URL','FTLITE_PACKAGED_SERVICE_ORIGIN','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','CHROME_CRASHPAD_PIPE_NAME'])delete (env as NodeJS.ProcessEnv)[key];
    if(local){delete (env as NodeJS.ProcessEnv).FTLITE_SERVICE_URL;(env as NodeJS.ProcessEnv).FTLITE_LOCAL_SERVICE_URL=runtime!.baseUrl;}
    const p=own(electron,[resolve('scripts/network/online-app-smoke.cjs'),`--online-app-dir=${directory}`,`--online-app-role=${kind}`,`--user-data-dir=${join(directory,kind)}`,...(args.has('--force-relay')?['--internet-force-relay']:[])],kind,env);p.child.stdout?.resume();
    let id=0;const pending=new Map<number,{resolve:(v:any)=>void,reject:(e:Error)=>void}>();
    p.child.on('message',(m:any)=>{const q=pending.get(m.id);if(!q)return;pending.delete(m.id);m.error?q.reject(Error('driver-failed')):q.resolve(m.result);});
    p.child.on('exit',()=>{for(const q of pending.values())q.reject(Error('driver-exited'));pending.clear();});
    p.request=async(command,data={})=>{
      if(!p.child.connected||p.exited||deadline.remaining(cleaning?8000:10000)<=0)throw Error('driver-timeout');
      const key=++id;const work=new Promise((resolve,reject)=>{pending.set(key,{resolve,reject});try{p.child.send({...data,...(command==='shutdown'?{shutdownBudgetMs:Math.max(0,Math.min(4500,deadline.remaining(cleaning?8000:10000)-250))}:{}),command,requestId:key},error=>{if(error){pending.delete(key);reject(Error('driver-failed'));}});}catch{pending.delete(key);reject(Error('driver-failed'));}});
      return waitForAppRequest(work,deadline,undefined,cleaning?8000:10000).finally(()=>pending.delete(key));
    };
    await until(async()=>{try{return await p.request!('status');}catch{if(p.exited)throw Error('driver-exited');return null;}},v=>v?.electron==='37.10.3'&&v?.text?.includes('Couch play'));return p;
  }
  async function phase(p:Owned,value:string){return until(()=>p.request!('status'),v=>v.status.phase===value);}
  const click=(p:Owned,id:string)=>p.request!('click',{id});
  async function capture(p:Owned) {
    const value=await p.request!('status'),o=value.observations.at(-1),s=value.status.snapshot;
    const resources=await p.request!('resources');
    const receipt=value.mirrorProof.receipts.at(-1);
    if(!o||!s||!receipt)throw Error('gameplay-missing');
    await p.request!('screenshot',{path:join(dirname(reportPath),`${basename(reportPath,'.json')}-${p.kind}.png`)});
    return {role:p.kind,seat:value.status.ownSeat,runId:s.runId,hostGeneration:s.hostGeneration,checkpoint:receipt,errors:o.errors,fullReceipts:o.fullReceipts,firstAckOrder:o.firstAckOrder,firstInputOrder:o.firstInputOrder,
      inputs:o.inputs.map((i:any)=>({player:i.player,sequence:i.sequence,order:i.order,...(i.command?{command:i.command}:{})})),
      results:o.results.filter((r:any)=>r.status==='applied').map((r:any)=>({id:{player:r.id.player,sequence:r.id.sequence},status:r.status})),
      publications:o.publications.map((s:any)=>({runId:s.runId,sequence:s.sequence,tick:s.tick,hash:s.hash,phase:s.phase,commandHighWater:s.commandHighWater,heldHighWater:s.heldHighWater})),
      routes:resources.native.flatMap((n:any)=>n.connections).filter((r:any)=>r.state==='connected'&&r.selected).map((r:any)=>({state:r.state,selected:r.selected,localType:r.localType,remoteType:r.remoteType,policy:r.policy,sent:r.channels.reduce((n:number,c:any)=>n+c.sent,0),received:r.channels.reduce((n:number,c:any)=>n+c.received,0)}))};
  }
  try {
    if(args.has('--inject-preparation-timeout'))await preparation(process.execPath,['-e','setInterval(()=>{},1000)']);
    const revision=await preparation('git',['rev-parse','HEAD'],true);
    if(args.has('--inject-preparation-read-failure')||args.has('--inject-cleanup-stop-failure'))readFileSync(join(directory,'missing-artifact'));
    if(!args.get('--candidate-manifest'))throw Error('preparation-failed');
    const manifest=JSON.parse(readFileSync(resolve(args.get('--candidate-manifest')!),'utf8'));identity=manifest.identity;
    assertCandidateServiceOrigin(manifest,config.baseUrl,()=>readFileSync('out/main/index.js','utf8'));
    if(!/^[a-f0-9]{40}$/.test(revision)||!/^[a-f0-9]{40}$/.test(identity.revision)||manifest.serviceOrigin!==config.baseUrl || INTERNET_ARTIFACTS.some(k=>!identity.artifacts[k]))throw Error('preparation-failed');
    // Documentation/evidence commits may follow packaging. Verify the candidate
    // source ancestor AND its exact source bytes instead of relabelling the build.
    await preparation('git',['merge-base','--is-ancestor',identity.revision,'HEAD']);
    if(!manifest.sourceFiles?.['scripts/network/internet-app-smoke.ts'])throw Error('preparation-failed');
    for(const [path,expected] of Object.entries(manifest.sourceFiles)) {if(!deadline.remaining(10000)||!(/^(src|scripts|build)\//.test(path)||['package.json','package-lock.json','electron.vite.config.ts','electron-builder.yml'].includes(path))||path.includes('..')||hash(path)!==expected)throw Error('preparation-failed');}
    for(const [path,expected] of Object.entries(identity.artifacts)) {if(!deadline.remaining(10000)||!path.startsWith('out/')||path.includes('..')||hash(path)!==expected)throw Error('preparation-failed');}
    if(hash(manifest.packagePath)!==identity.packageSha256)throw Error('preparation-failed');
    if(local){runtime=startOnlineAppRuntime(directory,identity.digest,abort.signal);await deadline.wait(runtime.ready,'preparation-timeout',10000);}
    else await preparation(process.execPath,['--import','tsx',resolve('scripts/network/internet-observer-worker.ts'),directory,identity.digest]);
    stage='native';
    if(manual) {
      const app=await launch(role as 'host'|'guest');console.log('Use ordinary Host/Join/Ready/Start; both players issue gameplay commands, then leave the game paused for capture.');
      await deadline.wait(pause(Math.max(0,began+captureAfter-performance.now())),'driver-timeout',10000);
      await phase(app,'paused');peers.push(await capture(app));
    } else {
      const host=await launch('host'),guest=await launch('guest');await click(host,'host');await click(host,'create-room');const lobby=await phase(host,'lobby');
      await click(guest,'join');await guest.request!('type',{id:'join-code',text:lobby.status.snapshot.joinCode});await click(guest,'join-room');await phase(guest,'lobby');
      await click(host,'ready');await click(guest,'ready');await until(()=>host.request!('status'),v=>v.status.actions.includes('start'));await click(host,'start');await phase(guest,'running');
      for(const app of [host,guest]) {await app.request!('key',{key:'F',down:true});await pause(100);await app.request!('key',{key:'F',down:false});await click(app,'pause');await phase(app,'paused');await click(app,'pause');await phase(app,'running');}
      await pause(6000);await click(guest,'pause');await phase(host,'paused');
      await until(async()=>[await host.request!('status'),await guest.request!('status')],v=>{const a=v[0].mirrorProof.receipts.at(-1),b=v[1].mirrorProof.receipts.at(-1);return a&&b&&a.capturedTick>0&&JSON.stringify(a)===JSON.stringify(b);});
      peers.push(await capture(host),await capture(guest));
      if(args.has('--local-delayed-shutdown'))await host.request!('delay-exit-commit');
    }
  }catch(error){failure=stage==='preparation'?(error instanceof Error&&error.message==='preparation-timeout'?'preparation-timeout':'preparation-failed'):'native-gameplay-failed';}
  finally {
    cleaning=true;
    await Promise.all([...owned.map(async p=>{try{if(p.kind!=='preparation'&&!p.exited){try{p.cleanup=await p.request!('shutdown');await deadline.wait(p.done,'cleanup-timeout',7000);}catch{cleanupFailed=true;}}
      await stopOwnedProcess(p.child,deadline);await deadline.wait(p.done,'cleanup-timeout',1500);
      if(p===owned[0]&&args.has('--inject-cleanup-stop-failure'))throw Error('cleanup-failed');
    }catch{cleanupFailed=true;}}),...(runtime?[runtime.dispose(deadline).catch(()=>{cleanupFailed=true;})]:[])]);abort.abort();
    directoryCleanupAttempted=true;
    try {const target=resolve(directory),prefix=resolve(tmpdir())+sep;if(!target.startsWith(prefix)||!target.slice(prefix.length).startsWith('ftlite-internet-app-'))throw Error('cleanup-target-invalid');await removeOwnedDirectory(target,deadline);}catch{cleanupFailed=true;}
  }
  for(const peer of peers){const p=owned.find(p=>p.kind===peer.role)!;peer.cleanup={pid:p.pid,exited:p.exited,exitCode:p.exitCode,...p.cleanup};}
  if(args.has('--local-delayed-shutdown')&&!failure) {const host=owned.find(p=>p.kind==='host');if(!host?.cleanup?.shutdownComplete||!host.cleanup.exitCommitAcknowledged||host.cleanup.exitCommitDelayMs<2500||host.cleanup.shutdownElapsedMs<2500)failure='delayed-shutdown-proof-failed';}
  if(cleanupFailed)failure??='cleanup-failed';
  const report={version:1,identity,serviceOrigin:local?runtime?.baseUrl??'http://127.0.0.1:1':config.baseUrl,forceRelay:args.has('--force-relay'),mode:manual?'single-device':'local-pair',machineLabel,networkLabel,failure,cleanupFailed,temporaryRemoved:!existsSync(directory),directoryCleanupAttempted,elapsedMs:Math.round(performance.now()-began),budgetMs,processes:owned.filter(p=>p.kind==='preparation').map(p=>({pid:p.pid,exited:p.exited,exitCode:p.exitCode,kind:p.kind})),peers};
  if(!failure)try{if(local){validateLocalInternetDriverRun(report);if(!runtime?.exited()||!runtime.observation().exited||runtime.observation().exitCode!==0)throw Error('runtime-cleanup-failed');}else validateInternetRun(report);}catch{report.failure='internet-evidence-invalid';}
  if(runtime)writeFileSync(reportPath+'.runtime.json',JSON.stringify({helper:runtime.observation(),workerPid:runtime.pid,workerExited:runtime.exited()},null,2)+'\n');
  // Negative reports retain owned process and exact directory identities without raw exceptions.
  writeFileSync(reportPath,JSON.stringify(report.failure?{...report,temporaryName:basename(directory),ownedProcesses:owned.map(p=>({pid:p.pid,kind:p.kind,exited:p.exited,exitCode:p.exitCode}))}:report,null,2)+'\n');
  if(report.failure){console.error(report.failure);process.exitCode=1;}else console.log('Actual-app evidence PASS; this invocation does not assert internet readiness or physical separation.');
}
main().catch(()=>{console.error('internet-driver-arguments-or-report-failed');process.exitCode=1;});
