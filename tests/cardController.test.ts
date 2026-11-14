import { cardSelection } from './helpers/cardUi';
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
  it('Navigation direction plus Confirm emits one explicit vote with no bridge input', () => {
    const s = makeState(2); quiet(s); setEvent(s, 0);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav);
    cardSelection(s, nav).cursor = navRows(s).findIndex(r => r.select === 'choice');
    const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const actions = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1, confirmPresses: 1 }], s.tick);
    expect(actions.commands.map(c => c.command)).toMatchObject([{ kind: 'vote', choice: 1 }]);
    expect(actions.legacyCardInput).toEqual([]); expect(ui.stations[nav]!.rowKey).toBe('choice:1');
  });
  it('held card direction repeats once every eight ticks and resets on a fresh seat', () => {
    const s = makeState(); const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav);
    const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const ticks: number[] = [];
    for (let tick = 0; tick < 18; tick++) { const previous = ui.stations[nav]!.rowKey; translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1 }], tick); if (ui.stations[nav]!.rowKey !== previous) ticks.push(tick); }
    expect(ticks).toEqual([0, 8, 16]);
    standUp(s, 0); reconcileUi(s, ui, 'run', []); sitDown(s, 0, nav); reconcileUi(s, ui, 'run', []);
    const previous = ui.stations[nav]!.rowKey; translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1 }], 18); expect(ui.stations[nav]!.rowKey).not.toBe(previous);
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
    expect(actions.legacyCardInput).toEqual([]); // Weapons is semantic; with no target, Confirm emits neither fire nor vote.
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [{ runId: 'run', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'vote', event: eventRef(s), choice: 0 } }] });
    expect(results[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
  });
  it('movement and held Interact remain raw state, while pause shares the gameplay command sequence', () => {
    const s = makeState(1); const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
    const held = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveX: .8, moveY: .8, interactHeld: true, interactPresses: 1 }], 0);
    expect(held.held[0]!.held).toEqual({ moveX: .8, moveY: .8, interactHeld: true }); expect(held.commands).toEqual([]); expect(held.legacyCardInput).toEqual([]);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav); reconcileUi(s, ui, 'run', []);
    const card = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: 1, confirmPresses: 1 }], 1);
    const pause = pauseActions(ui, 0, 1, true);
    const stand = translateTick(s, ui, [{ ...NEUTRAL_FRAME, interactPresses: 1, cancelPresses: 1, confirmPresses: 1 }], 1);
    expect([card.commands[0]!.id.sequence, pause.commands[0]!.id.sequence, stand.commands[0]!.id.sequence]).toEqual([1, 2, 3]);
    expect(stand.commands.map(c => c.command.kind)).toEqual(['stand']); expect(stand.legacyCardInput).toEqual([]);
  });
});

it('repeat preserves tick phase across missed opportunities and changes direction immediately', () => {
  const s = makeState(1), nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav);
  const ui = createCardUi('run'); reconcileUi(s, ui, 'run', []);
  const down = { ...NEUTRAL_FRAME, moveY: 1 };
  const changed = (tick: number, frame = down) => { const previous = ui.stations[nav]!.rowKey; const actions = translateTick(s, ui, [frame], tick); expect(actions.legacyCardInput).toEqual([]); return ui.stations[nav]!.rowKey !== previous; };
  expect(changed(0)).toBe(true); expect(changed(3)).toBe(false); expect(changed(8)).toBe(true); expect(changed(8)).toBe(false);
  expect(changed(11, { ...down, moveY: -1 })).toBe(true); expect(ui.players[0]!.heldDir).toBe(Dir.Up);
  expect(changed(18, { ...down, moveY: -1 })).toBe(false); expect(changed(19, { ...down, moveY: -1 })).toBe(true);
});
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { LAYOUT } from './helpers/sim';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

