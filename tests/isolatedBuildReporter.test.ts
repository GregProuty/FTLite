import { describe, expect, it, vi } from 'vitest';
import { ensureIsolatedBuildReporterOutput } from '../build/isolatedBuildReporter';

describe('piped isolated-preload build output', () => {
  it('supplies missing cursor controls for the pinned reporter without swallowing normal output', () => {
    const stdout = { isTTY: false, write: vi.fn() } as unknown as NodeJS.WriteStream;
    ensureIsolatedBuildReporterOutput(stdout);
    const completed = vi.fn();
    expect(stdout.clearLine(0, completed)).toBe(true);
    expect(stdout.moveCursor(0, -1, completed)).toBe(true);
    expect(stdout.cursorTo(0, 0, completed)).toBe(true);
    expect(completed).toHaveBeenCalledTimes(3);
    stdout.write('build diagnostic'); expect(stdout.write).toHaveBeenCalledWith('build diagnostic');
  });
  it('preserves existing cursor controls and never alters terminal output', () => {
    const native = vi.fn(), piped = { isTTY: false, clearLine: native, moveCursor: native, cursorTo: native } as unknown as NodeJS.WriteStream;
    ensureIsolatedBuildReporterOutput(piped);
    expect(piped.clearLine).toBe(native); expect(piped.moveCursor).toBe(native); expect(piped.cursorTo).toBe(native);
    const terminal = { isTTY: true } as NodeJS.WriteStream;
    ensureIsolatedBuildReporterOutput(terminal);
    expect(terminal.clearLine).toBeUndefined(); expect(terminal.moveCursor).toBeUndefined(); expect(terminal.cursorTo).toBeUndefined();
  });
});
