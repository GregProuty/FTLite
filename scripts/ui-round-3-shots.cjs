// UI round Part 3 screenshots (the look; plan Task 7). Single player Hound at 1280x720 with the Hunter pinned close, hostile and
// its laser kept charged, so it fires on the crew ship: a burst of ship-view frames (shots flying in, the shield shimmer, a
// layer drop, hull hits), the Helm map with the own ship window, and Weapons with the enemy window scanned (Level 2) and
// unscanned (Level 0). Usage: install playwright-core@1.48.2 in a scratch folder, run `npx electron-vite build` in the
// worktree, then `node scripts/ui-round-3-shots.cjs [out dir] [worktree] [playwright-core dir]`. Follows ui-round-2b-shots.cjs.
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/ui-round-3';
const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/ui-round-3';
const { _electron } = require(process.argv[4] || 'playwright-core');

(async () => {
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ur3-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root, `--user-data-dir=${profile}`], env });
  await app.context().addInitScript(() => { globalThis.__FTLITE_STAGE__ = true; });
  const page = await app.firstWindow();
  await page.evaluate(() => { globalThis.__FTLITE_STAGE__ = true; });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setFullScreen(false); w.setContentSize(1280, 720); w.setPosition(0, 0); });
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
  const tap = async (key, hold = 60) => { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(400); };
  const seatAt = (which) => page.evaluate((k) => { const h = globalThis.__spikeAsteroids, d = h.duel(), w = d.weapons; d.weapons = d[k]; try { h.seatWeapons(); } finally { d.weapons = w; } }, which);
  // The Hunter 320 px off the crew ship's nose, facing it, hostile, laser kept near full; `level` the crew's scan of it.
  const pin = (level) => page.evaluate((lv) => {
    const d = globalThis.__spikeAsteroids.duel;
    clearInterval(globalThis.__pin);
    globalThis.__pin = setInterval(() => {
      const t = d().tactical, a = t.ships[0], e = t.ships[1];
      Object.assign(e, { x: a.x + 320, y: a.y - 60, vx: a.vx, vy: a.vy });
      if (t.hostileAt < 0) t.hostileAt = t.tick;
      t.known[0] = lv;
      const s = t.systems[1]; if (s.laserCharge !== undefined) s.laserCharge = Math.max(s.laserCharge, 1e6);
      const c = t.systems[0]; if (c.hull < 20) c.hull = 60;
      if (globalThis.__keepShields && c.shields < 2) c.shields = 2;   // the ship-view burst: layers stay up, so hits shimmer on the bubble
    }, 5);
  }, level);
  const unpin = () => page.evaluate(() => clearInterval(globalThis.__pin));

  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
  await page.click('[data-testid="ship-hound"]'); await page.waitForTimeout(3000);
  await pin(2);
  await seatAt('nav'); await page.waitForTimeout(4800);
  await shot('helm-own-ship');
  await tap('Tab'); await page.waitForTimeout(800);
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(400);
  await tap('KeyT'); await page.waitForTimeout(500);
  await shot('weapons-window-scanned');
  for (let k = 0; k < 6; k++) { await page.waitForTimeout(250); await shot(`weapons-window-${String(k).padStart(2, '0')}`); }
  await pin(0); await page.waitForTimeout(400);
  await shot('weapons-window-unscanned');
  await tap('Escape'); await page.waitForTimeout(300);
  await pin(2);
  await tap('KeyX'); await page.waitForTimeout(1000);
  for (let k = 0; k < 20; k++) { await shot(`ship-${String(k).padStart(2, '0')}`); await page.waitForTimeout(60); }
  await page.evaluate(() => { globalThis.__keepShields = true; }); await page.waitForTimeout(600);
  for (let k = 0; k < 30; k++) { await shot(`ship-shield-${String(k).padStart(2, '0')}`); await page.waitForTimeout(40); }
  await unpin();
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
