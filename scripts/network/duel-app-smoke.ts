// `npm run test:duel-app-runtime` (H-2 spec §10): the online duel through the real application. Two Electron processes
// with separate temporary userData, against local workerd through Net-3d's harness and driver entry. Through the menu,
// Multiplayer → Host, Join by the displayed code, ready, Swap seats once, start. Round 1 is the forced round end: a
// test-only first seed (FTLITE_DUEL_TEST_SEED) whose round is decided on tick 1471 when nobody flies or fires, so in it
// both players only stand up and sit down again (their records' command samples); then Enter starts round 2 on both,
// and a duel-*.jsonl with latency figures is on both machines. In round 2 the Helm (the guest) holds W for 2 s and the
// ship's speed rises on both screens; Weapons (the host) presses and releases Space and a beam is fired on both; both
// renderers agree on a hash at a common publication; the guest is killed and restarted (presence false and the host
// paused for the lost partner, then the rejoin, its ACK before any input and its presence true, then an Escape
// unpause). H-2b: the host's records read loopback and the guest's lan with an RTT; F3 shows the latency overlay on
// both (screenshots beside the report); both machines' records are copied beside the report for the playtest report
// script. Exact temporary roots are cleaned; Electron and workerd are never killed globally.
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { build } from 'vite';
import { computeContentDigest } from '../../build/contentDigest';
import { startOnlineAppRuntime } from './online-app-runtime';

/** The test-only first seed: with no flight or weapon input its first round is decided on tick 1471, about 25 s of play,
 *  whoever is seated or away (found by search, H-2a plan). */
export const DUEL_TEST_SEED = 2277;
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
type Application = { child: ChildProcess; pid: number; profile: string; exited: boolean; exit: Promise<void>; request(command: string, data?: object): Promise<any> };

