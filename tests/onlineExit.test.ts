import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { registerOnlineExit } from '../src/main/network/onlineExit';

it('shares one final save across repeated window close and app quit, then permits termination', async () => {
  let saved!: () => void; const gate = new Promise<void>(resolve => { saved = resolve; });
  const owner = { prepareExit: vi.fn(() => gate), dispose: vi.fn(async () => {}) };
  const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const win = Object.assign(new EventEmitter(), { isDestroyed: () => false, close: vi.fn() });
  registerOnlineExit(app as any, win as any, owner);
  const event = { preventDefault: vi.fn() };
  win.emit('close', event); win.emit('close', event); app.emit('before-quit', event); app.emit('before-quit', event);
  await Promise.resolve();
  expect(event.preventDefault).toHaveBeenCalledTimes(4); expect(owner.prepareExit).toHaveBeenCalledOnce(); expect(app.quit).not.toHaveBeenCalled();
  saved(); await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce()); expect(owner.dispose).toHaveBeenCalledOnce();
  const later = { preventDefault: vi.fn() }; app.emit('before-quit', later); win.emit('close', later); expect(later.preventDefault).not.toHaveBeenCalled();
  win.emit('closed'); expect(app.listenerCount('before-quit')).toBe(0);
});
