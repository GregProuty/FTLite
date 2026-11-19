// Packaged check (Web-i R1-F2): the module host Worker must start from inside an asar archive over file://.
// Copies dist/win-unpacked to a temp dir, renames its app.asar to page.asar, and makes a tiny app/ that runs worker-boot.cjs
// against page.asar/out/renderer/index.html with the packaged Electron binary. Run: npm run package:candidate, then node this.
const { cpSync, mkdtempSync, renameSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const src = resolve(__dirname, '../../dist/win-unpacked');
if (!existsSync(join(src, 'resources/app.asar'))) { console.error('WORKER BOOT FAIL: run npm run package:candidate first'); process.exit(1); }
const tmp = mkdtempSync(join(tmpdir(), 'ftlite-packaged-boot-'));
try {
  cpSync(src, tmp, { recursive: true });
  renameSync(join(tmp, 'resources/app.asar'), join(tmp, 'resources/page.asar'));
  mkdirSync(join(tmp, 'resources/app'));
  writeFileSync(join(tmp, 'resources/app/package.json'), JSON.stringify({ name: 'boot', main: 'main.cjs' }));
  const boot = readFileSync(join(__dirname, 'worker-boot.cjs'), 'utf8');
  writeFileSync(join(tmp, 'resources/app/main.cjs'), boot);
  const page = join(tmp, 'resources/page.asar/out/renderer/index.html');
  const run = spawnSync(join(tmp, 'FTLite.exe'), [], { env: { ...process.env, FTLITE_BOOT_PAGE: page }, encoding: 'utf8', timeout: 60000 });
  process.stdout.write(run.stdout ?? ''); process.stderr.write(run.stderr ?? '');
  process.exitCode = run.status === 0 && /WORKER BOOT PASS/.test(run.stdout ?? '') ? 0 : 1;
} finally { rmSync(tmp, { recursive: true, force: true }); }
