import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAppExit } from '../src/main/appExit';

afterEach(() => vi.useRealTimers());
function harness() {
  const webContents = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false, send: vi.fn() });
  const win = Object.assign(new EventEmitter(), { webContents, isDestroyed: () => false, close: vi.fn() });
  const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const handlers = new Map<string, (...args: any[]) => unknown>();
  registerAppExit(app as never, win as never, { handle: (name: string, cb: any) => { handlers.set(name, cb); }, removeHandler: (name: string) => { handlers.delete(name); } } as never, 3000);
  const event = () => ({ preventDefault: vi.fn() });
  const answer = (request: unknown, sender: unknown = webContents, frame: unknown = webContents.mainFrame) => handlers.get('app:prepare-exit')?.({ sender, senderFrame: frame }, request);
  return { win, app, webContents, handlers, event, answer };
}
describe('the Electron close handshake (web build spec §3.3)', () => {
  it('asks the page once across repeated close and quit, accepts only the trusted answer, then quits', async () => {
    const h = harness(), first = h.event(), second = h.event(), quit = h.event();
    h.win.emit('close', first); h.win.emit('close', second); h.app.emit('before-quit', quit);
    expect(first.preventDefault).toHaveBeenCalled(); expect(second.preventDefault).toHaveBeenCalled(); expect(quit.preventDefault).toHaveBeenCalled();
    expect(h.webContents.send.mock.calls).toEqual([['app:prepare-exit', 1]]);
    expect(h.answer(1, {})).toBe(false); expect(h.answer(2)).toBe(false); expect(h.answer(1, h.webContents, {})).toBe(false);
    expect(h.answer(1)).toBe(true);
    await vi.waitFor(() => expect(h.app.quit).toHaveBeenCalledOnce()); expect(h.win.close).not.toHaveBeenCalled();
    const after = h.event(); h.win.emit('close', after); expect(after.preventDefault).not.toHaveBeenCalled();
  });
  it('closes after 3 s when the page never answers', async () => {
    vi.useFakeTimers(); const h = harness(); h.win.emit('close', h.event());
    await vi.advanceTimersByTimeAsync(2999); expect(h.win.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(h.win.close).toHaveBeenCalledOnce(); expect(h.handlers.has('app:prepare-exit')).toBe(false);
  });
  it('closes at once when the page process is gone', async () => {
    const h = harness(); h.win.emit('close', h.event()); h.webContents.emit('render-process-gone');
    await vi.waitFor(() => expect(h.win.close).toHaveBeenCalledOnce());
  });
  it('removes its listeners and handler when the window closes', () => {
    const h = harness(); h.win.emit('closed');
    expect(h.win.listenerCount('close')).toBe(0); expect(h.app.listenerCount('before-quit')).toBe(0); expect(h.handlers.size).toBe(0);
  });
});
