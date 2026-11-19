// Spike ii (billiard asteroids) screenshots, spec §9.7: single player at Weapons on the CRT map, staged through the solo
// hook globalThis.__spikeAsteroids (app/duel/duelMode.ts). The crew is pinned at rest outward of a big belt rock, the
// Hunter pinned far off. Usage: install playwright-core@1.48.2 in a scratch folder, copy this file there, run
// `npm run build` in the worktree, then `node spike-asteroids-ii-shots.cjs [out dir] [worktree] [zoom-in presses]`; with presses > 0 the map is zoomed in
// (the Equal key) and the shots are named `*-zoom.png`, a closer second set of the same scenes.
const { _electron } = require('playwright-core');
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
(async () => {
  const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/asteroid-spike-ii';
  const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/asteroids-ii';
  const zoomIns = Number(process.argv[4] || 0), suffix = zoomIns > 0 ? '-zoom' : '';
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ast2-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: [root, `--user-data-dir=${profile}`], env });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(2500);
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(800);
  for (let z = 0; z < zoomIns; z++) { await page.keyboard.down('Equal'); await page.waitForTimeout(60); await page.keyboard.up('Equal'); await page.waitForTimeout(150); }
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}${suffix}.png` }); console.log('shot', name); };
  const read = (key) => page.evaluate((k) => { const t = globalThis.__spikeAsteroids.duel().tactical; return k === 'asteroidHits' ? t.ships[0].asteroidHits : t[k]; }, key);
  const waitMore = (key, from, ms = 12000) => page.waitForFunction(([k, f]) => { const t = globalThis.__spikeAsteroids.duel().tactical; return (k === 'asteroidHits' ? t.ships[0].asteroidHits : t[k]) > f; }, [key, from], { polling: 16, timeout: ms });
  // Park the crew `gap` u outward of a big static belt rock at least 900 u from the ones used before, facing it; pin the Hunter far off.
  const stage = (gap) => page.evaluate((g) => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical, belt = [];
    for (let k = 0; k < t.map.beltCount; k++) { const a = h.rockAt(t, k); if (a.kind === 1 && a.r >= 38) belt.push({ k, ...a }); }
    belt.sort((p, q) => q.r - p.r);
    const used = globalThis.__used || [], pick = belt.find((b) => used.every((u) => Math.hypot(b.x - u.x, b.y - u.y) > 900)) || belt[0];
    used.push(pick); globalThis.__used = used;
    const d = Math.hypot(pick.x, pick.y), ux = pick.x / d, uy = pick.y / d, x = pick.x + ux * g, y = pick.y + uy * g;
    const heading = ((Math.round((Math.atan2(pick.x - x, -(pick.y - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
    clearInterval(globalThis.__pin);
    const pin = () => { const tt = h.duel().tactical; Object.assign(tt.ships[0], { x, y, vx: 0, vy: 0, heading, headingAcc: 0 }); Object.assign(tt.ships[1], { x: -x - 400, y: -y, vx: 0, vy: 0 }); };
    pin(); globalThis.__pin = setInterval(pin, 5);
    return { rock: pick.k, r: pick.r, x, y, ux, uy };
  }, gap);
  const sys = (patch, rock) => page.evaluate(([p, k]) => { const s = globalThis.__spikeAsteroids.duel().tactical.systems[0]; for (const [key, v] of Object.entries(p)) s[key] = v === 'ROCK' ? k : v; }, [patch, rock]);

  // b0, b1: the laser chips a rock (sparks), then splits it (pieces streaking).
  const a = await stage(220);
  const hits0 = await read('rockHits'), splits0 = await read('rockSplits');
  await sys({ laserRock: 'ROCK', laserTargeted: true }, a.rock);
  await waitMore('rockHits', hits0); await page.waitForTimeout(140); await shot('b0-laser-chip');
  await waitMore('rockSplits', splits0); await page.waitForTimeout(250); await shot('b1-laser-split');
  // b2, b3: a rock-targeted torpedo's blast mid-expansion, then the belt seconds after.
  const c = await stage(300);
  const blasts0 = await read('rockBlasts');
  await sys({ laserRock: -1, torpLock: -1, torpRock: 'ROCK' }, c.rock);
  await waitMore('rockBlasts', blasts0); await page.waitForTimeout(140); await shot('b2-blast-shockwave');
  await page.waitForTimeout(3000); await shot('b3-belt-after-blast');
  // b4: a piece strikes the crew ship (thrown in from outside the belt).
  const e = await stage(260);
  const touch0 = await read('asteroidHits');
  await page.evaluate((s) => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical, me = t.ships[0];
    let slot = -1; for (let k = 0; k < h.rockSlots(t); k++) if (h.rockAt(t, k).kind === 0) { slot = k; break; }
    h.writeRock(t, slot, h.RockKind.Moving, me.x + s.ux * 170, me.y + s.uy * 170, -s.ux * 220, -s.uy * 220, 18, 2);
    globalThis.__thrown = slot;
  }, e);
  // The contact itself lasts one tick, so the shot is taken as the piece closes (its surface about 25 u off the hull), then
  // the hit is confirmed through the crew's asteroidHits counter.
  await page.waitForFunction(() => { const h = globalThis.__spikeAsteroids, t = h.duel().tactical, me = t.ships[0], a = h.rockAt(t, globalThis.__thrown);
    return a.kind !== 2 || Math.hypot(a.x - me.x, a.y - me.y) < 75; }, null, { polling: 16, timeout: 4000 });
  await shot('b4-piece-hits-crew');
  await waitMore('asteroidHits', touch0, 4000); await page.waitForTimeout(120); await shot('b4b-piece-after-hit');
  // b5: a rock wearing the laser's target bracket (its surface beyond laser range, so it only wears the mark).
  const f = await stage(600);
  await sys({ torpRock: -1, laserRock: 'ROCK', laserTargeted: true }, f.rock);
  await page.waitForTimeout(400); await shot('b5-laser-target-bracket');
  await page.evaluate(() => clearInterval(globalThis.__pin));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
