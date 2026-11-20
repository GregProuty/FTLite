// UI round §2.2: the readout's row list is gone; the level text and the charge row it shared stay (Task 4's HUD uses level).
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { endModel } from '../src/renderer/src/render/duel/endModel';
import { chargeRow, level } from '../src/renderer/src/render/duel/readoutModel';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

const layout = parseShip(cutter);

describe('the room level text (owner 2026-11-17)', () => {
  it('Weapons and Engines at level 2 read OFFLINE, the laser CHARGE too; Shields at 2 stays DMG 2', () => {
    expect([level(2, Room.Weapons), level(2, Room.Shields), level(2, Room.Engines)]).toEqual(['OFFLINE', 'DMG 2', 'OFFLINE']);
    expect([level(1, Room.Weapons), level(0, Room.Shields), level(1, Room.Engines)]).toEqual(['DMG 1', 'OK', 'DMG 1']);
    const d = createDuel(layout, 5, 0, 2, ShipClass.ValkyrnLaser), s = d.tactical.systems[0];   // W-4 spec §14.1: the beam's rule, on the laser fit
    s.rooms = [2, 2, 2]; s.laserCharge = LASER_CHARGE_UNITS;
    const charge = chargeRow(d);
    expect([charge.value, charge.bar?.fill, charge.emphasis]).toEqual(['OFFLINE', 0, 'warn']);
    disposeDuel(d);
  });
});

describe('the end screen (H-1 spec §4 End)', () => {
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 'ENTER: REMATCH')).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 'ENTER: REMATCH')).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: REMATCH' });
    expect(endModel(Outcome.EnemyWins, 60, 'ENTER: REMATCH')!.title).toBe('DEFEAT');
    expect(endModel(Outcome.CrewWins, 60, 'ENTER: REMATCH   ESC: LEAVE')!.prompt).toBe('ENTER: REMATCH   ESC: LEAVE');   // online (H-2 spec §7)
    expect(endModel(Outcome.Draw, 60, 'ENTER: REMATCH')!.title).toBe('BOTH SHIPS LOST');
  });
});
