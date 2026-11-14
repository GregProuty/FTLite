import { describe, it, expect } from 'vitest';
import { stepCommands } from '../src/renderer/src/sim/step';
import type { Command, CommandEnvelope } from '../src/renderer/src/net/contracts';
import { makeState, quiet, setEvent } from './helpers/sim';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { hereIndex } from '../src/renderer/src/sim/run';

const envelope = (command: Command, player = 0, sequence = 1): CommandEnvelope => ({ runId: 'run', id: { player, sequence }, requestedTick: 0, command });
describe('explicit interaction commands', () => {
  it('arbitrates a simultaneous seat for lowest player ID and blocks a newly seated card action', () => {
    const s = makeState(2); quiet(s); const station = s.derived.stationOfKind[StationKind.Engineering]!;
    const tile = s.derived.stationTile[station]!;
    for (const eid of s.crew) { Position.x[eid] = tile % s.derived.width + .5; Position.y[eid] = Math.floor(tile / s.derived.width) + .5; }
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'sit', station }, 1), envelope({ kind: 'sit', station }), envelope({ kind: 'stand' }, 0, 2)] });
    expect(s.stations.occupant[station]).toBe(0);
    expect(results.find(r => r.id.player === 0 && r.id.sequence === 2)).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
  });
  it('assigns the chosen vote without cycling and rejects an old event reference', () => {
    const s = makeState(2); quiet(s); setEvent(s, 0);
    const event = { visit: { sector: s.run.sector, beacon: hereIndex(s), arrivalTick: s.run.arrivalTick }, eventId: s.run.event };
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'vote', event, choice: 1 }), envelope({ kind: 'vote', event: { ...event, eventId: 999 }, choice: 0 }, 1)] });
    expect(s.run.vote[0]).toBe(1); expect(s.run.vote[1]).toBe(-1);
    expect(results[1]).toMatchObject({ status: 'rejected', reason: 'stale-target' });
  });
  it('stand marks the movement-consuming tick and releases the station', () => {
    const s = makeState(); quiet(s); const station = s.derived.stationOfKind[StationKind.Engineering]!; sitDown(s, 0, station);
    const x = Position.x[s.crew[0]!]!;
    stepCommands(s, { held: [{ moveX: 1, moveY: 0, interactHeld: false }], legacyCardInput: [], commands: [envelope({ kind: 'stand' })] });
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.scratch.stoodThisTick[0]).toBe(1); expect(Position.x[s.crew[0]!]).toBe(x);
  });
});
import { eventRef, visitRef, legacyCardReason } from '../src/renderer/src/sim/commands';
import { choiceEnabled, EVENT_DEFS } from '../src/renderer/src/sim/events';
import { DoorState } from '../src/renderer/src/sim/grid';
import { teleport, run } from './helpers/sim';
import { VOTE_SETTLE, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { createLedger } from '../src/renderer/src/authority/ledger';
import { admitLegacyCardInput } from '../src/renderer/src/authority/legacyCardInput';
import { Dir } from '../src/renderer/src/sim/dir';
import { navRows, reachable, beaconIndex } from '../src/renderer/src/sim/run';
import { powerUsed, powerCapacity } from '../src/renderer/src/sim/power';

describe('interaction execution validation and phase preservation', () => {
  it('validates the explicit seat target without retargeting the nearest console', () => {
    const s = makeState(1); const nav = s.derived.stationOfKind[StationKind.Navigation]!, eng = s.derived.stationOfKind[StationKind.Engineering]!;
    teleport(s, 0, 2.5, 2.5);
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'sit', station: eng })] });
    expect(results[0]).toMatchObject({ status: 'rejected', reason: 'stale-target' });
    expect(s.stations.occupant[nav]).toBe(-1); expect(Seated.station[s.crew[0]!]).toBe(-1);
  });
  it('coalesces two explicit local door toggles into one seal change', () => {
    const s = makeState(2); teleport(s, 0, 2.5, 8.5); teleport(s, 1, 2.5, 8.5);
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'toggleDoorLocal', edge: 5 }), envelope({ kind: 'toggleDoorLocal', edge: 5 }, 1)] });
    expect(results.map(r => r.status)).toEqual(['applied', 'applied']); expect(s.doors.state[5]).toBe(DoorState.Sealed);
  });
  it('a disabled non-Navigation choice starts the timer but cannot settle; Navigation rejects it', () => {
    const s = makeState(2); quiet(s); s.run.scrap = 0;
    let event = -1, choice = -1;
    for (let i = 0; i < EVENT_DEFS.length && event < 0; i++) { setEvent(s, i); const c = EVENT_DEFS[i]!.choices.findIndex((_r,k) => !choiceEnabled(s, i, k)); if (c >= 0) { event = i; choice = c; } }
    expect(event).toBeGreaterThanOrEqual(0); setEvent(s, event);
    const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav);
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'vote', event: eventRef(s), choice }), envelope({ kind: 'vote', event: eventRef(s), choice }, 1)] });
    expect(results[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(s.run.vote[0]).toBe(-1); expect(s.run.vote[1]).toBe(choice); expect(s.run.eventOpenTick).toBe(0);
    run(s, VOTE_SETTLE * TICK_HZ + 1); expect(s.run.eventChoice).toBe(-1);
  });
  it('rejects a stale negative visit identity even though the wire can represent it', () => {
    const s = makeState(2); setEvent(s, 0); const event = eventRef(s); event.visit.arrivalTick = -1;
    expect(stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'vote', event, choice: 0 })] })[0]).toMatchObject({ status: 'rejected', reason: 'stale-target' });
    expect(s.run.vote[0]).toBe(-1);
  });
  it('a stale pending request cannot agree to a newer request with the same destination', () => {
    const s = makeState(2); quiet(s); const destination = beaconIndex(reachable(s)[0]!.column, reachable(s)[0]!.node);
    s.run.jumpPending = destination; s.run.jumpPendingTick = 0; s.tick = 2;
    const pending = { visit: visitRef(s), requestedAtTick: 0, destination }; s.run.jumpPendingTick = 1;
    const command = envelope({ kind: 'jumpAgree', pending }, 1); command.requestedTick = 2;
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [command] });
    expect(results[0]).toMatchObject({ status: 'rejected', reason: 'stale-target' }); expect(s.run.jumpPendingTick).toBe(1); expect(s.run.column).toBe(0);
  });
  it('rejects jump agreement while an event has priority', () => {
    const s = makeState(2); setEvent(s, 0); s.run.jumpPending = 4; s.run.jumpPendingTick = 0;
    const results = stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'jumpAgree', pending: { visit: visitRef(s), requestedAtTick: 0, destination: 4 } }, 1)] });
    expect(results[0]).toMatchObject({ reason: 'unavailable' }); expect(s.run.jumpPending).toBe(4);
  });
  it('standing sheds excess allocated power as well as consuming movement', () => {
    const s = makeState(1); quiet(s); const eng = s.derived.stationOfKind[StationKind.Engineering]!; sitDown(s, 0, eng);
    s.power.capacity = 1;
    stepCommands(s, { held: [], legacyCardInput: [], commands: [envelope({ kind: 'stand' })] });
    expect(powerUsed(s)).toBeLessThanOrEqual(powerCapacity(s)); expect(s.scratch.stoodThisTick[0]).toBe(1);
  });
  it('the bridge rejects migrated Navigation voting, inactive seats, and raw press fields', () => {
    const s = makeState(2); setEvent(s, 0); const nav = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, nav);
    s.stations.cursor[nav] = navRows(s).findIndex(r => r.select === 'choice');
    const legacy = { kind: 'legacyCardInput' as const, runId: 'run', id: { player: 0, sequence: 1 }, requestedTick: 0, input: { station: nav, direction: Dir.None, confirm: true } };
    expect(admitLegacyCardInput(createLedger([0]), legacy, 0, s)).toMatchObject({ status: 'rejected', result: { reason: 'unsupported' } });
    expect(legacyCardReason(s, { ...legacy, input: { ...legacy.input, station: s.derived.stationOfKind[StationKind.Engineering]! } })).toBe('invalid-seat');
    const malformed = { ...legacy, input: { ...legacy.input, confirmPressed: true } };
    expect(admitLegacyCardInput(createLedger([0]), malformed, 0, s)).toMatchObject({ status: 'rejected', result: { reason: 'malformed' } });
    stepCommands(s, { held: [], commands: [], legacyCardInput: [legacy] }); expect(s.run.vote[0]).toBe(-1);
  });
  it('moveTo consumes its valid sequence and returns terminal unsupported', () => {
    const s = makeState(1), ledger = createLedger([0]), command = envelope({ kind: 'moveTo', tile: 0 });
    expect(ledger.admit(command, 0).status).toBe('queued');
    const result = stepCommands(s, { held: [], commands: [command], legacyCardInput: [] })[0]!; ledger.finish(result);
    expect(result).toMatchObject({ status: 'rejected', reason: 'unsupported' }); expect(ledger.highWater()[0]).toBe(1);
    expect(ledger.admit(command, 1)).toMatchObject({ status: 'duplicate', result });
  });
});
