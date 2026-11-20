// W-4 spec §11 (W-4a): online, the Hound's Weapons seat sends weaponSel and gunHeld (only with the autocannon selected) in
// sessionHeld, and only there; a change of either is a held change; NO CHARGE still comes from the authority's
// 'unavailable' for a pewFire {}.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { heldChanged, sessionHeld } from '../src/renderer/src/app/duel/onlineDuel';
import { emptyPresses } from '../src/renderer/src/app/duel/input';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { predictTurret } from '../src/renderer/src/app/duel/weaponsSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
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

describe('the online reticle and mode (W-4 spec §11, W-4b)', () => {
  it('a change of the reticle alone is a held change (the latency stamp); the same reticle is not', () => {
    expect(heldChanged({ ...N, weaponSel: 0, turretAim: 4000 }, { ...N, weaponSel: 0, turretAim: 5000 })).toBe(true);
    expect(heldChanged({ ...N, weaponSel: 0, turretAim: 4000 }, { ...N, weaponSel: 0 })).toBe(true);
    expect(heldChanged({ ...N, weaponSel: 0, turretAim: 4000 }, { ...N, weaponSel: 0, turretAim: 4000 })).toBe(false);
  });
  it('sessionHeld carries turretAim at the Hound\'s Weapons seat only', () => {
    const d = createSeatedDuel(CUTTER, 5), fit = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);
    try {
      const g = 1 - d.helmPlayer;
      expect(sessionHeld(K, d, g, -1, { sel: 0, trigger: false, aim: 4000 })).toMatchObject({ weaponSel: 0, turretAim: 4000 });
      expect(sessionHeld(K, d, d.helmPlayer, -1, { sel: 0, trigger: false, aim: 4000 })).not.toHaveProperty('turretAim');
      expect(sessionHeld(K, fit, 1 - fit.helmPlayer, -1, { sel: 0, trigger: false, aim: 4000 })).not.toHaveProperty('turretAim');
    } finally { disposeDuel(d); disposeDuel(fit); }
  });
});

describe('the predicted own turret (W-4 spec §11)', () => {
  /** A seated Hound duel in MAN with the Hunter far off (no AUTO), and the gunner's held frame with the selection and reticle. */
  function rig(sel: number, aim: number) {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    Object.assign(d.tactical.systems[0], { pewManual: true, gunManual: true });   // both switches on MAN: the selected gun is in hand
    Object.assign(d.tactical.ships[1], { x: 6000, y: 6000 });
    const gunnerHeld = { moveX: 0, moveY: 0, interactHeld: false, weaponSel: sel, turretAim: aim };
    const held = [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]; held[g] = gunnerHeld;
    return { d, held, gunnerHeld };
  }
  it('equals the authority\'s turret after k stepped ticks with the same held frame (k = 0, 1, 5, 30)', () => {
    for (const k of [0, 1, 5, 30]) {
      const { d, held, gunnerHeld } = rig(0, 9000);
      try {
        const heading = d.tactical.ships[0].heading, want = predictTurret(d.tactical, 0, gunnerHeld, true, k);
        for (let n = 0; n < k; n++) stepDuelTick(d, { held, commands: [] });
        expect(d.tactical.ships[0].heading, 'the heading stays fixed in this rig').toBe(heading);
        expect(d.tactical.systems[0].pewTurret, `k ${k}`).toBe(want);
      } finally { disposeDuel(d); }
    }
  });
  it('is the replica\'s turret (k treated as 0) in AUTO, at 0 bars, with the torpedo selected or with no reticle', () => {
    const { d, gunnerHeld } = rig(0, 9000);
    try {
      const t = d.tactical; t.systems[0].pewTurret = 100;
      expect(predictTurret(t, 0, gunnerHeld, false, 10)).toBe(100);
      expect(predictTurret(t, 1, { weaponSel: 1, turretAim: 9000 }, true, 10)).toBe(t.systems[0].gunTurret);   // the autocannon on 0 bars
      expect(predictTurret(t, 0, { weaponSel: 2, turretAim: 9000 }, true, 10)).toBe(100);
      expect(predictTurret(t, 0, { weaponSel: 0 }, true, 10)).toBe(100);
      expect(predictTurret(t, 0, gunnerHeld, true, 10)).not.toBe(100);
    } finally { disposeDuel(d); }
  });
});
