import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_RATE_SOLO } from '../src/renderer/src/sim/duel/tuning';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { consoleInReach, cycleLock, repairInReach, seatOf } from '../src/renderer/src/app/duel/controls';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const step = (d: DuelState, player: number, command: DuelCommand | null, held: HeldInput[] = [NONE, NONE]) =>
  stepDuelTick(d, { held, commands: command ? [{ id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command }] : [] });
const put = (d: DuelState, pid: number, tx: number, ty: number): void => { const eid = d.interior.crew[pid]!; Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5; };

describe('duel controls (H-1 spec §5)', () => {
  it('a downed character can neither repair nor sit, and an offline console cannot be sat at (as the sim)', () => {
    const d = createDuel(layout, 5);
    step(d, 0, { kind: 'stand' }); put(d, 0, 1, 6);
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    expect(repairInReach(d, 0)).toBe(Room.Engines);
    const eid = d.interior.crew[0]!, was = Life.state[eid]!;
    Life.state[eid] = LifeState.Downed;
    expect(repairInReach(d, 0)).toBe(-1);
    Life.state[eid] = was;
    step(d, 1, { kind: 'stand' });                             // free the Weapons console
    const w = d.interior.derived.stationTile[d.weapons]!, W = d.interior.derived.width;
    put(d, 1, w % W, Math.floor(w / W));
    expect(consoleInReach(d, 1)).toBe(d.weapons);
    d.interior.stations.failed[d.weapons] = 1;
    expect(consoleInReach(d, 1)).toBe(-1);
    const results = step(d, 1, { kind: 'sit', station: d.weapons });
    expect(results.map((r) => r.status)).not.toContain('applied');   // the sim agrees
    disposeDuel(d);
  });
  it('seatOf: player 0 at the Helm, player 1 at Weapons, standing after a stand', () => {
    const d = createDuel(layout, 5);
    expect([seatOf(d, 0), seatOf(d, 1)]).toEqual(['helm', 'weapons']);
    step(d, 1, { kind: 'stand' });
    expect(seatOf(d, 1)).toBe('standing');
    disposeDuel(d);
  });
  it('repairInReach mirrors the sim: a damaged room, from inside its repair room, in reach of its tile', () => {
    const d = createDuel(layout, 5);
    step(d, 0, { kind: 'stand' }); put(d, 0, 1, 6);            // Engines room, next to its repair point (2, 6)
    expect(repairInReach(d, 0)).toBe(-1);                         // nothing damaged
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    expect(repairInReach(d, 0)).toBe(Room.Engines);
    step(d, 0, null, [{ moveX: 0, moveY: 0, interactHeld: true }, NONE]);
    expect(d.repair[Room.Engines]).toBe(REPAIR_RATE_SOLO);        // the sim agrees: holding E there repairs
    put(d, 0, 5, 6);                                              // the Aft Passage: outside the repair room
    expect(repairInReach(d, 0)).toBe(-1);
    expect(repairInReach(d, 1)).toBe(-1);                         // seated characters repair nothing
    disposeDuel(d);
  });
  it('consoleInReach: a free role console from inside its room and in reach; never a scenery console', () => {
    const d = createDuel(layout, 5);
    expect(consoleInReach(d, 0)).toBe(-1);                        // seated
    step(d, 0, { kind: 'stand' });
    expect(consoleInReach(d, 0)).toBe(d.nav);                     // standing at the Navigation console
    put(d, 0, 22, 6);                                             // the next room forward
    expect(consoleInReach(d, 0)).toBe(-1);
    step(d, 1, { kind: 'stand' });
    put(d, 0, 9, 6);                                              // beside the Weapons console, now free
    expect(consoleInReach(d, 0)).toBe(d.weapons);
    step(d, 0, { kind: 'sit', station: d.weapons });
    expect(seatOf(d, 0)).toBe('weapons');
    put(d, 1, 9, 5);
    expect(consoleInReach(d, 1)).toBe(-1);                        // occupied
    disposeDuel(d);
  });
  it('the lock cycles Weapons, Shields, Engines and back, both ways', () => {
    expect([cycleLock(0, 1), cycleLock(1, 1), cycleLock(2, 1)]).toEqual([1, 2, 0]);
    expect([cycleLock(0, -1), cycleLock(1, -1), cycleLock(2, -1)]).toEqual([2, 0, 1]);
  });
});
