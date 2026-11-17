import { z } from 'zod';
import { resolveOnlineConfig } from '../../src/main/network/onlineConfig';
import { validateOnlineRecoveryReport } from './online-recovery-report';
import { isCanonicalServiceOrigin } from './internet-app-manifest';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
export const INTERNET_ARTIFACTS = ['out/main/index.js','out/main/authorityHost.js','out/main/hostProcess.js','out/main/transportWindow.js','out/main/rtcTransport.js','out/preload/index.js','out/preload/networkTransport.js','out/renderer/index.html','out/renderer/networkTransport.html'];
/** All executable output, including dynamically named renderer/main chunks. */
export function executableRuntimeArtifacts(artifacts:Record<string,string>):Record<string,string> {
  return Object.fromEntries(Object.entries(artifacts).filter(([path])=>/^out\/.*\.(?:[cm]?js|html|wasm|node)$/.test(path)).sort(([a],[b])=>a.localeCompare(b)));
}
const sha=z.string().regex(/^[a-f0-9]{64}$/), nat=z.number().int().nonnegative(), pos=nat.positive();
const label=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const identity=z.object({serviceOrigin:z.string().max(200).refine(isCanonicalServiceOrigin),revision:z.string().regex(/^[a-f0-9]{40}$/),digest:sha,packageSha256:sha,workerBundleSha256:sha,workerConfigSha256:sha,artifacts:z.record(sha),versions:z.object({electron:z.literal('37.10.3'),wrangler:z.literal('4.156.0'),workerd:z.literal('1.20261023.1'),protocol:z.literal(2),sim:z.literal(SIM_VERSION),checkpoint:z.literal(2),replay:z.tuple([z.literal(2),z.literal(3),z.literal(4)])}).strict()}).strict();
const runId=z.string().regex(/^[a-f0-9]{32}$/);
const checkpoint=z.object({runId,hostGeneration:pos,checkpointSequence:pos,capturedTick:nat,payloadSha256:sha}).strict();
const publication=z.object({runId,sequence:pos,tick:nat,hash:z.string().regex(/^[a-f0-9]{8}$/),phase:z.enum(['running','paused']),commandHighWater:z.array(nat).length(2),heldHighWater:z.array(nat).length(2)}).strict();
const cleanup=z.object({pid:pos,exited:z.literal(true),exitCode:z.literal(0),utilities:nat,utilityExits:nat,utilityPids:z.array(pos).max(8),windows:z.literal(0),ports:z.literal(0),listeners:z.literal(0),peers:z.literal(0),nativeWindows:pos,nativeWindowExits:pos,nativePeersObserved:pos,nativePeerCloses:nat,nativePeersEndedWithWindow:nat,observedMainPorts:pos,shutdownComplete:z.literal(true).optional(),shutdownElapsedMs:z.number().finite().nonnegative().max(5000).optional(),exitCommitDelayMs:z.number().finite().nonnegative().max(5000).optional(),exitCommitAcknowledged:z.literal(true).optional()}).strict();
const peer=z.object({role:z.enum(['host','guest']),seat:z.union([z.literal(0),z.literal(1)]),runId,hostGeneration:pos,checkpoint,errors:z.literal(0),fullReceipts:pos,firstAckOrder:pos,firstInputOrder:pos,
  inputs:z.array(z.object({player:nat,sequence:pos,order:pos,command:label.optional()}).strict()).min(1).max(512),
  results:z.array(z.object({id:z.object({player:nat,sequence:pos}).strict(),status:z.literal('applied')}).strict()).min(1).max(128),
  publications:z.array(publication).min(1).max(256),routes:z.array(z.object({state:z.literal('connected'),selected:z.literal(true),localType:z.enum(['host','srflx','prflx','relay']),remoteType:z.enum(['host','srflx','prflx','relay']),policy:z.enum(['all','relay']),sent:pos,received:pos}).strict()).min(1).max(3),cleanup}).strict();
