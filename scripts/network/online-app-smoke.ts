import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
import { startOnlineAppRuntime } from './online-app-runtime';
import { ONLINE_APP_ARTIFACTS, validateOnlineAppReport } from './online-app-report';
import { onlineAppFailureCode, onlineAppStderrDiagnostic, onlineAppWaitDiagnostic } from './online-app-diagnostics';

const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
type Application = { child: ChildProcess; pid: number; profile: string; exited: boolean; exit: Promise<void>; request(command: string, data?: object): Promise<any>; cleanup?: any; exitCode?: number|null; beforeExit?: any; termination?: 'shutdown'|'restart'|'fault' };
async function main() {
  const began = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-online-app-'));
  const reportPath = resolve(process.argv.find(a => a.startsWith('--report-path='))?.slice(14) ?? '.superpowers/sdd/2026-11-15-net-3d-online-sector/online-app.json');
  const artifactDirectory = resolve(reportPath, '..'); mkdirSync(artifactDirectory, { recursive: true });
  const processes: Application[] = [], scenarios: any[] = [], checks: string[] = [], viewports: any[] = [];
  let runtime: ReturnType<typeof startOnlineAppRuntime> | undefined, failure: string | undefined, timedOut = false, electronVersion:string|undefined;
  const deadline = new AbortController();
  const timeout = () => { timedOut = true; deadline.abort(); };
  const watchdog = setTimeout(timeout, 90000);
  let injectedDeadline: ReturnType<typeof setTimeout> | undefined;
  let waitFailure: ReturnType<typeof onlineAppWaitDiagnostic> | undefined;
  const source = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim(), digest: computeContentDigest(process.cwd()),
    artifactHashes:Object.fromEntries(ONLINE_APP_ARTIFACTS
      .map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])) };
  async function until(read: () => Promise<any>, predicate: (value: any) => boolean, label: string, ms = 10000) {
    const deadline = performance.now() + ms; let last;
    while (performance.now() < deadline) { if (timedOut) throw Error('launcher timeout'); last = await read(); if (predicate(last)) return last; await delay(40); }
    waitFailure = onlineAppWaitDiagnostic(label, last?.status?.phase); console.error(waitFailure); throw Error(label + ' timeout');
  }
  async function launch(profile: string) {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    // The sector runs through the test-only entry (H-2 spec §10): the menu's Multiplayer is the duel.
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, FTLITE_SECTOR_ONLINE_TEST: '1', NODE_PATH:resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
    const child = spawn(electron, [resolve('scripts/network/online-app-smoke.cjs'), `--online-app-dir=${directory}`, `--online-app-role=${profile}`,
      `--user-data-dir=${join(directory, profile)}`], { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>(); let id = 0;
    const record: Application = { child, pid: child.pid!, profile, exited: false, exit: Promise.resolve(), request(command, data = {}) {
      if (record.exited || !child.connected) return Promise.reject(Error('application IPC disconnected'));
      return new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(command + ' driver timeout')); }, 5000);
        pending.set(key, { resolve, reject, timer });
        const failed=()=>{const item=pending.get(key);if(item){pending.delete(key);clearTimeout(item.timer);item.reject(Error('application IPC disconnected'));}};
        try { child.send({ ...data, requestId: key, command },error=>{if(error)failed();}); } catch { failed(); }
      });
    } };
    child.on('message', (message: any) => { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(Error('app-driver-command-failed')) : item.resolve(message.result); });
    child.on('error',()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('application process error'));}pending.clear();});
    // Native Electron diagnostics can also contain raw page/exception payloads.
    // Consume every chunk, but report only one fixed category and validated role.
    let stderrReported=false;
    child.stderr!.on('data', () => { if(!stderrReported){stderrReported=true;console.error(onlineAppStderrDiagnostic(profile));} });
    record.exit = new Promise(done => child.once('exit', code => { record.exited = true; record.exitCode=code; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('application exited')); } pending.clear(); done(); }));
    processes.push(record);
    const initial=await until(async () => { try { return await record.request('status'); } catch (error) { if (record.exited) throw error; return null; } }, value => !!value?.status && value.text.includes('Single player'), profile + ' app ready');
    assert(initial.electron==='37.10.3','wrong actual Electron runtime');electronVersion=initial.electron;
    return record;
  }
  const status = (app: Application) => app.request('status');
  const phase = (app: Application, value: string) => until(() => status(app), r => r.status.phase === value, `${app.profile} ${value}`);
  async function host(app: Application, capacity: number) { await app.request('host-sector', { capacity }); return phase(app, 'lobby'); }
  async function joinRoom(app: Application, code: string) { await app.request('join-sector', { code }); return phase(app, 'lobby'); }
  async function kill(app: Application) {
    if (!app.exited) {
      app.termination??='restart';
      try { app.beforeExit=await app.request('resources'); } catch {}
      if (process.platform === 'win32') await new Promise<void>(done => { const child = spawn('taskkill', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); child.once('error', () => done()); child.once('exit', () => done()); });
      else app.child.kill('SIGKILL');
    }
    await Promise.race([app.exit, delay(5000).then(() => { if (!app.exited) throw Error('owned Electron exit not observed'); })]);
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
  async function play(h: Application, initialGuest: Application, capacity: number) {
    let g = initialGuest;
    const seat = capacity === 2 ? 1 : 2;
    await h.request('click', {id:'ready'}); await g.request('click',{id:'ready'});
    await until(()=>status(h),r=>r.status.actions.includes('start'),'native/service ready');
    await h.request('click',{id:'start'}); await phase(h,'running'); const first = await phase(g,'running');
    const runId = first.status.snapshot.runId;
    const initialMirror = (await status(h)).mirrorProof;
    const initialUtility = initialMirror.utilities.find((u: any) => u.runId === runId);
    assert(initialUtility?.initialCaptureTick === 0 && initialUtility?.bootstrapAfterCommit === true, 'initial mirror barrier');
    const mirrored = await until(async () => ({ host: await status(h), guest: await status(g) }), r => {
      const utility = r.host.mirrorProof.utilities.find((u: any) => u.runId === runId);
      const receipt = r.host.mirrorProof.receipts.find((m: any) => m.runId === runId && m.capturedTick === 300);
      return utility?.periodicCapturedTick === 300 && receipt && r.guest.mirrorProof.receipts.some((m: any) => m.runId === runId && m.checkpointSequence === receipt.checkpointSequence && m.payloadSha256 === receipt.payloadSha256);
    }, 'periodic mirrored capture', 12000);
    const periodicReceipt = mirrored.host.mirrorProof.receipts.find((m: any) => m.runId === runId && m.capturedTick === 300);
    const mirrorProof = { initialCommittedTick: 0, initialBeforeBootstrap: initialUtility.bootstrapAfterCommit,
      periodicCapturedTick: 300, periodicCommittedTick: periodicReceipt.capturedTick, guestReceived: true };
    assert(first.status.ownSeat===seat && first.text.includes(`You are Player ${seat+1}`),'assigned-seat HUD');
    const generationBefore = first.status.snapshot.seats[seat].seatGeneration;
    await key(g,'F'); await key(g,'D',350);
    await until(()=>status(g),r=>observation(r).inputs.some((i:any)=>i.held?.moveX===1),'guest native keyboard input');
    await viewportProof(g, `online-player${seat+1}`);
    const initial = await matched(h,g);
    for(const app of [h,g]) {
      const resources=await app.request('resources');
      assert(resources.native.flatMap((n:any)=>n.connections).some((pc:any)=>pc.state==='connected'&&pc.selected&&pc.direct),'real selected native direct route');
    }
    assert(initial.guest.errors===0 && initial.host.errors===0,'passive state decoder');
    await g.request('key',{key:'D',down:true}); await delay(100); const beforeBlur = observation(await status(g));
    await g.request('blur'); await h.request('focus');
    await until(()=>status(g),r=>observation(r).inputs.some((i:any)=>i.order>beforeBlur.order&&i.reliable&&i.held?.moveX===0),'blur reliable neutral');
    await delay(120); const afterBlur = observation(await status(g));
    assert(afterBlur.publications.at(-1).phase==='running' && afterBlur.publications.at(-1).tick>initial.same.tick,'blur globally paused authority');
    await g.request('key',{key:'D',down:false});
    await g.request('click',{id:'pause'}); await phase(g,'paused'); await phase(h,'paused');
    await g.request('click',{id:'pause'}); await phase(g,'running');
    const commandProof = observation(await status(g));
    assert(commandProof.results.some((r:any)=>r.id.player===seat&&r.status==='applied'),'guest command application result');
    if(process.argv.includes('--inject-timeout')) {
      const timer=setTimeout(timeout,250);
      try { await until(()=>status(g),()=>false,'deliberately held launcher wait'); } finally { clearTimeout(timer); }
    }
    if(process.argv.includes('--inject-guest-failure')) { g.termination='fault'; await kill(g); throw Error('injected guest process death'); }
    if(process.argv.includes('--inject-transport-failure')) { await g.request('transport-death'); throw Error('injected transport death'); }
    await key(g,'D',100); const beforeLoss = observation(await status(h)).publications.at(-1);
    await kill(g);
    await until(()=>status(h),r=>!r.status.snapshot.seats[seat].connected,'service observes guest process loss');
    const bot = await until(()=>status(h),r=>observation(r).publications.at(-1).heldHighWater[seat]>beforeLoss.heldHighWater[seat]+2,'bot publication advances guest seat');
    g = await launch('guest'); await g.request('open-multiplayer'); await g.request('click',{id:'reconnect'}); const rejoined = await phase(g,'running');
    assert(rejoined.status.snapshot.seats[seat].seatGeneration>generationBefore,'persisted token generation did not increase');
    await key(g,'F'); await key(g,'D',150); const resumed = await matched(h,g);
    assert(resumed.guest.firstAckOrder>0 && resumed.guest.firstInputOrder>resumed.guest.firstAckOrder,'resumed input before full ACK');
    await g.request('click',{id:'pause'}); await phase(g,'paused'); await phase(h,'paused');
    await kill(g); g = await launch('guest'); await g.request('open-multiplayer'); await g.request('click',{id:'reconnect'});
    const paused = await phase(g,'paused'); const frozen = observation(paused).publications.at(-1); await delay(200);
    assert(observation(await status(g)).publications.at(-1).tick===frozen.tick,'reconnect auto-unpaused');
    const final = await matched(h,g);
    const records = [commandProof,resumed.guest,final.guest];
    const inputs = records.flatMap(r=>r.inputs);
    assert(inputs.length>0 && inputs.every((i:any)=>i.player===seat),'guest produced unowned-seat input');
    const proof = {capacity,seat,layout:final.same.layout,mirrors:mirrorProof,fullReceipts:records.reduce((n,r)=>n+r.fullReceipts,0),acks:records.reduce((n,r)=>n+r.acks,0),
      commands:commandProof.results.filter((r:any)=>r.status==='applied'&&r.id.player===seat).length,matched:3,ownership:true,
      ackBeforeInput:records.every(r=>r.firstAckOrder>0&&(!r.firstInputOrder||r.firstInputOrder>r.firstAckOrder)),
      generationBefore,generationAfter:paused.status.snapshot.seats[seat].seatGeneration,botTakeover:true,pausedReconnect:true,blurNeutral:true,
      botHeldBefore:beforeLoss.heldHighWater[seat],botHeldAfter:observation(bot).publications.at(-1).heldHighWater[seat],
      agreement:{runId:final.same.runId,sequence:final.same.sequence,hash:final.same.hash,tick:final.same.tick}};
    scenarios.push(proof); console.log(`ACTUAL APP ${capacity}-seat ${proof.layout}: input, ACK, bot, restart and paused rejoin proved`);
    await g.request('click',{id:'leave'}); await phase(g,'idle'); await h.request('click',{id:'leave'}); await phase(h,'idle');
    return g;
  }
  try {
    const hang = process.argv.includes('--inject-startup-timeout') ? 'startup' : process.argv.includes('--inject-build-timeout') ? 'observer-build' : undefined;
    runtime = startOnlineAppRuntime(directory, source.digest, deadline.signal, hang, stage => {
      if (hang === stage) injectedDeadline = setTimeout(timeout, 250);
    });
    await runtime.ready;
    const h = await launch('host'); let g = await launch('guest');
    await h.request('screenshot', { path: join(artifactDirectory, 'online-menu.png') });
    await g.request('open-multiplayer'); await g.request('click',{id:'join'}); await g.request('type',{id:'join-code',text:'00000000'}); await g.request('click',{id:'join-room'});
    const invalid = await phase(g,'error'), invalidResources = await g.request('resources');
    assert(invalid.status.error==='not-found'&&invalid.status.snapshot===null&&invalidResources.utilities.length===0&&invalidResources.windows===1,'bad code allocated native resources');
    checks.push('bad-code'); await g.request('click',{id:'home'});
    const lobby = await host(h, 2);
    // A labelled incompatible compiled copy changes only the compiled digest. It
    // still runs the production menu, compatibility candidates and service client.
    const variant = join(directory,'incompatible-build'); cpSync(resolve('out'),variant,{recursive:true});
    for(const dependency of ['zod','bitecs']) cpSync(resolve('node_modules',dependency),join(variant,'node_modules',dependency),{recursive:true});
    let changed=0;
    for(const file of readdirSync(variant,{recursive:true})) if(String(file).endsWith('.js')) {
      const path=join(variant,String(file)), text=readFileSync(path,'utf8');
      if(text.includes(source.digest)){writeFileSync(path,text.replaceAll(source.digest,'0'.repeat(64)));changed++;}
    }
    assert(changed>=3,'incompatible compiled variant missing');
    const incompatible=await launch('incompatible'); await incompatible.request('join-sector',{code:lobby.status.snapshot.joinCode});
    const mismatch=await phase(incompatible,'error'), mismatchResources=await incompatible.request('resources');
    assert(mismatch.status.error==='incompatible'&&mismatch.status.snapshot===null&&mismatchResources.utilities.length===0&&mismatchResources.windows===1,'incompatible build allocated resources');
    assert((await status(h)).status.snapshot.seats.filter((s:any)=>s.occupied).length===1,'incompatible build occupied seat');
    checks.push('incompatible'); await shutdown(incompatible);
    await g.request('delay-next-transport'); await g.request('join-sector',{code:lobby.status.snapshot.joinCode});
    await phase(g,'joining'); await g.request('click',{id:'leave'}); await phase(g,'idle');
    await g.request('click',{id:'single-player'}); await delay(1300);
    const cancelled=await g.request('resources'); assert(cancelled.utilities.length===0&&cancelled.windows===1&&cancelled.listeners===0,'cancel retained transport resources');
    await viewportProof(g, 'single');
    await key(g, 'Escape'); await delay(100); await key(g, 'M');
    await until(() => g.request('status'), r => r.text.includes('Single player'), 'single returns to menu'); checks.push('cancel-single');
    // Cancellation can leave the service's disconnected reservation; host removes
    // it through the same real roster action before admitting the actual guest.
    if((await status(h)).status.snapshot.seats[1].occupied) await h.request('click',{id:'remove-seat-1'});
    await joinRoom(g, lobby.status.snapshot.joinCode);
    g = await play(h,g,2);
    const fourSeatLobby=await host(h,4), filler=await launch('filler');
    await joinRoom(filler,fourSeatLobby.status.snapshot.joinCode); await joinRoom(g,fourSeatLobby.status.snapshot.joinCode);
    await h.request('click',{id:'remove-seat-1'}); await shutdown(filler);
    const sparse=(await status(h)).status.snapshot;
    assert(sparse.capacity===4&&sparse.seats[0].occupied&&!sparse.seats[1].occupied&&sparse.seats[2].occupied&&!sparse.seats[3].occupied,'sparse 0/2 roster');
    g=await play(h,g,4);
  } catch (error) { failure = onlineAppFailureCode(error); }
  finally {
    clearTimeout(watchdog); clearTimeout(injectedDeadline);
    for (const app of processes) if (!app.exited) {
      app.termination='shutdown';
      try { app.cleanup = await app.request('shutdown'); await Promise.race([app.exit,delay(1000)]); } catch { console.error('APP_SHUTDOWN_OBSERVATION_FAILED'); }
      try { await kill(app); } catch { failure??='owned Electron cleanup failed'; }
    }
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-online-app-')) throw Error('invalid exact cleanup target');
    try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { failure??='exact temporary cleanup failed'; }
  }
  const cleanups = processes.flatMap(p => p.cleanup ? [p.cleanup] : []);
  const report = { version: 1, source, runtime: { electron: electronVersion, workerd: runtime?.workerdVersion, workerPid:runtime?.pid, workerExit: runtime?.exited(), temporaryRemoved: !existsSync(directory) },
    processes: processes.map(({pid,profile,exited,exitCode,beforeExit,cleanup,termination}) => ({pid,profile,exited,exitCode,termination,resourcesBeforeForcedExit:beforeExit,cleanup})),
    cleanup: Object.fromEntries(['utilities','utilityExits','windows','ports','listeners','peers','nativeWindows','nativeWindowExits','nativePeersObserved','nativePeerCloses','nativePeersEndedWithWindow','observedMainPorts'].map(k => [k, cleanups.reduce((n,r)=>n+r[k],0)])),
    runtimeHelper: runtime?.observation(), viewports, scenarios, checks, elapsedMs: Math.ceil(performance.now()-began), failure, waitFailure,
    limits: ['loopback-only','no-TURN','no-rehost','no-WAN','no-two-machine'] };
  writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n');
  if (failure) throw Error(failure);
  validateOnlineAppReport(report); console.log('ACTUAL TWO-PROCESS ONLINE APPLICATION PASS');
}
main().catch(error => { console.error(onlineAppFailureCode(error)); process.exitCode=1; });



