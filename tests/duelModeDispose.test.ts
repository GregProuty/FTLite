// duelMode's dispose path clears the duel sink: the scene's dispose calls ui.clear() (React UI spec §2), and the mode's own
// dispose disposes the scene exactly once. Input, runtime and scene are stubbed so no renderer is needed.
import { expect, it, vi } from 'vitest';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';

const h = vi.hoisted(() => ({ disposes: 0 }));
vi.mock('../src/renderer/src/app/duel/input', () => ({
  createDuelKeyboard: () => ({ sample() {}, clear() {}, destroy() {} }), createPointerSource: () => ({ sample() {}, clear() {}, destroy() {} })
}));
vi.mock('../src/renderer/src/app/duel/runtime', () => ({ createDuelRuntime: () => ({ pause() {}, resume() {}, dispose() {} }) }));
vi.mock('../src/renderer/src/app/duel/scene', () => ({
  createDuelScene: (_r: unknown, opts: { ui: { frame(v: unknown): void; clear(): void } }) => {
    opts.ui.frame({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null });
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
