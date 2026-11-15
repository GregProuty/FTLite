/** electron-vite 5.0.0's isolated-entry reporter calls cursor controls even on pipes.
 * Supply only missing controls on non-terminal stdout; ordinary output/errors stay intact.
 * Remove this compatibility helper when that pinned reporter gains a non-TTY guard.
 */
export function ensureIsolatedBuildReporterOutput(stdout: NodeJS.WriteStream = process.stdout): void {
  if (stdout.isTTY) return;
  stdout.clearLine ??= (_direction, callback) => { callback?.(); return true; };
  stdout.moveCursor ??= (_dx, _dy, callback) => { callback?.(); return true; };
  stdout.cursorTo ??= (_x: number, yOrCallback?: number | (() => void), callback?: () => void) => {
    if (typeof yOrCallback === 'function') yOrCallback(); else callback?.();
    return true;
  };
}