/** Real bytes/ledger/pause/publication path; mutations only create the initial fixture. */
function votePublicationRig() {
  const owner = makeState(2); quiet(owner); setEvent(owner, 4);
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
  const pair = transport.connectLocal(); let now = 0;
  const client = createClientRun(pair.clientLink, [0, 1], { runId: 'vote-publication', resolveLayout: () => LAYOUT });
  const authority = createFixtureAuthority({ clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} },
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT, onCrash(record) { throw new Error(record.error); },
    beforeControls() { transport.drain(); }, beforeTick() { transport.drain(); },
    init: { runId: 'vote-publication', layoutId: LAYOUT.id, layoutHash: owner.derived.layoutHash, simVersion: SIM_VERSION,
      contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 1, playerCount: 2, characters: [], unlocked: [] }
  }, owner);
  authority.attach(pair.authorityLink, [0, 1]); transport.drain();
  return { owner, client, pair,
    press(requestedTick = owner.tick) {
      const actions = translateTick(client.state()!, client.ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], requestedTick);
      client.send(actions); return actions.commands[0]!;
    },
    pause(paused: boolean, requestedTick = owner.tick) { client.send(pauseActions(client.ui, 0, requestedTick, paused)); },
    pump(time = now) { now = time; authority.pump(); transport.drain(); },
    dispose() { authority.dispose(); client.dispose(); pair.host.close('test-end'); pair.client.close('test-end'); }
  };
}

describe('pending vote completion across control publications', () => {
  it('retains the submitted choice through pause/resume admission-only publications', () => {
    const h = votePublicationRig();
    try {
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 0 });
      h.pause(true); h.pump();
      expect(h.client.publication()).toMatchObject({ tick: 0, phase: 'paused', commandHighWater: [2, 0] });
      expect(h.owner.run.vote[0]).toBe(-1);
      expect(h.client.ui.players[0]!.pendingVote?.choice).toBe(0);
      h.pause(false); h.pump();
      expect(h.client.publication()).toMatchObject({ tick: 0, phase: 'running', commandHighWater: [3, 0] });
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 1 });
      h.pump(17);
      expect(h.owner.run.vote[0]).toBe(1); expect(h.client.ui.players[0]!.pendingVote).toBeNull();
    } finally { h.dispose(); }
  });
  it('retires a successful vote only when the executed state is published', () => {
    const h = votePublicationRig();
    try {
      const sent = h.press(), pendingAtResult: number[] = [];
      h.pair.clientLink.onMessage((_channel, bytes) => {
        const message = decodeMessage(bytes);
        if (message.kind === 'result' && message.result.id.player === 0 && message.result.id.sequence === sent.id.sequence)
          pendingAtResult.push(h.client.ui.players[0]!.pendingVote?.choice ?? -1);
      });
      h.pump(17);
      expect(pendingAtResult).toEqual([0]);
      expect(h.client.state()!.run.vote[0]).toBe(0); expect(h.client.ui.players[0]!.pendingVote).toBeNull();
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 1 });
    } finally { h.dispose(); }
  });
  it('retires a matching terminal rejection without requiring another publication', () => {
    const h = votePublicationRig();
    try {
      h.press(1); h.pump();
      expect(h.client.takeResults()).toContainEqual(expect.objectContaining({ id: { player: 0, sequence: 1 }, status: 'rejected', reason: 'stale-tick' }));
      expect(h.client.publication()!.commandHighWater).toEqual([0, 0]);
      expect(h.client.ui.players[0]!.pendingVote).toBeNull();
      expect(h.press().command).toMatchObject({ kind: 'vote', choice: 0 });
    } finally { h.dispose(); }
  });
  it('an older rejected vote and unrelated rejected control preserve the newest pending choice', () => {
    const h = votePublicationRig();
    try {
      h.press(1); expect(h.press().command).toMatchObject({ kind: 'vote', choice: 1 });
      h.pause(true, 1); h.pump();
      expect(h.client.takeResults().map(result => result.id.sequence)).toEqual([1, 3]);
      expect(h.client.ui.players[0]!.pendingVote?.choice).toBe(1);
      h.pump(17); expect(h.owner.run.vote[0]).toBe(1);
    } finally { h.dispose(); }
  });
});
