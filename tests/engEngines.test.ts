// Engineering spike spec §10.2 (Amendment 2; §9.1's rules stand): 1 Engines bar = 25 % throttle (cap = bars, to 4), the
// engine factor [0, 1, 1, 1, 1, 1.25]; a throttle above the cap is unavailable; reverse needs a bar; the stored throttle
// is lowered to the cap the same tick; the prediction flies as the ship does.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { clampToCapacity, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { throttleCap } from '../src/renderer/src/sim/tactical/bars';
import { flySlot, shipEngineFactor } from '../src/renderer/src/sim/tactical/physics';
import { predictFlight } from '../src/renderer/src/sim/tactical/predict';
import { cloneShip, createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { DEFAULT_FLIGHT } from '../src/renderer/src/sim/tactical/tuning';
import { sitDown } from '../src/renderer/src/sim/stations';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });

describe('engineering spike: Engines bars (spec §10.2)', () => {
  it('the cap and the factor by bars; damage 2 is off at once', () => {
    const s = createTacticalState(2), sys = s.systems[0];
    expect([0, 1, 2, 3, 4, 5].map((b) => { sys.bars[DuelSystem.Engines] = b; return [throttleCap(sys), shipEngineFactor(s, 0)]; }))
      .toEqual([[0, 0], [1, 1], [2, 1], [3, 1], [4, 1], [4, 1.25]]);
    sys.bars[DuelSystem.Engines] = 3; sys.rooms[Room.Engines] = 2;
    expect(throttleCap(sys)).toBe(0); expect(shipEngineFactor(s, 0)).toBe(0);
  });
  it('the prediction flies exactly as the ship does at the overdrive factor', () => {
    const s = createTacticalState(2);
    s.systems[0].bars[DuelSystem.Engines] = 5;
    const axes = { turn: 1, thrust: 1 }, path = predictFlight(s, 0, axes, 30, 1).points, ship = cloneShip(s.ships[0]);
    const live = { ...s, ships: [ship, s.ships[1]] as typeof s.ships };
    for (let k = 0; k < 30; k++) flySlot(live, 0, axes, DEFAULT_FLIGHT);
    expect(path[path.length - 1]).toEqual({ x: ship.x, y: ship.y });
  });
  it('a throttle above the cap is unavailable; reverse needs a bar; a lowered cap lowers the stored throttle the same tick', () => {
    const d = createDuel(HOUND, 5);
    try {
      sitDown(d.interior, 0, d.nav);
      expect(step(d, [env(d, 0, { kind: 'throttle', level: 4 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // start: 3 bars, 75 %
      expect(step(d, [env(d, 0, { kind: 'throttle', level: 3 })])[0]).toMatchObject({ status: 'applied' });
      const less = () => step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Engines, delta: -1 })]);
      less(); expect(d.throttle).toBe(2);
      less(); expect(d.throttle).toBe(1);
      less(); expect(d.throttle).toBe(0);
      expect(step(d, [env(d, 0, { kind: 'throttle', level: -1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      d.tactical.systems[0].bars[DuelSystem.Engines] = 2; d.throttle = -1;
      d.tactical.systems[0].rooms[Room.Engines] = 2; clampToCapacity(d);
      expect(d.throttle).toBe(0);                                         // damage to 0 bars: a reverse throttle becomes 0
    } finally { disposeDuel(d); }
  });
  it('a fire-cadence damage rise clamps bars and the throttle the same tick (spec §7 clampToCapacity, §8)', () => {
    const d = createDuel(HOUND, 6);
    try {
      d.tactical.ships[1]!.active = false;                                // no hits: only the fire cadence raises the Room
      const E = d.systemRooms[DuelSystem.Engines]!;
      igniteRoom(d.interior, E); d.throttle = 3;                          // Engines 3 bars, cap 3
      while ((d.interior.tick - d.baseTick) % 900 !== 899) { step(d, []); igniteRoom(d.interior, E); }   // keep it burning
      expect(d.interior.rooms.fire[E]!).toBeGreaterThan(0);
      expect(d.tactical.systems[0].rooms[Room.Engines]).toBe(0);
      step(d, []);                                                        // the cadence tick: Engines Room 1, capacity 2
      expect(d.tactical.systems[0].rooms[Room.Engines]).toBe(1);
      expect(d.tactical.systems[0].bars[DuelSystem.Engines]).toBe(2);
      expect(d.throttle).toBe(2);
    } finally { disposeDuel(d); }
  });
});
