import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { startOnlineAppRuntime } from './online-app-runtime';
import { ONLINE_RECOVERY_ARTIFACTS, validateOnlineRecoveryReport, validateRecoveryMemory } from './online-recovery-report';
import { onlineAppFailureCode, onlineAppStderrDiagnostic, onlineAppWaitDiagnostic } from './online-app-diagnostics';
import { createLauncherDeadline, stopOwnedProcess, removeOwnedDirectory } from './lease-smoke-lifecycle';

const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
let assertionFailure: string | undefined;
const assert = (value: unknown, message: string) => { if (!value) { assertionFailure=message; throw Error(message); } };
type Application = { child: ChildProcess; pid: number; profile: string; exited: boolean; exit: Promise<void>; request(command: string, data?: object): Promise<any>; cleanup?: any; exitCode?: number|null; beforeExit?: any; forcedUtilityExits?: any[]; termination?: 'shutdown'|'restart'|'fault' };
async function main() {
  const scenario = process.argv.find(a => a.startsWith('--scenario='))?.slice(11) ?? 'skiff';
  let proof: any;
  let failureCategory: string | undefined, stage = 'startup', utilityFailure: unknown, instrumentation: any[]=[], driverFailure: unknown;
  const began = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-online-recovery-'));
  const ownedDeadline=createLauncherDeadline(began+90000);
  const reportPath = resolve(process.argv.find(a => a.startsWith('--report-path='))?.slice(14) ?? '.superpowers/sdd/2026-11-15-net-3e-recovery-internet/recovery.json');
  const artifactDirectory = resolve(reportPath, '..'); mkdirSync(artifactDirectory, { recursive: true });
  const processes: Application[] = [], viewports: any[] = [];
  let runtime: ReturnType<typeof startOnlineAppRuntime> | undefined, failure: string | undefined, timedOut = false, electronVersion:string|undefined;
  const deadline = new AbortController();
  const timeout = () => { timedOut = true; deadline.abort(); };
  const watchdog = setTimeout(timeout, 80000); // reserve cleanup inside the same 90-second pass
  let injectedDeadline: ReturnType<typeof setTimeout> | undefined;
  let waitFailure: ReturnType<typeof onlineAppWaitDiagnostic> | undefined;
  const source = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim(), digest: computeContentDigest(process.cwd()),
    artifactHashes:Object.fromEntries([...new Set([...ONLINE_RECOVERY_ARTIFACTS,...readdirSync('out',{recursive:true}).filter(p=>/\.(js|html)$/.test(String(p))).map(p=>'out/'+String(p).replaceAll('\\','/'))])]
      .map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])) };
  async function until(read: () => Promise<any>, predicate: (value: any) => boolean, label: string, ms = 10000) {
    const deadline = performance.now() + ms; let last;
    while (performance.now() < deadline) { if (timedOut) throw Error('launcher timeout'); last = await read(); if (predicate(last)) return last; await delay(40); }
    if(last?.utilityEpoch) { utilityFailure=last; console.error('UTILITY_WAIT',last); }
    waitFailure = onlineAppWaitDiagnostic(label, last?.status?.phase); console.error(waitFailure); throw Error(label + ' timeout');
  }
  async function launch(profile: string) {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, NODE_PATH:resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    const child = spawn(electron, [resolve('scripts/network/online-app-smoke.cjs'), '--recovery-observe-utility', `--online-app-dir=${directory}`, `--online-app-role=${profile}`,
      `--user-data-dir=${join(directory, profile)}`], { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>(); let id = 0;
    const record: Application = { child, pid: child.pid!, profile, exited: false, exit: Promise.resolve(), request(command, data = {}) {
      if (record.exited || !child.connected) return Promise.reject(Error('application IPC disconnected'));
      return new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { pending.delete(key); driverFailure={profile,command,code:'DRIVER_TIMEOUT'}; reject(Error(command + ' driver timeout')); }, 5000);
        pending.set(key, { resolve, reject, timer });
        const failed=()=>{const item=pending.get(key);if(item){pending.delete(key);clearTimeout(item.timer);item.reject(Error('application IPC disconnected'));}};
        try { child.send({ ...data, requestId: key, command },error=>{if(error)failed();}); } catch { failed(); }
      });
    } };
    child.on('message', (message: any) => { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer);
      if(message.error) { driverFailure={profile,command:message.command,code:'DRIVER_COMMAND_FAILED'}; item.reject(Error('app-driver-command-failed')); } else item.resolve(message.result); });
    child.on('error',()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('application process error'));}pending.clear();});
    // Native Electron diagnostics can also contain raw page/exception payloads.
    // Consume every chunk, but report only one fixed category and validated role.
    let stderrReported=false;
    child.stderr!.on('data', () => { if(!stderrReported){stderrReported=true;console.error(onlineAppStderrDiagnostic(profile));} });
    record.exit = new Promise(done => child.once('exit', code => { record.exited = true; record.exitCode=code; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('application exited')); } pending.clear(); done(); }));
    processes.push(record);
    const initial=await until(async () => { try { return await record.request('status'); } catch (error) { if (record.exited) throw error; return null; } }, value => !!value?.status && value.text.includes('Couch play'), profile + ' app ready');
    assert(initial.electron==='37.10.3','wrong actual Electron runtime');electronVersion=initial.electron;
    return record;
  }
  const status = (app: Application) => app.request('status');
  const phase = (app: Application, value: string) => until(() => status(app), r => r.status.phase === value, `${app.profile} ${value}`);
  async function host(app: Application, capacity: number) { await app.request('click', { id: 'host' }); if (capacity !== 2) await app.request('capacity', { value: capacity }); await app.request('click', { id: 'create-room' }); return phase(app, 'lobby'); }
  async function joinRoom(app: Application, code: string) { await app.request('click', { id: 'join' }); await app.request('type', { id: 'join-code', text: code }); await app.request('click', { id: 'join-room' }); return phase(app, 'lobby'); }
  async function kill(app: Application) {
    if (!app.exited) {
      app.termination??='restart';
      try { app.beforeExit=await app.request('resources'); } catch {}
      await stopOwnedProcess(app.child,createLauncherDeadline(Math.min(began+90000,performance.now()+6000)));
    }
    await Promise.race([app.exit, delay(5000).then(() => { if (!app.exited) throw Error('owned Electron exit not observed'); })]);
    if(app.beforeExit) {
      app.forcedUtilityExits=app.beforeExit.utilities.map((u:any)=>{let alive=false;try{process.kill(u.pid,0);alive=true;}catch{} return {pid:u.pid,exited:!alive};});
      assert(app.forcedUtilityExits!.every(u=>u.exited),'owned forced utility exit not observed');
    }
  }
  async function shutdown(app: Application) {
    app.termination='shutdown';
    app.cleanup = await app.request('shutdown'); await Promise.race([app.exit,delay(1000)]); await kill(app);
    assert(app.exitCode===0,'graceful application exit was nonzero');
  }
  async function viewportProof(app: Application, name: string) {
    for (const small of [false, true]) {
      await app.request('resize', { width: small ? 640 : 1280, height: small ? 480 : 720 });
      const layout = await until(() => app.request('layout'), r => r.canvas.top >= r.menu.bottom && r.canvas.bottom <= r.height + 1 && r.canvas.width === r.width, 'reserved game viewport');
      viewports.push({ name, small, ...layout });
      await app.request('screenshot', { path: join(artifactDirectory, `${name}${small ? '-small' : ''}.png`) });
    }
    await app.request('resize', { width: 1280, height: 720 });
  }
  const observation = (r: any) => r.observations.at(-1);
  async function matched(h: Application, g: Application) {
    return until(async () => { const [a,b] = await Promise.all([status(h),status(g)]); const host = observation(a), guest = observation(b);
      const same = guest?.publications.findLast((p: any) => host?.publications.some((q: any) => p.runId === q.runId && p.sequence === q.sequence && p.hash === q.hash && p.tick === q.tick));
      return { host, guest, same }; }, r => !!r.same, 'host/guest canonical agreement');
  }
  async function key(g: Application, key: string, duration = 100) { await g.request('key',{key,down:true}); await delay(duration); await g.request('key',{key,down:false}); }
  try {
    const hang = process.argv.includes('--inject-startup-timeout') ? 'startup' : process.argv.includes('--inject-build-timeout') ? 'observer-build' : undefined;
    runtime = startOnlineAppRuntime(directory, source.digest, deadline.signal, hang, stage => { if (hang === stage) injectedDeadline = setTimeout(timeout,250); });
    await runtime.ready;
    let h = await launch('host'), g = await launch('guest');
    const capacity = ['cutter','race'].includes(scenario) ? 4 : 2;
    let seat = capacity === 4 ? 2 : 1, contender: Application | undefined;
    const lobby = await host(h,capacity);
    if(capacity === 4) {
      const filler = await launch('filler'); await joinRoom(filler,lobby.status.snapshot.joinCode); await joinRoom(g,lobby.status.snapshot.joinCode);
      if(scenario==='race') contender=filler;
      else { await h.request('click',{id:'remove-seat-1'}); await shutdown(filler); }
    } else await joinRoom(g,lobby.status.snapshot.joinCode);
    await h.request('click',{id:'ready'}); await g.request('click',{id:'ready'});
    if(contender) await contender.request('click',{id:'ready'});
    await until(()=>status(h),r=>r.status.actions.includes('start'),'native/service ready');
    await h.request('click',{id:'start'}); await phase(h,'running'); await phase(g,'running');
    const runId = (await status(h)).status.snapshot.runId;
    // Keep actual human commands and held input in flight across the periodic boundary.
    const commands = (async () => { for(let i=0;i<7;i++) { await key(g,'F',40); await key(g,'D',50); await delay(550); } })();
    const mirrored = await until(async()=>({h:await status(h),g:await status(g)}),r=>r.h.mirrorProof.receipts.some((m:any)=>m.capturedTick===300)
      && r.g.recovery.gets.some((m:any)=>m.tick===300),'periodic receipt',12000);
    await commands;
    assert(mirrored.h.mirrorProof.utilities[0].bootstrapAfterCommit,'initial commit barrier');
    const before = await status(h), beforeUtility = before.mirrorProof.utilities.at(-1);
    let committed = before.status.mirror.committed, pendingProof: any;
    if(scenario === 'paused') {
      await g.request('click',{id:'pause'}); await phase(h,'paused');
      const saved = await until(()=>status(h),r=>r.status.mirror.committed.capturedTick>committed.capturedTick && !r.status.mirror.localPending,'paused committed');
      committed = saved.status.mirror.committed;
    }
    if(scenario === 'upload') {
      await h.request('hold-upload'); await g.request('click',{id:'pause'}); await phase(h,'paused');
      const pending = await until(()=>status(h),r=>r.recovery.heldUploads>0 && r.status.mirror.localPending,'upload held');
      assert(pending.recovery.pending.tick>committed.capturedTick,'missing newer pending data');
      pendingProof=pending.recovery.pending;
    }
    if(process.argv.includes('--inject-timeout')) { const timer=setTimeout(timeout,250); try { await until(()=>status(g),()=>false,'deliberate timeout'); } finally { clearTimeout(timer); } }
    if(process.argv.includes('--inject-guest-failure')) { g.termination='fault'; await kill(g); throw Error('injected guest process death'); }
    if(process.argv.includes('--inject-transport-failure')) { await g.request('transport-death'); throw Error('injected transport death'); }
    if(process.argv.includes('--inject-worker-death')) { process.kill(runtime.pid!); throw Error('injected worker death'); }
    let staleEvidence: any, contenders: any[] | undefined;
    if(scenario==='stale') {
      stage='stale-arm';
      await h.request('block-next-grant');
      const blockPath=join(directory,'host-block.json'), utilityPath=join(directory,'host-utility-0.json');
      const block=await until(async()=>existsSync(blockPath)?JSON.parse(readFileSync(blockPath,'utf8')):null,r=>!!r,'main actually blocked',7000);
      stage='stale-fence';
      const fenced=await until(async()=>JSON.parse(readFileSync(utilityPath,'utf8')),r=>r.phase==='paused' && r.observedMs>r.deadlineMs+200,'independent utility fence',14000);
      utilityFailure=fenced;
      assert(fenced.permissions.tick.lastAllowedMs<fenced.deadlineMs && Object.values(fenced.permissions).every((v:any)=>v.postDeadlineAllowed===0) && fenced.errors===0,'post-deadline old authority admission');
      stage='stale-resume';
      // The real renderer still sends a Resume while main is blocked; the native RTC/utility route remains alive.
      await phase(g,'paused'); await g.request('click',{id:'pause'}); await delay(400);
      const rejected=JSON.parse(readFileSync(utilityPath,'utf8'));
      assert(rejected.afterDeadlineInputs>0 && rejected.unavailableResults>0 && rejected.tick===fenced.tick,'closed utility admitted Resume');
      process.kill(block.utilityPid,0);
      staleEvidence={block,utilityPath,before:fenced,rejected};
    } else await kill(h);
    const saved = await until(()=>status(g),r=>r.status.phase==='saved' && r.status.actions.includes('rehost'),'saved claim allowed',20000);
    if(staleEvidence) { process.kill(staleEvidence.block.utilityPid,0); assert(saved.status.snapshot.phase==='lost','service did not expire old host'); }
    committed = saved.status.mirror.committed;
    await viewportProof(g,`${scenario}-saved`);
    if(contender) {
      await until(()=>status(contender!),r=>r.status.phase==='saved'&&r.status.actions.includes('rehost'),'second contender allowed',5000);
      await Promise.all([g.request('click',{id:'rehost'}),contender.request('click',{id:'rehost'})]);
      const race=await until(async()=>({a:await status(g),b:await status(contender!)}),r=>[r.a,r.b].filter(s=>s.status.role==='host'&&s.status.phase==='paused').length===1,'single claim winner');
      if(race.b.status.role==='host') { const old=g; g=contender; contender=old; seat=1; }
      const loser=await phase(contender,'paused');
      assert(loser.mirrorProof.utilities.length===0,'loser allocated authority');
      contenders=[{seat,outcome:'winner',utilitiesCreated:1},{seat:loser.status.ownSeat,outcome:'loser',utilitiesCreated:0}];
    } else {
      await g.request('hold-restore'); await g.request('click',{id:'rehost'}); await phase(g,'rehosting');
      await viewportProof(g,`${scenario}-rehosting`); await g.request('release-restore');
    }
    const restored = await phase(g,'paused'), restore = restored.recovery.restores.at(-1);
    assert(restore && restore.payloadSha256===committed.payloadSha256 && restore.runId===runId,'restore did not use committed service bytes');
    assert(restored.recovery.gets.some((m:any)=>m.payloadSha256===restore.payloadSha256),'missing authenticated checkpoint GET');
    assert(restored.status.snapshot.hostGeneration>committed.hostGeneration && restored.status.snapshot.hostSeatId===seat,'wrong claim ownership');
    assert(restored.status.mirror.committed.hostGeneration===restored.status.snapshot.hostGeneration && restored.status.mirror.committed.capturedTick===restore.tick,'paused baseline not committed');
    const baseline=restored.recovery.puts.find((p:any)=>p.phase==='paused' && p.tick===restore.tick);
    proof={committed,restored:restore,pausedBaseline:baseline,observedPuts:restored.recovery.puts,observedCaptures:restored.recovery.captures};
    assert(baseline && baseline.snapshotHash===restore.snapshotHash,'restored canonical snapshot changed');
    const memoryReconciliation=validateRecoveryMemory(restore,baseline);
    assert(JSON.stringify(baseline.commandHighWater)===JSON.stringify(restore.commandHighWater) && JSON.stringify(baseline.heldHighWater)===JSON.stringify(restore.heldHighWater),'restored watermarks changed');
    const frozen = observation(restored).publications.at(-1); await delay(350);
    assert(observation(await status(g)).publications.at(-1).tick===frozen.tick,'auto resume');
    await viewportProof(g,`${scenario}-paused`);
    let oldHostFence: any;
    if(staleEvidence) {
      const late=await until(async()=>{ try { return JSON.parse(readFileSync(staleEvidence.utilityPath+'.late.json','utf8')); } catch { return null; } },r=>r?.lateReplyRejected>0,'delayed real grant rejected',14000);
      const old=await until(()=>status(h),r=>!!r.recovery.mainBlockedMs,'main unblocked',5000);
      assert(late.tick===staleEvidence.before.tick && late.commandHighWater.every((n:number,i:number)=>n===staleEvidence.before.commandHighWater[i]),'old epoch advanced after deadline');
      oldHostFence={utilityAlive:true,mainBlockedMs:old.recovery.mainBlockedMs,lastAdvanceBeforeDeadline:late.permissions.tick.lastAllowedMs<late.deadlineMs && Object.values(late.permissions).every((v:any)=>v.postDeadlineAllowed===0),closedAdmission:true,
        noOldCommit:old.recovery.puts.at(-1).payloadSha256===staleEvidence.block.lastPut.payloadSha256,lateReplyRejected:true,serverExpired:true,evidence:late};
      assert(oldHostFence.noOldCommit,'old generation committed after main stall');
      contenders=[{seat:0,outcome:'loser',utilitiesCreated:0},{seat,outcome:'winner',utilitiesCreated:1}];
      await until(()=>status(h),r=>r.status.phase==='saved'||r.status.phase==='paused','old host transition',10000);
      if((await status(h)).status.phase==='saved') await h.request('click',{id:'reconnect'});
    } else { h=await launch('host'); await h.request('click',{id:'reconnect'}); }
    const rejoined=await phase(h,'paused');
    assert(rejoined.status.ownSeat===0 && rejoined.status.role==='guest','old host did not rejoin logical seat');
    const synced = await matched(g,h);
    assert(synced.host.firstAckOrder>0 && synced.guest.firstAckOrder>0,'missing full ACK');
    await g.request('click',{id:'pause'}); await phase(g,'running'); await phase(h,'running');
    await key(h,'F'); await key(g,'D',150); const agreement = await matched(g,h);
    const inputs=[agreement.host,agreement.guest];
    assert(inputs.every(r=>r.firstAckOrder>0 && (!r.firstInputOrder || r.firstInputOrder>r.firstAckOrder)),'input before ACK');
    assert(agreement.host.inputs.every((i:any)=>i.player===seat) && agreement.guest.inputs.every((i:any)=>i.player===0),'stale input ownership');
    proof={runId,capacity,seat,layout:agreement.same.layout,hostGenerationBefore:committed.hostGeneration,hostGenerationAfter:restored.status.snapshot.hostGeneration,
      utilityEpochBefore:beforeUtility.utilityEpoch,utilityEpochAfter:restored.mirrorProof.utilities.at(-1).utilityEpoch,committed,restored:restore,
      serviceBytesRestored:true,fullAck:true,ackBeforeInput:true,ownership:true,pausedBaselineCommitted:true,explicitResume:true,autoResume:false,
      agreement:agreement.same,initialCommittedTick:0,periodicCapturedTick:300,oldHostRejoinedSeat:rejoined.status.ownSeat,
      seatGenerationBefore:before.status.snapshot.seats[0].seatGeneration,seatGenerationAfter:rejoined.status.snapshot.seats[0].seatGeneration,
      observations:{restored:observation(restored),afterResume:inputs},mirrorReceipts:restored.mirrorProof.receipts,pausedBaseline:baseline,memoryReconciliation};
    if(contenders) proof.contenders=contenders;
    if(oldHostFence) proof.oldHostFence=oldHostFence;
    if(scenario==='upload') {
      assert(restore.tick<pendingProof.tick && restore.payloadSha256!==pendingProof.payloadSha256,'pending upload substituted for committed rollback');
      proof.pendingRollback={pending:pendingProof,restoredTick:restore.tick};
    }
    await g.request('click',{id:'pause'}); await phase(g,'paused');
    assert(!(await status(g)).text.includes('Restored at tick'),'restoration-only message survived Resume');
    if(scenario==='stale') {
      stage='suspend-hook';
      await g.request('suspend-hook'); const suspended=await phase(g,'saved');
      assert(suspended.recovery.invalidations.includes('suspended'),'trusted suspend did not invalidate utility'); proof.suspendHook=true;
    }
    if(contender) { await contender.request('click',{id:'leave'}); await phase(contender,'idle'); }
    stage='leave-old-host'; await h.request('click',{id:'leave'}); await phase(h,'idle');
    stage='leave-winner'; await g.request('click',{id:'leave'}); await phase(g,'idle');
    stage='idle-resources';
    for(const app of [h,g]) await until(()=>app.request('resource-counts'),r=>r.windows===1 && r.utilities.every((u:any)=>u.exited) && r.listeners===0 && r.ports===0,'idle resource release',5000);
  } catch(error) { failure=onlineAppFailureCode(error); failureCategory=error instanceof SyntaxError?'invalid-observation-json':(error as any)?.code==='ENOENT'?'missing-observation-file':'gate-failure'; console.error('RECOVERY_FAILED',{stage,category:failureCategory,assertion:assertionFailure}); }
  finally {
    clearTimeout(watchdog); clearTimeout(injectedDeadline);
    for(const app of processes) if(!app.exited) {
      app.termination='shutdown';
      try { app.cleanup=await app.request('shutdown'); await Promise.race([app.exit,delay(1000)]); } catch { console.error('APP_SHUTDOWN_OBSERVATION_FAILED'); }
      try { await kill(app); } catch { failure??='owned Electron cleanup failed'; }
    }
    try { await runtime?.dispose(); } catch { failure??='workerd cleanup failed'; }
    instrumentation=readdirSync(directory).filter(p=>p.endsWith('.instrumentation.json')).map(p=>({file:p,...JSON.parse(readFileSync(join(directory,p),'utf8'))}));
    const target=resolve(directory),prefix=resolve(tmpdir())+sep;
    if(!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-online-recovery-')) throw Error('invalid exact cleanup target');
    try { await removeOwnedDirectory(target,ownedDeadline); } catch { failure??='exact temporary cleanup failed'; }
  }
  const cleanups=processes.flatMap(p=>p.cleanup?[p.cleanup]:[]);
  const report={version:1,scenario,source,runtime:{electron:electronVersion,workerd:runtime?.workerdVersion,workerPid:runtime?.pid,workerExit:runtime?.exited(),temporaryRemoved:!existsSync(directory)},
    processes:processes.map(({pid,profile,exited,exitCode,beforeExit,cleanup,termination,forcedUtilityExits})=>({pid,profile,exited,exitCode,termination,resourcesBeforeForcedExit:beforeExit,forcedUtilityExits,cleanup})),
    cleanup:Object.fromEntries(['utilities','utilityExits','windows','ports','listeners','peers','nativeWindows','nativeWindowExits','nativePeersObserved','nativePeerCloses','nativePeersEndedWithWindow','observedMainPorts'].map(k=>[k,cleanups.reduce((n,r)=>n+r[k],0)])),
    runtimeHelper:runtime?.observation(),instrumentation,viewports,proof,elapsedMs:Math.ceil(performance.now()-began),failure,assertionFailure,failureCategory,stage,utilityFailure,driverFailure:failure?driverFailure:undefined,waitFailure,limits:['loopback-only','no-TURN','no-WAN','no-two-machine','OS-suspend-NOT-RUN']};
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  if(failure) throw Error(failure);
  validateOnlineRecoveryReport(report); console.log('ACTUAL APPLICATION RECOVERY PASS',scenario);
}
main().catch(error=>{console.error(onlineAppFailureCode(error));process.exitCode=1;});
