// Hacking spike screenshots (plan Task 8 step 4). Single player Hound at 1280x720: the Science seat with the enemy pinned in
// range, Sensors 3 with 2 bars on HACK and the enemy designated and scanned: `science-ready` (HACK: PICK A ROOM), then a
// click on SHLD: `science-hacking` (the hold), then `science-hacked` once it lands (the short look in the enemy window),
// and `map-hacked` zoomed toward the enemy. Usage: `npx electron-vite build` in the worktree, then
// `node scripts/hacking-shots.cjs [out dir] [worktree] [playwright-core dir]`. Follows scripts/ui-round-2b-shots.cjs.
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/hacking';
const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/hacking';
const { _electron } = require(process.argv[4] || 'playwright-core');

(async () => {
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-hack-'));
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
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
  await page.click('[data-testid="ship-hound"]'); await page.waitForTimeout(3000);
  // Pin the Hunter 700 east of the crew ship, matching its velocity; Sensors 3, the enemy scanned to Level 2.
  await page.evaluate(() => {
    const d = globalThis.__spikeAsteroids.duel;
    clearInterval(globalThis.__pin);
    globalThis.__pin = setInterval(() => { const t = d().tactical, a = t.ships[0]; Object.assign(t.ships[1], { x: a.x + 700, y: a.y - 150, vx: a.vx, vy: a.vy }); }, 5);
    const t = d().tactical; t.systems[0].bars[3] = 3; t.known[0] = 2;
  });
  // Seat character 0 at Science (the hook seats at d.weapons, so point it at Science for the call).
  await page.evaluate(() => { const h = globalThis.__spikeAsteroids, d = h.duel(), w = d.weapons; d.weapons = d.science; try { h.seatWeapons(); } finally { d.weapons = w; } });
  await page.waitForTimeout(4800);
  // Two bars onto HACK with the pips, then T selects (designates) the enemy.
  const pips = page.locator('[data-testid="console-science-pips-hack"] > *').first();
  await pips.click(); await page.waitForTimeout(250); await pips.click(); await page.waitForTimeout(400);
  await tap('KeyT'); await page.waitForTimeout(700);
  await shot('science-ready');
  await page.click('[data-testid="console-hack-1"]'); await page.waitForTimeout(3000);
  await shot('science-hacking');
  await page.waitForTimeout(5200);
  await shot('science-hacked');
  console.log('state', JSON.stringify(await page.evaluate(() => { const t = globalThis.__spikeAsteroids.duel().tactical; return { hackPower: t.systems[0].hackPower, hacked: t.systems[1].hacked, hackRoom: t.hackRoom, designated: t.designated, shields: t.systems[1].shields }; })));
  await page.mouse.move(640, 300); for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  await shot('map-hacked');
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await page.evaluate(() => clearInterval(globalThis.__pin));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
