import { expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createLauncherDeadline, stopOwnedProcess } from '../scripts/network/lease-smoke-lifecycle';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
it('bounds an injected slow killer by the same absolute deadline and terminates both owned processes', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
  let killer: ChildProcess | undefined;
  const started = performance.now(), deadline = createLauncherDeadline(started + 1200);
  try {
    await expect(stopOwnedProcess(child, deadline, () => {
      child.kill('SIGKILL');
      killer = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
      return killer;
    })).rejects.toThrow('cleanup-timeout');
    expect(performance.now() - started).toBeLessThan(1200);
    expect(alive(child.pid!)).toBe(false); expect(alive(killer!.pid!)).toBe(false);
  } finally { child.kill('SIGKILL'); killer?.kill('SIGKILL'); }
});

it('does not give a cleanup stage a new budget after an earlier stage consumes time', async () => {
  const deadline = createLauncherDeadline(performance.now() + 100);
  await new Promise(done => setTimeout(done, 60));
  const started = performance.now();
  await expect(deadline.wait(new Promise(() => {}), 'cleanup-timeout')).rejects.toThrow('cleanup-timeout');
  expect(performance.now() - started).toBeLessThan(90);
});
