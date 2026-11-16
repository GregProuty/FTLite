import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { startOnlineAppRuntime, waitForAppRequest } from '../scripts/network/online-app-runtime';
import { createLauncherDeadline } from '../scripts/network/lease-smoke-lifecycle';

it('cancels both blocked work requests and reserves absolute time after multiple unresponsive shutdown requests', async () => {
  vi.useFakeTimers();
  try {
    const began=performance.now(), deadline=createLauncherDeadline(began+90000), abort=new AbortController();
    const never=()=>new Promise<never>(()=>{});
    const work=Promise.allSettled([waitForAppRequest(never(),deadline,abort.signal),waitForAppRequest(never(),deadline,abort.signal)]);
    abort.abort();
    expect((await work).every(r=>r.status==='rejected')).toBe(true);
    await vi.advanceTimersByTimeAsync(80000);
    const cleaned:string[]=[];
    const shutdown=Promise.all([0,1].map(async i=>{
      try {await waitForAppRequest(never(),deadline,undefined,8000);}catch{}
      cleaned.push('exact-process-exit-'+i);
    }));
    await vi.advanceTimersByTimeAsync(2000); await shutdown;
    expect(cleaned).toHaveLength(2);
    expect(deadline.remaining()).toBeGreaterThanOrEqual(7999);
    await deadline.wait(Promise.resolve(cleaned.push('runtime-exit')),'cleanup-timeout',2000);
    await deadline.wait(Promise.resolve(cleaned.push('temp-removed')),'cleanup-timeout',250);
    expect(cleaned).toEqual(['exact-process-exit-0','exact-process-exit-1','runtime-exit','temp-removed']);
    expect(vi.getTimerCount()).toBe(0);
  } finally {vi.useRealTimers();}
});

it.each(['startup', 'observer-build'] as const)('bounds an unresolved actual %s and observes owned process cleanup', async stage => {
  const directory = mkdtempSync(join(tmpdir(), 'ftlite-online-app-runtime-test-'));
  const abort = new AbortController();
  const runtime = startOnlineAppRuntime(directory, __GAMEPLAY_CONTENT_DIGEST__, abort.signal, stage, current => {
    if (current === stage) abort.abort();
  });
  const began = performance.now();
  try {
    await expect(runtime.ready).rejects.toThrow('launcher timeout');
    await runtime.dispose();
    const evidence = runtime.observation();
    expect(evidence.exited).toBe(true); expect(evidence.pid).toBeGreaterThan(0);
    if (stage === 'observer-build') {
      expect(runtime.pid).toBeGreaterThan(0); expect(runtime.exited()).toBe(true);
      expect(() => process.kill(runtime.pid!, 0)).toThrow();
    }
    expect(performance.now() - began).toBeLessThan(12000);
  } finally {
    await runtime.dispose();
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-online-app-runtime-test-')) throw Error('invalid test cleanup target');
    rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 15000);
