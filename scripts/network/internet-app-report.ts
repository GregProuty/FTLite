import { z } from 'zod';
import { resolveOnlineConfig } from '../../src/main/network/onlineConfig';
import { validateOnlineRecoveryReport } from './online-recovery-report';
export const INTERNET_ARTIFACTS = ['out/main/index.js','out/main/authorityHost.js','out/main/rtcTransport.js','out/preload/index.js','out/preload/networkTransport.js','out/renderer/index.html'];
const sha=z.string().regex(/^[a-f0-9]{64}$/), nat=z.number().int().nonnegative(), pos=nat.positive();
const label=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const identity=z.object({revision:z.string().regex(/^[a-f0-9]{40}$/),digest:sha,packageSha256:sha,artifacts:z.record(sha),versions:z.object({electron:z.literal('37.10.3'),protocol:z.literal(2),sim:z.literal(35),checkpoint:z.literal(2),replay:z.tuple([z.literal(2),z.literal(3),z.literal(4)])}).strict()}).strict();
const runId=z.string().regex(/^[a-f0-9]{32}$/);
const checkpoint=z.object({runId,hostGeneration:pos,checkpointSequence:pos,capturedTick:nat,payloadSha256:sha}).strict();
const publication=z.object({runId,sequence:pos,tick:pos,hash:z.string().regex(/^[a-f0-9]{16}$/),phase:z.enum(['running','paused']),commandHighWater:z.array(nat).length(2),heldHighWater:z.array(nat).length(2)}).strict();
const cleanup=z.object({pid:pos,exited:z.literal(true),exitCode:z.literal(0),utilities:nat,utilityExits:nat,utilityPids:z.array(pos).max(8),windows:z.literal(0),ports:z.literal(0),listeners:z.literal(0),peers:z.literal(0),nativeWindows:pos,nativeWindowExits:pos,nativePeersObserved:pos,nativePeerCloses:nat,nativePeersEndedWithWindow:nat,observedMainPorts:pos}).strict();
const peer=z.object({role:z.enum(['host','guest']),seat:z.union([z.literal(0),z.literal(1)]),runId,hostGeneration:pos,checkpoint,errors:z.literal(0),fullReceipts:pos,firstAckOrder:pos,firstInputOrder:pos,
  inputs:z.array(z.object({player:nat,sequence:pos,order:pos,command:label.optional()}).strict()).min(1).max(512),
  results:z.array(z.object({id:z.object({player:nat,sequence:pos}).strict(),status:z.literal('applied')}).strict()).min(1).max(128),
  publications:z.array(publication).min(1).max(256),routes:z.array(z.object({state:z.literal('connected'),selected:z.literal(true),localType:z.enum(['host','srflx','prflx','relay']),remoteType:z.enum(['host','srflx','prflx','relay']),policy:z.enum(['all','relay']),sent:pos,received:pos}).strict()).min(1).max(3),cleanup}).strict();
