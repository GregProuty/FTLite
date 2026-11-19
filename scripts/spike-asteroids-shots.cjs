// Destructible-asteroids spike screenshots: single player, sit at Weapons, stage the crew ship facing a big cluster rock
// with the Hunter behind it, let the crew laser's auto-dig crack it, split it, and watch the fragments drift.
const { _electron } = require('playwright-core');
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
(async () => {
  const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/asteroid-spike';
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ast-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: ['C:/Users/djuar/FTLite/.worktrees/spike-asteroids', `--user-data-dir=${profile}`], env });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(2500);
  const hold = async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); await page.waitForTimeout(100); };
  await hold('KeyD', 1500); await hold('KeyW', 800); await hold('KeyA', 150);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(900);
  // Stage: the biggest rock; the crew 170 units west of its surface facing east (heading 64), the Hunter east of it, both pinned.
  const staged = await page.evaluate(() => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical;
    // The rock (r >= 40) and firing direction with the most open space beyond it, so the fragments drift in the clear.
    const dirs = [[64, 1, 0], [192, -1, 0], [0, 0, -1], [128, 0, 1]];
    const gap = (x, y, skip) => { let m = 1e9; for (let j = 0; j < h.rockSlots(t); j++) { if (j === skip) continue; const o = h.rockAt(t, j); if (o.kind) m = Math.min(m, Math.hypot(o.x - x, o.y - y) - o.r); } return m; };
    let best = -1, bd = null, score = -1;
    for (let k = 0; k < h.rockSlots(t); k++) {
      const a = h.rockAt(t, k);
      if (a.kind !== 1 || a.r < 40) continue;
      for (const d of dirs) {
        let ok = true;
        for (let s = 0; s <= 20 && ok; s++) { const u = -a.r - 170 + s * (2 * a.r + 310) / 20; if (Math.abs(u) > a.r + 5) ok = gap(a.x + d[1] * u, a.y + d[2] * u, k) > 45; }
        if (!ok) continue;
        let sc = 1e9;   // open space ahead: the clearance at three points beyond the rock
        for (const u of [a.r + 60, a.r + 120, a.r + 180]) for (const side of [-40, 0, 40]) sc = Math.min(sc, gap(a.x + d[1] * u - d[2] * side, a.y + d[2] * u + d[1] * side, k));
        if (sc > score) { score = sc; best = k; bd = d; }
      }
    }
    const a = h.rockAt(t, best), d = bd;
    const pin = () => {   // the runtime's state object can be replaced, so every write re-reads it
      const tt = h.duel().tactical;
      Object.assign(tt.ships[0], { x: a.x - d[1] * (a.r + 170), y: a.y - d[2] * (a.r + 170), vx: 0, vy: 0, heading: d[0], headingAcc: 0 });
      Object.assign(tt.ships[1], { x: a.x + d[1] * (a.r + 140), y: a.y + d[2] * (a.r + 140), vx: 0, vy: 0 });
      if (globalThis.__dig) { tt.systems[0].laserTargeted = true; tt.systems[0].lock = 1; }   // a target on the Hunter's Shields: the laser auto-fires, the rock in the way
    };
    globalThis.__dig = true; pin(); globalThis.__pin = setInterval(pin, 5);
    return { rock: best, r: a.r, hp: a.hp, x: a.x, y: a.y, heading: d[0], openSpace: score };
  });
  console.log('staged', JSON.stringify(staged));
  const rock = async () => page.evaluate((k) => { const h = globalThis.__spikeAsteroids, t = h.duel().tactical; return { hp: h.rockAt(t, k).hp, kind: h.rockAt(t, k).kind, splits: t.rockSplits, hits: t.rockHits, tick: t.tick }; }, staged.rock);
  await page.screenshot({ path: out + '/a0-staged.png' });
  let shotCracked = false, shotSplit = false;
  for (let n = 0; n < 160; n++) {
    await page.waitForTimeout(100);
    const r = await rock();
    if (!shotCracked && r.hp > 0 && r.hp <= Math.ceil(staged.hp / 2)) { await page.screenshot({ path: out + '/a1-cracked.png' }); console.log('cracked', JSON.stringify(r)); shotCracked = true; }
    if (!shotSplit && r.splits > 0) {
      await page.screenshot({ path: out + '/a2-split.png' }); console.log('split', JSON.stringify(r)); shotSplit = true;
      await page.evaluate(() => { globalThis.__dig = false; clearInterval(globalThis.__pin); const t = globalThis.__spikeAsteroids.duel().tactical; t.systems[0].laserTargeted = false; });   // stop digging; let the fragments fly
      const fr = () => page.evaluate(() => { const h = globalThis.__spikeAsteroids, t = h.duel().tactical, o = []; for (let k = 0; k < h.rockSlots(t); k++) { const a = h.rockAt(t, k); if (a.kind === 2) o.push({ k, x: Math.round(a.x), y: Math.round(a.y), r: +a.r.toFixed(1), v: +Math.hypot(a.vx, a.vy).toFixed(1) }); } return o; });
      await page.waitForTimeout(700); await page.screenshot({ path: out + '/a3-fragments-0s7.png' }); console.log('0.7 s', JSON.stringify(await fr()));
      await page.waitForTimeout(1300); await page.screenshot({ path: out + '/a4-fragments-2s.png' }); console.log('2 s', JSON.stringify(await fr()));
      await page.waitForTimeout(2000); await page.screenshot({ path: out + '/a5-fragments-4s.png' }); console.log('4 s', JSON.stringify(await fr()));
      const frags = await page.evaluate(() => { const h = globalThis.__spikeAsteroids, t = h.duel().tactical, o = []; for (let k = 0; k < h.rockSlots(t); k++) { const a = h.rockAt(t, k); if (a.kind === 2) o.push({ k, x: Math.round(a.x), y: Math.round(a.y), r: +a.r.toFixed(1), v: +Math.hypot(a.vx, a.vy).toFixed(1), hp: a.hp }); } return o; });
      console.log('fragments', JSON.stringify(frags));
      break;
    }
  }
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
