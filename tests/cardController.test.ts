import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import { describe, it, expect } from 'vitest';
import { createCardUi, reconcileUi, translateTick } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { makeState, quiet, setEvent } from './helpers/sim';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Dir } from '../src/renderer/src/sim/dir';
import { navRows } from '../src/renderer/src/sim/run';

describe('client semantic interaction translation', () => {
  it('preserves fixture visit identity with a signed historical arrival tick over bytes', () => {
    const s = makeState(2); setEvent(s, 0); s.run.arrivalTick = -7200;
    const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const envelope = translateTick(s, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], s.tick).commands[0]!;
    expect(decodeMessage(encodeMessage({ kind: 'command', envelope }))).toEqual({ kind: 'command', envelope });
  });
  it('two vote presses before publication explicitly choose 0 then 1', () => {
    const s = makeState(2); quiet(s); setEvent(s, 0);
    const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const frame = { ...NEUTRAL_FRAME, confirmPresses: 1 };
    const first = translateTick(s, ui, [frame], s.tick);
    const second = translateTick(s, ui, [frame], s.tick);
    expect([first.commands[0]?.command, second.commands[0]?.command]).toMatchObject([{ kind: 'vote', choice: 0 }, { kind: 'vote', choice: 1 }]);
    expect(first.legacyCardInput).toEqual([]);
  });
  it('Navigation direction plus Confirm emits one explicit vote and bridge direction without Confirm', () => {
    const s = makeState(2); quiet(s); setEvent(s, 0);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav);
    s.stations.cursor[nav] = navRows(s).findIndex(r => r.select === 'choice');
    const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const actions = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1, confirmPresses: 1 }], s.tick);
    expect(actions.commands.map(c => c.command)).toMatchObject([{ kind: 'vote', choice: 1 }]);
    expect(actions.legacyCardInput.map(c => c.input)).toEqual([{ station: nav, direction: Dir.Down, confirm: false }]);
  });
  it('held card direction repeats once every eight ticks and resets on a fresh seat', () => {
    const s = makeState(); const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav);
    const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const ticks: number[] = [];
    for (let tick = 0; tick < 18; tick++) if (translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1 }], tick).legacyCardInput.length) ticks.push(tick);
    expect(ticks).toEqual([0, 8, 16]);
    standUp(s, 0); reconcileUi(s, ui, 'run', []); sitDown(s, 0, nav); reconcileUi(s, ui, 'run', []);
    expect(translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1 }], 18).legacyCardInput[0]?.input).toMatchObject({ direction: Dir.Down });
    expect('stick' in s).toBe(false); expect('bar' in s.groups).toBe(false);
  });
});
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { fixtureRunner } from './helpers/rawInput';
import { Seated } from '../src/renderer/src/sim/components';
import { pauseActions } from '../src/renderer/src/clientControl/cardController';
import { selectTab } from '../src/renderer/src/sim/stations';
import { stepCommands } from '../src/renderer/src/sim/step';
import { eventRef } from '../src/renderer/src/sim/commands';

describe('shared client navigation and held inputs', () => {
  it('holds one repeat stream across two group tabs over the full byte path', () => {
    const s = createSimState(parseShip(skiff), 2, 1); quiet(s);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, group = s.derived.stationGroup[nav]!; sitDown(s, 0, nav);
    const runner = fixtureRunner(s); runner.ui.groupBar[group] = true;
    const changes: number[] = [];
    for (let tick = 0; tick <= 16; tick++) {
      const previous = runner.view().groups.tab[group];
      runner.advance([{ ...NEUTRAL_FRAME, moveX: 1 }]);
      if (runner.view().groups.tab[group] !== previous) changes.push(tick);
    }
    expect(changes).toEqual([0, 8, 16]); expect(runner.ui.groupBar[group]).toBe(true);
  });
  it('a Navigation occupant on another active tab does not become a standing-style voter', () => {
    const s = createSimState(parseShip(skiff), 2, 1); setEvent(s, 0);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, wpn = s.derived.stationOfKind[StationKind.Weapons]!, group = s.derived.stationGroup[nav]!;
    sitDown(s, 0, nav); selectTab(s, 0, group, s.derived.groupStations[group]!.indexOf(wpn));
    const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const actions = translateTick(s, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], 0);
    expect(Seated.station[s.crew[0]!]).toBe(wpn); expect(actions.commands).toEqual([]);
    expect(actions.legacyCardInput).toHaveLength(1);
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [{ runId: 'run', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'vote', event: eventRef(s), choice: 0 } }] });
    expect(results[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
  });
  it('movement and held Interact remain raw state, while pause shares semantic and bridge sequences', () => {
    const s = makeState(1); const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const held = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveX: .8, moveY: .8, interactHeld: true, interactPresses: 1 }], 0);
    expect(held.held[0]!.held).toEqual({ moveX: .8, moveY: .8, interactHeld: true }); expect(held.commands).toEqual([]); expect(held.legacyCardInput).toEqual([]);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav); reconcileUi(s, ui, 'run', []);
    const card = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1 }], 1);
    const pause = pauseActions(ui, 0, 1, true);
    const stand = translateTick(s, ui, [{ ...NEUTRAL_FRAME, interactPresses: 1, cancelPresses: 1, confirmPresses: 1 }], 1);
    expect([card.legacyCardInput[0]!.id.sequence, pause.commands[0]!.id.sequence, stand.commands[0]!.id.sequence]).toEqual([1, 2, 3]);
    expect(stand.commands.map(c => c.command.kind)).toEqual(['stand']); expect(stand.legacyCardInput).toEqual([]);
  });
});

it('repeat preserves tick phase across missed opportunities and changes direction immediately', () => {
  const s = makeState(1); sitDown(s, 0, s.derived.stationOfKind[StationKind.Navigation]!);
  const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
  const down = { ...NEUTRAL_FRAME, moveY: 1 };
  expect(translateTick(s, ui, [down], 0).legacyCardInput).toHaveLength(1);
  expect(translateTick(s, ui, [down], 3).legacyCardInput).toHaveLength(0);
  expect(translateTick(s, ui, [down], 8).legacyCardInput).toHaveLength(1);
  expect(translateTick(s, ui, [down], 8).legacyCardInput).toHaveLength(0);
  expect(translateTick(s, ui, [{ ...down, moveY: -1 }], 11).legacyCardInput[0]?.input.direction).toBe(Dir.Up);
  expect(translateTick(s, ui, [{ ...down, moveY: -1 }], 18).legacyCardInput).toHaveLength(0);
  expect(translateTick(s, ui, [{ ...down, moveY: -1 }], 19).legacyCardInput).toHaveLength(1);
});
