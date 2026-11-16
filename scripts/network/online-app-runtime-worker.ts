import { build } from 'vite';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { startLocalRuntime } from '../../services/signalling/scripts/local-runtime';

const [directory, digest, hang] = process.argv.slice(2);
if (!directory || !digest || !process.send) throw Error('invalid runtime helper');
const send = (message: object) => { if (process.connected) process.send!(message, () => {}); };
let runtime: Awaited<ReturnType<typeof startLocalRuntime>> | undefined;
// Observe native workerd even if runtime.ready never settles, so the parent can
// verify its exact PID after terminating this owned tree.
const cp = createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process');
const originalSpawn = cp.spawn;
cp.spawn = ((command: string, ...args: any[]) => {
  const child = (originalSpawn as any)(command, ...args) as import('node:child_process').ChildProcess;
  if (/(^|[\\/])workerd(?:\.exe)?$/i.test(command)) {
    send({ type: 'worker-started', pid: child.pid });
    child.once('exit', () => send({ type: 'worker-exited', pid: child.pid }));
  }
  return child;
}) as typeof cp.spawn;
const unresolved = () => new Promise<never>(() => {});
const startup = (async () => {
  send({ type: 'stage', stage: 'startup' });
  if (hang === 'startup') await unresolved();
  runtime = await startLocalRuntime(directory);
  cp.spawn = originalSpawn;
  send({ type: 'runtime-ready', baseUrl: runtime.baseUrl, workerdVersion: runtime.workerdVersion });
  send({ type: 'stage', stage: 'observer-build' });
  if (hang === 'observer-build') await unresolved();
  await build({ configFile: false, envDir: false, logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
    build: { outDir: join(directory, 'observer'), emptyOutDir: false, lib: { entry: resolve('scripts/network/online-app-observer.ts'), name: 'OnlineObserver', formats: ['iife'], fileName: () => 'observer.js' } } });
  await build({ configFile:false, envDir:false, logLevel:'warn', define:{ __GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest) },
    build:{ outDir:join(directory,'observer'),emptyOutDir:false,target:'node22',lib:{entry:resolve('scripts/network/online-recovery-utility.ts'),formats:['cjs'],fileName:()=>'utility.cjs'},rollupOptions:{external:['node:fs']} } });
  send({ type: 'stage', stage: 'ready' });
  send({ type: 'ready', baseUrl: runtime.baseUrl, workerdVersion: runtime.workerdVersion });
})();
startup.catch(() => send({ type: 'failed' }));
let stopping = false;
process.on('message', message => {
  if ((message as any)?.type !== 'shutdown' || stopping) return;
  stopping = true;
  void (async () => {
    // During unresolved startup we cannot yet dispose Miniflare. Remain alive
    // so the parent kills the entire owned tree, including partial startup.
    if (!runtime) await startup;
    await runtime?.dispose();
    process.exit(0);
  })().catch(() => process.exit(1));
});
