// Asteroids-iii renderer frame-time check (owner request 2026-11-19): the real app, single player at Weapons on the map. A quiet
// scene (the untouched belt) and a busy one (script-side torpedo bursts, `breakRock(..., 'torpedo', 0, 'shatter')`, on the rocks
// nearest the crew, 0.5 s apart, so there are many free rocks, trails and shards). Frame times are requestAnimationFrame deltas
// in the page. Usage: playwright-core@1.48.2 in a scratch folder, `npm run build` in the worktree, then
// `node spike-asteroids-iii-frames.cjs [seconds per scene] [worktree] [json out]` (CPU_THROTTLE=4 slows the page 4x). The rAF delta is locked to the display's refresh when the page keeps up, so the numbers read as headroom only against that refresh interval. Reads the hooks __spikeAsteroids and
// __spikeAsteroidsFx (app/duel/scene.ts), both set only behind the __FTLITE_STAGE__ flag, which this script sets. Report only; nothing is tuned.
const { _electron } = require('playwright-core');
const { mkdtempSync, writeFileSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
(async () => {
  const throttle = Number(process.env.CPU_THROTTLE || 1), secs = Number(process.argv[2] || 12), root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/asteroids-iii', jsonOut = process.argv[4] || '';
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ast3f-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: [root, `--user-data-dir=${profile}`], env });
  await app.context().addInitScript(() => { globalThis.__FTLITE_STAGE__ = true; });   // the staging hooks exist only behind this flag (app/duel/duelMode.ts)
  const page = await app.firstWindow();
  await page.evaluate(() => { globalThis.__FTLITE_STAGE__ = true; });   // the first window may have loaded before the init script: set it before the duel begins
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.waitForTimeout(2500);
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
  await page.click('[data-testid="ship-hound"]'); await page.waitForTimeout(2500);   // the ship picker: the Hound
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(800);
  // Pin the crew 300 u outward of the largest main-lane rock, co-rotating with the lane (as the shots script does).
  await page.evaluate(() => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical, m = t.map, lo = m.laneSizes[0], hi = lo + m.laneSizes[1], rails = [];
    for (let k = lo; k < hi; k++) { const a = h.rockAt(t, k); if (a.kind === 1) rails.push({ k, ...a }); }
    rails.sort((p, q) => q.r - p.r); const pick = rails[0];
    const w = Math.sqrt(2.5e6 / Math.pow(1200 * 1200 + 400, 1.5)), tick0 = t.tick, R = Math.hypot(pick.x, pick.y) + 300, a0 = Math.atan2(pick.y, pick.x);
    const heading = (x, y) => ((Math.round((Math.atan2(pick.x - x, -(pick.y - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
    const pin = () => {
      const tt = h.duel().tactical, ang = a0 + w * (tt.tick - tick0) / 60, x = Math.cos(ang) * R, y = Math.sin(ang) * R, wr = Math.sqrt(2.5e6 / Math.pow(R * R + 400, 1.5));
      Object.assign(tt.ships[0], { x, y, vx: -wr * y, vy: wr * x, heading: heading(x, y), headingAcc: 0 });
      Object.assign(tt.ships[1], { x: -x, y: -y, vx: 0, vy: 0 });
    };
    pin(); globalThis.__pin = setInterval(pin, 5);
    // the recorder: rAF deltas; the census counts live rocks, free rocks and fx items
    globalThis.__rec = { on: false, dts: [], last: 0 };
    const loop = (ts) => { const r = globalThis.__rec; if (r.on) { if (r.last) r.dts.push(ts - r.last); r.last = ts; } else r.last = 0; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    globalThis.__census = () => { const tt = h.duel().tactical, n = h.rockSlots(tt); let live = 0, free = 0; for (let k = 0; k < n; k++) { const kind = tt.rocks[k * 8]; if (kind !== 0) live++; if (kind === 2) free++; } return { live, free, fx: globalThis.__spikeAsteroidsFx ? globalThis.__spikeAsteroidsFx.items.length : -1 }; };
  });
  if (throttle > 1) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); console.log('cpu throttle', throttle); }   // optional: CPU_THROTTLE=4 slows the page 4x, for headroom
  const record = async (label, during) => {
    await page.evaluate(() => { globalThis.__rec.dts = []; globalThis.__rec.on = true; });
    const t0 = Date.now(), peak = { live: 0, free: 0, fx: 0 }; let atEnd = null;
    if (during) await during();
    while (Date.now() - t0 < secs * 1000) { await page.waitForTimeout(100); const c = await page.evaluate(() => globalThis.__census()); for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], c[k]); atEnd = c; }
    const dts = await page.evaluate(() => { globalThis.__rec.on = false; return globalThis.__rec.dts; });
    const s = [...dts].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const res = { label, seconds: secs, frames: dts.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], over16_7: dts.filter((d) => d > 16.7).length / dts.length, peak, atEnd };
    console.log(JSON.stringify(res)); return res;
  };
  const quiet = await record('quiet');
  // Busy: bursts on the 7 rocks (r >= 20) nearest the crew, 0.5 s apart, then the scene plays out for the rest of the window.
  const busy = await record('busy', async () => {
    const ks = await page.evaluate(() => {
      const h = globalThis.__spikeAsteroids, t = h.duel().tactical, s0 = t.ships[0], n = h.rockSlots(t), c = [];
      for (let k = 0; k < n; k++) { const a = h.rockAt(t, k); if (a.kind !== 0 && a.r >= 20) c.push({ k, d: Math.hypot(a.x - s0.x, a.y - s0.y) }); }
      c.sort((p, q) => p.d - q.d); return c.slice(0, 7).map((x) => x.k);
    });
    for (const k of ks) {
      // The step resets `tactical.events` at the start of every tick, so a break made between ticks would show no fx. An accessor
      // on the state carries the break's events into the next tick's fresh array, as if a torpedo had landed in that tick.
      await page.evaluate((kk) => {
        const h = globalThis.__spikeAsteroids, t = h.duel().tactical, a = h.rockAt(t, kk);
        if (!globalThis.__carry) { globalThis.__carry = []; let cur = t.events; Object.defineProperty(t, 'events', { configurable: true, enumerable: true, get: () => cur, set: (v) => { cur = v; if (globalThis.__carry.length) { for (const e of globalThis.__carry) v.push(e); globalThis.__carry.length = 0; } } }); }
        const n0 = t.events.length; h.breakRock(t, kk, a.x, a.y, -a.x, -a.y, 'torpedo', 0, 'shatter'); h.beginRockTick(t);
        for (const e of t.events.slice(n0)) globalThis.__carry.push(e);
      }, k);
      await page.waitForTimeout(500);
    }
  });
  await page.evaluate(() => clearInterval(globalThis.__pin));
  console.log('errors', JSON.stringify(errs.slice(0, 5)));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ quiet, busy }, null, 1));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
