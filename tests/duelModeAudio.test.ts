// Audio-i spec section 4b: Single player was silent (main.ts gave startDuelMode no audio); the solo duel now hands its
// audio to the scene. Input, runtime and scene are stubbed as in duelModeDispose.test.ts.
import { expect, it, vi } from 'vitest';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';

const h = vi.hoisted(() => ({ opts: [] as unknown[] }));
vi.mock('../src/renderer/src/app/duel/input', () => ({
  createDuelKeyboard: () => ({ sample() {}, clear() {}, destroy() {} }), createPointerSource: () => ({ sample() {}, clear() {}, destroy() {} })
}));
vi.mock('../src/renderer/src/app/duel/runtime', () => ({ createDuelRuntime: () => ({ pause() {}, resume() {}, dispose() {} }) }));
vi.mock('../src/renderer/src/app/duel/scene', () => ({ createDuelScene: (_r: unknown, opts: unknown) => { h.opts.push(opts); return { dispose() {} }; } }));
import { startDuelMode } from '../src/renderer/src/app/duel/duelMode';

it('the solo duel passes its audio to the scene', () => {
  (globalThis as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {} };
  (globalThis as Record<string, unknown>).document = { addEventListener() {}, removeEventListener() {} };
  const audio = { play() {}, sounds() {}, status() {} };
  const renderer = { app: { canvas: {}, ticker: { add() {}, remove() {} } } };
  const dispose = startDuelMode({ renderer: renderer as never, seed: 1, ui: createDuelSink(createUiStore({ onlineAvailable: false })), layout: {} as never, audio });
  expect((h.opts[0] as { audio?: unknown }).audio).toBe(audio);
  dispose();
  delete (globalThis as Record<string, unknown>).window; delete (globalThis as Record<string, unknown>).document;
});
