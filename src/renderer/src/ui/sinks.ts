// The sinks (React UI spec §2): the scene and the flight mode call frame(view) once per frame and clear() on dispose.
// frame shares the new view against the stored one and writes only when something changed.
import type { UiPerf } from './perf';
import { replaceEqualDeep } from './share';
import type { UiStore } from './store';
import type { HudModel } from '../render/hudModel';
import type { DuelUiView, FlightUiView } from './views';

export interface Sink<V> { frame(view: V): void; clear(): void }
export type DuelSink = Sink<DuelUiView>;
export type FlightSink = Sink<FlightUiView>;

const passThrough: UiPerf = { run: (write) => write() };
function createSink<K extends 'duel' | 'flight' | 'hud'>(store: UiStore, key: K, perf: UiPerf = passThrough): Sink<NonNullable<ReturnType<UiStore['getState']>[K]>> {
  return {
    frame(view) {
      const prev = store.getState()[key], next = replaceEqualDeep(prev, view);
      if (next === prev) return;
      perf.run(() => store.setState((s) => ({ [key]: next, epochs: prev === null ? { ...s.epochs, [key]: s.epochs[key] + 1 } : s.epochs }) as Partial<ReturnType<UiStore['getState']>>));
    },
    clear() { if (store.getState()[key] !== null) store.setState({ [key]: null } as Partial<ReturnType<UiStore['getState']>>); }
  };
}
export function createDuelSink(store: UiStore, perf?: UiPerf): DuelSink { return createSink(store, 'duel', perf); }
export function createFlightSink(store: UiStore, perf?: UiPerf): FlightSink { return createSink(store, 'flight', perf); }
export interface HudSink { update(m: HudModel): void; clear(): void }
export function createHudSink(store: UiStore, perf?: UiPerf): HudSink { const s = createSink(store, 'hud', perf); return { update: (m) => s.frame(m), clear: () => s.clear() }; }

/** The F3 latency overlay's lines (H-2b, render/duel/latencyOverlay.ts): frame shows them, clear hides the overlay. */
export type LatencySink = Sink<readonly string[]>;
export function createLatencySink(store: UiStore, perf: UiPerf = passThrough): LatencySink {
  return {
    frame(lines) {
      const prev = store.getState().latency, next = replaceEqualDeep(prev, lines);
      if (next !== prev) perf.run(() => store.setState({ latency: next }));
    },
    clear() { if (store.getState().latency !== null) store.setState({ latency: null }); }
  };
}
