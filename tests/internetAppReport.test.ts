import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateInternetAppReport, validateInternetRun, validateLocalInternetDriverRun, INTERNET_ARTIFACTS } from '../scripts/network/internet-app-report';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
const sha = 'a'.repeat(64), runId = 'b'.repeat(32);
const recovery = JSON.parse(readFileSync('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-7-evidence/recovery-skiff.json','utf8'));
const identity = () => ({ serviceOrigin:'https://service.example', revision:'c'.repeat(40), digest:recovery.source.digest, packageSha256:sha,workerBundleSha256:sha,workerConfigSha256:sha, artifacts:Object.fromEntries(Object.entries(recovery.source.artifactHashes).filter(([k])=>k.startsWith('out/'))), versions:{electron:'37.10.3',wrangler:'4.156.0',workerd:'1.20261023.1',protocol:2,sim:SIM_VERSION,checkpoint:2,replay:[2,3,4]} });
const ref = () => ({path:'evidence/run.json',sha256:sha});
const publication = () => ({runId,sequence:10,tick:320,hash:'f'.repeat(8),phase:'paused',commandHighWater:[2,3],heldHighWater:[4,5]});
const peer = (seat:number) => ({role:seat===0?'host':'guest',seat,runId,hostGeneration:1,checkpoint:{runId,hostGeneration:1,checkpointSequence:3,capturedTick:320,payloadSha256:sha},errors:0,fullReceipts:1,firstAckOrder:1,firstInputOrder:2,
  inputs:[{player:seat,sequence:seat?3:2,order:2,command:'pause'}],results:[{id:{player:seat,sequence:seat?3:2},status:'applied'}],publications:[publication()],
  routes:[{state:'connected',selected:true,localType:'relay',remoteType:'relay',policy:'relay',sent:10,received:10}],
  cleanup:{pid:100+seat,exited:true,exitCode:0,utilities:seat?0:1,utilityExits:seat?0:1,utilityPids:seat?[]:[150],windows:0,ports:0,listeners:0,peers:0,nativeWindows:1,nativeWindowExits:1,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithWindow:0,observedMainPorts:4}});
const duelCleanup = (pid:number,host:boolean) => ({pid,exited:true,exitCode:0,utilities:host?1:0,utilityExits:host?1:0,utilityPids:host?[pid+50]:[],windows:0,ports:0,listeners:0,peers:0,nativeWindows:1,nativeWindowExits:1,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithWindow:0,observedMainPorts:3});
const duel = () => ({seed:2277,decidedTick:1471,thrust:{before:0,host:12.5,guest:12.5},beam:{before:0,host:1,guest:1},agreement:{tick:1800,sequence:600,hash:'abcdef01'},
  records:[{role:'host',round:0,transport:'loopback',rttMs:1,held:2,command:2},{role:'guest',round:0,transport:'internet',rttMs:38,held:2,command:2}],cleanup:[duelCleanup(200,true),duelCleanup(201,false)]});
const deviceDuel = (seat:number) => ({seed:2277,decidedTick:1471,thrust:{before:0,peak:12.5},beam:{before:0,after:1},
  record:seat?{role:'guest',round:0,transport:'internet',rttMs:38,held:2,command:2}:{role:'host',round:0,transport:'loopback',rttMs:1,held:2,command:2},cleanup:duelCleanup(300+seat,!seat)});
