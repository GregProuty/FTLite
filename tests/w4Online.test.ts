// W-4 spec §11 (W-4a): online, the Hound's Weapons seat sends weaponSel and gunHeld (only with the autocannon selected) in
// sessionHeld, and only there; a change of either is a held change; NO CHARGE still comes from the authority's
// 'unavailable' for a pewFire {}.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { heldChanged, sessionHeld } from '../src/renderer/src/app/duel/onlineDuel';
import { emptyPresses } from '../src/renderer/src/app/duel/input';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';

const CUTTER = parseShip(cutter), K = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
const N = { moveX: 0, moveY: 0, interactHeld: false };

describe('the online Weapons seat (W-4 spec §11)', () => {
  it('a change of weaponSel or gunHeld alone is a held change (the latency stamp); the same frame is not', () => {
    expect(heldChanged({ ...N, weaponSel: 0 }, { ...N, weaponSel: 1 })).toBe(true);
    expect(heldChanged({ ...N, weaponSel: 1 }, { ...N, weaponSel: 1, gunHeld: true })).toBe(true);
    expect(heldChanged({ ...N, weaponSel: 1, gunHeld: true }, { ...N, weaponSel: 1, gunHeld: true })).toBe(false);
  });
  it('sessionHeld carries weaponSel and gunHeld at the Hound\'s Weapons seat only', () => {
    const d = createSeatedDuel(CUTTER, 5), fit = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);
    try {
      const g = 1 - d.helmPlayer;
      expect(sessionHeld(K, d, g, -1, { sel: 1, trigger: true })).toMatchObject({ weaponSel: 1, gunHeld: true });
      expect(sessionHeld(K, d, g, -1, { sel: 0, trigger: true })).not.toHaveProperty('gunHeld');
      expect(sessionHeld(K, d, d.helmPlayer, -1, { sel: 1, trigger: true })).not.toHaveProperty('weaponSel');
      expect(sessionHeld(K, fit, 1 - fit.helmPlayer, -1, { sel: 1, trigger: true })).not.toHaveProperty('weaponSel');
    } finally { disposeDuel(d); disposeDuel(fit); }
  });
});
