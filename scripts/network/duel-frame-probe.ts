// `npm run test:duel-frames` (Net-4a measurement, owner request 2026-11-20): does the online duel draw smoothly at the
// display's rate in the real app? Two Electron app processes over loopback, as `npm run test:duel-app-runtime`
// (duel-app-smoke.ts) launches and drives them, through the frame wrapper (duel-frame-driver.cjs, which loads the same
// shared wrapper) and the frame observer (duel-frame-observer.ts: the duel gate's observer plus a page-side recorder).
// The guest sits at Weapons and the host at the Helm; phase 1: the host flies 30 s (A/D on and off, W and S held); then
// both stand and swap; phase 2: the guest flies 25 s at the Helm. In both windows every rAF timestamp and, per drawn
// frame, the camera centre (the drawn own ship), the crew hull's screen place and three rail rocks (and a free rock if
// any) are recorded; F3's prediction line is read at each phase's end. Report only: nothing is asserted beyond the run
// completing. Results: .superpowers/net-4a/frames.json (summaries, by --run=<label>) and frames-raw-<label>.json.
// Flags: --run=<label> (default 'run'), --software (keep the shared wrapper's software renderer; default is the GPU, as
// the production app runs). Exact temporary roots are cleaned; Electron and workerd are never killed globally.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { build } from 'vite';
import { computeContentDigest } from '../../build/contentDigest';
import { INTERNAL_H, INTERNAL_W } from '../../src/shared/resolution';
import { CONTOUR_ACCELS, contourRadius, STAR_PARALLAX } from '../../src/renderer/src/render/tactical/tacticalModel';
import { startOnlineAppRuntime } from './online-app-runtime';

/** The duel app gate's test-only first seed (duel-app-smoke.ts DUEL_TEST_SEED; not imported, as that module runs its gate). */
const DUEL_TEST_SEED = 423;
const FLY_1_MS = 30000, FLY_2_MS = 25000, SETTLE_MS = 2000;
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
type Application = { child: ChildProcess; pid: number; profile: string; exited: boolean; exit: Promise<void>; request(command: string, data?: object): Promise<any>; probe(message: object): Promise<any> };
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const runLabel = arg('run') ?? 'run', gpu = !process.argv.includes('--software');
const outDir = resolve('.superpowers/net-4a');
/** The whole machine's CPU busy share since `from` (all processes: both apps, workerd, this script and anything else). */
const cpuTimes = () => cpus().map(c => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
const busySince = (from: ReturnType<typeof cpuTimes>) => { const now = cpuTimes(); let idle = 0, total = 0; now.forEach((c, i) => { idle += c.idle - from[i]!.idle; total += c.total - from[i]!.total; }); return Math.round((1 - idle / total) * 1000) / 10; };

// ---- analysis ---------------------------------------------------------------------------------------------------------
const q = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]! : NaN;
const r2 = (v: number) => Math.round(v * 100) / 100, r3 = (v: number) => Math.round(v * 1000) / 1000;
function intervals(ts: number[]) {
  const d: number[] = []; for (let i = 1; i < ts.length; i++) d.push(ts[i]! - ts[i - 1]!);
  const s = [...d].sort((a, b) => a - b);
  return { frames: ts.length, seconds: r2(ts.length ? (ts.at(-1)! - ts[0]!) / 1000 : 0), median: r2(q(s, 0.5)), p95: r2(q(s, 0.95)), p99: r2(q(s, 0.99)),
    over20: d.filter(x => x > 20).length, over33: d.filter(x => x > 33.4).length, longest: r2(s.at(-1) ?? NaN), d };
}
/** Per-frame movement regularity of a series (consecutive frames only). Moving: the local step (the neighbours' median, ±5 frames) is above eps.
 *  Backward: the step points against the local step; zero: the step is under 5 % of it. Ratios over the moving frames' steps:
 *  per frame (what each displayed frame moves), and per millisecond of each clock: the rAF timestamp (the frame's vsync) and
 *  the page clock when the frame ran (performance.now(), the clock the app's alpha and prediction read). Pops: steps whose
 *  drawn-time error (the ms of local motion the step covers, less the page ms that passed) is beyond POP_MS, back or ahead. */
