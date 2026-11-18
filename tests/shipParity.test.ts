// Valkyrn spec §3.3: every ship in the Single player picker has what the Hound has: every station kind, every room system,
// one repair point per tactical Room, an airlock, and a breach site in each room whose system the Hound has. Allowed
// differences: Navigation and Weapons in one seat; rooms with no system are not compared. A Hound feature that adds a
// station kind or a system fails here until the other ships get it.
import { describe, expect, it } from 'vitest';
import houndJson from '../src/renderer/src/sim/ship/hound.json';
import { parseShip, type ShipLayout } from '../src/renderer/src/sim/ship/schema';
import { SOLO_SHIPS } from '../src/renderer/src/sim/ship/fleet';
import { DUEL_REPAIR_POINTS } from '../src/renderer/src/sim/duel/tuning';

const hound = parseShip(houndJson);
const systems = (s: ShipLayout): Set<string> => new Set(s.rooms.flatMap((r) => (r.system === null ? [] : [r.system])));
const points = (s: ShipLayout): number[] => (DUEL_REPAIR_POINTS[s.id] ?? []).map((p) => p.tacticalRoom).sort();
const groups = (s: ShipLayout): string[] => s.consoleGroups.map((g) => [...g.kinds].sort().join('+')).filter((k) => k !== 'navigation+weapons').sort();

describe('ship parity with the Hound (Valkyrn spec §3.3)', () => {
  it('the picker lists the Hound first, then the Valkyrn', () => { expect(SOLO_SHIPS.map((s) => s.id)).toEqual(['hound', 'valkyrn']); });
  for (const entry of SOLO_SHIPS) it(`${entry.name} has every Hound station, system, repair point, an airlock and a breach site per system room`, () => {
    const ship = parseShip(entry.layout);
    expect(new Set(ship.stations.map((s) => s.id))).toEqual(new Set(hound.stations.map((s) => s.id)));
    for (const sys of systems(hound)) expect(systems(ship).has(sys), `system ${sys}`).toBe(true);
    expect(points(ship)).toEqual(points(hound));
    expect(ship.airlocks.length).toBeGreaterThanOrEqual(1);
    for (const r of ship.rooms) if (r.system !== null && systems(hound).has(r.system)) expect(ship.breachSites.some((b) => b.room === r.id), `breach site in ${r.id}`).toBe(true);
    expect(groups(ship)).toEqual(groups(hound));   // only the combined Flight seat may differ
  });
});
