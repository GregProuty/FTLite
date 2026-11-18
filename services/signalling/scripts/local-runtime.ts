import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { build } from 'vite';

/** Trusted local test boundary. No .env/config discovery, remote binding or TURN provider. */
export async function startLocalRuntime(directory: string, options: { allowedOrigins?: string } = {}) {
  const requireService = createRequire(resolve('services/signalling/package.json'));
  const { Miniflare, convertV4MiniflareOptions } = requireService('miniflare');
  const workerdVersion: string = requireService('workerd/package.json').version;
  if (workerdVersion !== '1.20261023.1') throw Error('wrong pinned workerd');
  const entry = join(directory, 'local-worker.ts');
  writeFileSync(entry, `import worker from ${JSON.stringify(resolve('services/signalling/src/index.ts').replaceAll('\\', '/'))};
export { Room, Directory } from ${JSON.stringify(resolve('services/signalling/src/index.ts').replaceAll('\\', '/'))};
export default { fetch(request, env) { const headers = new Headers(request.headers); headers.set('CF-Connecting-IP', '192.0.2.7');
return worker.fetch(new Request(request, { headers }), env); } };`);
  await build({ configFile: false, envDir: false, logLevel: 'warn', build: { target: 'esnext', minify: false, outDir: join(directory, 'worker'), emptyOutDir: false,
    lib: { entry, formats: ['es'], fileName: () => 'worker.mjs' }, rollupOptions: { external: ['cloudflare:workers'] } } });
  // Observe only this construction's native workerd spawn; never substitute its result.
  const cp = requireService('node:child_process') as typeof import('node:child_process');
  const spawn = cp.spawn;
  let child: ChildProcess | undefined, workerExited = false, exit: Promise<void> | undefined;
  cp.spawn = ((command: string, ...args: any[]) => {
    const result = (spawn as any)(command, ...args) as ChildProcess;
    if (/(^|[\\/])workerd(?:\.exe)?$/i.test(command)) {
      if (child) throw Error('unexpected extra workerd');
      child = result; exit = new Promise(done => result.once('exit', () => { workerExited = true; done(); }));
    }
    return result;
  }) as typeof cp.spawn;
  let runtime: any;
  try {
    const options = convertV4MiniflareOptions({ name: 'local-service', modules: true, script: readFileSync(join(directory, 'worker/worker.mjs'), 'utf8'),
      compatibilityDate: '2026-10-23', host: '127.0.0.1', port: 0, cf: false,
      bindings: { IP_HASH_SALT: 'synthetic-local-native-gate-salt', ...(options.allowedOrigins ? { ALLOWED_ORIGINS: options.allowedOrigins } : {}) },
      durableObjects: { ROOMS: { className: 'Room', useSQLite: true }, DIRECTORY: { className: 'Directory', useSQLite: true } },
      resourcePersistencePath: join(directory, 'sqlite'), resourceTmpPath: join(directory, 'runtime') });
    options.enableDevRegistry = false; options.telemetry = { enabled: false }; options.logRequests = false;
    runtime = new Miniflare(options);
    const url = await bounded(runtime.ready, 'local Worker startup');
    if (!child?.pid) throw Error('actual workerd spawn not observed');
    return { baseUrl: String(url).replace(/\/$/, ''), workerdVersion, pid: child.pid,
      exited: () => workerExited,
      kill: () => child!.kill(),
      async hibernate() {
        const ids: string[] = await runtime.listDurableObjectIds('ROOMS', 'local-service');
        if (ids.length !== 1) throw Error('expected exactly one SQLite Room');
        await runtime.unsafeEvictDurableObject('local-service', 'Room', { id: ids[0], webSockets: 'hibernate' });
      },
      async dispose() {
        try { await bounded(runtime.dispose(), 'local Worker dispose'); }
        finally { if (!workerExited) child!.kill(); await bounded(exit!, 'actual workerd exit'); }
      } };
  } catch (error) {
    try { if (runtime) await bounded(runtime.dispose(), 'failed Worker dispose'); }
    finally { if (child && !workerExited) child.kill(); if (exit) await bounded(exit, 'failed actual workerd exit'); }
    throw error;
  } finally { cp.spawn = spawn; }
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), 10000); })]); }
  finally { clearTimeout(timer); }
}
