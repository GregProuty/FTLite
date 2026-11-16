import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createLauncherDeadline, stopOwnedProcess, type LauncherDeadline } from './lease-smoke-lifecycle';

export type RuntimeStage = 'startup' | 'observer-build' | 'ready';
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** A command cap never extends the shared deadline or consumes its cleanup reserve. */
export async function waitForAppRequest<T>(work: Promise<T>, deadline: LauncherDeadline, signal?: AbortSignal, reserveMs=10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    const budget=Math.min(5000,deadline.remaining(reserveMs));
    if(signal?.aborted || budget<=0) {void work.catch(()=>{});throw Error('launcher timeout');}
    return await Promise.race([work,new Promise<never>((_,reject)=>{
      abort=()=>reject(Error('launcher timeout'));
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>reject(Error('application driver timeout')),budget);
    })]);
  } finally {if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

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
    dispose(deadline: LauncherDeadline = createLauncherDeadline(performance.now()+11000)): Promise<void> {
      return disposal ??= (async () => {
        signal.removeEventListener('abort', aborted);
        if (child.connected) { try { child.send({ type: 'shutdown' }, () => {}); } catch {} }
        await Promise.race([exit, delay(Math.min(2000,deadline.remaining(8000)))]);
        if (!exited && child.pid) {
          forced = true;
          await stopOwnedProcess(child,createLauncherDeadline(performance.now()+deadline.remaining(2000)), target=>{
            if(process.platform==='win32') return spawn('taskkill',['/PID',String(target.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
            try {process.kill(-target.pid!,'SIGKILL');}catch{} return undefined;
          });
        }
        await deadline.wait(exit,'owned runtime cleanup failed',2000);
        if (!exited) throw Error('owned runtime cleanup failed');
        // Forced process-tree termination has no worker IPC callback. Confirm the
        // exact worker PID captured at spawn has disappeared before claiming exit.
        if (workerPid && !workerExited) {
          const workerDeadline=createLauncherDeadline(performance.now()+Math.min(2000,deadline.remaining(1500)));
          while(alive(workerPid) && workerDeadline.remaining()>0) await workerDeadline.wait(delay(50),'owned runtime cleanup failed');
          workerExited = !alive(workerPid);
          if (!workerExited) throw Error('owned runtime cleanup failed');
        }
      })();
    }
  };
}
