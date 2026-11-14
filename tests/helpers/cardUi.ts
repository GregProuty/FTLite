import type { SimState } from '../../src/renderer/src/sim/state';
import { StationKind } from '../../src/renderer/src/sim/stationKinds';
import { cardRowIndex, cardRows, createCardUiState } from '../../src/renderer/src/clientControl/cardController';
import { upgradeRows, REACTOR_ROW, BACK_ROW } from '../../src/renderer/src/sim/power';
import { fixtureRunner } from './rawInput';
import { buildHudModel, type Viewer } from '../../src/renderer/src/render/hudModel';
export function fixtureCardUi(state: SimState) { const runner = fixtureRunner(state); runner.refresh(); return runner.ui; }
/** Numeric fixture convenience only; migrated UI never reads canonical slots. */
export function cardSelection(state: SimState, station: number) {
  const ui = fixtureCardUi(state), kind = state.derived.stationKind[station];
  return {
    get cursor(): number {
      const index = cardRowIndex(state, station, ui);
      return kind === StationKind.Engineering && ui.stations[station]!.page === 'upgrades' ? upgradeRows(state)[index]! : index;
    },
    set cursor(value: number) {
      const memory = ui.stations[station]!;
      memory.rowKey = kind === StationKind.Engineering && memory.page === 'upgrades' ? value === REACTOR_ROW ? 'reactor' : value === BACK_ROW ? 'back' : `upgrade:${value}` : cardRows(state, station, ui)[value]?.key ?? null;
    },
    get page(): number { return ui.stations[station]!.page === 'upgrades' ? 1 : 0; },
    set page(value: number) { ui.stations[station]!.page = value ? 'upgrades' : 'main'; }
  };
}
export function fixtureCouchViewer(state: SimState | null): Viewer {
  return { mode: 'couch', ui: state ? fixtureCardUi(state) : createCardUiState('lobby', 0) };
}
export { buildHudModel as buildFixtureHud };
