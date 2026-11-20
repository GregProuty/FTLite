// Crew3D screenshots (docs/superpowers/specs/2026-11-20-crew3d-prerendered-sprites-design.md section 5): single player
// aboard the Hound, with the 3D crew and then the old art (the ftlite-crew3d setting, as F8 writes it in dev builds).
// Usage: `npx electron-vite build` in the worktree, then `node scripts/crew3d-shots.cjs [out dir] [worktree]`.
const { _electron } = require('playwright-core');
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
(async () => {
  const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/crew3d';
  const root = process.argv[3] || process.cwd();
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-crew3d-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: [root, `--user-data-dir=${profile}`], env });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const board = async () => {
    await page.waitForTimeout(2500);
    await page.click('[data-testid="single-player"]'); await page.waitForTimeout(800);
    await page.click('[data-testid="ship-hound"]'); await page.waitForTimeout(3000);
  };
  for (const mode of ['on', 'off']) {
    await page.evaluate((m) => localStorage.setItem('ftlite-crew3d', m), mode);
    await page.reload(); await board();
    await shot(`hound-idle-${mode}`);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(450); await shot(`hound-walk-e-${mode}`); await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyS'); await page.waitForTimeout(350); await shot(`hound-walk-s-${mode}`); await page.keyboard.up('KeyS');
    await hold('KeyA', 300); await page.waitForTimeout(400); await shot(`hound-stand-w-${mode}`);
  }
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
