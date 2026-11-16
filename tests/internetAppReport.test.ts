import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateInternetAppReport, validateInternetRun, validateLocalInternetDriverRun, INTERNET_ARTIFACTS } from '../scripts/network/internet-app-report';
const sha = 'a'.repeat(64), runId = 'b'.repeat(32);
const recovery = JSON.parse(readFileSync('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-7-evidence/recovery-skiff.json','utf8'));
const identity = () => ({ revision:'c'.repeat(40), digest:recovery.source.digest, packageSha256:sha, artifacts:Object.fromEntries(INTERNET_ARTIFACTS.map(k=>[k,sha])), versions:{electron:'37.10.3',protocol:2,sim:35,checkpoint:2,replay:[2,3,4]} });
const ref = () => ({path:'evidence/run.json',sha256:sha});
const publication = () => ({runId,sequence:10,tick:320,hash:'f'.repeat(8),phase:'paused',commandHighWater:[2,3],heldHighWater:[4,5]});
const peer = (seat:number) => ({role:seat===0?'host':'guest',seat,runId,hostGeneration:1,checkpoint:{runId,hostGeneration:1,checkpointSequence:3,capturedTick:320,payloadSha256:sha},errors:0,fullReceipts:1,firstAckOrder:1,firstInputOrder:2,
  inputs:[{player:seat,sequence:seat?3:2,order:2,command:'pause'}],results:[{id:{player:seat,sequence:seat?3:2},status:'applied'}],publications:[publication()],
  routes:[{state:'connected',selected:true,localType:'relay',remoteType:'relay',policy:'relay',sent:10,received:10}],
  cleanup:{pid:100+seat,exited:true,exitCode:0,utilities:seat?0:1,utilityExits:seat?0:1,utilityPids:seat?[]:[150],windows:0,ports:0,listeners:0,peers:0,nativeWindows:1,nativeWindowExits:1,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithWindow:0,observedMainPorts:4}});
const run = (role?:number):any => ({version:1,identity:identity(),serviceOrigin:'https://service.example',forceRelay:true,mode:role===undefined?'local-pair':'single-device',machineLabel:role===undefined?'local':`device-${role}`,networkLabel:role===undefined?'local':`network-${role}`,failure:null,cleanupFailed:false,temporaryRemoved:true,directoryCleanupAttempted:true,elapsedMs:1000,budgetMs:90000,processes:[{pid:10,exited:true,exitCode:0,kind:'preparation'}],peers:role===undefined?[peer(0),peer(1)]:[peer(role)]});
const fixture = ():any => ({version:1,identity:identity(),internetReady:true,localRecovery:{status:'PASS',evidence:[ref()],report:structuredClone(recovery)},deployedService:{status:'PASS',evidence:[ref()],report:run()},forcedRelayGameplay:{status:'PASS',evidence:[ref()],report:run()},twoMachineGameplay:{status:'PASS',evidence:[ref(),ref()],reports:[run(0),run(1)],attestation:{physicallySeparate:true,differentNetworks:true,operatorLabels:['operator-a','operator-b']}},actualOsSuspend:{status:'NOT_RUN',evidence:[]}});
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
  ['raw diagnostic',(r:any)=>r.forcedRelayGameplay.report.peers[0].routes[0].address='192.0.2.1'],
])('rejects %s',(_name,mutate)=>{const r=fixture();mutate(r);expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('admits a single device only as an independent local result',()=>expect(()=>validateInternetRun(run(1))).not.toThrow());
it('keeps a loopback rehearsal out of every internet gate',()=>{const r=run();r.serviceOrigin='http://127.0.0.1:12345';r.forceRelay=false;expect(()=>validateLocalInternetDriverRun(r)).not.toThrow();expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');});
it('accepts bounded retained inputs without losing the observed first ACK/input ordering',()=>{const r=run();r.peers[0].firstInputOrder=2;r.peers[0].inputs[0].order=10;expect(()=>validateInternetRun(r)).not.toThrow();});
it('rejects credentials hidden in older recovery evidence',()=>{const r=fixture();r.localRecovery.report.seatToken='private';expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('accepts the production 32-bit canonical publication hash width',()=>{const r=run();for(const p of r.peers)p.publications[0].hash='c7e5cfd9';expect(()=>validateInternetRun(r)).not.toThrow();});