function regularity(frames: number[], xs: number[], ys: number[], eps: number, clocks: Record<string, (frame: number) => number>) {
  const steps: { dx: number; dy: number; f: number }[] = [];
  for (let i = 1; i < frames.length; i++) if (frames[i] === frames[i - 1]! + 1 && Number.isFinite(xs[i]!) && Number.isFinite(xs[i - 1]!)) steps.push({ dx: xs[i]! - xs[i - 1]!, dy: ys[i]! - ys[i - 1]!, f: frames[i]! });
  let moving = 0, backward = 0, zero = 0; const mags: number[] = [], speeds: Record<string, number[]> = {}, worst: { f: number; ratio: number }[] = [], pops: { frame: number; ms: number }[] = [];
  for (const k of Object.keys(clocks)) speeds[k] = [];
  for (let i = 0; i < steps.length; i++) {
    // The neighbours' step (±5 frames, this frame's own left out), by component medians so one pop does not move it, and their median page interval.
    const nx: number[] = [], ny: number[] = [], nd: number[] = [];
    for (let j = Math.max(0, i - 5); j <= Math.min(steps.length - 1, i + 5); j++) { if (j === i || steps[j]!.f - steps[i]!.f !== j - i) continue; nx.push(steps[j]!.dx); ny.push(steps[j]!.dy); nd.push(clocks.page!(steps[j]!.f)); }
    if (!nx.length) continue;
    const med = (v: number[]) => q(v.sort((a, b) => a - b), 0.5), mx = med(nx), my = med(ny), dmed = med(nd), m = Math.hypot(mx, my);
    if (m <= eps) continue;
    moving++;
    const st = steps[i]!, along = (st.dx * mx + st.dy * my) / m, mag = Math.hypot(st.dx, st.dy);
    if (along < 0) backward++; else if (mag < 0.05 * m) zero++;
    // The drawn-time error: how many ms of the body's local motion this step covers, less the page time that passed.
    const perMs = m / dmed, err = along / perMs - clocks.page!(st.f);
    if (Number.isFinite(err) && Math.abs(err) > POP_MS) pops.push({ frame: st.f, ms: r2(err) });
    mags.push(mag); worst.push({ f: st.f, ratio: mag / m });
    for (const [k, clock] of Object.entries(clocks)) { const t = clock(st.f); if (t > 0) speeds[k]!.push(mag / t); }
  }
  const ms = [...mags].sort((a, b) => a - b), medStep = q(ms, 0.5);
  worst.sort((a, b) => b.ratio - a.ratio);
  const perMs: Record<string, { maxOverMedian: number; p99OverMedian: number } | null> = {};
  for (const [k, v] of Object.entries(speeds)) { const ss = [...v].sort((a, b) => a - b), smed = q(ss, 0.5); perMs[k] = ss.length ? { maxOverMedian: r2(ss.at(-1)! / smed), p99OverMedian: r2(q(ss, 0.99) / smed) } : null; }
  return { steps: steps.length, moving, backwardShare: moving ? r3(backward / moving) : null, zeroShare: moving ? r3(zero / moving) : null,
    backwardOrZeroShare: moving ? r3((backward + zero) / moving) : null, medianStep: r3(medStep), maxOverMedian: moving ? r2(ms.at(-1)! / medStep) : null, p99OverMedian: moving ? r2(q(ms, 0.99) / medStep) : null,
    pops: { back: pops.filter(x => x.ms < 0).length, ahead: pops.filter(x => x.ms > 0).length, largest: [...pops].sort((a, b) => Math.abs(b.ms) - Math.abs(a.ms)).slice(0, 8) },
    perMs, worstFrames: worst.slice(0, 5).map(w => ({ frame: w.f, stepOverLocalMean: r2(w.ratio) })) };
}
/** A step whose drawn-time error is beyond this (ms) is a pop: half a 60 Hz frame. */
const POP_MS = 8;
const CONTOUR_WORLD_R = CONTOUR_ACCELS.map(contourRadius);
function analyse(raw: any) {
  const raf = intervals(raw.raf), tick = intervals(raw.t), page = intervals(raw.p);
  const clocks = { raf: (f: number) => (f > 0 ? raw.t[f] - raw.t[f - 1] : NaN), page: (f: number) => (f > 0 ? raw.p[f] - raw.p[f - 1] : NaN) };
  // The camera centre, the drawn own ship's world place: the star tile offset is −centre × STAR_PARALLAX wrapped into the viewport.
  const cx: number[] = [], cy: number[] = []; let ux = 0, uy = 0;
  for (let i = 0; i < raw.sx.length; i++) {
    if (i > 0) {
      let dx = raw.sx[i] - raw.sx[i - 1], dy = raw.sy[i] - raw.sy[i - 1];
      if (dx > INTERNAL_W / 2) dx -= INTERNAL_W; if (dx < -INTERNAL_W / 2) dx += INTERNAL_W;
      if (dy > INTERNAL_H / 2) dy -= INTERNAL_H; if (dy < -INTERNAL_H / 2) dy += INTERNAL_H;
      ux += -dx / STAR_PARALLAX; uy += -dy / STAR_PARALLAX;
    }
    cx.push(ux); cy.push(uy);
  }
  // The zoom: a contour is a circle of world radius contourRadius(accel) × zoom about the planet. A rough zoom from the
  // planet's screen motion against the camera's picks which contour each drawn circle is; then zoom = r / R exactly.
  const rough: number[] = [];
  for (let i = 1; i < raw.rings.length; i++) {
    const a = raw.rings[i - 1], b = raw.rings[i], dc = Math.hypot(cx[i]! - cx[i - 1]!, cy[i]! - cy[i - 1]!);
    if (a?.length && b?.length && dc > 0.3) rough.push(Math.hypot(b[0] - a[0], b[1] - a[1]) / dc);
  }
  const zRough = q(rough.sort((x, y) => x - y), 0.5);
  const zoom: number[] = []; let zLast = Number.isFinite(zRough) ? zRough : NaN;
  for (let i = 0; i < raw.rings.length; i++) {
    const ring = raw.rings[i];
    if (ring?.length && Number.isFinite(zLast)) {
      let best = NaN, err = Infinity;
      for (const R of CONTOUR_WORLD_R) { const z = ring[2] / R, e = Math.abs(Math.log(z / zLast)); if (e < err) { err = e; best = z; } }
      if (err < 0.35) zLast = best;
    }
    zoom.push(zLast);
  }
  const zs = zoom.filter(Number.isFinite).sort((a, b) => a - b);
  const all = raw.sx.map((_: unknown, i: number) => i);
  const hullX = raw.shx.filter(Number.isFinite), hullY = raw.shy.filter(Number.isFinite);
  const spread = (v: number[]) => v.length ? r2(Math.max(...v) - Math.min(...v)) : null;
  const works = [...raw.work].sort((a: number, b: number) => a - b);
  // Main-thread tasks (duel-frame-hooks.ts) by kind, and those between two frames that ran far apart.
  const span = (raw.p.at(-1) - raw.p[0]) / 1000 || 1, kinds: Record<string, { n: number; msPerS: number; over8: number; longest: number }> = {};
  for (const [k, v] of Object.entries<any>(raw.taskTotals ?? {})) kinds[k] = { n: v.n, msPerS: r2(v.ms / span), over8: 0, longest: 0 };
  for (const [, d, k] of raw.tasks ?? []) { const e = (kinds[k] ??= { n: 0, msPerS: 0, over8: 0, longest: 0 }); if (d > 8) e.over8++; e.longest = Math.max(e.longest, r2(d)); }
  const between = (from: number, to: number) => { const out: Record<string, number> = {}; for (const [t0, d, k] of raw.tasks ?? []) if (t0 + d > from && t0 < to) out[k] = r2((out[k] ?? 0) + d); return out; };
  // The long frames: by the page clock (the frame callback ran late or long) and by rAF timestamp (a vsync missed). The
  // frame's own work (session.frame and the render) is the app's; tasks between frames are named by kind.
  const long = page.d.map((d, i) => ({ frame: i + 1, pageMs: r2(d), rafMs: r2(tick.d[i]!), workMs: r2(raw.work[i + 1]), prevWorkMs: r2(raw.work[i]),
    heapDropKb: Math.round(((raw.heap[i] ?? 0) - (raw.heap[i + 1] ?? 0)) / 1024), tasksBetween: between(raw.p[i] + raw.work[i], raw.p[i + 1]) }))
    .filter(x => x.pageMs > 20 || x.rafMs > 20).sort((a, b) => Math.max(b.pageMs, b.rafMs) - Math.max(a.pageMs, a.rafMs)).slice(0, 12);
  let heapDrops = 0; for (let i = 1; i < raw.heap.length; i++) if (raw.heap[i] < raw.heap[i - 1] - 256 * 1024) heapDrops++;
  const tracks = raw.tracks.filter((t: any) => t.frames.length >= 30).map((t: any) => {
    const wx = t.frames.map((f: number, j: number) => cx[f]! + (t.xs[j] - INTERNAL_W / 2) / zoom[f]!), wy = t.frames.map((f: number, j: number) => cy[f]! + (t.ys[j] - INTERNAL_H / 2) / zoom[f]!);
    return { id: t.id, kind: t.kind, vertices: t.n, frames: t.frames.length, firstFrame: t.frames[0], lostAt: t.lostAt, screen: regularity(t.frames, t.xs, t.ys, 0.02, clocks),
      world: zs.length ? regularity(t.frames, wx, wy, 0.01, clocks) : null };
  });
  const { d: _a, ...rafSummary } = raf, { d: _b, ...tickSummary } = tick, { d: _c, ...pageSummary } = page;
  return { label: raw.label, marks: raw.marks ?? null, raf: rafSummary, tick: tickSummary, page: pageSummary, work: { median: r2(q(works, 0.5)), p95: r2(q(works, 0.95)), p99: r2(q(works, 0.99)), max: r2(works.at(-1) ?? NaN) },
    tasks: kinds, longAnimationFrames: (raw.loaf ?? []).length, loaf: (raw.loaf ?? []).slice(0, 8),
    drawnShare: r3(raw.drew.reduce((a: number, b: number) => a + b, 0) / Math.max(1, raw.drew.length)), rocksDrawnMedian: q([...raw.rocks].sort((a: number, b: number) => a - b), 0.5),
    zoom: zs.length ? { min: r3(zs[0]!), median: r3(q(zs, 0.5)), max: r3(zs.at(-1)!) } : null, heapDropsOver256k: heapDrops, longFrames: long,
    ship: { worldTravelU: r2(Math.hypot(cx.at(-1)! - cx[0]!, cy.at(-1)! - cy[0]!)), regularity: regularity(all, cx, cy, 0.01, clocks), hullScreenSpreadPx: { x: spread(hullX), y: spread(hullY) } },
    rocks: tracks };
}
function predLine(text: string): Record<string, string> | null {
  const m = /PRED LEAD (\d+) \((\d+) MS\)\s+OK (\S+)\s+RESIM (\S+) MS\s+FIX (\S+) U\s+HDG (\S+)\s+RT (\S+)\/MIN/.exec(text ?? '');
  return m ? { lead: `${m[1]} (${m[2]} ms)`, ok: m[3]!, resimP99Ms: m[4]!, fixU: m[5]!, hdg: m[6]!, rtPerMin: m[7]! } : null;
}

