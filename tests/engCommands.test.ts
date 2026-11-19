// Engineering spike spec §5, §7: shipPower, shipCoolant, shipDoor and shipAirlock: who may send them, their reasons in
// order, the door and airlock toggles, the last in player order winning, the decided round.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { applyPower, DuelSystem, sparesOf } from '../src/renderer/src/sim/duel/power';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { DoorState } from '../src/renderer/src/sim/grid';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { sitDown } from '../src/renderer/src/sim/stations';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand, tick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
function withDuel(f: (d: DuelState) => void): void { const d = createDuel(HOUND, 11); try { f(d); } finally { disposeDuel(d); } }
const bars = (d: DuelState) => d.tactical.systems[0].bars;

describe('engineering spike: the four ship commands (spec §7)', () => {
  it('shipPower from a standing player and from a seated one; reasons stale → malformed → unavailable', () => withDuel((d) => {
    let r = step(d, [env(d, 0, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 })]);
    expect(r[0]).toMatchObject({ status: 'applied' }); expect(bars(d)[DuelSystem.Sensors]).toBe(0);
    sitDown(d.interior, 1, d.weapons);
    r = step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Weapons, delta: 1 })]);
    expect(r[0]).toMatchObject({ status: 'applied' }); expect(bars(d)[DuelSystem.Weapons]).toBe(3);
    r = step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Weapons, delta: 1 })]);   // the start's spare bar too
    expect(r[0]).toMatchObject({ status: 'applied' }); expect(sparesOf(d)).toBe(0);
    r = step(d, [env(d, 0, { kind: 'shipPower', system: 0, delta: 1 }, d.interior.tick - 1)]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'stale-tick' });
    for (const bad of [{ system: 5, delta: 1 }, { system: 0, delta: 2 }, { system: 1.5, delta: 1 }]) {
      r = step(d, [env(d, 0, { kind: 'shipPower', ...bad })]);
      expect(r[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
    }
    r = step(d, [env(d, 0, { kind: 'shipPower', system: DuelSystem.Shields, delta: 1 })]);   // no spare
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    const eid = d.interior.crew[0]!; Life.state[eid] = LifeState.Downed; Health.cur[eid] = 0;
    r = step(d, [env(d, 0, { kind: 'shipPower', system: DuelSystem.Weapons, delta: -1 })]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    d.present[1] = false;
    r = step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Weapons, delta: -1 })]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
  }));
  it('the power commands apply in player order, whatever the envelope order', () => withDuel((d) => {
    applyPower(d, DuelSystem.Engines, 1);                                   // spend the start's spare bar first
    const a = env(d, 1, { kind: 'shipPower', system: DuelSystem.Shields, delta: 1 }), b = env(d, 0, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 });
    const r = step(d, [a, b]);   // player 0 frees a bar first, so player 1's +1 Shields applies
    expect(r.map((x) => x.status)).toEqual(['applied', 'applied']);
    expect(bars(d)[DuelSystem.Shields]).toBe(3); expect(sparesOf(d)).toBe(0);
  }));
  it('shipCoolant cycles, noop when unchanged; malformed for Oxygen or out of range', () => withDuel((d) => {
    expect(step(d, [env(d, 0, { kind: 'shipCoolant', system: 1 })])[0]).toMatchObject({ status: 'applied' });
    expect(d.power.coolant[1]).toBe(1);
    expect(step(d, [env(d, 0, { kind: 'shipCoolant', system: 4 })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
    d.power.coolant = [2, 2, 2, 0, 2];   // a full pool (Oxygen's slot borrowed for the test)
    expect(step(d, [env(d, 0, { kind: 'shipCoolant', system: 3 })])[0]).toMatchObject({ status: 'noop' });
  }));
  it('shipDoor toggles auto ↔ held open remotely; shipAirlock toggles open; bad indices are malformed', () => withDuel((d) => {
    const edge = d.interior.derived.doorEdges[0]!;
    d.interior.doors.state[edge] = DoorState.Closed;   // Task 6 makes Closed the start; until then createDuel holds doors open
    expect(step(d, [env(d, 0, { kind: 'shipDoor', edge })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.doors.state[edge]).toBe(DoorState.HeldOpen);
    step(d, [env(d, 1, { kind: 'shipDoor', edge })]);
    expect(d.interior.doors.state[edge]).toBe(DoorState.Closed);
    expect(step(d, [env(d, 0, { kind: 'shipAirlock', index: 1 })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.airlocks.open[1]).toBe(1);
    step(d, [env(d, 0, { kind: 'shipAirlock', index: 1 })]);
    expect(d.interior.airlocks.open[1]).toBe(0);
    const wall = d.interior.derived.edgeIsDoor.findIndex((x) => x === 0);
    for (const c of [{ kind: 'shipDoor', edge: 999 }, { kind: 'shipAirlock', index: 2 }, { kind: 'shipAirlock', index: -1 }, ...(wall >= 0 ? [{ kind: 'shipDoor', edge: wall }] : [])] as DuelCommand[])
      expect(step(d, [env(d, 0, c)])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
  }));
  it('on a decided round the four kinds answer duel-decided', () => withDuel((d) => {
    d.tactical.outcome = Outcome.CrewWins;
    const r = step(d, [env(d, 0, { kind: 'shipPower', system: 0, delta: -1 }), env(d, 0, { kind: 'shipDoor', edge: 0 }), env(d, 0, { kind: 'shipCoolant', system: 0 }), env(d, 0, { kind: 'shipAirlock', index: 0 })]);
    expect(r.every((x) => x.status === 'rejected' && x.reason === 'duel-decided')).toBe(true);
  }));
});
