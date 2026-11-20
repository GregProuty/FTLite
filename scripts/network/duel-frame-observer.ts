// TEST ONLY: injected by the duel frame probe (scripts/network/duel-frame-probe.ts), never imported by product. It is the
// duel app gate's passive observer (duel-app-observer.ts, unchanged) plus a frame recorder. Before any page script runs it
// sets Pixi's own init hook (globalThis.__PIXI_APP_INIT__, which pixi.js v8 calls from Application.init) to keep the app,
// then, when armed by the probe, records for every drawn frame: the rAF timestamp (a raw rAF loop and the Pixi ticker's
// time), the frame's work time (the first ticker listener to the last, after the render), and what the tactical layer drew:
// the star tile's offset (the camera centre: tacticalModel.starOffset is -centre x STAR_PARALLAX, wrapped), the crew hull's
// first polygon and every rock polygon (Graphics.poly wrapped on the two layer instances; a rock's vertex mean is its
// centre to within a slow spin wobble). Rocks are tracked in the page so only the tracked bodies leave it.
import { observerWindow, taskLog } from './duel-frame-hooks';
import './duel-app-observer';

// After the duel observer's test-port listener: a 'message' listener added from now on is the game's (duel-frame-hooks.ts).
window.addEventListener('ftlite:online:test-port', () => { observerWindow.open = false; });

type Pt = { x: number; y: number };
type Poly = { x: number; y: number; n: number; r: number; free: boolean };
type Track = { id: number; kind: 'rail' | 'free'; n: number; r: number; last: Pt; step: Pt; frames: number[]; xs: number[]; ys: number[]; lostAt: number | null };
const target = globalThis as any;
const probe: any = { app: null, armed: false };
target.__PIXI_APP_INIT__ = (app: unknown) => { probe.app ??= app; };

// The raw rAF loop: every timestamp while armed, whatever Pixi does.
const raf: number[] = [];
const loop = (ts: number) => { if (probe.armed) raf.push(ts); requestAnimationFrame(loop); };
requestAnimationFrame(loop);

const isGraphics = (o: any) => !!o && typeof o.poly === 'function' && typeof o.clear === 'function' && !!o.context;
type Layer = { bodies: any; ships: any; stars: any; contours: any; rings: number[]; polys: Poly[]; ship: Poly | null; drew: boolean; draws: number; pathPoints: number; freeHint: boolean };
// Every container shaped like the tactical layer's bloom is hooked; the frame reads the one that drew (the most draws so far).
let layers: Layer[] = [], current: Layer | null = null;
function polyOf(points: number[]): Poly {
  let sx = 0, sy = 0; const n = points.length / 2;
  for (let i = 0; i < points.length; i += 2) { sx += points[i]!; sy += points[i + 1]!; }
  const x = sx / n, y = sy / n; let rr = 0;
  for (let i = 0; i < points.length; i += 2) rr += Math.hypot(points[i]! - x, points[i + 1]! - y);
  return { x, y, n, r: rr / n, free: false };
}
function hookLayer(bloom: any): void {
  if (layers.some((l) => l.bodies === bloom.children[4])) return;
  const [, stars, , contours, bodies, , ships] = bloom.children;
  const proto = Object.getPrototypeOf(bodies), L: Layer = { bodies, ships, stars, contours, rings: [], polys: [], ship: null, drew: false, draws: 0, pathPoints: 0, freeHint: false };
  bodies.clear = function (...a: any[]) { L.polys = []; L.drew = true; L.draws++; L.pathPoints = 0; L.freeHint = false; return proto.clear.apply(this, a); };
  // A free rock's trail is one path of a moveTo and several lineTo calls just before its polygon (tacticalLayer.ts §7.1).
  bodies.moveTo = function (...a: any[]) { L.pathPoints = 1; return proto.moveTo.apply(this, a); };
  bodies.lineTo = function (...a: any[]) { if (L.pathPoints > 0 && ++L.pathPoints >= 3) L.freeHint = true; return proto.lineTo.apply(this, a); };
  bodies.poly = function (points: number[], ...a: any[]) {
    if (Array.isArray(points) && points.length >= 6) { const p = polyOf(points); p.free = L.freeHint; L.polys.push(p); }
    L.freeHint = false; L.pathPoints = 0;
    return proto.poly.call(this, points, ...a);
  };
  // The planet's acceleration contours: circles about the planet's screen place, of world radius contourRadius(accel) x zoom.
  contours.clear = function (...a: any[]) { L.rings = []; return proto.clear.apply(this, a); };
  contours.circle = function (x: number, y: number, r: number, ...a: any[]) { if (L.rings.length < 9) L.rings.push(x, y, r); return proto.circle.call(this, x, y, r, ...a); };
  ships.clear = function (...a: any[]) { L.ship = null; return proto.clear.apply(this, a); };
  ships.poly = function (points: number[], ...a: any[]) { if (!L.ship && Array.isArray(points) && points.length >= 6) L.ship = polyOf(points); return proto.poly.call(this, points, ...a); };
  layers.push(L);
}
function hook(): boolean {
  const root = probe.app?.stage; if (!root) return false;
  const stack = [root];
  while (stack.length) {
    const c = stack.pop(), k = c?.children ?? [];
    if (k.length >= 11 && k.slice(0, 11).every(isGraphics)) hookLayer(c);
    for (const child of k) stack.push(child);
  }
  return layers.length > 0;
}

