// The hud sink (React UI spec §2, §7): the sector sessions' deps.hud. update shares and writes the hud slice, an equal
// model writes nothing, the first model bumps epochs.hud, clear() returns it to null.
import { describe, expect, it } from 'vitest';
import { createUiStore } from '../src/renderer/src/ui/store';
import { createHudSink } from '../src/renderer/src/ui/sinks';
import { buildHudModel, HUD_MAX_CELLS, seatedName } from '../src/renderer/src/render/hudModel';
import { createCardUi } from '../src/renderer/src/clientControl/cardController';
import { STATION_MAX, STATION_OVERDRIVE, UPGRADE_MAX } from '../src/renderer/src/sim/tuning';
import { STATION_NAMES } from '../src/renderer/src/sim/stationKinds';
import { makeState } from './helpers/sim';

const model = () => buildHudModel(makeState(2), { mode: 'player', player: 0, ui: createCardUi() }, { phase: 'running', message: '', slots: [{ status: 'active', key: 'kb:0' }, { status: 'bot', key: null }] });

describe('the hud sink', () => {
  it('writes a changed model once, skips an equal one, bumps the epoch once and clears', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createHudSink(store); let writes = 0; store.subscribe(() => { writes++; });
    const m = model(); sink.update(m); sink.update(structuredClone(m)); expect(writes).toBe(1);
    sink.update({ ...structuredClone(m), message: 'x' }); expect(writes).toBe(2); expect(store.getState().epochs.hud).toBe(1);
    sink.clear(); expect(store.getState().hud).toBeNull(); sink.clear(); expect(writes).toBe(3);
  });
});

describe('the HUD view values the UI reads', () => {
  it('names a seated player\'s station and counts the widest cell row', () => {
    const p = model().players[0]!;
    expect(seatedName({ ...p, seated: null })).toBe(''); expect(seatedName({ ...p, seated: 2 })).toBe(STATION_NAMES[2]);
    expect(HUD_MAX_CELLS).toBe(Math.max(...STATION_MAX) + UPGRADE_MAX + STATION_OVERDRIVE);
  });
});
