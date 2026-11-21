// Asteroids-iii screenshots (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §8.4): single player at Weapons on
// the CRT map, staged through the solo hook globalThis.__spikeAsteroids (app/duel/duelMode.ts; set only behind the __FTLITE_STAGE__ flag, which this script sets). Usage: install
// playwright-core@1.48.2 in a scratch folder, copy this file there, run `npm run build` in the worktree, then
// `node spike-asteroids-iii-shots.cjs [out dir] [worktree]`. Shots: the belt at 0 and 120 s; a burst at 0, 2, 10 and 30 s;
// worn rocks at wear 0.25, 0.5 and 1 (seams since asteroids-iv); a laser cut at 0, 3 and 15 s (asteroids-iv). The crew is pinned co-rotating with the main lane, 300 u outward of its target.
const { _electron } = require('playwright-core');
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
(async () => {
  const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/asteroids-iii';
  const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/asteroids-iii';
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ast3-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: [root, `--user-data-dir=${profile}`], env });
  await app.context().addInitScript(() => { globalThis.__FTLITE_STAGE__ = true; });   // the staging hooks exist only behind this flag (app/duel/duelMode.ts)
  const page = await app.firstWindow();
  await page.evaluate(() => { globalThis.__FTLITE_STAGE__ = true; });   // the first window may have loaded before the init script: set it before the duel begins
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
  await page.click('[data-testid="ship-hound"]'); await page.waitForTimeout(2500);   // the ship picker: the Hound
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(800);
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
  const zoom = async (n, key) => { for (let z = 0; z < n; z++) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(150); } };
  // Pin the crew `gap` u outward of main-lane rock `pick` (the largest, or the middle of three neighbours), turning with the
  // main lane (ω(1200)) from the tick it was staged, on a circular velocity; the Hunter pinned far off. Returns the rock.
  const stage = (opts) => page.evaluate(({ gap, triple }) => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical, m = t.map, lo = m.laneSizes[0], hi = lo + m.laneSizes[1], rails = [];
    for (let k = lo; k < hi; k++) { const a = h.rockAt(t, k); if (a.kind === 1) rails.push({ k, ...a, ang: Math.atan2(a.y, a.x) }); }
    let pick;
    if (triple) { rails.sort((p, q) => p.ang - q.ang); let bestGap = Infinity; for (let i = 1; i + 1 < rails.length; i++) { const g = rails[i + 1].ang - rails[i - 1].ang; if (g < bestGap) { bestGap = g; pick = rails[i]; } } }
    else { rails.sort((p, q) => q.r - p.r); pick = rails[0]; }
    const w = Math.sqrt(2.5e6 / Math.pow(1200 * 1200 + 400, 1.5)), tick0 = t.tick, d = Math.hypot(pick.x, pick.y), R = d + gap, a0 = Math.atan2(pick.y, pick.x);
    const heading = (x, y) => ((Math.round((Math.atan2(pick.x - x, -(pick.y - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
    clearInterval(globalThis.__pin);
    const pin = () => {
      const tt = h.duel().tactical, ang = a0 + w * (tt.tick - tick0) / 60, x = Math.cos(ang) * R, y = Math.sin(ang) * R, wr = Math.sqrt(2.5e6 / Math.pow(R * R + 400, 1.5));
      Object.assign(tt.ships[0], { x, y, vx: -wr * y, vy: wr * x, heading: heading(x, y), headingAcc: 0 });
      Object.assign(tt.ships[1], { x: -x, y: -y, vx: 0, vy: 0 });
    };
    pin(); globalThis.__pin = setInterval(pin, 5);
    globalThis.__triple = triple ? rails.filter((r) => Math.abs(r.ang - pick.ang) < 0.2).map((r) => r.k) : [];
    return { rock: pick.k, r: pick.r };
  }, opts);
  const read = (key) => page.evaluate((k) => globalThis.__spikeAsteroids.duel().tactical[k], key);
  const waitMore = (key, from, ms = 15000) => page.waitForFunction(([k, f]) => globalThis.__spikeAsteroids.duel().tactical[k] > f, [key, from], { polling: 16, timeout: ms });

  // belt-000s, belt-120s: the turning belt (zoomed out to the whole belt).
  await stage({ gap: 300, triple: false });
  await zoom(4, 'Minus'); await page.waitForTimeout(500); await shot('belt-000s');
  await page.waitForTimeout(120000); await shot('belt-120s');
  await zoom(4, 'Equal');
  // burst-00s .. burst-30s: a rock-targeted torpedo on the largest main-lane rock.
  const b = await stage({ gap: 300, triple: false });
  const blasts0 = await read('rockBlasts');
  await page.evaluate((k) => { const s = globalThis.__spikeAsteroids.duel().tactical.systems[0]; s.laserRock = -1; s.torpLock = -1; s.torpRock = k; }, b.rock);
  await waitMore('rockBlasts', blasts0); await page.waitForTimeout(100); await shot('burst-00s');
  await page.waitForTimeout(2000); await shot('burst-02s');
  await page.waitForTimeout(8000); await shot('burst-10s');
  await page.waitForTimeout(20000); await shot('burst-30s');
  // cracks: three neighbouring main-lane rocks at wear 0.25, 0.5 and 1 (hp = hpMax · (1 − wear), wear 1 as hp 0.001).
  await stage({ gap: 150, triple: true });
  await page.evaluate(() => {
    const t = globalThis.__spikeAsteroids.duel().tactical;
    globalThis.__triple.slice(0, 3).forEach((k, i) => { const r = t.rocks[k * 8 + 5], max = Math.ceil(r / 10), wear = [0.25, 0.5, 1][i]; t.rocks[k * 8 + 6] = Math.max(0.001, max * (1 - wear)); });
  });
  await zoom(6, 'Equal'); await page.waitForTimeout(600); await shot('cracks-025-050-100');
  // asteroids-iv: a laser cut through the middle of the largest main-lane rock, then a torpedo's direct hit on another
  const c = await stage({ gap: 200, triple: false });
  await page.evaluate((k) => { const h = globalThis.__spikeAsteroids, t = h.duel().tactical, a = h.rockAt(t, k); h.beginRockTick(t); h.breakRock(t, k, a.x, a.y, 0, 1, 'laser', 0, 'cut'); h.beginRockTick(t); }, c.rock);
  await page.waitForTimeout(150); await shot('cut-00s'); await page.waitForTimeout(3000); await shot('cut-03s'); await page.waitForTimeout(12000); await shot('cut-15s');
  await page.evaluate(() => clearInterval(globalThis.__pin));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