// ---- the run -----------------------------------------------------------------------------------------------------------
async function main() {
  const began = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-duel-frames-'));
  const digest = computeContentDigest(process.cwd()), processes: Application[] = [];
  const deadline = new AbortController(), watchdog = setTimeout(() => deadline.abort(), 300000);
  let runtime: ReturnType<typeof startOnlineAppRuntime> | undefined, failure: string | undefined, step = 'startup';
  const result: any = { run: runLabel, renderer: gpu ? 'gpu' : 'software', startedAtIso: new Date().toISOString(), phases: [] };
  const raws: any[] = [];
  async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean, label: string, ms = 15000): Promise<T> {
    const end = performance.now() + ms;
    while (performance.now() < end) { if (deadline.signal.aborted) throw Error('launcher timeout'); const last = await read(); if (predicate(last)) return last; await delay(50); }
    throw Error(`${label} timeout`);
  }
  async function launch(profile: 'host' | 'guest'): Promise<Application> {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, FTLITE_DUEL_TEST_SEED: String(DUEL_TEST_SEED), FTLITE_ONLINE_TEST_PROBE: '1', NODE_PATH: resolve('node_modules'), FTLITE_FRAME_PROBE_GPU: gpu ? '1' : '0' };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL; delete env.FTLITE_SECTOR_ONLINE_TEST;
    const child = spawn(electron, [resolve('scripts/network/duel-frame-driver.cjs'), `--online-app-dir=${directory}`, `--online-app-role=${profile}`, `--user-data-dir=${join(directory, profile)}`],
      { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>(); let id = 0;
    const ask = (message: object, key: number) => new Promise<any>((resolve, reject) => {
      if (app.exited || !child.connected) { reject(Error('application IPC disconnected')); return; }
      const timer = setTimeout(() => { pending.delete(key); reject(Error('driver timeout')); }, 10000);
      pending.set(key, { resolve, reject, timer }); try { child.send(message); } catch { pending.delete(key); clearTimeout(timer); reject(Error('application IPC disconnected')); }
    });
    const app: Application = { child, pid: child.pid!, profile, exited: false, exit: Promise.resolve(),
      request(command, data = {}) { const key = ++id; return ask({ ...data, requestId: key, command }, key); },
      probe(message) { const key = ++id; return ask({ ...message, frameProbe: key }, key); } };
    child.on('message', (message: any) => {
      const key = message?.frameReply ?? message?.id, item = pending.get(key); if (!item || key === 0) return;
      pending.delete(key); clearTimeout(item.timer);
      if (message.frameReply !== undefined) message.error ? item.reject(Error(`frame probe: ${message.error}`)) : item.resolve(message.result);
      else message.error ? item.reject(Error(`app-driver-command-failed (${message.command}: ${message.reason})`)) : item.resolve(message.result);
    });
    child.stdout!.resume(); child.stderr!.resume();
    if (process.env.FTL_DEBUG) child.stderr!.pipe(process.stderr);
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
  const latest = (r: any) => (r.observations.at(-1)?.publications as any[] | undefined)?.reduce((a: any, p: any) => (a && a.sequence >= p.sequence ? a : p), undefined);
  const key = (app: Application, k: string, down: boolean) => app.request('key', { key: k, down });
  const press = async (app: Application, k: string, hold = 120) => { await key(app, k, true); await delay(hold); await key(app, k, false); };
  const applied = async (app: Application, seat: number): Promise<number> =>
    Math.max(0, ...((await status(app)).observations.at(-1)?.results ?? []).filter((x: any) => x.status === 'applied' && x.id.player === seat).map((x: any) => x.id.sequence as number));
  /** Walk with held keys, then press E until a sit is applied, nudging with `nudge` between tries (duel-app-smoke.ts's walkAndSit, with the nudge key a parameter). */
  async function walkAndSit(app: Application, seat: number, route: readonly (readonly [string, number])[], nudge = 'A', tries = 8): Promise<void> {
    for (const [k, ms] of route) await press(app, k, ms);
    for (let attempt = 0; attempt < tries; attempt++) {
      const before = await applied(app, seat);
      await press(app, 'E');
      try { await until(() => applied(app, seat), (n) => n > before, `${app.profile} sat`, 1500); return; }
      catch { await press(app, nudge, 150); }
    }
    throw Error(`${app.profile} could not reach its console`);
  }
  async function stand(app: Application, seat: number): Promise<void> {
    const before = await applied(app, seat); await press(app, 'X');
    await until(() => applied(app, seat), (n) => n > before, `${app.profile} stood`, 3000);
  }
  /** The pilot's pattern, repeated for `ms`: thrust (W held), turn port (A), turn starboard (D), brake (S held), coast. */
  async function fly(app: Application, ms: number): Promise<void> {
    const pattern: [string | null, number][] = [['W', 1200], [null, 400], ['A', 700], [null, 500], ['D', 1300], [null, 400], ['S', 900], [null, 600], ['A', 500], ['W', 600], [null, 900]];
    const end = performance.now() + ms;
    for (let i = 0; performance.now() < end; i = (i + 1) % pattern.length) {
      const [k, hold] = pattern[i]!, left = end - performance.now(), h = Math.min(hold, left);
      if (k) { await key(app, k, true); await delay(h); await key(app, k, false); } else await delay(h);
    }
  }
  async function measure(label: string, pilot: Application, apps: Application[], ms: number) {
    for (const app of apps) if (!(await app.probe({ eval: `window.__frameProbe.start(${JSON.stringify(label)}, ${INTERNAL_W}, ${INTERNAL_H})` }))) throw Error(`${app.profile} has no tactical layer to hook`);
    const t0 = latest(await status(pilot)), cpu0 = cpuTimes();
    await delay(SETTLE_MS);   // recorded before the first key: a pop here is not the pilot's input
    for (const app of apps) await app.probe({ eval: `window.__frameProbe.mark('fly')` });
    await fly(pilot, ms);
    const cpuBusyPct = busySince(cpu0);
    const recs = [];
    for (const app of apps) recs.push(await app.probe({ eval: 'window.__frameProbe.stop()', ms: 15000 }));
    const t1 = latest(await status(pilot));
    // F3's prediction line on each window (shown for a moment only: the overlay is a React update every frame).
    const pred: Record<string, unknown> = {};
    for (const app of apps) {
      await press(app, 'F3'); await delay(800);
      // The overlay's lines are PixelText canvases, each carrying its text in data-text (ui/stage/PixelText.tsx).
      const lines: string[] = await app.probe({ eval: `[...document.querySelectorAll('canvas[data-text]')].map((c) => c.dataset.text).filter((t) => /^(LATENCY|HELD|CMD|RTT|PRED)/.test(t))` });
      pred[app.profile] = { parsed: predLine(lines.find((l) => l.startsWith('PRED')) ?? ''), lines };
      await press(app, 'F3');
    }
    const windows: Record<string, unknown> = {};
    apps.forEach((app, i) => { raws.push({ phase: label, window: app.profile, ...recs[i] }); windows[app.profile] = { ...analyse(recs[i]), f3: pred[app.profile] ?? null }; });
    result.phases.push({ label, pilot: pilot.profile, ms, ticks: [t0?.tick, t1?.tick], outcome: t1?.outcome, round: t1?.round, phase: t1?.phase, speed: r2(t1?.speed ?? NaN), cpuBusyPct, windows });
  }
  try {
    runtime = startOnlineAppRuntime(directory, digest, deadline.signal);
    await runtime.ready;
    await build({ configFile: false, envDir: false, logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(directory, 'observer'), emptyOutDir: false, lib: { entry: resolve('scripts/network/duel-frame-observer.ts'), name: 'DuelFrameObserver', formats: ['iife'], fileName: () => 'observer.js' } } });
    writeFileSync(join(directory, 'observer', 'utility.cjs'), 'module.exports = { reconciledMemory: () => null };\n');
    const h = await launch('host'), g = await launch('guest');
    step = 'display';
    result.display = await h.probe({ display: true });
    const wa = result.display.primary.workArea, hb = result.display.window.bounds;
    await h.probe({ place: { x: wa.x, y: wa.y } }); await g.probe({ place: { x: Math.max(wa.x, wa.x + wa.width - hb.width), y: wa.y } });
    result.windows = { host: await h.probe({ display: true }).then((d: any) => d.window), guest: await g.probe({ display: true }).then((d: any) => d.window) };
    step = 'lobby';
    await h.request('open-multiplayer'); await h.request('click', { id: 'host' }); await h.request('click', { id: 'crew-2' }); await h.request('click', { id: 'create-room' });
    const lobby = await phase(h, 'lobby');
    await g.request('open-multiplayer'); await g.request('click', { id: 'join' }); await g.request('type', { id: 'join-code', text: lobby.status.snapshot.joinCode }); await g.request('click', { id: 'join-room' });
    await phase(g, 'lobby');
    await h.request('click', { id: 'ready' }); await g.request('click', { id: 'ready' });
    await until(() => status(h), (r: any) => r.status.actions.includes('start'), 'both ready');
    await h.request('click', { id: 'start' });
    await phase(h, 'running', 20000); await phase(g, 'running', 20000);
    await until(() => status(g), (r: any) => latest(r)?.seed === DUEL_TEST_SEED, 'guest sees the round start');
    step = 'seating';
    // Both start standing in the mid room (Q). The guest takes Weapons (19,5) first (the smoke's Weapons route), then the
    // host goes right to the cockpit's back wall beside the Helm (20,7).
    await walkAndSit(g, 1, [['D', 3000], ['W', 1500], ['A', 300]]);
    await walkAndSit(h, 0, [['D', 3000]]);
    step = 'phase 1';
    await measure('host-helm', h, [h, g], FLY_1_MS);
    step = 'swap';
    // The guest stands and goes down the cockpit to its bottom wall and right; the host stands, goes up and left to Weapons;
    // the guest then steps up to the Helm.
    await stand(g, 1); await press(g, 'S', 1500); await press(g, 'D', 1500);
    await stand(h, 0); await walkAndSit(h, 0, [['W', 1500], ['A', 300]], 'A');
    await walkAndSit(g, 1, [], 'W', 12);
    step = 'phase 2';
    await measure('guest-helm', g, [h, g], FLY_2_MS);
  } catch (error) { failure = `${step}: ${String((error as Error)?.message ?? error).slice(0, 200)}`; }
  finally {
    clearTimeout(watchdog);
    for (const app of processes) if (!app.exited) { try { await Promise.race([app.request('shutdown'), delay(6000)]); } catch { /* forced below */ } await kill(app); }
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-duel-frames-')) throw Error('invalid exact cleanup target');
    try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { failure ??= 'exact temporary cleanup failed'; }
  }
  result.failure = failure ?? null; result.elapsedMs = Math.ceil(performance.now() - began);
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, 'frames.json');
  const all: any = existsSync(file) ? (() => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } })() : {};
  all.version = 1; all.runs = { ...(all.runs ?? {}), [runLabel]: result };
  writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
  writeFileSync(join(outDir, `frames-raw-${runLabel}.json`), JSON.stringify(raws));
  // The summary table.
  const rows: string[] = [];
  rows.push(`run ${runLabel} (${result.renderer}; display ${result.display?.primary?.frequency ?? '?'} Hz; CPU busy ${result.phases.map((p: any) => p.cpuBusyPct + '%').join(' / ')})`);
  rows.push('phase      window frames  med  p95  p99 >20 >33 longest | page>20 >33 longest | ship b/z max/med p99/med(page) pops back/ahead | rocks (world) b/z max/med pops | F3');
  for (const p of result.phases) for (const [w, s] of Object.entries<any>(p.windows)) {
    const rk = s.rocks.slice(0, 4).map((r: any) => { const m = r.world ?? r.screen; return `${r.kind[0]}${r.id}:${m.backwardOrZeroShare}/${m.maxOverMedian}/${m.pops.back}b${m.pops.ahead}a`; }).join(' ');
    const f = s.f3?.parsed, f3 = f ? `lead ${f.lead} ok ${f.ok} resim ${f.resimP99Ms} fix ${f.fixU} hdg ${f.hdg} rt ${f.rtPerMin}` : '-', sr = s.ship.regularity;
    rows.push(`${p.label.padEnd(10)} ${w.padEnd(6)} ${String(s.raf.frames).padStart(5)} ${String(s.raf.median).padStart(4)} ${String(s.raf.p95).padStart(4)} ${String(s.raf.p99).padStart(5)} ${String(s.raf.over20).padStart(3)} ${String(s.raf.over33).padStart(3)} ${String(s.raf.longest).padStart(6)} | ${String(s.page.over20).padStart(4)} ${String(s.page.over33).padStart(3)} ${String(s.page.longest).padStart(6)} | ${sr.backwardOrZeroShare} ${sr.maxOverMedian} ${sr.perMs?.page?.p99OverMedian} ${sr.pops.back}/${sr.pops.ahead} | ${rk} | ${f3}`);
  }
  console.log(rows.join('\n'));
  if (failure) throw Error(failure);
  console.log(`DUEL FRAME PROBE DONE (${result.elapsedMs} ms)`);
}
main().catch(error => { console.error(`DUEL FRAME PROBE FAIL: ${String((error as Error)?.message ?? error).slice(0, 300)}`); process.exitCode = 1; });
