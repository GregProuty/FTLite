import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { computeContentDigest } from '../../build/contentDigest';
async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ui-smoke-'));
  const server = await createServer({ configFile: false, root: resolve('src/renderer'), publicDir: resolve('public'), define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(computeContentDigest(process.cwd())) }, server: { host: '127.0.0.1', port: 0 } });
  try {
    await server.listen();
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME;
    const code = await new Promise<number | null>((done, reject) => {
      const child = spawn(electron as unknown as string, [resolve('scripts/determinism/ui-electron.cjs'), server.resolvedUrls!.local[0]!, `--user-data-dir=${profile}`], { env, windowsHide: true, stdio: 'inherit' });
      child.once('exit', done); child.once('error', reject);
    });
    if (code !== 0) throw Error(`UI smoke exited ${code}`);
  } finally {
    await server.close();
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && profile.includes('ftlite-ui-smoke-')) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
