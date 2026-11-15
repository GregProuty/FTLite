import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export type RuntimeStage = 'startup' | 'observer-build' | 'ready';
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Own the uncancellable Vite/Miniflare awaits behind an interruptible process boundary. */
export function startOnlineAppRuntime(directory: string, digest: string, signal: AbortSignal,
  hang?: Exclude<RuntimeStage, 'ready'>, onStage?: (stage: RuntimeStage) => void) {
  const child = spawn(process.execPath, ['--import', 'tsx', resolve('scripts/network/online-app-runtime-worker.ts'), directory, digest, hang ?? ''],
    { windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let exited = false, exitCode: number | null | undefined, workerPid: number | undefined, workerExited = false;
  let stage: RuntimeStage | undefined, baseUrl = '', workerdVersion: string | undefined, forced = false;
  let resolveReady!: () => void, rejectReady!: (error: Error) => void, disposal: Promise<void> | undefined;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const aborted = () => rejectReady(Error('launcher timeout'));
  signal.addEventListener('abort', aborted, { once: true });
  if (signal.aborted) aborted();
  // Never forward native/build exceptions, configuration or stderr payloads.
  let warned = false;
  child.stderr!.on('data', () => { if (!warned) { warned = true; console.error('APP_RUNTIME_STDERR'); } });
  child.on('error', () => rejectReady(Error('application process error')));
  const exit = new Promise<void>(done => child.once('close', code => {
    exited = true; exitCode = code; rejectReady(Error('application exited')); done();
  }));
  child.on('message', (message: any) => {
    if (message?.type === 'worker-started' && Number.isSafeInteger(message.pid) && message.pid > 0 && workerPid === undefined) workerPid = message.pid;
    if (message?.type === 'worker-exited' && message.pid === workerPid) workerExited = true;
    if (message?.type === 'stage' && ['startup', 'observer-build', 'ready'].includes(message.stage)) {
      stage = message.stage; onStage?.(stage!);
    }
    if (message?.type === 'ready' || message?.type === 'runtime-ready') {
      if (typeof message.baseUrl !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(message.baseUrl) || message.workerdVersion !== '1.20261023.1') {
        rejectReady(Error('online-application-gate-failed')); return;
      }
      baseUrl = message.baseUrl; workerdVersion = message.workerdVersion; if (message.type === 'ready') resolveReady();
    }
    if (message?.type === 'failed') rejectReady(Error('online-application-gate-failed'));
  });
  return {
    ready,
    get baseUrl() { return baseUrl; }, get pid() { return workerPid; }, get workerdVersion() { return workerdVersion; },
    exited: () => workerExited,
    observation: () => ({ pid: child.pid, exited, exitCode, forced, stage }),
    dispose(): Promise<void> {
      return disposal ??= (async () => {
        signal.removeEventListener('abort', aborted);
        if (child.connected) { try { child.send({ type: 'shutdown' }, () => {}); } catch {} }
        await Promise.race([exit, delay(2000)]);
        if (!exited && child.pid) {
          forced = true;
          if (process.platform === 'win32') {
            await new Promise<void>((done, reject) => {
              const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
              const timer = setTimeout(() => { kill.kill(); reject(Error('owned runtime cleanup failed')); }, 5000);
              kill.once('error', () => { clearTimeout(timer); reject(Error('owned runtime cleanup failed')); });
              kill.once('exit', () => { clearTimeout(timer); done(); });
            });
          } else { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
        }
        await Promise.race([exit, delay(2000)]);
        if (!exited) throw Error('owned runtime cleanup failed');
        // Forced process-tree termination has no worker IPC callback. Confirm the
        // exact worker PID captured at spawn has disappeared before claiming exit.
        if (workerPid && !workerExited) {
          for (let i = 0; i < 40 && alive(workerPid); i++) await delay(50);
          workerExited = !alive(workerPid);
          if (!workerExited) throw Error('owned runtime cleanup failed');
        }
      })();
    }
  };
}