const run = (role?:number):any => ({version:1,identity:identity(),serviceOrigin:'https://service.example',forceRelay:true,mode:role===undefined?'local-pair':'single-device',machineLabel:role===undefined?'local':`device-${role}`,networkLabel:role===undefined?'local':`network-${role}`,failure:null,cleanupFailed:false,temporaryRemoved:true,directoryCleanupAttempted:true,elapsedMs:1000,budgetMs:90000,processes:[{pid:10,exited:true,exitCode:0,kind:'preparation'}],peers:role===undefined?[peer(0),peer(1)]:[peer(role)],...(role===undefined?{duel:duel()}:{deviceDuel:deviceDuel(role)})});
const fixture = ():any => ({version:1,identity:identity(),internetReady:true,localRecovery:{status:'PASS',evidence:[ref()],report:structuredClone(recovery),runtimeProvenance:{reportRevision:recovery.source.revision,candidateRevision:'c'.repeat(40),executableArtifacts:identity().artifacts}},deployedService:{status:'PASS',evidence:[ref()],report:run(),deployment:{workerName:'ftlite-signalling-dev',serviceOrigin:'https://service.example',versionId:'deployment-1',bundleSha256:sha,configSha256:sha,operatorConfirmedArtifact:true}},forcedRelayGameplay:{status:'PASS',evidence:[ref()],report:run()},twoMachineGameplay:{status:'PASS',evidence:[ref(),ref()],reports:[run(0),run(1)],attestation:{physicallySeparate:true,differentNetworks:true,operatorLabels:['operator-a','operator-b']}},actualOsSuspend:{status:'NOT_RUN',evidence:[]}});
it('accepts complete semantic evidence with honest operator attestation',()=>expect(()=>validateInternetAppReport(fixture())).not.toThrow());
it('accepts an explicitly incomplete candidate without promoting external gates',()=>{const r=fixture();r.internetReady=false;for(const k of ['deployedService','forcedRelayGameplay','twoMachineGameplay'])r[k]={status:'NOT_RUN',evidence:[]};expect(()=>validateInternetAppReport(r)).not.toThrow();});
it.each([
  ['missing selected pair',(r:any)=>r.forcedRelayGameplay.report.peers[0].routes[0].selected=false],
  ['direct pair relabelled relay',(r:any)=>r.forcedRelayGameplay.report.peers[0].routes[0].localType='host'],
  ['handshake only',(r:any)=>r.forcedRelayGameplay.report.peers[1].publications=[]],
  ['no commands',(r:any)=>r.forcedRelayGameplay.report.peers[1].results=[]],
  ['different state',(r:any)=>r.forcedRelayGameplay.report.peers[1].publications[0].hash='0'.repeat(8)],
  ['different command',(r:any)=>r.forcedRelayGameplay.report.peers[1].results[0].id.sequence=99],
  ['same machine',(r:any)=>r.twoMachineGameplay.reports[1].machineLabel='device-0'],
  ['same network',(r:any)=>r.twoMachineGameplay.reports[1].networkLabel='network-0'],
  ['local pair relabelled',(r:any)=>r.twoMachineGameplay.reports[1]=run()],
  ['missing attestation',(r:any)=>delete r.twoMachineGameplay.attestation],
  ['incompatible artifact',(r:any)=>r.twoMachineGameplay.reports[1].identity.packageSha256='d'.repeat(64)],
  ['wrong generation',(r:any)=>r.twoMachineGameplay.reports[1].peers[0].hostGeneration++],
  ['wrong checkpoint',(r:any)=>r.twoMachineGameplay.reports[1].peers[0].checkpoint.checkpointSequence++],
  ['hidden failure',(r:any)=>r.deployedService.report.failure='driver-failed'],
  ['missing cleanup',(r:any)=>delete r.forcedRelayGameplay.report.peers[0].cleanup],
  ['unbalanced cleanup',(r:any)=>r.forcedRelayGameplay.report.peers[0].cleanup.utilityExits=0],
  ['temporary leak',(r:any)=>r.forcedRelayGameplay.report.temporaryRemoved=false],
  ['observer error',(r:any)=>r.forcedRelayGameplay.report.peers[0].errors=1],
  ['input before ACK',(r:any)=>r.forcedRelayGameplay.report.peers[0].inputs[0].order=1],
  ['summary false',(r:any)=>r.internetReady=false],
  ['unreferenced proof',(r:any)=>r.deployedService.evidence=[]],
  ['wrong deployed artifact',(r:any)=>r.deployedService.deployment.bundleSha256='d'.repeat(64)],
  ['wrong deployed origin',(r:any)=>r.deployedService.deployment.serviceOrigin='https://other.example'],
  ['local recovery from different runtime bytes',(r:any)=>r.localRecovery.report.source.artifactHashes['out/main/index.js']='d'.repeat(64)],
  ['raw diagnostic',(r:any)=>r.forcedRelayGameplay.report.peers[0].routes[0].address='192.0.2.1'],
  ['no duel run in a local pair',(r:any)=>delete r.forcedRelayGameplay.report.duel],
  ['a direct duel guest under forced relay',(r:any)=>r.forcedRelayGameplay.report.duel.records[1].transport='lan'],
  ['a duel guest record without an RTT',(r:any)=>r.deployedService.report.duel.records[1].rttMs=null],
  ['a duel host record off loopback',(r:any)=>r.deployedService.report.duel.records[0].transport='lan'],
  ['no beam in the duel',(r:any)=>r.deployedService.report.duel.beam.guest=0],
  ['unbalanced duel cleanup',(r:any)=>r.deployedService.report.duel.cleanup[0].utilityExits=0],
  ['a duel pid reused',(r:any)=>r.deployedService.report.duel.cleanup[1].pid=100],
  ['a duel run on a single device',(r:any)=>r.twoMachineGameplay.reports[0].duel=duel()],
  ['a duel candidate field',(r:any)=>r.deployedService.report.duel.records[1].candidate='host'],
  ['no latency samples',(r:any)=>{const x=r.deployedService.report.duel.records[1];x.held=0;x.command=0;}],
  ['no duel run on a single device',(r:any)=>delete r.twoMachineGameplay.reports[1].deviceDuel],
  ['a device duel record from the other seat',(r:any)=>{ r.twoMachineGameplay.reports[0].deviceDuel.record={role:'guest',round:0,transport:'internet',rttMs:38,held:2,command:2}; }],
  ['a direct device duel guest under forced relay',(r:any)=>r.twoMachineGameplay.reports[1].deviceDuel.record.transport='lan'],
  ['two-machine duel seeds differ',(r:any)=>r.twoMachineGameplay.reports[1].deviceDuel.seed=1],
])('rejects %s',(_name,mutate)=>{const r=fixture();mutate(r);expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('admits a single device only as an independent local result',()=>expect(()=>validateInternetRun(run(1))).not.toThrow());
it('admits a direct LAN duel guest only without forced relay',()=>{const r=run();r.duel.records[1].transport='lan';expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');r.forceRelay=false;for(const p of r.peers)p.routes[0]={...p.routes[0],localType:'host',remoteType:'host',policy:'all'};expect(()=>validateInternetRun(r)).not.toThrow();});
it('keeps a loopback rehearsal out of every internet gate',()=>{const r=run();r.serviceOrigin='http://127.0.0.1:12345';r.forceRelay=false;expect(()=>validateLocalInternetDriverRun(r)).not.toThrow();expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');});
it('accepts bounded retained inputs without losing the observed first ACK/input ordering',()=>{const r=run();r.peers[0].firstInputOrder=2;r.peers[0].inputs[0].order=10;expect(()=>validateInternetRun(r)).not.toThrow();});
it('rejects credentials hidden in older recovery evidence',()=>{const r=fixture();r.localRecovery.report.seatToken='private';expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('accepts the production 32-bit canonical publication hash width',()=>{const r=run();for(const p of r.peers)p.publications[0].hash='c7e5cfd9';expect(()=>validateInternetRun(r)).not.toThrow();});
it('accepts actual tick-zero bootstrap followed by gameplay',()=>{const r=run();for(const p of r.peers)p.publications.unshift({...publication(),tick:0,sequence:1});expect(()=>validateInternetRun(r)).not.toThrow();});
it('rejects only tick-zero bootstrap as gameplay',()=>{const r=run();for(const p of r.peers)p.publications[0].tick=0;expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');});
it('rejects matching bootstrap with unrelated advancing gameplay',()=>{const r=run();for(const p of r.peers)p.publications.unshift({...publication(),tick:0,sequence:1});r.peers[1].publications[1].hash='00000000';expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');});
it('requires command watermarks in a common advancing publication',()=>{const r=run();for(const p of r.peers)p.publications[0].commandHighWater=[0,0];expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');});
it('requires deployed artifact identity, not only successful app requests',()=>{const r=fixture();delete r.deployedService.deployment;expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
const localCandidate=()=>{const r=fixture();r.internetReady=false;for(const key of ['deployedService','forcedRelayGameplay','twoMachineGameplay'])r[key]={status:'NOT_RUN',evidence:[]};return r;};
const rendererArtifact=Object.keys(recovery.source.artifactHashes).find(k=>/^out\/renderer\/assets\/index-.*\.js$/.test(k))!;
it.each(['out/main/hostProcess.js','out/main/transportWindow.js',rendererArtifact])('rejects changed recovery executable %s',path=>{const r=localCandidate();r.localRecovery.report.source.artifactHashes[path]=sha;expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it.each(['candidate','recovery'])('rejects missing executable in %s',side=>{const r=localCandidate();if(side==='candidate')delete r.identity.artifacts[rendererArtifact];else delete r.localRecovery.report.source.artifactHashes[rendererArtifact];expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it.each(['candidate','recovery'])('rejects extra executable in %s',side=>{const r=localCandidate();(side==='candidate'?r.identity.artifacts:r.localRecovery.report.source.artifactHashes)['out/main/extra-chunk.js']=sha;expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('requires explicit byte-equality provenance for historical recovery revisions',()=>{const r=localCandidate();delete r.localRecovery.runtimeProvenance;expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it.each(['deployedService','forcedRelayGameplay','twoMachineGameplay','actualOsSuspend'])('binds %s to the intended service origin',gate=>{
  const r=fixture();if(gate==='twoMachineGameplay'){for(const report of r[gate].reports)report.serviceOrigin='https://other.example';}
  else if(gate==='actualOsSuspend')r[gate]={status:'PASS',evidence:[ref()],report:{...run(),serviceOrigin:'https://other.example'},attestation:{actualOsSleep:true,operatorLabel:'operator-a'}};
  else {r[gate].report.serviceOrigin='https://other.example';if(gate==='deployedService')r[gate].deployment.serviceOrigin='https://other.example';}
  expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');
});
it('requires the intended origin in candidate identity',()=>{const r=localCandidate();delete r.identity.serviceOrigin;expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it.each(['reportRevision','candidateRevision','executableArtifacts'])('rejects incorrect historical provenance %s',field=>{const r=localCandidate();if(field==='executableArtifacts')r.localRecovery.runtimeProvenance[field]['out/main/hostProcess.js']=sha;else r.localRecovery.runtimeProvenance[field]='d'.repeat(40);expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('accepts current-revision recovery without a historical provenance record',()=>{const r=localCandidate();r.localRecovery.report.source.revision=r.identity.revision;delete r.localRecovery.runtimeProvenance;expect(()=>validateInternetAppReport(r)).not.toThrow();});
it('does not confuse provenance map field ordering with byte inequality',()=>{const r=localCandidate();r.localRecovery.runtimeProvenance.executableArtifacts=Object.fromEntries(Object.entries(r.localRecovery.runtimeProvenance.executableArtifacts).reverse());expect(()=>validateInternetAppReport(r)).not.toThrow();});
it.each(['https://SERVICE.example','https://service.example/','https://service.example:443'])('rejects noncanonical identity origin %s',origin=>{const r=localCandidate();r.identity.serviceOrigin=origin;expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});

it('admits exact cleanup with bounded shutdown observation and an acknowledged delayed exit commit',()=>{
  const r=run();Object.assign(r.peers[0].cleanup,{shutdownComplete:true,shutdownElapsedMs:3100,exitCommitDelayMs:2600,exitCommitAcknowledged:true});
  expect(()=>validateInternetRun(r)).not.toThrow();
});
it.each([{shutdownComplete:false},{shutdownElapsedMs:5001},{exitCommitDelayMs:-1},{exitCommitAcknowledged:false}])('rejects invalid shutdown observation %j',fields=>{
  const r=run();Object.assign(r.peers[0].cleanup,fields);expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');
});
