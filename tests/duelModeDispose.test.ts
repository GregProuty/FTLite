// duelMode's dispose path clears the duel sink: the scene's dispose calls ui.clear() (React UI spec §2), and the mode's own
// dispose disposes the scene exactly once. Input, runtime and scene are stubbed so no renderer is needed.
import { expect, it, vi } from 'vitest';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';

const h = vi.hoisted(() => ({ disposes: 0, kbOpts: undefined as undefined | { intercept?(code: string): boolean } }));
vi.mock('../src/renderer/src/app/duel/input', () => ({
  createDuelKeyboard: (_t: unknown, o?: { intercept?(code: string): boolean }) => { h.kbOpts = o; return { sample() {}, clear() {}, destroy() {} }; }, createPointerSource: () => ({ sample() {}, clear() {}, destroy() {} })
}));
vi.mock('../src/renderer/src/app/duel/runtime', () => ({ createDuelRuntime: () => ({ pause() {}, resume() {}, dispose() {} }) }));
vi.mock('../src/renderer/src/app/duel/scene', () => ({
  createDuelScene: (_r: unknown, opts: { ui: { frame(v: unknown): void; clear(): void } }) => {
    opts.ui.frame({ end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null });
    return { dispose() { h.disposes++; opts.ui.clear(); } };
  }
}));
import { startDuelMode } from '../src/renderer/src/app/duel/duelMode';

it('disposing the solo duel mode clears the duel slice, once', () => {
  const listeners: Record<string, unknown> = {};
  const w = { addEventListener(t: string, f: unknown) { listeners[t] = f; }, removeEventListener() {} };
  (globalThis as Record<string, unknown>).window = w; (globalThis as Record<string, unknown>).document = { addEventListener() {}, removeEventListener() {} };
  const store = createUiStore({ onlineAvailable: false });
  const renderer = { app: { canvas: {}, ticker: { add() {}, remove() {} } } };
  const dispose = startDuelMode({ renderer: renderer as never, seed: 1, ui: createDuelSink(store), layout: {} as never });
  expect(store.getState().duel).not.toBeNull();
  dispose(); dispose();
  expect(h.disposes).toBe(1);
  expect(store.getState().duel).toBeNull();
  delete (globalThis as Record<string, unknown>).window; delete (globalThis as Record<string, unknown>).document;
});

it('hands its contact controller to setContact on start and null on dispose (enemy ship window spec §6.1)', () => {
  const w = { addEventListener() {}, removeEventListener() {} };
  (globalThis as Record<string, unknown>).window = w; (globalThis as Record<string, unknown>).document = { addEventListener() {}, removeEventListener() {} };
  const setContact = vi.fn();
  const renderer = { app: { canvas: {}, ticker: { add() {}, remove() {} } } };
  const dispose = startDuelMode({ renderer: renderer as never, seed: 1, ui: createDuelSink(createUiStore({ onlineAvailable: false })), layout: {} as never, setContact });
  expect(setContact).toHaveBeenCalledTimes(1);
  const c = setContact.mock.calls[0]![0] as { close: unknown; arm: unknown; cancelAim: unknown; pick: unknown };
  expect([typeof c.close, typeof c.arm, typeof c.cancelAim, typeof c.pick]).toEqual(['function', 'function', 'function', 'function']);
  dispose();
  expect(setContact).toHaveBeenCalledTimes(2); expect(setContact.mock.calls[1]![0]).toBeNull();
  delete (globalThis as Record<string, unknown>).window; delete (globalThis as Record<string, unknown>).document;
});

it('passes the contact controller\'s intercept to the keyboard: a shown window takes Escape (spec §6.2)', () => {
  const w = { addEventListener() {}, removeEventListener() {} };
  (globalThis as Record<string, unknown>).window = w; (globalThis as Record<string, unknown>).document = { addEventListener() {}, removeEventListener() {} };
  const setContact = vi.fn();
  const renderer = { app: { canvas: {}, ticker: { add() {}, remove() {} } } };
  const dispose = startDuelMode({ renderer: renderer as never, seed: 1, ui: createDuelSink(createUiStore({ onlineAvailable: false })), layout: {} as never, setContact });
  const c = setContact.mock.calls[0]![0] as import('../src/renderer/src/app/duel/contactController').ContactController;
  c.click(1);
  c.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0 });
  expect(h.kbOpts?.intercept?.('Escape')).toBe(true);
  expect(c.state()).toBeNull();
  dispose();
  delete (globalThis as Record<string, unknown>).window; delete (globalThis as Record<string, unknown>).document;
});
