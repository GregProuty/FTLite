// UI round Part 2a screenshots (docs/superpowers/specs/2026-11-20-ui-round-design.md §2.2-§2.4a; plan Task 7). Single player
// at a 1280x720 window: the Helm (HUD, Helm block, own ship window, BRG/RNG line), Weapons with the enemy window and the sit
// card, Science (SENSOR RANGE), the ship view (an empty console badge; a second shot with an AWAY label), a damaged, an
// offline and a burning room with the health row, and the Valkyrn's Flight seat. Usage: install playwright-core@1.48.2 in a
// scratch folder, run `npx electron-vite build` in the worktree, then
// `node scripts/ui-round-2a-shots.cjs [out dir] [worktree] [playwright-core dir]`. Follows scripts/ui-round-1-shots.cjs.
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/ui-round-2a';
const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/ui-round-2a';
const { _electron } = require(process.argv[4] || 'playwright-core');

async function launch(ship) {
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ur2a-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root, `--user-data-dir=${profile}`], env });
  await app.context().addInitScript(() => { globalThis.__FTLITE_STAGE__ = true; });
  const page = await app.firstWindow();
  await page.evaluate(() => { globalThis.__FTLITE_STAGE__ = true; });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setFullScreen(false); w.setContentSize(1280, 720); w.center(); });
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
  await page.click(`[data-testid="ship-${ship}"]`); await page.waitForTimeout(3000);
  return { app, page, errs };
}

(async () => {
  mkdirSync(out, { recursive: true });
  let { app, page, errs } = await launch('hound');
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name, JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight]))); };
  const tap = async (key, hold = 60) => { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(400); };
  const seat = () => page.evaluate(() => { const r = globalThis.__ftliteDuel, d = r.duel, me = r.active(), occ = d.interior.stations.occupant; return { me, nav: occ[d.nav], weapons: occ[d.weapons], science: d.science >= 0 ? occ[d.science] : null }; });
  // Seat the active character at station `which` ('nav' | 'science') through seatWeapons with the Weapons index pointed there for one call.
  const seatAt = (which) => page.evaluate((k) => { const h = globalThis.__spikeAsteroids, d = h.duel(), w = d.weapons; d.weapons = d[k]; try { h.seatWeapons(); } finally { d.weapons = w; } }, which);
  const pin = () => page.evaluate(() => {
    const d = globalThis.__spikeAsteroids.duel;
    clearInterval(globalThis.__pin);
    globalThis.__pin = setInterval(() => { const t = d().tactical, a = t.ships[0]; Object.assign(t.ships[1], { x: a.x + 700, y: a.y - 200, vx: a.vx, vy: a.vy }); }, 5);
  });
  const unpin = () => page.evaluate(() => clearInterval(globalThis.__pin));

  console.log('start seat', JSON.stringify(await seat()));
  // 1. The Helm: character 0 at the Helm; wait out the sit card so the top band reads.
  await seatAt('nav'); await page.waitForTimeout(4800);
  console.log('helm seat', JSON.stringify(await seat()));
  await shot('1-helm');
  // 1b. The same Helm with the Hunter pinned in sensor range, so the top band has its BRG/RNG line.
  await pin(); await page.waitForTimeout(1200);
  await shot('1-helm-contact');

  // 2. Weapons with the enemy window open and the sit card at the top: Tab to character 1, pin the Hunter 700 u off, sit,
  // then T at once (the card shows for 4 s after a sit).
  await tap('Tab'); await page.waitForTimeout(800);
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(400);
  await tap('KeyT'); await page.waitForTimeout(500);
  console.log('weapons seat', JSON.stringify(await seat()));
  await shot('2-weapons-window');
  await tap('Escape'); await page.waitForTimeout(300);   // closes the enemy window
  await unpin();

  // 3. Science: stand, then sit at Science.
  await tap('KeyX'); await page.waitForTimeout(500);
  await seatAt('science'); await page.waitForTimeout(1500);
  console.log('science seat', JSON.stringify(await seat()));
  await shot('3-science');

  // 4. The ship view: stand (X); Weapons is empty, so its badge blinks red (two shots for the blink), then an AWAY label on
  // the character at the Helm (present false for the shot only).
  await tap('KeyX'); await page.waitForTimeout(1200);
  console.log('stood', JSON.stringify(await seat()));
  await shot('4-ship');
  await page.waitForTimeout(350); await shot('4-ship-b');
  // 4c. AWAY: Tab to the character at the Helm (the one left standing goes away), then the SHIP tab for the ship view. The
  // away character still stands on the Science console tile, so its label falls on the SCIENCE badge's.
  await tap('Tab'); await page.waitForTimeout(600);
  await page.mouse.click(360, 20); await page.waitForTimeout(800);
  console.log('away', JSON.stringify({ ...(await seat()), present: await page.evaluate(() => [...globalThis.__ftliteDuel.duel.present]) }));
  await shot('4-ship-away-on-console');
  // 4d. The same with the away character walked off the console first (S held), so its label shows on open floor.
  await tap('Tab'); await page.waitForTimeout(600);
  await tap('KeyS', 700); await page.waitForTimeout(400);
  await tap('Tab'); await page.waitForTimeout(800);
  console.log('away', JSON.stringify({ ...(await seat()), present: await page.evaluate(() => [...globalThis.__ftliteDuel.duel.present]) }));
  await shot('4-ship-away');
  await tap('Tab'); await page.waitForTimeout(800);   // back to character 1 (standing)
  console.log('back', JSON.stringify(await seat()));

  // 5. Damage: back at Weapons; the Weapons room burns (the seated character's room, so the fire hurts it: the health row),
  // Shields is damaged (1) and Engines offline (2). Two shots for the fire blink.
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(4500);   // let the sit card go
  const dmg = await page.evaluate(() => {
    const d = globalThis.__ftliteDuel.duel, sys = d.tactical.systems[0], wr = d.points.find((p) => p.tacticalRoom === 0).room;
    const sr = d.interior.derived.stationRoom[d.weapons];
    d.interior.rooms.fire[wr] = 1; d.interior.rooms.fire[sr] = 1; sys.rooms[1] = 1; sys.rooms[2] = 2; d.repair[1] = 480;   // Shields half repaired: its progress bar
    return { weaponsRoom: wr, stationRoom: d.interior.derived.stationRoom[d.weapons], rooms: [...sys.rooms] };
  });
  console.log('damage', JSON.stringify(dmg));
  await page.waitForTimeout(2500);
  console.log('after', JSON.stringify(await page.evaluate(() => { const d = globalThis.__ftliteDuel.duel; return { rooms: [...d.tactical.systems[0].rooms], fire: [...d.interior.rooms.fire] }; })));
  console.log('repair', JSON.stringify(await page.evaluate(() => [...globalThis.__ftliteDuel.duel.repair])));
  await shot('5-damage');
  await page.waitForTimeout(200); await shot('5-damage-b');
  await page.waitForTimeout(200); await shot('5-damage-c');
  console.log('errors hound', JSON.stringify(errs.slice(0, 10)));
  await app.close();

  // 6. The Valkyrn's Flight seat: its one character at the Helm.
  ({ app, page, errs } = await launch('valkyrn'));
  await seatAt('nav'); await page.waitForTimeout(4800);
  console.log('flight seat', JSON.stringify(await seat()));
  await shot('6-flight');
  console.log('errors valkyrn', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
