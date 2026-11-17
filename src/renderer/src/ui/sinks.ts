// The sinks (React UI spec §2): the scene and the flight mode call frame(view) once per frame and clear() on dispose.
// frame shares the new view against the stored one and writes only when something changed.
import { replaceEqualDeep } from './share';
import type { UiStore } from './store';
import type { DuelUiView, FlightUiView } from './views';

export interface Sink<V> { frame(view: V): void; clear(): void }
export type DuelSink = Sink<DuelUiView>;
export type FlightSink = Sink<FlightUiView>;

function createSink<K extends 'duel' | 'flight'>(store: UiStore, key: K): Sink<NonNullable<ReturnType<UiStore['getState']>[K]>> {
  return {
    frame(view) {
      const prev = store.getState()[key], next = replaceEqualDeep(prev, view);
      if (next === prev) return;
      store.setState((s) => ({ [key]: next, epochs: prev === null ? { ...s.epochs, [key]: s.epochs[key] + 1 } : s.epochs }) as Partial<ReturnType<UiStore['getState']>>);
    },
    clear() { if (store.getState()[key] !== null) store.setState({ [key]: null } as Partial<ReturnType<UiStore['getState']>>); }
  };
}
export function createDuelSink(store: UiStore): DuelSink { return createSink(store, 'duel'); }
export function createFlightSink(store: UiStore): FlightSink { return createSink(store, 'flight'); }
