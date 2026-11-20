// UI round Part 1 screenshots (docs/superpowers/specs/2026-11-20-ui-round-design.md §1; plan Task 10). Single player on the
// Hound at a 1280x720 window: the Helm with the grid off, Weapons with no torpedo ring, Weapons paused with the enemy window
// open, the ship view paused, the FPS corner, and Settings. Usage: install playwright-core@1.48.2 in a scratch folder, run
// `npx electron-vite build` in the worktree, then `node scripts/ui-round-1-shots.cjs [out dir] [worktree] [playwright-core dir]`.
// The launch and the Single player start follow scripts/spike-asteroids-iii-shots.cjs (the staging flag, the ship picker).
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/ui-round-1';
const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/ui-round-1';
const { _electron } = require(process.argv[4] || 'playwright-core');
(async () => {
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ur1-'));   // a fresh profile: Settings at their defaults (Map grid Off, FPS counter on)
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root, `--user-data-dir=${profile}`], env });
  await app.context().addInitScript(() => { globalThis.__FTLITE_STAGE__ = true; });
  const page = await app.firstWindow();
  await page.evaluate(() => { globalThis.__FTLITE_STAGE__ = true; });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setFullScreen(false); w.setContentSize(1280, 720); w.center(); });
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  const shot = async (name, clip) => { await page.screenshot({ path: `${out}/${name}.png`, ...(clip ? { clip } : {}) }); console.log('shot', name, JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight]))); };
  const tap = async (key, hold = 60) => { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(400); };
  const seat = () => page.evaluate(() => { const r = globalThis.__ftliteDuel, d = r.duel, me = r.active(), occ = d.interior.stations.occupant; return { me, nav: occ[d.nav], weapons: occ[d.weapons] }; });

  // 6. Settings (a fresh profile: the defaults), from the main menu before the duel.
  await page.click('[data-testid="settings"]'); await page.waitForTimeout(800);
  // The FPS counter row sits below the fold: scroll so Map grid and the checkbox are both in view.
  await page.evaluate(() => document.querySelector('[data-testid="fps-counter"]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(400);
  await shot('6-settings');
  console.log('settings', JSON.stringify(await page.evaluate(() => ({ grid: document.querySelector('[data-testid="map-grid"]')?.value, fps: document.querySelector('[data-testid="fps-counter"]')?.checked }))));
  await page.click('[data-testid="back"]'); await page.waitForTimeout(600);

  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
  await page.click('[data-testid="ship-hound"]'); await page.waitForTimeout(3000);
  console.log('start seat', JSON.stringify(await seat()));
  // 1. The Helm: the crew start standing, so seat the active character at the Helm through seatWeapons with the Weapons
  // index pointed at the Helm for that one call (restored at once; the hook reads d.weapons when called).
  await page.evaluate(() => { const h = globalThis.__spikeAsteroids, d = h.duel(), w = d.weapons; d.weapons = d.nav; try { h.seatWeapons(); } finally { d.weapons = w; } });
  await page.waitForTimeout(800);
  let s = await seat();
  console.log('helm seat', JSON.stringify(s));
  await shot('1-helm-grid-off');
  // 2. Weapons: Tab to the other character (seated there by seatWeapons if no one is).
  await tap('Tab'); s = await seat();
  if (s.weapons !== s.me) { await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(600); s = await seat(); }
  console.log('weapons seat', JSON.stringify(s));
  await shot('2-weapons-no-ring');
  // 3. Weapons paused with the enemy window open (T). The Hunter starts out of sensor range, so pin it 700 u off the crew
  // ship (still and facing away) until the window is open; the pause then holds the picture.
  await page.evaluate(() => {
    const d = globalThis.__spikeAsteroids.duel;
    clearInterval(globalThis.__pin);
    globalThis.__pin = setInterval(() => { const t = d().tactical, a = t.ships[0]; Object.assign(t.ships[1], { x: a.x + 700, y: a.y - 200, vx: a.vx, vy: a.vy }); }, 5);
  });
  await page.waitForTimeout(1500);
  // Esc with the window open closes the window first (contactController.escape), so pause first, then T opens it.
  await tap('Escape'); await page.waitForTimeout(400);
  await tap('KeyT'); await page.waitForTimeout(800);
  console.log('paused', JSON.stringify(await page.evaluate(() => [...globalThis.__ftliteDuel.reasons()])));
  await shot('3-weapons-paused');
  await tap('Escape'); await page.waitForTimeout(400);   // the first Esc closes the enemy window
  await tap('Escape'); await page.waitForTimeout(600);   // the second resumes
  await page.evaluate(() => clearInterval(globalThis.__pin));
  console.log('resumed', JSON.stringify(await page.evaluate(() => [...globalThis.__ftliteDuel.reasons()])));
  // 4. The ship view paused: stand (X), then Esc.
  await tap('KeyX'); await page.waitForTimeout(800);
  console.log('stood', JSON.stringify(await seat()));
  await tap('Escape'); await page.waitForTimeout(800);
  console.log('paused', JSON.stringify(await page.evaluate(() => [...globalThis.__ftliteDuel.reasons()])));
  await shot('4-ship-paused');
  await tap('Escape'); await page.waitForTimeout(600);
  // 5. The FPS corner on a map view (the scale bar is a map's): Tab to the character still at the Helm.
  await tap('Tab'); await page.waitForTimeout(1500);
  console.log('fps seat', JSON.stringify(await seat()));
  await shot('5-fps', { x: 1080, y: 660, width: 200, height: 60 });
  await shot('5-fps-full');
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
