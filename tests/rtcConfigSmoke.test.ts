import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createLauncherDeadline, stopOwnedProcess } from '../scripts/network/lease-smoke-lifecycle';

it.each([
  ['preparation-read-failure', 'preparation-failed'],
  ['git-timeout', 'preparation-timeout'],
  ['cleanup-stop-failure', 'preparation-failed'],
])('cleans exact owned resources after injected %s within the unchanged deadline', async (injection, failure) => {
  const directory = mkdtempSync(join(tmpdir(), 'ftlite-config-test-')), reportPath = join(directory, 'report.json');
  const deadline = createLauncherDeadline(performance.now() + 27000);
  const child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/network/rtc-config-smoke.ts', `--inject-${injection}`,
    ...(injection === 'cleanup-stop-failure' ? ['--inject-preparation-read-failure'] : []), `--report-path=${reportPath}`], { windowsHide: true, stdio: 'ignore' });
  try {
    const code = await deadline.wait(new Promise<number | null>((done, reject) => { child.once('exit', done); child.once('error', reject); }), 'probe-test-timeout', 5000);
    expect(code).toBe(1);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.failure).toBe(failure); expect(report.budgetMs).toBe(20000); expect(report.elapsedMs).toBeLessThan(20000);
    expect(report.temporaryRemoved).toBe(true); expect(report.directoryCleanupAttempted).toBe(true);
    expect(report.temporaryName).toMatch(/^ftlite-rtc-config-[A-Za-z0-9]+$/);
    expect(existsSync(join(tmpdir(), report.temporaryName))).toBe(false);
    expect(report.processes.length).toBeGreaterThan(0);
    for (const owned of report.processes) { expect(owned.pid).toBeGreaterThan(0); expect(owned.exited).toBe(true); expect(() => process.kill(owned.pid, 0)).toThrow(); }
    if (injection === 'git-timeout') {
      expect(report.elapsedMs).toBeGreaterThanOrEqual(14500);
      expect(report.processes).toHaveLength(1); expect(report.processes[0]).toMatchObject({ kind: 'git', forced: true });
      expect(report.nativeAllocated).toBe(false);
    } else expect(report.nativeAllocated).toBe(false);
    expect(report.cleanupFailed).toBe(injection === 'cleanup-stop-failure');
  } finally {
    try { await stopOwnedProcess(child, deadline); }
    finally { const target = resolve(directory); if (!target.startsWith(resolve(tmpdir()) + sep) || !target.slice((resolve(tmpdir()) + sep).length).startsWith('ftlite-config-test-')) throw Error('test-cleanup-target'); rmSync(target, { recursive: true, force: true }); }
  }
}, 30000);
