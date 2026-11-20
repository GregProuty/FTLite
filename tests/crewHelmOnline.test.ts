// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §6): the online seat's held frame at the crew Helm;
// Net-4a §3.9: the source's axes are the sim's own on the drawn state, with no local ramp or vent of its own.
import { describe, expect, it } from 'vitest';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { sessionHeld } from '../src/renderer/src/app/duel/onlineDuel';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { crewAxes } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE = { moveX: 0, moveY: 0, interactHeld: false };
const keys = (over: Partial<KeySample>): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses(), ...over });
const source = (d: DuelState, seat: number) => createOnlineDuelSource({ client: { state: () => d, publication: () => ({ publicationSequence: 1, tick: d.interior.tick, phase: 'running' }) }, seat, now: () => 0, viewport: { w: 1280, h: 720 } });

describe('the online held frame (spec §3, §4, §4a)', () => {
  it('at the crew Helm: the A/D moveX, the three fields and the steer; elsewhere and on the Valkyrn: today\'s frame', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const k = keys({ moveX: 1, moveY: -1, throttleHeld: 1, rcsX: 1, rcsY: -1, fireHeld: true });
      expect(sessionHeld(k, d, 0, 64)).toEqual({ moveX: 1, moveY: -1, interactHeld: false, throttleHeld: 1, rcsX: 1, rcsY: -1, aim: 64 });   // helm round 2 §4: Space rides no face at the crew Helm
      expect(sessionHeld(k, d, 0, -1)).not.toHaveProperty('aim');
      expect(sessionHeld(k, d, 1, 64)).toEqual({ moveX: 1, moveY: -1, interactHeld: false });   // Weapons
      expect(sessionHeld(k, v, 0, 64)).toEqual({ moveX: 1, moveY: -1, interactHeld: false, face: true });   // the Valkyrn's Helm
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('the crew Helm online reads the prediction (Net-4a §3.9)', () => {
  it('thrMille and the vent are the drawn state\'s own fields: no local ramp on top', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 100;
      const s = source(d, 0);
      s.observe(); s.sent({ ...NONE, throttleHeld: 1, rcsX: 1 });
      expect((s as { thrMille?: unknown }).thrMille).toBeUndefined();
      expect((s as { helmVent?: unknown }).helmVent).toBeUndefined();
      expect(s.axes()).toEqual(crewAxes(d, { ...NONE, throttleHeld: 1, rcsX: 1 }));   // the sim's own function on the drawn state
    } finally { disposeDuel(d); }
  });
  it('away from the Helm the drawn state shows its own thrMille and the seat flies nothing (rewritten from the replica case)', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 300;
      const s = source(d, 1);
      s.observe(); s.sent({ ...NONE, throttleHeld: 1, rcsX: 1 });
      expect(s.duel.thrMille).toBe(300);
      expect(s.axes()).toEqual(NO_AXES);
    } finally { disposeDuel(d); }
  });
});