async function main() {
  const began = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-duel-app-'));
  const reportPath = resolve(process.argv.find(a => a.startsWith('--report-path='))?.slice(14) ?? 'out/h2a-duel-app/duel-app.json');
  mkdirSync(resolve(reportPath, '..'), { recursive: true });
  const digest = computeContentDigest(process.cwd()), processes: Application[] = [], proof: Record<string, unknown> = {};
  const deadline = new AbortController(), watchdog = setTimeout(() => deadline.abort(), 180000);
  let runtime: ReturnType<typeof startOnlineAppRuntime> | undefined, failure: string | undefined, step = 'startup';
  async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean, label: string, ms = 15000): Promise<T> {
    const end = performance.now() + ms; let last: T | undefined;
    while (performance.now() < end) { if (deadline.signal.aborted) throw Error('launcher timeout'); last = await read(); if (predicate(last)) return last; await delay(50); }
    throw Error(`${label} timeout`);
  }
  async function launch(profile: 'host' | 'guest'): Promise<Application> {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, FTLITE_DUEL_TEST_SEED: String(DUEL_TEST_SEED), NODE_PATH: resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL; delete env.FTLITE_SECTOR_ONLINE_TEST;
    const child = spawn(electron, [resolve('scripts/network/online-app-smoke.cjs'), `--online-app-dir=${directory}`, `--online-app-role=${profile}`, `--user-data-dir=${join(directory, profile)}`],
      { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>(); let id = 0;
    const app: Application = { child, pid: child.pid!, profile, exited: false, exit: Promise.resolve(), request(command, data = {}) {
      if (app.exited || !child.connected) return Promise.reject(Error('application IPC disconnected'));
      return new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(command + ' driver timeout')); }, 8000);
        pending.set(key, { resolve, reject, timer }); try { child.send({ ...data, requestId: key, command }); } catch { pending.delete(key); clearTimeout(timer); reject(Error('application IPC disconnected')); } });
    } };
    child.on('message', (message: any) => { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(`app-driver-command-failed (${message.command}: ${message.reason})`)) : item.resolve(message.result); });
    child.stdout!.resume(); child.stderr!.resume();
    app.exit = new Promise(done => child.once('exit', () => { app.exited = true; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('application exited')); } pending.clear(); done(); }));
    processes.push(app);
    await until(async () => { try { return await app.request('status'); } catch (error) { if (app.exited) throw error; return null; } }, (v: any) => !!v?.status && v.text.includes('Single player'), `${profile} app ready`, 30000);
    return app;
  }
  async function kill(app: Application) {
    if (!app.exited) {
      if (process.platform === 'win32') await new Promise<void>(done => { const c = spawn('taskkill', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); c.once('error', () => done()); c.once('exit', () => done()); });
      else app.child.kill('SIGKILL');
    }
    await Promise.race([app.exit, delay(5000)]);
  }
  const status = (app: Application) => app.request('status');
  const phase = (app: Application, value: string, ms?: number) => until(() => status(app), (r: any) => r.status.phase === value, `${app.profile} ${value}`, ms);
  // State packets can arrive out of order and a paused host stops publishing, so the newest is the highest sequence, not the last received.
  const latest = (r: any) => (r.observations.at(-1)?.publications as any[] | undefined)?.reduce((a: any, p: any) => (a && a.sequence >= p.sequence ? a : p), undefined);
  const press = async (app: Application, key: string, hold = 120) => { await app.request('key', { key, down: true }); await delay(hold); await app.request('key', { key, down: false }); };
  /** The highest applied command sequence of `seat` in the app's latest observation. */
  const applied = async (app: Application, seat: number): Promise<number> =>
    Math.max(0, ...((await status(app)).observations.at(-1)?.results ?? []).filter((x: any) => x.status === 'applied' && x.id.player === seat).map((x: any) => x.id.sequence as number));
  /** Walk `seat` with held keys (each [key, ms]) and press E until its sit is applied, nudging left between tries. */
  async function walkAndSit(app: Application, seat: number, route: readonly (readonly [string, number])[]): Promise<void> {
    for (const [key, ms] of route) await press(app, key, ms);
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await applied(app, seat);
      await press(app, 'E');
      try { await until(() => applied(app, seat), (n) => n > before, `${app.profile} sat`, 1500); return; }
      catch { await press(app, 'A', 120); }
    }
    throw Error(`${app.profile} could not reach its console`);
  }
  /** Both start standing in the Hound's mid room (Q): the host goes right to the cockpit's back wall, up to its top
   *  wall and a little left, to Weapons (19,5); the guest goes right to the back wall beside the Helm (20,7). */
  async function takeConsoles(h: Application, g: Application): Promise<void> {
    await walkAndSit(h, 0, [['D', 3000], ['W', 1500], ['A', 300]]);
    await walkAndSit(g, 1, [['D', 3000]]);
  }
  try {
    runtime = startOnlineAppRuntime(directory, digest, deadline.signal);
    await runtime.ready;
    // The duel's own passive observer replaces the sector's, before any application window loads it.
    await build({ configFile: false, envDir: false, logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(directory, 'observer'), emptyOutDir: false, lib: { entry: resolve('scripts/network/duel-app-observer.ts'), name: 'DuelObserver', formats: ['iife'], fileName: () => 'observer.js' } } });
    // The shared driver proves each utility checkpoint with the sector's card memory; a duel checkpoint has none.
    writeFileSync(join(directory, 'observer', 'utility.cjs'), 'module.exports = { reconciledMemory: () => null };\n');
    const h = await launch('host'); let g = await launch('guest');
    step = 'step 1';
    // 1. Through the real menu: Multiplayer → Host; Join by the displayed code; ready; Swap seats once; start.
    await h.request('open-multiplayer'); await h.request('click', { id: 'host' }); await h.request('click', { id: 'create-room' });
    const lobby = await phase(h, 'lobby');
    assert(lobby.status.snapshot.compatibility.modeId === 'duel' && lobby.status.snapshot.capacity === 2, 'Host made a two-seat duel room');
    await g.request('open-multiplayer'); await g.request('click', { id: 'join' }); await g.request('type', { id: 'join-code', text: lobby.status.snapshot.joinCode }); await g.request('click', { id: 'join-room' });
    await phase(g, 'lobby');
    await h.request('click', { id: 'ready' }); await g.request('click', { id: 'ready' });
    await until(() => status(h), (r: any) => r.status.actions.includes('start'), 'both ready');
    await h.request('click', { id: 'swap-seats' });
    assert((await status(h)).text.includes('Guest flies Helm'), 'Swap seats shows the guest at the Helm');
    assert((await status(g)).text.includes('Host picks seats'), 'the guest lobby says the host picks seats');
    await h.request('click', { id: 'start' });
    await phase(h, 'running', 20000); await phase(g, 'running', 20000);
    const started = await until(() => status(g), (r: any) => latest(r)?.helmPlayer === 1 && latest(r)?.seed === DUEL_TEST_SEED, 'guest sees itself at the Helm');
    proof.swap = { helmPlayer: latest(started).helmPlayer, seed: latest(started).seed };
    step = 'step 2';
    // 2. Round 1, the forced end: both start standing aboard (start-aboard spec §1) and walk to their consoles: the host
    //    to Weapons, the guest to the Helm. Nobody flies or fires, so the test seed's round is decided on tick 1471
    //    whatever the timing, and both records get command samples.
    await takeConsoles(h, g);
    step = 'step 3';
    // 3. The round ends; Enter starts round 2 on both; a record with latency samples on both machines.
    const decided = await until(() => status(h), (r: any) => latest(r)?.outcome !== 0, 'the forced round end', 60000);
    await until(() => status(g), (r: any) => latest(r)?.outcome !== 0, 'the guest sees the decision');
    await press(h, 'Return');
    await until(async () => [latest(await status(h)), latest(await status(g))], ([a, b]: any) => a.round === 1 && b.round === 1 && a.outcome === 0, 'Enter starts round 2 on both');
    proof.rounds = { decidedTick: latest(decided).tick, outcome: latest(decided).outcome };
    await takeConsoles(h, g);   // round 2 starts standing aboard too
    const records = await until(async () => (['host', 'guest'] as const).map((profile) => {
      const dir = join(directory, profile, 'playtest');
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^duel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) : [];
      return files.flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    }), (both) => both.every((list) => list.some((r: any) => r.round === 0 && r.summary.round === 0 && r.latency.held.count + r.latency.command.count > 0)), 'playtest records with latency samples on both', 15000);
    proof.records = records.map((list) => ({ count: list.length, role: list[0].role, transport: list[0].transport, latency: list[0].latency, jitter: list[0].jitter }));
    // H-2b: the host's own port is loopback; the guest labels its link from the RTC window's selected pair, with an RTT.
    assert(records[0]!.every((r: any) => r.transport === 'loopback') && records[1]!.every((r: any) => r.transport === 'lan' && r.latency.rttMs !== null), 'host records read loopback, guest records lan with an RTT');
    step = 'step 4';
    // 4. The Helm machine (the guest) holds W for 2 s: the crew ship's speed rises on both screens.
    const speedBefore = latest(await status(h)).speed;
    await g.request('key', { key: 'W', down: true }); await delay(2000); await g.request('key', { key: 'W', down: false });
    const fast = await until(async () => [latest(await status(h)), latest(await status(g))], ([a, b]: any) => a.speed > speedBefore + 1 && b.speed > speedBefore + 1, 'speed rises on both');
    proof.thrust = { before: speedBefore, host: fast[0].speed, guest: fast[1].speed };
    step = 'step 5';
    // 5. The Weapons machine (the host) presses Space and releases it: a beam (a laser shot) on both.
    const shotsBefore = latest(await status(h)).shots;
    await h.request('key', { key: 'Space', down: true }); await delay(4500); await h.request('key', { key: 'Space', down: false });   // a full charge takes 4 s
    const fired = await until(async () => [latest(await status(h)), latest(await status(g))], ([a, b]: any) => a.shots > shotsBefore && b.shots > shotsBefore, 'beam on both', 10000);
    proof.beam = { before: shotsBefore, host: fired[0].shots, guest: fired[1].shots };
    step = 'step 6';
    // 6. Both renderers agree on the hash at a common publication.
    const agreement = await until(async () => { const [a, b] = [await status(h), await status(g)]; const hp = a.observations.at(-1).publications, gp = b.observations.at(-1).publications;
      return gp.findLast((p: any) => hp.some((q: any) => q.sequence === p.sequence && q.hash === p.hash && q.tick === p.tick)); }, (same: any) => !!same, 'hash agreement');
    proof.agreement = { tick: agreement.tick, sequence: agreement.sequence, hash: agreement.hash };
    // F3 shows the latency overlay on either machine (spec §9): a screenshot of each beside the report, then F3 hides it.
    for (const app of [h, g]) await press(app, 'F3');
    await delay(500);
    for (const app of [h, g]) await app.request('screenshot', { path: join(resolve(reportPath, '..'), `f3-${app.profile}.png`) });
    for (const app of [h, g]) await press(app, 'F3');
    proof.overlay = { screenshots: ['f3-host.png', 'f3-guest.png'] };
    step = 'step 7';
    // 7. The guest is killed and restarted: presence false and the host paused for the lost partner; the rejoin and
    //    its ACK before any input, then presence true; then an Escape unpause.
    await kill(g);
    const lost = await until(() => status(h), (r: any) => latest(r)?.present[1] === 0 && latest(r)?.phase === 'paused' && latest(r)?.pauseReason === 'peer-lost', 'presence false, then the peer-lost pause', 30000);
    proof.peerLost = { tick: latest(lost).tick };
    g = await launch('guest'); await g.request('open-multiplayer'); await g.request('click', { id: 'reconnect' });
    await phase(g, 'paused', 30000);
    const rejoined = await until(() => status(g), (r: any) => r.observations.at(-1)?.inputs.some((i: any) => i.command === 'presence' && i.present === true), 'rejoin presence true');
    const session = rejoined.observations.at(-1);
    assert(session.firstAckOrder > 0 && session.firstInputOrder > session.firstAckOrder, 'the rejoined guest sent input before its full-state ACK');
    assert(latest(await status(h)).phase === 'paused', 'rejoining unpaused the duel');
    await press(h, 'Escape');
    await phase(h, 'running'); await phase(g, 'running');
    await until(() => status(h), (r: any) => latest(r)?.present[1] === 1, 'the guest is present again');
    proof.rejoin = { ackBeforeInput: true, resumedByEscape: true };
    for (const app of [g, h]) { await app.request('click', { id: 'leave' }); }
    await phase(h, 'idle'); await phase(g, 'idle');
    console.log('ACTUAL DUEL APP: menu host/join/swap/start, the forced round end and round 2, records on both, Helm thrust and a beam on both, hash agreement, peer-lost pause and rejoin');
  } catch (error) { failure = `${step}: ${String((error as Error)?.message ?? error).slice(0, 160)}`; }
  finally {
    clearTimeout(watchdog);
    for (const app of processes) if (!app.exited) { try { const done = app.request('shutdown'); await Promise.race([done, delay(6000)]); } catch { /* forced below */ } await kill(app); }
    // Both machines' playtest logs, beside the report, for scripts/duel-playtest-report.ts (exact paths only).
    // The recursive delete is only ever under out/: a report path elsewhere is refused, its records not copied.
    const evidence = resolve(reportPath, '..'), outRoot = resolve('out') + sep;
    if (!evidence.startsWith(outRoot)) failure ??= 'report path outside out/: records not copied';
    else try {
      const copies = join(evidence, 'records');
      rmSync(copies, { recursive: true, force: true });
      for (const profile of ['host', 'guest']) {
        const from = join(directory, profile, 'playtest');
        if (!existsSync(from)) continue;
        mkdirSync(join(copies, profile), { recursive: true });
        for (const f of readdirSync(from).filter((f) => /^duel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))) copyFileSync(join(from, f), join(copies, profile, f));
      }
    } catch { failure ??= 'record copy failed'; }
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-duel-app-')) throw Error('invalid exact cleanup target');
    try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { failure ??= 'exact temporary cleanup failed'; }
  }
  const report = { version: 1, digest, elapsedMs: Math.ceil(performance.now() - began), processes: processes.map(({ pid, profile, exited }) => ({ pid, profile, exited })), proof, failure, temporaryRemoved: !existsSync(directory) };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (failure) throw Error(failure);
  console.log(`ACTUAL TWO-PROCESS DUEL APPLICATION PASS (${report.elapsedMs} ms)`);
}
main().catch(error => { console.error(`DUEL APP FAIL: ${String((error as Error)?.message ?? error).slice(0, 200)}`); process.exitCode = 1; });