const run=z.object({version:z.literal(1),identity,serviceOrigin:z.string().max(200),forceRelay:z.boolean(),mode:z.enum(['local-pair','single-device']),machineLabel:label,networkLabel:label,failure:z.null(),cleanupFailed:z.literal(false),temporaryRemoved:z.literal(true),directoryCleanupAttempted:z.literal(true),elapsedMs:pos,budgetMs:pos.max(600000),processes:z.array(z.object({pid:pos,exited:z.literal(true),exitCode:z.literal(0),kind:z.literal('preparation')}).strict()).min(1).max(8),peers:z.array(peer).min(1).max(2)}).strict();
const evidence=z.array(z.object({path:z.string().regex(/^[A-Za-z0-9_./-]+$/).max(300),sha256:sha}).strict()).max(32);
const fail=():never=>{throw Error('internet-evidence-invalid');};
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
function checkIdentity(v:z.infer<typeof identity>) {if(INTERNET_ARTIFACTS.some(k=>!v.artifacts[k]))fail();}
function checkAgreement(peers:z.infer<typeof peer>[]) {
  if(peers.length!==2 || peers[0]!.seat!==0 || peers[1]!.seat!==1)fail();
  const [a,b]=peers as [z.infer<typeof peer>,z.infer<typeof peer>];
  if(a.runId!==b.runId || a.hostGeneration!==b.hostGeneration || !same(a.checkpoint,b.checkpoint)
    || !a.publications.some(p=>b.publications.some(q=>same(p,q))))fail();
  // Every accepted command must be represented in a common canonical publication.
  const common=a.publications.filter(p=>b.publications.some(q=>same(p,q)));
  if(peers.some(p=>p.results.some(r=>!common.some(s=>s.commandHighWater[r.id.player]!>=r.id.sequence))))fail();
}
function parseRun(value:unknown,localOnly=false) {
  const r=run.parse(value);checkIdentity(r.identity);
  if(!resolveOnlineConfig(localOnly?{packaged:false,localServiceUrl:r.serviceOrigin}:{packaged:false,serviceUrl:r.serviceOrigin}).enabled || localOnly&&r.forceRelay || r.elapsedMs>r.budgetMs || r.peers.length!==(r.mode==='local-pair'?2:1))fail();
  if(new Set([...r.processes.map(p=>p.pid),...r.peers.map(p=>p.cleanup.pid)]).size!==r.processes.length+r.peers.length)fail();
  for(const p of r.peers) {
    if(p.seat!==(p.role==='host'?0:1) || p.checkpoint.runId!==p.runId || p.checkpoint.hostGeneration!==p.hostGeneration
      || p.publications.some(s=>s.runId!==p.runId) || p.firstInputOrder<=p.firstAckOrder
      || Math.min(...p.inputs.map(i=>i.order))<p.firstInputOrder || p.inputs.some(i=>i.player!==p.seat || i.order<=p.firstAckOrder)
      || p.results.some(result=>result.id.player!==p.seat || !p.inputs.some(i=>!!i.command && i.player===result.id.player && i.sequence===result.id.sequence)
        || !p.publications.some(s=>s.commandHighWater[p.seat]!>=result.id.sequence))
      || r.forceRelay && p.routes.some(t=>t.policy!=='relay'||t.localType!=='relay'||t.remoteType!=='relay'))fail();
    const c=p.cleanup;
    if(c.utilities!==c.utilityExits || c.utilityPids.length!==c.utilities || new Set(c.utilityPids).size!==c.utilities
      || c.nativeWindows!==c.nativeWindowExits || c.nativePeersObserved!==c.nativePeerCloses+c.nativePeersEndedWithWindow)fail();
  }
  if(r.mode==='local-pair')checkAgreement(r.peers);
  return r;
}
/** Fixed error only: never includes arbitrary report fields or underlying parser diagnostics. */
export function validateInternetRun(value:unknown):void {try{parseRun(value);}catch{fail();}}
/** Loopback rehearsal can never be admitted by the internet readiness validator. */
export function validateLocalInternetDriverRun(value:unknown):void {try{parseRun(value,true);}catch{fail();}}
export function validateInternetAppReport(value:unknown):void {
  try {
    const scan=(v:unknown,depth=0):void=>{if(depth>80)fail();if(v&&typeof v==='object')for(const [key,item] of Object.entries(v)){if(/^(seatToken|token|credentials?|username|password|sdp|candidates?|address|ip|rawException)$/i.test(key))fail();scan(item,depth+1);}};
    if(JSON.stringify(value).length>2097152)fail();scan(value);
    const base=z.object({version:z.literal(1),identity,internetReady:z.boolean(),localRecovery:z.unknown(),deployedService:z.unknown(),forcedRelayGameplay:z.unknown(),twoMachineGameplay:z.unknown(),actualOsSuspend:z.unknown()}).strict().parse(value);
    checkIdentity(base.identity);
    const gates=['localRecovery','deployedService','forcedRelayGameplay','twoMachineGameplay','actualOsSuspend'] as const;
    const statuses:string[]=[];
    for(const name of gates) {
      const raw=base[name] as any;
      if(raw?.status!=='PASS') {
        const g=z.object({status:z.enum(['FAIL','NOT_RUN']),evidence}).strict().parse(raw);
        if(g.status==='FAIL'&&!g.evidence.length)fail();statuses.push(g.status);continue;
      }
      statuses.push('PASS');
      if(name==='twoMachineGameplay') {
        const g=z.object({status:z.literal('PASS'),evidence:evidence.min(2),reports:z.array(z.unknown()).length(2),attestation:z.object({physicallySeparate:z.literal(true),differentNetworks:z.literal(true),operatorLabels:z.tuple([label,label])}).strict()}).strict().parse(raw);
        const [a,b]=g.reports.map(value=>parseRun(value)) as [ReturnType<typeof parseRun>,ReturnType<typeof parseRun>];
        if(a.mode!=='single-device'||b.mode!=='single-device'||a.machineLabel.toLowerCase()===b.machineLabel.toLowerCase()||a.networkLabel.toLowerCase()===b.networkLabel.toLowerCase()
          || !same(a.identity,base.identity)||!same(b.identity,base.identity)||a.serviceOrigin!==b.serviceOrigin||!a.forceRelay||!b.forceRelay)fail();
        checkAgreement([a.peers[0]!,b.peers[0]!]);
      } else if(name==='actualOsSuspend') {
        // Human attestation is explicit and cannot be replaced by a synthetic powerMonitor event.
        const g=z.object({status:z.literal('PASS'),evidence:evidence.min(1),report:z.unknown(),attestation:z.object({actualOsSleep:z.literal(true),operatorLabel:label}).strict()}).strict().parse(raw);
        if(!same(parseRun(g.report).identity,base.identity))fail();
      } else {
        const g=z.object({status:z.literal('PASS'),evidence:evidence.min(1),report:z.unknown()}).strict().parse(raw);
        if(name==='localRecovery') {validateOnlineRecoveryReport(g.report);if((g.report as any).source.digest!==base.identity.digest)fail();}
        else {const r=parseRun(g.report);if(r.mode!=='local-pair'||!same(r.identity,base.identity)||(name==='forcedRelayGameplay'&&!r.forceRelay))fail();}
      }
    }
    if(base.internetReady!==statuses.slice(0,4).every(s=>s==='PASS'))fail();
  }catch{fail();}
}
