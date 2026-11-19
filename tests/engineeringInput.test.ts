// Engineering spike §5-§7: a ship-view click becomes one of the four ship commands. The interior hit-test maps a screen
// point to a door or an airlock through the interior's placement; the duel keyboard queues the commands for the next
// sample; the UI's actions hand them to the keyboard's console slot.
import { describe, expect, it, vi } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { TILE_PX } from '../src/shared/resolution';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { shipCommandOf, shipControlAt, type ShipCommand } from '../src/renderer/src/render/duel/shipControls';
import { createDuelKeyboard, SHIP_QUEUE_MAX, type ConsoleInput, type EventSource } from '../src/renderer/src/app/duel/input';
import { makeUi } from './helpers/uiStore';

const HOUND = parseShip(hound);
const quiet: EventSource = { addEventListener() {}, removeEventListener() {} };

describe('shipControlAt (spec §5)', () => {
  it('a point on a door tile is that door, on an airlock tile that airlock, elsewhere nothing', () => {
    const d = createDuel(HOUND, 5), der = d.interior.derived, p = { scale: 0.5, x: 100, y: 60 };
    try {
      const at = (tx: number, ty: number) => shipControlAt(d, p, p.x + (tx + 0.5) * TILE_PX * p.scale, p.y + (ty + 0.5) * TILE_PX * p.scale);
      const door = der.doorTileToEdge[7 * der.width + 12]!;   // the Ops–Quarters door at (12,7)
      expect(door).toBeGreaterThanOrEqual(0);
      expect(at(12, 7)).toEqual({ kind: 'door', edge: door, tile: 7 * der.width + 12 });
      const lock = der.airlockOfTile[7 * der.width + 0]!;   // the Hold's airlock at (0,7)
      expect(at(0, 7)).toEqual({ kind: 'airlock', index: lock, tile: 7 * der.width });
      expect(at(14, 7)).toBeNull();   // Quarters floor
      expect(at(-1, 7)).toBeNull(); expect(at(der.width, 7)).toBeNull();
      expect(shipControlAt(d, { scale: 0, x: 0, y: 0 }, 10, 10)).toBeNull();
      expect(shipCommandOf({ kind: 'door', edge: door, tile: 0 })).toEqual({ kind: 'shipDoor', edge: door });
      expect(shipCommandOf({ kind: 'airlock', index: lock, tile: 0 })).toEqual({ kind: 'shipAirlock', index: lock });
    } finally { disposeDuel(d); }
  });
  it('a point outside the interior band is nothing, even over the ship', () => {
    const d = createDuel(HOUND, 5), der = d.interior.derived;
    try { expect(shipControlAt(d, { scale: 1, x: 0, y: 0 }, 12 * TILE_PX + 4, 7 * TILE_PX + 4)).toEqual({ kind: 'door', edge: der.doorTileToEdge[7 * der.width + 12], tile: 7 * der.width + 12 });
      expect(shipControlAt(d, { scale: 1, x: 0, y: -200 }, 12 * TILE_PX + 4, 30)).toBeNull();   // y 30 is above the band (42)
    } finally { disposeDuel(d); }
  });
});

describe('the duel keyboard queues ship commands (spec §7)', () => {
  it('every click since the last sample, in order, once; clear drops them; at most SHIP_QUEUE_MAX, oldest first out', () => {
    const kb = createDuelKeyboard(quiet);
    const a: ShipCommand = { kind: 'shipPower', system: 1, delta: 1 }, b: ShipCommand = { kind: 'shipDoor', edge: 3 };
    kb.ui.ship?.(a); kb.ui.ship?.(b);
    expect(kb.sample().ship).toEqual([a, b]);
    expect(kb.sample().ship ?? []).toEqual([]);
    kb.ui.ship?.(a); kb.clear(); expect(kb.sample().ship ?? []).toEqual([]);
    kb.ui.ship?.(a); kb.clearUi(); expect(kb.sample().ship).toEqual([a]);   // a console change keeps them (Decision 1)
    for (let n = 0; n < SHIP_QUEUE_MAX + 3; n++) kb.ui.ship?.({ kind: 'shipCoolant', system: n % 4 });
    const s = kb.sample().ship!;
    expect(s).toHaveLength(SHIP_QUEUE_MAX);
    expect(s[0]).toEqual({ kind: 'shipCoolant', system: 3 % 4 });   // the first three went
    kb.destroy();
  });
});

describe('actions.ship (spec §6)', () => {
  it('each action hands its command to the console slot; nothing happens without one', () => {
    const { actions } = makeUi(), ship = vi.fn();
    actions.ship.power(0, 1);   // no console set: a no-op
    const input: ConsoleInput = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), ship };
    actions.setConsole(input);
    actions.ship.power(3, -1); actions.ship.coolant(2); actions.ship.door(7); actions.ship.airlock(1);
    expect(ship.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'shipPower', system: 3, delta: -1 }, { kind: 'shipCoolant', system: 2 }, { kind: 'shipDoor', edge: 7 }, { kind: 'shipAirlock', index: 1 }
    ]);
    actions.setConsole({ ...input, ship: undefined }); actions.ship.door(1);   // a slot without ship: still a no-op
    expect(ship).toHaveBeenCalledTimes(4);
  });
});
