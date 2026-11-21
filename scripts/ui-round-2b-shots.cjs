// UI round Part 2b screenshots (fill the window; plan Task 6). Single player Hound at three window shapes: the Helm, Weapons
// with the enemy window, and the ship view, at 1280x720 (16:9), 2560x1080 (wide) and a 4:3 window. The Electron window's
// minimum is 1280x720 (src/main/index.ts), so the 4:3 shot is 1280x960 (files 1280x960-*), not 1024x768. Also `resize-live.png` (the window goes
// from 1280x720 to 1920x1080 mid-game, shot a few frames later) and `menu-2560x1080.png`. Usage: install playwright-core@1.48.2
// in a scratch folder, run `npx electron-vite build` in the worktree, then
// `node scripts/ui-round-2b-shots.cjs [out dir] [worktree] [playwright-core dir]`. Follows scripts/ui-round-2a-shots.cjs.
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/ui-round-2b';
const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/ui-round-2b';
const { _electron } = require(process.argv[4] || 'playwright-core');

const SIZES = [{ w: 1280, h: 720 }, { w: 2560, h: 1080 }, { w: 1280, h: 960 }];

async function launch(size) {
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ur2b-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root, `--user-data-dir=${profile}`], env });
  await app.context().addInitScript(() => { globalThis.__FTLITE_STAGE__ = true; });
  const page = await app.firstWindow();
  await page.evaluate(() => { globalThis.__FTLITE_STAGE__ = true; });
  await resize(app, size);
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  return { app, page, errs };
}
async function resize(app, s) {
  await app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setFullScreen(false); w.setContentSize(s.w, s.h); w.setPosition(0, 0); }, s);
}
async function startGame(page) {
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
  await page.click('[data-testid="ship-hound"]'); await page.waitForTimeout(3000);
}

(async () => {
  mkdirSync(out, { recursive: true });
  for (const size of SIZES) {
    const tag = `${size.w}x${size.h}`;
    const { app, page, errs } = await launch(size);
    const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name, JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]))); };
    const tap = async (key, hold = 60) => { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(400); };
    const seatAt = (which) => page.evaluate((k) => { const h = globalThis.__spikeAsteroids, d = h.duel(), w = d.weapons; d.weapons = d[k]; try { h.seatWeapons(); } finally { d.weapons = w; } }, which);
    const pin = () => page.evaluate(() => {
      const d = globalThis.__spikeAsteroids.duel;
      clearInterval(globalThis.__pin);
      globalThis.__pin = setInterval(() => { const t = d().tactical, a = t.ships[0]; Object.assign(t.ships[1], { x: a.x + 700, y: a.y - 200, vx: a.vx, vy: a.vy }); }, 5);
    });
    const unpin = () => page.evaluate(() => clearInterval(globalThis.__pin));

    if (tag === '2560x1080') await shot('menu-2560x1080');
    await startGame(page);
    // The Helm: character 0 at the Helm, with the Hunter pinned in sensor range; wait out the sit card.
    await pin();
    await seatAt('nav'); await page.waitForTimeout(4800);
    await shot(`${tag}-helm`);
    // Weapons with the enemy window: Tab to character 1, sit, T at once (the sit card shows at the top for 4 s).
    await tap('Tab'); await page.waitForTimeout(800);
    await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(400);
    await tap('KeyT'); await page.waitForTimeout(500);
    await shot(`${tag}-weapons-window`);
    await tap('Escape'); await page.waitForTimeout(300);
    // The ship view: stand (X).
    await tap('KeyX'); await page.waitForTimeout(1200);
    await shot(`${tag}-ship`);
    await unpin();

    if (tag === '1280x720') {
      // Live resize: back to character 0 at the Helm, then the window goes to 1920x1080 and the shot is a few frames later.
      await tap('Tab'); await page.waitForTimeout(800);
      await resize(app, { w: 1920, h: 1080 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      await shot('resize-live');
    }
    console.log('errors', tag, JSON.stringify(errs.slice(0, 10)));
    await app.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
