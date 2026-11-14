import { describe, it, expect } from 'vitest';
import { makeState, quiet, mapM, setEvent, setNodeTypes } from './helpers/sim';
import { sitDown, selectTab, standUp } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { createCardUiState, reconcileUi, reconcileCardUi, translateTick, cardRows, cardRowIndex } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { stepCommands } from '../src/renderer/src/sim/step';
import { hashState } from '../src/renderer/src/sim/hash';
import { DT, JUMP_CHARGE_TIME, SECTORS, SECTOR_COLUMNS, FUEL_COST, SHOP_FUEL, EVADE_WINDOW, EVADE_COOLDOWN, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { applyConsoleCommand, visitRef, eventRef } from '../src/renderer/src/sim/commands';
import { navRows, NodeType } from '../src/renderer/src/sim/run';
import type { Command } from '../src/renderer/src/net/contracts';
import { createFixtureRunner } from './helpers/authorityFixture';
import { flatten } from '../src/renderer/src/sim/flatten';
import { resolveEvent } from '../src/renderer/src/sim/events';
import { weaponDef } from '../src/renderer/src/sim/weaponDefs';
import { Life, LifeState } from '../src/renderer/src/sim/components';
const apply = (s: ReturnType<typeof makeState>, command: Command, player = 0) => applyConsoleCommand(s, { runId: 'run', requestedTick: s.tick, id: { player, sequence: 1 }, command });
const setup = () => { const s = makeState(1); quiet(s); const station = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, station); const ui = createCardUiState('run', 1); reconcileUi(s, ui, 'run', []); return { s, station, ui }; };
describe('semantic Navigation', () => {
  it('emits a jump below published readiness and validates after jumpStep', () => {
    const { s, station, ui } = setup(); s.run.jumpCharge = 1 - DT / JUMP_CHARGE_TIME;
    const actions = translateTick(s, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], s.tick);
    expect(actions).not.toHaveProperty('legacyCardInput'); expect(actions.commands[0]?.command.kind).toBe('jump');
    expect(cardRows(s, station, ui)[0]?.action?.kind).toBe('jump');
    expect(stepCommands(s, { held: [], commands: actions.commands,  })[0]?.status).toBe('applied');
    expect(s.run.nodesReached).toBe(1);
  });
  it('keeps direction in client memory and confirms the new row in the same tick', () => {
    const { s, station, ui } = setup(), before = hashState(s);
    const actions = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: -1, confirmPresses: 1 }], s.tick);
    expect(actions).not.toHaveProperty('legacyCardInput'); expect(actions.commands[0]?.command).toEqual({ kind: 'evade', station });
    expect(ui.stations[station]?.rowKey).toBe('evade:0'); expect(hashState(s)).toBe(before);
  });
  it('removes every canonical UI field from state', () => {
    const { s } = setup(); expect(s.stations).not.toHaveProperty('cursor'); expect(s.stations).not.toHaveProperty('page');
    for (const field of ['navSig', 'navSelect', 'navIndex']) expect(s.run).not.toHaveProperty(field);
  });
  it('buys the identified offer at the authoritative price and rejects replacements and revisits', () => {
    const { s, station, ui } = setup(); mapM(s); s.run.column = 1; setNodeTypes(s, { '1:0': NodeType.Shop }); s.run.shopWeapon = 1; s.run.scrap = 999;
    reconcileUi(s, ui, 'run', []); ui.stations[station]!.rowKey = 'buy:3';
    const action = translateTick(s, ui, [{ ...NEUTRAL_FRAME, confirmPresses: 1 }], s.tick).commands[0]!.command;
    expect(action).toEqual({ kind: 'buy', station, visit: { sector: 0, beacon: 4, arrivalTick: 0 }, item: 3, expectedOffer: 1 });
    s.run.shopWeapon = 2; expect(apply(s, action).reason).toBe('stale-target'); expect(s.run.scrap).toBe(999);
    s.run.shopWeapon = 1; s.run.arrivalTick++; expect(apply(s, action).reason).toBe('stale-target');
    s.run.arrivalTick--; expect(apply(s, action).status).toBe('applied'); expect(s.run.scrap).toBe(999 - weaponDef(1).price); expect(s.run.shopWeapon).toBe(0); expect(s.telemetry.purchases).toBe(1);
    expect(apply(s, action).reason).toBe('stale-target');
    const fuel = s.run.fuel, scrap = s.run.scrap;
    expect(apply(s, { kind: 'buy', station, visit: visitRef(s), item: 2, expectedOffer: 0 }).status).toBe('applied');
    expect(s.run.fuel).toBe(fuel + SHOP_FUEL); expect(s.run.scrap).toBe(scrap - FUEL_COST);
    s.run.scrap = 0; expect(apply(s, { kind: 'buy', station, visit: visitRef(s), item: 2, expectedOffer: 0 }).reason).toBe('unavailable');
  });
  it('keeps standalone purchase online gating and blocks inactive or offline grouped Navigation', () => {
    const { s, station } = setup(); mapM(s); s.run.column = 1; setNodeTypes(s, { '1:0': NodeType.Shop }); s.run.scrap = 999; s.stations.level[station] = 0;
    const command: Command = { kind: 'buy', station, visit: visitRef(s), item: 2, expectedOffer: 0 };
    expect(apply(s, command).status).toBe('applied');
    const weapons = s.derived.stationOfKind[StationKind.Weapons]!; s.derived.stationGroup[station] = 0; s.derived.stationGroup[weapons] = 0; s.derived.groupStations.push([station, weapons]); s.groups.tab = new Uint8Array(1); sitDown(s, 0, station);
    expect(apply(s, command).reason).toBe('unavailable');
    selectTab(s, 0, 0, 1); expect(apply(s, command).reason).toBe('invalid-seat');
    standUp(s, 0); expect(apply(s, command).reason).toBe('invalid-seat');
  });
  it('validates reachable travel, fuel and readiness while retaining pending requests', () => {
    const s = makeState(2); quiet(s); mapM(s); const station = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, station);
    const command: Command = { kind: 'jump', station, visit: visitRef(s), destination: 4 };
    expect(apply(s, { ...command, destination: 999 }).reason).toBe('stale-target');
    s.run.jumpCharge = .9; expect(apply(s, command).reason).toBe('unavailable');
    s.run.jumpCharge = 1; s.run.fuel = 0; expect(apply(s, command).status).toBe('rejected');
    s.run.fuel = 8; expect(apply(s, command).status).toBe('applied'); expect(s.run.jumpPending).toBe(4); expect(s.run.fuel).toBe(8);
    expect(apply(s, command).status).toBe('noop'); expect(s.run.jumpPendingTick).toBe(0);
    expect(apply(s, { ...command, visit: { ...visitRef(s), arrivalTick: 1 } }).reason).toBe('stale-target');
  });
  it('reports an applied jump when a pending pilot becomes the only conscious crew', () => {
    const s = makeState(2); quiet(s); mapM(s); const station = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, station);
    const command: Command = { kind: 'jump', station, visit: visitRef(s), destination: 4 };
    expect(apply(s, command).status).toBe('applied'); Life.state[s.crew[1]!] = LifeState.Downed;
    expect(apply(s, command).status).toBe('applied'); expect(s.run.nodesReached).toBe(1); expect(s.run.jumpPending).toBe(-1);
  });
  it.each([0, SECTORS - 1])('crosses the sector or final beacon boundary at execution-time readiness (sector %i)', sector => {
    const { s, station } = setup(); s.run.column = SECTOR_COLUMNS - 1; s.run.sector = sector; s.run.jumpCharge = 1 - DT / JUMP_CHARGE_TIME;
    const runner = createFixtureRunner(s);
    try {
      runner.advance([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);
      expect(s.scratch.commandResults[0]?.status).toBe('applied'); expect(s.run.fuel).toBe(7);
      expect(s.run.finalBeacon).toBe(sector === SECTORS - 1 ? 1 : 0); expect(s.run.sector).toBe(sector === 0 ? 1 : sector);
      expect(runner.ui.stations[station]!.rowKey).toBe(sector === SECTORS - 1 ? 'evade:0' : cardRows(runner.view(), station)[0]!.key);
      if (s.run.finalBeacon) expect(apply(s, { kind: 'sectorJump', station, visit: visitRef(s) }).status).toBe('rejected');
    } finally { runner.dispose(); }
  });
  it('starts wait only on the enabled fuel row and enforces evade cooldown without RNG draws', () => {
    const { s, station } = setup(), rng = JSON.stringify(s.rng);
    const wait: Command = { kind: 'wait', station, visit: visitRef(s) };
    expect(apply(s, wait).reason).toBe('unavailable'); s.run.fuel = 0;
    expect(apply(s, wait).status).toBe('applied'); expect(apply(s, wait).reason).toBe('unavailable');
    expect(apply(s, { kind: 'evade', station }).status).toBe('applied'); expect(s.run.evadeUntilTick).toBe(EVADE_WINDOW * TICK_HZ); expect(s.run.evadeReadyTick).toBe((EVADE_WINDOW + EVADE_COOLDOWN) * TICK_HZ);
    expect(apply(s, { kind: 'evade', station }).reason).toBe('unavailable'); s.tick = s.run.evadeReadyTick;
    expect(apply(s, { kind: 'evade', station }).status).toBe('applied'); expect(JSON.stringify(s.rng)).toBe(rng);
  });
  it('reconciles disappearing rows by semantic identity, then first selectable fallback, without changing state or repeat', () => {
    const { s, station, ui } = setup(); mapM(s); s.run.column = 1; setNodeTypes(s, { '1:0': NodeType.Shop }); s.run.shopWeapon = 1;
    reconcileUi(s, ui, 'run', []); const last = navRows(s).filter(row => row.select === 'jump').at(-1)!;
    ui.stations[station]!.rowKey = `jump:${last.index}`; const beforeIndex = cardRowIndex(s, station, ui); s.run.shopWeapon = 0;
    const before = Array.from(flatten(s)); ui.players[0]!.repeat = 6; reconcileCardUi(s, ui);
    expect(cardRowIndex(s, station, ui)).toBe(beforeIndex - 1); expect(ui.stations[station]!.rowKey).toBe(`jump:${last.index}`); expect(ui.players[0]!.repeat).toBe(6); expect(Array.from(flatten(s))).toEqual(before);
    s.run.shopWeapon = 1; ui.stations[station]!.rowKey = 'buy:3'; reconcileCardUi(s, ui); s.run.shopWeapon = 0; reconcileCardUi(s, ui); expect(ui.stations[station]!.rowKey).toBe('buy:0');
    ui.stations[station]!.rowKey = 'evade:0'; s.run.arrivalTick++; reconcileCardUi(s, ui); expect(ui.stations[station]!.rowKey).toBe('buy:0');
  });
  it('falls from a resolved event choice to the first jump row and rejects a stale event press', () => {
    const { s, station, ui } = setup(); mapM(s); setEvent(s, 4); reconcileUi(s, ui, 'run', []); ui.stations[station]!.rowKey = 'choice:1';
    const event = eventRef(s); resolveEvent(s, 0); reconcileCardUi(s, ui);
    expect(ui.stations[station]!.rowKey).toBe('jump:4'); expect(apply(s, { kind: 'vote', event, choice: 1 }).reason).toBe('stale-target');
  });
  it('uses first-row Up and tab-bar Down locally while a tab switch changes canonical state', () => {
    const { s, station, ui } = setup(), weapons = s.derived.stationOfKind[StationKind.Weapons]!;
    standUp(s, 0); reconcileUi(s, ui, 'run', []); s.derived.stationGroup[station] = 0; s.derived.stationGroup[weapons] = 0; s.derived.groupStations.push([station, weapons]); s.groups.tab = new Uint8Array(1); sitDown(s, 0, station); reconcileUi(s, ui, 'run', []);
    const before = hashState(s);
    expect(translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: -.5 }], 0).commands).toEqual([]); expect(ui.groupBar[0]).toBe(true);
    expect(translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: .5 }], 1).commands).toEqual([]); expect(ui.groupBar[0]).toBe(false); expect(hashState(s)).toBe(before);
    translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveY: -.5 }], 2);
    const actions = translateTick(s, ui, [{ ...NEUTRAL_FRAME, moveX: .5 }], 3); expect(actions.commands[0]!.command).toEqual({ kind: 'tab', group: 0, station: weapons });
    expect(apply(s, actions.commands[0]!.command).status).toBe('applied'); expect(hashState(s)).not.toBe(before);
  });
});