// The duel run (H-2b): the forced round end and round 2's thrust, beam and hash agreement, each machine's round-1
// playtest record (route label and RTT only) and both apps' exact cleanup.
const duelRecord=z.object({role:z.enum(['host','guest']),round:z.literal(0),transport:z.enum(['loopback','lan','internet']).nullable(),rttMs:z.number().finite().nonnegative().nullable(),held:nat,command:nat}).strict();
const duel=z.object({seed:nat,decidedTick:pos,thrust:z.object({before:z.number().finite(),host:z.number().finite(),guest:z.number().finite()}).strict(),
  beam:z.object({before:nat,host:pos,guest:pos}).strict(),agreement:z.object({tick:pos,sequence:pos,hash:z.string().regex(/^[a-f0-9]{8}$/)}).strict(),
  records:z.tuple([duelRecord,duelRecord]),cleanup:z.tuple([cleanup,cleanup])}).strict();
// One machine of a two-machine duel: its own screen's thrust peak and beam, its round-1 record and its app's cleanup.
const deviceDuel=z.object({seed:nat,decidedTick:pos,thrust:z.object({before:z.number().finite(),peak:z.number().finite()}).strict(),beam:z.object({before:nat,after:pos}).strict(),record:duelRecord,cleanup}).strict();
const run=z.object({version:z.literal(1),identity,serviceOrigin:z.string().max(200),forceRelay:z.boolean(),mode:z.enum(['local-pair','single-device']),machineLabel:label,networkLabel:label,failure:z.null(),cleanupFailed:z.literal(false),temporaryRemoved:z.literal(true),directoryCleanupAttempted:z.literal(true),elapsedMs:pos,budgetMs:pos.max(600000),processes:z.array(z.object({pid:pos,exited:z.literal(true),exitCode:z.literal(0),kind:z.literal('preparation')}).strict()).min(1).max(8),peers:z.array(peer).min(1).max(2),duel:duel.optional(),deviceDuel:deviceDuel.optional()}).strict();
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
  const common=a.publications.filter(p=>p.tick>0&&b.publications.some(q=>same(p,q)));
  if(peers.some(p=>p.results.some(r=>!common.some(s=>s.commandHighWater[r.id.player]!>=r.id.sequence))))fail();
}
function checkCleanup(c:z.infer<typeof cleanup>) {
  if(c.utilities!==c.utilityExits || c.utilityPids.length!==c.utilities || new Set(c.utilityPids).size!==c.utilities
    || c.nativeWindows!==c.nativeWindowExits || c.nativePeersObserved!==c.nativePeerCloses+c.nativePeersEndedWithWindow)fail();
}
/** A duel record carries latency samples; the host's reads loopback; the guest's carries an RTT and its route ('internet' under forced relay). */
function checkRecord(x:z.infer<typeof duelRecord>,forceRelay:boolean) {
  if(x.held+x.command<=0 || (x.role==='host'?x.transport!=='loopback':x.rttMs===null||(forceRelay?x.transport!=='internet':x.transport!=='lan'&&x.transport!=='internet')))fail();
}
/** A local pair also runs the duel (H-2b), seen on both screens. */
function checkDuel(r:z.infer<typeof run>) {
  const d=r.duel;if(!d||r.deviceDuel)fail();
  const [h,g]=d!.records;
  if(h.role!=='host'||g.role!=='guest'
    || d!.thrust.host<=d!.thrust.before+1 || d!.thrust.guest<=d!.thrust.before+1 || d!.beam.host<=d!.beam.before || d!.beam.guest<=d!.beam.before)fail();
  checkRecord(h,r.forceRelay);checkRecord(g,r.forceRelay);
  for(const c of d!.cleanup)checkCleanup(c);
}
/** A single device runs its half of a two-machine duel: its own seat's record, and thrust and a beam on its own screen. */
function checkDeviceDuel(r:z.infer<typeof run>) {
  const d=r.deviceDuel;if(!d||r.duel)fail();
  if(d!.record.role!==r.peers[0]!.role || d!.thrust.peak<=d!.thrust.before+1 || d!.beam.after<=d!.beam.before)fail();
  checkRecord(d!.record,r.forceRelay);checkCleanup(d!.cleanup);
}
function parseRun(value:unknown,localOnly=false) {
  const r=run.parse(value);checkIdentity(r.identity);if(!localOnly&&r.serviceOrigin!==r.identity.serviceOrigin)fail();
  if(!resolveOnlineConfig(localOnly?{packaged:false,localServiceUrl:r.serviceOrigin}:{packaged:false,serviceUrl:r.serviceOrigin}).enabled || localOnly&&r.forceRelay || r.elapsedMs>r.budgetMs || r.peers.length!==(r.mode==='local-pair'?2:1))fail();
  const duelPids=[...(r.duel?.cleanup.map(c=>c.pid)??[]),...(r.deviceDuel?[r.deviceDuel.cleanup.pid]:[])];
  if(new Set([...r.processes.map(p=>p.pid),...r.peers.map(p=>p.cleanup.pid),...duelPids]).size!==r.processes.length+r.peers.length+duelPids.length)fail();
  for(const p of r.peers) {
    if(p.seat!==(p.role==='host'?0:1) || p.checkpoint.runId!==p.runId || p.checkpoint.hostGeneration!==p.hostGeneration
      || p.publications.some(s=>s.runId!==p.runId) || !p.publications.some(s=>s.tick>0) || p.firstInputOrder<=p.firstAckOrder
      || Math.min(...p.inputs.map(i=>i.order))<p.firstInputOrder || p.inputs.some(i=>i.player!==p.seat || i.order<=p.firstAckOrder)
      || p.results.some(result=>result.id.player!==p.seat || !p.inputs.some(i=>!!i.command && i.player===result.id.player && i.sequence===result.id.sequence)
        || !p.publications.some(s=>s.commandHighWater[p.seat]!>=result.id.sequence))
      || r.forceRelay && p.routes.some(t=>t.policy!=='relay'||t.localType!=='relay'||t.remoteType!=='relay'))fail();
    checkCleanup(p.cleanup);
  }
  if(r.mode==='local-pair'){checkAgreement(r.peers);checkDuel(r);}
  else checkDeviceDuel(r);
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
          || !same(a.identity,base.identity)||!same(b.identity,base.identity)||a.serviceOrigin!==b.serviceOrigin||!a.forceRelay||!b.forceRelay
          || a.deviceDuel?.seed!==b.deviceDuel?.seed)fail();
        checkAgreement([a.peers[0]!,b.peers[0]!]);
      } else if(name==='actualOsSuspend') {
        // Human attestation is explicit and cannot be replaced by a synthetic powerMonitor event.
        const g=z.object({status:z.literal('PASS'),evidence:evidence.min(1),report:z.unknown(),attestation:z.object({actualOsSleep:z.literal(true),operatorLabel:label}).strict()}).strict().parse(raw);
        if(!same(parseRun(g.report).identity,base.identity))fail();
      } else {
        const deployment=z.object({workerName:z.literal('ftlite-signalling-dev'),serviceOrigin:z.string(),versionId:label,bundleSha256:sha,configSha256:sha,operatorConfirmedArtifact:z.literal(true)}).strict();
        const shape={status:z.literal('PASS'),evidence:evidence.min(1),report:z.unknown()};
        const runtimeProvenance=z.object({reportRevision:identity.shape.revision,candidateRevision:identity.shape.revision,executableArtifacts:z.record(sha)}).strict();
        const g=(name==='deployedService'?z.object({...shape,deployment}).strict():name==='localRecovery'?z.object({...shape,runtimeProvenance:runtimeProvenance.optional()}).strict():z.object(shape).strict()).parse(raw);
        if(name==='deployedService'){const d=(g as any).deployment;if(d.bundleSha256!==base.identity.workerBundleSha256||d.configSha256!==base.identity.workerConfigSha256||d.serviceOrigin!==base.identity.serviceOrigin||d.serviceOrigin!==(g.report as any).serviceOrigin)fail();}
        if(name==='localRecovery') {
          validateOnlineRecoveryReport(g.report);const source=(g.report as any).source;
          const expected=executableRuntimeArtifacts(base.identity.artifacts),observed=executableRuntimeArtifacts(source.artifactHashes);
          if(source.digest!==base.identity.digest||!same(expected,observed))fail();
          const provenance=(g as any).runtimeProvenance;
          if(source.revision!==base.identity.revision&&!provenance)fail();
          if(provenance&&(provenance.reportRevision!==source.revision||provenance.candidateRevision!==base.identity.revision
            ||!same(Object.fromEntries(Object.entries(provenance.executableArtifacts).sort(([a],[b])=>a.localeCompare(b))),expected)))fail();
        }
        else {const r=parseRun(g.report);if(r.mode!=='local-pair'||!same(r.identity,base.identity)||(name==='forcedRelayGameplay'&&!r.forceRelay))fail();}
      }
    }
    if(base.internetReady!==statuses.slice(0,4).every(s=>s==='PASS'))fail();
  }catch{fail();}
}
