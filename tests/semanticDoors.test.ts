import { describe, it, expect } from 'vitest';
import { cutterState, teleport, quiet } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { applyConsoleCommand } from '../src/renderer/src/sim/commands';
import { stepCommands } from '../src/renderer/src/sim/step';
import { DoorState } from '../src/renderer/src/sim/grid';
import type { Command, CommandEnvelope } from '../src/renderer/src/net/contracts';
const envelope = (command: Command, player = 0, sequence = 1): CommandEnvelope => ({ runId: 'run', id: { player, sequence }, requestedTick: 0, command });
const setup = () => { const s = cutterState(); quiet(s); const station = s.derived.stationOfKind[StationKind.Doors]!; sitDown(s, 0, station); return { s, station, edge: s.derived.doorEdges[0]! }; };
describe('semantic Doors', () => {
  it('rejects a changed online mode and coalesces requests on one edge', () => {
    const { s, station, edge } = setup();
    expect(applyConsoleCommand(s, envelope({ kind: 'doorCycle', station, edge, mode: 'seal' })).reason).toBe('unavailable');
    const results = stepCommands(s, { held: [], commands: [envelope({ kind: 'doorCycle', station, edge, mode: 'cycle' }), envelope({ kind: 'doorCycle', station, edge, mode: 'cycle' }, 0, 2)] });
    expect(results.map(r => r.status)).toEqual(['applied', 'applied']); expect(s.doors.state[edge]).toBe(DoorState.Sealed); expect(s.skills.lastDoorToggleTick).toBe(0);
  });
  it('flushes local toggle before remote cycle, then airlocks', () => {
    const { s, station, edge } = setup(), tile = s.derived.edgeTile[edge]!; teleport(s, 1, tile % s.derived.width + .5, Math.floor(tile / s.derived.width) + 1.5);
    const results = stepCommands(s, { held: [], commands: [envelope({ kind: 'doorCycle', station, edge, mode: 'cycle' }), envelope({ kind: 'airlockToggle', station, airlock: 0 }, 0, 2), envelope({ kind: 'toggleDoorLocal', edge }, 1)] });
    expect(results.every(r => r.status === 'applied')).toBe(true); expect(s.doors.state[edge]).toBe(DoorState.HeldOpen); expect(s.airlocks.open[0]).toBe(1);
  });
  it('retains standalone offline seal mode, rejects airlocks and migrated bridge requests', () => {
    const { s, station, edge } = setup(); s.stations.level[station] = 0;
    expect(applyConsoleCommand(s, envelope({ kind: 'doorCycle', station, edge, mode: 'seal' })).status).toBe('applied');
    expect(applyConsoleCommand(s, envelope({ kind: 'airlockToggle', station, airlock: 0 })).reason).toBe('unavailable');
    s.derived.stationGroup[station] = 0; s.derived.groupStations.push([station]);
    expect(applyConsoleCommand(s, envelope({ kind: 'doorCycle', station, edge, mode: 'seal' })).reason).toBe('unavailable');
  });
});
