import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { startOnlineAppRuntime } from '../scripts/network/online-app-runtime';

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
