// Duel fire views (duel-fire spec §2): the interior marker, the readout row, the help line, the client's reach check
// and the work particles.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { DUEL_EXTINGUISH_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { interiorOverlay } from '../src/renderer/src/render/duel/interiorModel';
import { readoutHelp, readoutRows, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { duelWorking } from '../src/renderer/src/render/particles/sources';
import { repairInReach } from '../src/renderer/src/app/duel/controls';
import { GOOD, WARN } from '../src/renderer/src/render/theme';
import { TILE_PX } from '../src/shared/resolution';

const layout = parseShip(cutter);
const roomOf = (d: DuelState, r: number): number => d.points.find((p) => p.tacticalRoom === r)!.room;

describe('duel fire views (spec §2)', () => {
  it('a burning room has a FIRE - HOLD E marker with the extinguish progress, even at level 0', () => {
    const d = createDuel(layout, 5);
    try {
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      d.interior.rooms.fireRepair[roomOf(d, Room.Engines)] = 180 / DUEL_EXTINGUISH_UNITS;
      const o = interiorOverlay(d);
      expect(o.tints).toEqual([]);
      expect(o.markers).toEqual([{ tacticalRoom: Room.Engines, level: 0, x: 2.5 * TILE_PX, y: 6.5 * TILE_PX, progress: 0.25, label: 'FIRE - HOLD E', fire: true }]);
      d.tactical.systems[0].rooms[Room.Engines] = 2; d.repair[Room.Engines] = 480;   // damaged too: still the fire's marker and progress
      expect(interiorOverlay(d).markers[0]).toMatchObject({ level: 2, progress: 0.25, label: 'FIRE - HOLD E', fire: true });
      expect(interiorOverlay(d).tints.map((t) => [t.tacticalRoom, t.level])).toEqual([[Room.Engines, 2]]);
    } finally { disposeDuel(d); }
  });
  it('a burning room reads FIRE in the damage red on every readout, with the extinguish bar', () => {
    const d = createDuel(layout, 5);
    try {
      d.tactical.systems[0].rooms[Room.Shields] = 1;
      igniteRoom(d.interior, roomOf(d, Room.Shields));
      for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) {
        const rows = readoutRows({ duel: d, mode, active: 0, other: 'WALKING' });
        const r = rows.find((x) => x.label === 'SHIELDS')!;
        expect(r).toMatchObject({ value: 'FIRE', valueTint: WARN, emphasis: 'alert' });
        expect(r.bar).toBeUndefined();
        expect(rows.find((x) => x.label === 'WEAPONS' && x.value !== '')!.value).toBe('OK');
      }
      d.interior.rooms.fireRepair[roomOf(d, Room.Shields)] = 0.5;
      expect(readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING' }).find((x) => x.label === 'SHIELDS')!.bar).toEqual({ fill: 0.5, colour: GOOD });
    } finally { disposeDuel(d); }
  });
  it('the interior help says HOLD E REPAIR/EXTINGUISH', () => {
    expect(readoutHelp('interior')).toContain('E SIT   HOLD E REPAIR/EXTINGUISH');
  });
  it('the client reach check counts a burning, undamaged room as the sim does', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    try {
      Seated.station[eid] = -1; d.interior.stations.occupant[d.nav] = -1;
      Position.x[eid] = 1.5; Position.y[eid] = 6.5;
      expect(repairInReach(d, 0)).toBe(-1);
      igniteRoom(d.interior, roomOf(d, Room.Engines));
      expect(repairInReach(d, 0)).toBe(Room.Engines);
    } finally { disposeDuel(d); }
  });
  it('fireWork events make fire-work particles at the repair tile', () => {
    const d = createDuel(layout, 5), w = d.interior.derived.width, T = TILE_PX;
    try {
      d.events = [{ kind: 'fireWork', player: 0, room: Room.Engines }, { kind: 'fireOut', room: Room.Engines, players: [0] }, { kind: 'fireStart', room: Room.Shields }];
      const p = d.points.find((q) => q.tacticalRoom === Room.Engines)!;
      expect(duelWorking(d)).toEqual([{ pid: 0, kind: 'fire', x: (p.tile % w) * T + T / 2, y: Math.floor(p.tile / w) * T + T / 2 }]);
    } finally { disposeDuel(d); }
  });
});
