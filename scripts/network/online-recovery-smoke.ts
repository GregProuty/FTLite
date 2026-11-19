import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { startOnlineAppRuntime, waitForAppRequest } from './online-app-runtime';
import { ONLINE_RECOVERY_ARTIFACTS, validateOnlineRecoveryReport, validateRecoveryMemory } from './online-recovery-report';
import { onlineAppFailureCode, onlineAppStderrDiagnostic, onlineAppWaitDiagnostic } from './online-app-diagnostics';
import { createLauncherDeadline, stopOwnedProcess, removeOwnedDirectory } from './lease-smoke-lifecycle';

const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
let assertionFailure: string | undefined;
const assert = (value: unknown, message: string) => { if (!value) { assertionFailure=message; throw Error(message); } };
type Application = { child: ChildProcess; pid: number; profile: string; exited: boolean; exit: Promise<void>; request(command: string, data?: object): Promise<any>; cleanup?: any; exitCode?: number|null; beforeExit?: any; forcedRendererExits?: any[]; termination?: 'shutdown'|'restart'|'fault' };
async function main() {
  const scenario = process.argv.find(a => a.startsWith('--scenario='))?.slice(11) ?? 'hound-2';
  let proof: any;
  let failureCategory: string | undefined, stage = 'preparation', utilityFailure: unknown, instrumentation: any[]=[], driverFailure: unknown, firstDriverFailure: unknown;
  const began = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-online-recovery-'));
  const unresponsiveProbe=process.argv.includes('--inject-unresponsive-cleanup');
  const preparationProbe=process.argv.some(a=>['--inject-git-timeout','--inject-git-failure','--inject-preparation-read-failure'].includes(a));
  const budgetMs=unresponsiveProbe||preparationProbe?20000:90000;
  const ownedDeadline=createLauncherDeadline(began+budgetMs);
  const reportPath = resolve(process.argv.find(a => a.startsWith('--report-path='))?.slice(14) ?? '.superpowers/sdd/2026-11-15-net-3e-recovery-internet/recovery.json');
  const artifactDirectory = resolve(reportPath, '..');
  const processes: Application[] = [], viewports: any[] = [];
  let runtime: ReturnType<typeof startOnlineAppRuntime> | undefined, failure: string | undefined, timedOut = false, electronVersion:string|undefined;
  const deadline = new AbortController();
  const timeout = () => { timedOut = true; deadline.abort(); };
  let cleaning=false;
  const watchdog = setTimeout(timeout, budgetMs-10000); // same absolute deadline, ten-second cleanup reserve
  let injectedDeadline: ReturnType<typeof setTimeout> | undefined;
  let waitFailure: ReturnType<typeof onlineAppWaitDiagnostic> | undefined;
  let source: any = null, directoryCleanupAttempted = false, cleanupFailed = false;
  const preparationProcesses: {child: ChildProcess; pid?: number; exited: boolean; forced: boolean; code: number | null; done: Promise<void>}[] = [];
  async function git(args: string[]) {
    if (!ownedDeadline.remaining(10000)) throw Error('preparation-timeout');
    const inject = preparationProcesses.length === 0;
    const child = inject && process.argv.includes('--inject-git-timeout')
      ? spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {windowsHide:true,stdio:['ignore','pipe','ignore']})
      : spawn('git', inject && process.argv.includes('--inject-git-failure') ? ['rev-parse','--verify','refs/ftlite-deliberately-missing'] : args, {windowsHide:true,stdio:['ignore','pipe','ignore']});
    const record = {child,pid:child.pid,exited:false,forced:false,code:null as number|null,done:Promise.resolve()};
    record.done = new Promise<void>((done,reject)=>{child.once('error',()=>reject(Error('preparation-failed')));child.once('exit',code=>{record.exited=true;record.code=code;});child.once('close',()=>done());});
    void record.done.catch(()=>{});preparationProcesses.push(record);
    let output='',overflow=false;
    child.stdout!.on('data',(chunk:Buffer)=>{if(Buffer.byteLength(output)+chunk.byteLength>1048576)overflow=true;else if(!overflow)output+=chunk.toString('utf8');});
    await ownedDeadline.wait(record.done,'preparation-timeout',10000);
    if(record.code!==0||overflow)throw Error('preparation-failed');return output.trim();
  }
  async function until(read: () => Promise<any>, predicate: (value: any) => boolean, label: string, ms = 10000) {
    const deadline = performance.now() + ms; let last;
    while (performance.now() < deadline) { if (timedOut) throw Error('launcher timeout'); last = await read(); if (predicate(last)) return last; await delay(40); }
    if(last?.utilityEpoch) { utilityFailure=last; console.error('UTILITY_WAIT',last); }
    if(process.env.FTL_DEBUG) console.error('WAIT_LAST',label,JSON.stringify({status:last?.status,recovery:last?.recovery&&{phases:last.recovery.phases,invalidations:last.recovery.invalidations},workers:last?.mirrorProof?.workers}).slice(0,3000));
    waitFailure = onlineAppWaitDiagnostic(label, last?.status?.phase); console.error(waitFailure); throw Error(label + ' timeout');
  }
  async function launch(profile: string) {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, FTLITE_SECTOR_ONLINE_TEST: '1', FTLITE_ONLINE_TEST_PROBE: '1', NODE_PATH:resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    const child = spawn(electron, [resolve('scripts/network/online-app-smoke.cjs'), '--recovery-observe-worker', `--online-app-dir=${directory}`, `--online-app-role=${profile}`,
      `--user-data-dir=${join(directory, profile)}`], { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>(); let id = 0;
    const record: Application = { child, pid: child.pid!, profile, exited: false, exit: Promise.resolve(), request(command, data = {}) {
      if (record.exited || !child.connected) return Promise.reject(Error('application IPC disconnected'));
      if((!cleaning && deadline.signal.aborted) || ownedDeadline.remaining(cleaning?8000:10000)<=0) return Promise.reject(Error('launcher timeout'));
      const key=++id;
      const work=new Promise((resolve, reject) => {
        pending.set(key, { resolve, reject });
        const failed=()=>{const item=pending.get(key);if(item){pending.delete(key);item.reject(Error('application IPC disconnected'));}};
        try { child.send({ ...data, ...(command==='shutdown'?{shutdownBudgetMs:Math.max(0,Math.min(4500,ownedDeadline.remaining(cleaning?8000:10000)-250))}:{}), requestId: key, command },error=>{if(error)failed();}); } catch { failed(); }
      });
      return waitForAppRequest(work,ownedDeadline,cleaning?undefined:deadline.signal,cleaning?8000:10000)
        .catch(error=>{if(pending.has(key))driverFailure={profile,command,code:'DRIVER_TIMEOUT'};throw error;}).finally(()=>pending.delete(key));
    } };
    child.on('message', (message: any) => { const item = pending.get(message.id); if (!item) return; pending.delete(message.id);
      if(message.error) { driverFailure={profile,command:message.command,reason:message.reason,code:'DRIVER_COMMAND_FAILED'}; item.reject(Error('app-driver-command-failed')); } else item.resolve(message.result); });
    child.on('error',()=>{for(const item of pending.values()){item.reject(Error('application process error'));}pending.clear();});
    // Native Electron diagnostics can also contain raw page/exception payloads.
    // Consume every chunk, but report only one fixed category and validated role.
    let stderrReported=false;
    child.stderr!.on('data', () => { if(!stderrReported){stderrReported=true;console.error(onlineAppStderrDiagnostic(profile));} });
    // Local debugging only (FTL_DEBUG=1): raw wrapper diagnostics; never set by the npm gates.
    if(process.env.FTL_DEBUG) child.stderr!.pipe(process.stderr);
    record.exit = new Promise(done => child.once('exit', code => { record.exited = true; record.exitCode=code; for (const item of pending.values()) { item.reject(Error('application exited')); } pending.clear(); done(); }));
    processes.push(record);
    const initial=await until(async () => { try { return await record.request('status'); } catch (error) { if (record.exited) throw error; return null; } }, value => !!value?.status && value.text.includes('Single player'), profile + ' app ready');
    assert(initial.electron==='37.10.3','wrong actual Electron runtime');electronVersion=initial.electron;
    return record;
  }
  const status = (app: Application) => app.request('status');
  const phase = (app: Application, value: string) => until(() => status(app), r => r.status.phase === value, `${app.profile} ${value}`);
  // The sector's test-only entry (H-2 spec §10).
  async function host(app: Application, capacity: number) { await app.request('host-sector', { capacity }); return phase(app, 'lobby'); }
  async function joinRoom(app: Application, code: string) { await app.request('join-sector', { code }); return phase(app, 'lobby'); }
  async function kill(app: Application) {
    if (!app.exited) {
      app.termination??='restart';
      if(!cleaning && !app.cleanup) try { app.beforeExit=await app.request('resources'); } catch {}
      await stopOwnedProcess(app.child,createLauncherDeadline(performance.now()+Math.min(6000,ownedDeadline.remaining(2500))));
    }
    await ownedDeadline.wait(app.exit,'owned Electron exit not observed',2500);
    if(app.beforeExit) {
      // Web-i: a Worker has no OS process; the killed app's renderer (which ran its Worker) must be gone.
      app.forcedRendererExits=[app.beforeExit.rendererPid].map((pid:number)=>{let alive=false;try{process.kill(pid,0);alive=true;}catch{} return {pid,exited:!alive};});
      assert(app.forcedRendererExits!.every(u=>u.exited),'owned forced renderer exit not observed');
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
    mkdirSync(artifactDirectory, { recursive: true });
    const revision=await git(['rev-parse','HEAD']),dirty=!!await git(['status','--porcelain']);
    if(process.argv.includes('--inject-preparation-read-failure'))readFileSync(join(directory,'missing-build-artifact.js'));
    source={revision,dirty,digest:computeContentDigest(process.cwd()),
      artifactHashes:Object.fromEntries([...new Set([...ONLINE_RECOVERY_ARTIFACTS,...readdirSync('out',{recursive:true}).filter(p=>/\.(js|html)$/.test(String(p))).map(p=>'out/'+String(p).replaceAll('\\','/'))])]
        .map(path=>{if(!ownedDeadline.remaining(10000))throw Error('preparation-timeout');return [path,createHash('sha256').update(readFileSync(path)).digest('hex')];}))};
    if(!ownedDeadline.remaining(10000))throw Error('preparation-timeout');
    stage='startup';
    const hang = process.argv.includes('--inject-startup-timeout') ? 'startup' : process.argv.includes('--inject-build-timeout') ? 'observer-build' : undefined;
    runtime = startOnlineAppRuntime(directory, source.digest, deadline.signal, hang, stage => { if (hang === stage) injectedDeadline = setTimeout(timeout,250); });
    await runtime.ready;
    let h = await launch('host'), g = await launch('guest');
    const capacity = ['hound-4','race'].includes(scenario) ? 4 : 2;
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
    if(unresponsiveProbe) {
      stage='unresponsive-cleanup';
      for(const app of [h,g]) { app.beforeExit=await app.request('resource-counts'); await app.request('ignore-driver'); }
      // Both real apps intentionally stop answering the test driver. The same
      // watchdog must interrupt in-flight work and leave time for exact cleanup.
      await ownedDeadline.wait(delay(ownedDeadline.remaining(12000)),'launcher timeout',10000);
      await Promise.all([h.request('status'),g.request('status')]);
      throw Error('unresponsive probe unexpectedly answered');
    }
    const runId = (await status(h)).status.snapshot.runId;
    // Keep actual human commands and held input in flight across the periodic boundary.
    const commands = (async () => { for(let i=0;i<7;i++) { await key(g,'F',40); await key(g,'D',50); await delay(550); } })();
    const mirrored = await until(async()=>({h:await status(h),g:await status(g)}),r=>r.h.mirrorProof.receipts.some((m:any)=>m.capturedTick===300)
      && r.g.recovery.gets.some((m:any)=>m.tick===300),'periodic receipt',12000);
    await commands;
    assert(mirrored.h.mirrorProof.workers[0].bootstrapAfterCommit,'initial commit barrier');
    const before = await status(h), beforeUtility = before.mirrorProof.workers.at(-1);
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
      // Web-i: the old main stall is now a page main-thread stall, and the Worker's evidence reaches main only through that
      // page (the probe's report port). This scenario needs a Worker-target evidence path that a blocked page cannot gate;
      // until it has one it fails here by name rather than timing out on files no one writes.
      // Deferred: plan deviation D-9 (what is uncovered and how to restore it).
      assert(false,'stale scenario not ported to the page topology (needs Worker-target evidence)');
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
      assert(loser.mirrorProof.workers.length===0,'loser allocated authority');
      contenders=[{seat,outcome:'winner',workersCreated:1},{seat:loser.status.ownSeat,outcome:'loser',workersCreated:0}];
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
      contenders=[{seat:0,outcome:'loser',workersCreated:0},{seat,outcome:'winner',workersCreated:1}];
      await until(()=>status(h),r=>r.status.phase==='saved'||r.status.phase==='paused','old host transition',10000);
      if((await status(h)).status.phase==='saved') await h.request('click',{id:'reconnect'});
    } else { h=await launch('host'); await h.request('open-multiplayer'); await h.request('click',{id:'reconnect'}); }
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
      utilityEpochBefore:beforeUtility.utilityEpoch,utilityEpochAfter:restored.mirrorProof.workers.at(-1).utilityEpoch,committed,restored:restore,
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
    for(const app of [h,g]) await until(()=>app.request('resource-counts'),r=>r.windows===1 && r.workers.every((w:any)=>w.exited) && r.listeners===1 && r.ports===0,'idle resource release',5000);
    proof.menuClicks=await Promise.all([h,g,...(contender?[contender]:[])].map(async app=>({role:app.profile,clicks:(await status(app)).recovery.clicks})));
  } catch(error) { failure=stage==='preparation'?(error instanceof Error && error.message==='preparation-timeout'?'preparation-timeout':'preparation-failed'):onlineAppFailureCode(error); firstDriverFailure=driverFailure; failureCategory=error instanceof SyntaxError?'invalid-observation-json':(error as any)?.code==='ENOENT'?'missing-observation-file':'gate-failure'; console.error('RECOVERY_FAILED',{stage,category:failureCategory,assertion:assertionFailure,driver:firstDriverFailure}); if(process.env.FTL_DEBUG) console.error('GATE_ERROR', error); }
  finally {
    clearTimeout(watchdog); clearTimeout(injectedDeadline);
    cleaning=true;
    await Promise.all([...(processes.filter(app=>!app.exited).map(async app=>{
      app.termination='shutdown';
      try {
        if(!app.beforeExit) app.beforeExit=await app.request('resource-counts');
        app.cleanup=await app.request('shutdown');
        await Promise.race([app.exit,delay(Math.min(1000,ownedDeadline.remaining(8000)))]);
      } catch { console.error('APP_SHUTDOWN_OBSERVATION_FAILED'); if(unresponsiveProbe)app.termination='fault'; }
      try { await kill(app); } catch { failure??='owned Electron cleanup failed'; }
    })),(async()=>{try { await runtime?.dispose(ownedDeadline); } catch { failure??='workerd cleanup failed'; }})()]);
    for(const record of preparationProcesses) {
      try {record.forced=!!record.pid&&!record.exited;await stopOwnedProcess(record.child,ownedDeadline);if(record.pid)await ownedDeadline.wait(record.done,'cleanup-timeout',2000);}
      catch {cleanupFailed=true;failure??='preparation cleanup failed';}
    }
    try { instrumentation=readdirSync(directory).filter(p=>p.endsWith('.instrumentation.json')).map(p=>({file:p,...JSON.parse(readFileSync(join(directory,p),'utf8'))})); } catch {cleanupFailed=true;failure??='instrumentation cleanup failed';}
    directoryCleanupAttempted=true;
    try {
    const target=resolve(directory),prefix=resolve(tmpdir())+sep;
    if(!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-online-recovery-')) throw Error('invalid exact cleanup target');
    await removeOwnedDirectory(target,ownedDeadline); } catch { cleanupFailed=true;failure??='exact temporary cleanup failed'; }
  }
  const cleanups=processes.flatMap(p=>p.cleanup?[p.cleanup]:[]);
  const report={version:1,scenario,source,temporaryName:basename(directory),directoryCleanupAttempted,cleanupFailed,
    preparationProcesses:preparationProcesses.map(({pid,exited,forced,code})=>({kind:'git',pid,exited,forced,code})),nativeAllocated:!!runtime||processes.length>0,runtime:{electron:electronVersion,workerd:runtime?.workerdVersion,workerPid:runtime?.pid,workerExit:runtime?.exited(),temporaryRemoved:!existsSync(directory)},
    processes:processes.map(({pid,profile,exited,exitCode,beforeExit,cleanup,termination,forcedRendererExits})=>({pid,profile,exited,exitCode,termination,resourcesBeforeForcedExit:beforeExit,forcedRendererExits,cleanup})),
    // An unobserved counter (e.g. ports: null) stays null so the report cannot pass.
    cleanup:Object.fromEntries(['workers','workerExits','windows','ports','listeners','peers','nativePeersObserved','nativePeerCloses','nativePeersEndedWithPage','observedPagePorts'].map(k => [k, cleanups.some(r => !Number.isSafeInteger(r[k])) ? null : cleanups.reduce((n,r)=>n+r[k],0)])),
    runtimeHelper:runtime?.observation(),instrumentation,viewports,proof,budgetMs,elapsedMs:Math.ceil(performance.now()-began),failure,assertionFailure,failureCategory,stage,utilityFailure,driverFailure:failure?firstDriverFailure:undefined,waitFailure,limits:['loopback-only','no-TURN','no-WAN','no-two-machine','OS-suspend-NOT-RUN']};
  try {writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
  catch {console.error('RECOVERY_REPORT_WRITE_FAILED');console.log(JSON.stringify(report));failure??='report-write-failed';}
  if(failure) throw Error(failure);
  validateOnlineRecoveryReport(report); console.log('ACTUAL APPLICATION RECOVERY PASS',scenario);
}
main().catch(error=>{console.error(onlineAppFailureCode(error));process.exitCode=1;});