let rec: any = null, tracks: Track[] = [], nextId = 1, frameIndex = 0, workStart = 0;
const VIEW_MARGIN = 60;
function pickTracks(polys: Poly[], w: number, h: number): void {
  const live = tracks.filter((t) => t.lostAt === null);
  const taken = new Set<Poly>();
  const inView = (p: Poly) => p.x > VIEW_MARGIN && p.x < w - VIEW_MARGIN && p.y > VIEW_MARGIN && p.y < h - VIEW_MARGIN && p.r >= 4;
  const want = (kind: 'rail' | 'free', count: number) => {
    const have = live.filter((t) => t.kind === kind).length;
    if (have >= count) return;
    const near = (p: Poly) => live.some((t) => Math.hypot(t.last.x - p.x, t.last.y - p.y) < 3 * (t.r + p.r));
    const candidates = polys.filter((p) => inView(p) && p.free === (kind === 'free') && !taken.has(p) && !near(p)).sort((a, b) => b.r - a.r);
    for (const p of candidates.slice(0, count - have)) {
      taken.add(p);
      const t: Track = { id: nextId++, kind, n: p.n, r: p.r, last: { x: p.x, y: p.y }, step: { x: 0, y: 0 }, frames: [frameIndex], xs: [p.x], ys: [p.y], lostAt: null };
      tracks.push(t); live.push(t);
    }
  };
  want('rail', 3); want('free', 1);
}
function trackFrame(polys: Poly[]): void {
  const used = new Set<Poly>();
  for (const t of tracks) {
    if (t.lostAt !== null) continue;
    const px = t.last.x + t.step.x, py = t.last.y + t.step.y, gate = 6 + 2 * Math.hypot(t.step.x, t.step.y);
    let best: Poly | null = null, bestD = Infinity;
    for (const p of polys) {
      if (used.has(p) || p.n !== t.n || Math.abs(p.r - t.r) > 0.3 * t.r + 1) continue;
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best || bestD > gate) { t.lostAt = frameIndex; continue; }
    used.add(best);
    t.step = { x: best.x - t.last.x, y: best.y - t.last.y }; t.last = { x: best.x, y: best.y }; t.r = best.r;
    t.frames.push(frameIndex); t.xs.push(best.x); t.ys.push(best.y);
  }
}
function onFrameStart(): void { workStart = performance.now(); }
function onFrameEnd(): void {
  if (!rec) return;
  if (frameIndex % 120 === 0) hook();   // a layer added after the start is hooked too
  const ticker = probe.app.ticker, now = performance.now();
  const drew = layers.filter((l) => l.drew).sort((a, b) => b.draws - a.draws)[0] ?? null;
  if (drew) current = drew;
  const L = current;
  rec.t.push(ticker.lastTime); rec.p.push(workStart); rec.rings.push(L ? L.rings.slice() : []); rec.work.push(now - workStart); rec.drew.push(drew ? 1 : 0);
  rec.sx.push(L ? L.stars.position.x : NaN); rec.sy.push(L ? L.stars.position.y : NaN);
  rec.shx.push(L?.ship ? L.ship.x : NaN); rec.shy.push(L?.ship ? L.ship.y : NaN);
  rec.rocks.push(L ? L.polys.length : 0); rec.heap.push((performance as any).memory?.usedJSHeapSize ?? 0);
  if (drew) { trackFrame(drew.polys); pickTracks(drew.polys, rec.w, rec.h); }
  else for (const t of tracks) if (t.lostAt === null) { t.frames.push(frameIndex); t.xs.push(t.last.x); t.ys.push(t.last.y); }   // nothing redrawn: the same picture again
  for (const l of layers) l.drew = false;
  frameIndex++;
}
let tickerAdded = false;
probe.start = (label: string, w: number, h: number): boolean => {
  if (!hook()) return false;
  if (!tickerAdded) {   // first of all listeners, and after the render (Pixi's render is UPDATE_PRIORITY.LOW, -25)
    probe.app.ticker.add(onFrameStart, null, 1000); probe.app.ticker.add(onFrameEnd, null, -1000); tickerAdded = true;
  }
  raf.length = 0; tracks = []; nextId = 1; frameIndex = 0; for (const l of layers) l.drew = false;
  rec = { label, w, h, startedAt: performance.now(), t: [], work: [], drew: [], sx: [], sy: [], shx: [], shy: [], rocks: [], heap: [], p: [], rings: [] };
  taskLog.tasks = []; taskLog.totals = {}; taskLog.loaf = []; taskLog.armed = true;
  probe.armed = true;
  return true;
};
probe.stop = () => {
  probe.armed = false; taskLog.armed = false;
  const out = { ...rec, tasks: taskLog.tasks, taskTotals: taskLog.totals, loaf: taskLog.loaf, layers: layers.map((l) => ({ draws: l.draws, children: l.bodies.parent?.children?.length ?? 0 })), raf: raf.slice(), tracks: tracks.map(({ id, kind, n, frames, xs, ys, lostAt }) => ({ id, kind, n, frames, xs, ys, lostAt })), memory: (performance as any).memory ? { used: (performance as any).memory.usedJSHeapSize, total: (performance as any).memory.totalJSHeapSize } : null };
  rec = null; raf.length = 0; tracks = [];
  return out;
};
probe.ready = () => hook();
/** A named frame index (the probe marks the first key), kept in the record. */
probe.mark = (name: string): number => { if (rec) (rec.marks ??= {})[name] = frameIndex; return frameIndex; };
target.__frameProbe = probe;
