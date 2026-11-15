import { spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';

/** One monotonic absolute deadline; reserves never restart a stage's budget. */
export function createLauncherDeadline(at: number) {
  const remaining = (reserveMs = 0) => Math.max(0, at - performance.now() - reserveMs);
  return {
    remaining,
    async wait<T>(work: Promise<T>, diagnostic: string, reserveMs = 0): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const budget = remaining(reserveMs);
        if (!budget) { void work.catch(() => {}); throw Error(diagnostic); }
        return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(diagnostic)), budget); })]);
      } finally { if (timer) clearTimeout(timer); }
    }
  };
}
export type LauncherDeadline = ReturnType<typeof createLauncherDeadline>;
function observeExit(child: ChildProcess) {
  let release = () => {};
  const promise = child.exitCode !== null || child.signalCode ? Promise.resolve() : new Promise<void>((done, reject) => {
    const exit = () => done(), error = () => reject(Error('owned-process-failure'));
    child.once('exit', exit); child.once('error', error);
    release = () => { child.off('exit', exit); child.off('error', error); };
  });
  return { promise, release };
}
const nativeKiller = (child: ChildProcess): ChildProcess | undefined => {
  if (process.platform === 'win32') return spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  child.kill('SIGKILL'); return undefined;
};
/** Only the child owned by this launcher and its exact killer may be terminated. */
export async function stopOwnedProcess(child: ChildProcess, deadline: LauncherDeadline,
  spawnKiller: (child: ChildProcess) => ChildProcess | undefined = nativeKiller): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode) return;
  const target = observeExit(child);
  let killer: ChildProcess | undefined, helper: ReturnType<typeof observeExit> | undefined;
  try {
    killer = spawnKiller(child); if (killer) helper = observeExit(killer);
    await deadline.wait(Promise.all([target.promise, helper?.promise]), 'cleanup-timeout', 1000);
  } catch {
    // Reserve the tail of the SAME deadline for observing emergency termination.
    try { killer?.kill('SIGKILL'); } catch { /* verified by the launcher */ }
    try { child.kill('SIGKILL'); } catch { /* verified by the launcher */ }
    await deadline.wait(Promise.allSettled([target.promise, ...(helper ? [helper.promise] : [])]), 'cleanup-timeout', 500).catch(() => {});
    throw Error('cleanup-timeout');
  } finally { target.release(); helper?.release(); }
}

export async function removeOwnedDirectory(target: string, deadline: LauncherDeadline): Promise<void> {
  for (;;) {
    try {
      // Node's built-in linear retries have independent delays; use zero and
      // explicitly account every attempt/backoff against the common deadline.
      await deadline.wait(rm(target, { recursive: true, force: true, maxRetries: 0 }), 'cleanup-timeout', 250);
      return;
    } catch {
      if (deadline.remaining(300) <= 0) throw Error('cleanup-timeout');
      await deadline.wait(new Promise<void>(done => setTimeout(done, 50)), 'cleanup-timeout', 250);
    }
  }
}
