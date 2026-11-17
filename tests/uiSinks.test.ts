// The duel and flight sinks (React UI spec §2): one setState per changed frame, none for an equal one, an epoch per
// null -> non-null, and clear() back to null.
import { describe, expect, it } from 'vitest';
import { createUiStore, setLayout } from '../src/renderer/src/ui/store';
import { createDuelSink, createFlightSink } from '../src/renderer/src/ui/sinks';
import { mapOverlayOf, type DuelUiView, type FlightUiView } from '../src/renderer/src/ui/views';

const banners = { interior: null, tactical: null, notice: null };
const duelView = (value: string): DuelUiView => ({ readout: { rows: [{ label: 'HULL', value, labelTint: 1, valueTint: 2 }], help: ['TAB'] }, end: null, banners, overlay: null });

describe('the duel sink', () => {
  it('writes a changed view, skips an equal one and keeps unchanged subtrees', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createDuelSink(store); let writes = 0; store.subscribe(() => { writes++; });
    sink.frame(duelView('10')); expect(writes).toBe(1); const first = store.getState().duel!;
    sink.frame(duelView('10')); expect(writes).toBe(1); expect(store.getState().duel).toBe(first);
    sink.frame(duelView('9')); expect(writes).toBe(2); expect(store.getState().duel!.readout.help).toBe(first.readout.help);
  });
  it('bumps the duel epoch on each null -> non-null and clears to null', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createDuelSink(store);
    sink.frame(duelView('1')); sink.frame(duelView('2')); expect(store.getState().epochs.duel).toBe(1);
    sink.clear(); expect(store.getState().duel).toBeNull(); sink.clear();
    sink.frame(duelView('1')); expect(store.getState().epochs.duel).toBe(2); expect(store.getState().epochs.flight).toBe(0);
  });
});

describe('the flight sink', () => {
  it('writes the flight slice with its own epoch', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createFlightSink(store);
    const view: FlightUiView = { feel: [['SPEED', '1 u/s']], banners, overlay: mapOverlayOf({ zoomText: 'ZOOM 1.00', scaleBar: { px: 80, units: 500 }, snapHint: false, paused: true }) };
    sink.frame(view); expect(store.getState().flight!.overlay).toEqual({ zoomText: 'ZOOM 1.00', scaleBar: { px: 80, units: 500 }, snapHint: false });
    expect(store.getState().epochs.flight).toBe(1); sink.clear(); expect(store.getState().flight).toBeNull();
  });
});

describe('setLayout', () => {
  it('writes only changes', () => {
    const store = createUiStore({ onlineAvailable: false }); let writes = 0; store.subscribe(() => { writes++; });
    setLayout(store, { scale: 1.5, offsetX: 0, offsetY: 30, dpr: 1 }); setLayout(store, { scale: 1.5, offsetX: 0, offsetY: 30, dpr: 1 });
    expect(writes).toBe(1); expect(store.getState().layout).toEqual({ stripHeight: 0, scale: 1.5, offsetX: 0, offsetY: 30, dpr: 1 });
  });
});
