// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §6, Decisions 11 and 14): the online seat's held
// frame at the crew Helm, and the source's local prediction of thrMille over the unacknowledged held frames, its axes and
// its vent; away from the Helm the replica's own values.
import { describe, expect, it } from 'vitest';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { sessionHeld } from '../src/renderer/src/app/duel/onlineDuel';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { crewAxes } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE = { moveX: 0, moveY: 0, interactHeld: false };
const keys = (over: Partial<KeySample>): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses(), ...over });
const source = (d: DuelState, seat: number) => createOnlineDuelSource({ client: { state: () => d, publication: () => ({ publicationSequence: 1, tick: d.interior.tick, phase: 'running' }) }, seat, now: () => 0, viewport: { w: 1280, h: 720 } });

describe('the online held frame (spec §3, §4, §4a)', () => {
  it('at the crew Helm: moveX 0, the three fields and the steer; elsewhere and on the Valkyrn: today\'s frame', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const k = keys({ moveX: 1, moveY: -1, throttleHeld: 1, rcsX: 1, rcsY: -1, fireHeld: true });
      expect(sessionHeld(k, d, 0, 64)).toEqual({ moveX: 0, moveY: -1, interactHeld: false, face: true, throttleHeld: 1, rcsX: 1, rcsY: -1, aim: 64 });
      expect(sessionHeld(k, d, 0, -1)).not.toHaveProperty('aim');
      expect(sessionHeld(k, d, 1, 64)).toEqual({ moveX: 1, moveY: -1, interactHeld: false });   // Weapons
      expect(sessionHeld(k, v, 0, 64)).toEqual({ moveX: 1, moveY: -1, interactHeld: false, face: true });   // the Valkyrn's Helm
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('the online source\'s prediction (spec §3, §6)', () => {
  it('shows thrMille plus the local ramp over the unacknowledged frames, capped by the ENGINE share; its axes and vent follow', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 100;
      const s = source(d, 0);
      s.observe();
      s.sent({ ...NONE, throttleHeld: 1 }); s.unacked(5);
      expect(s.thrMille()).toBe(135);
      s.unacked(200);
      expect(s.thrMille()).toBe(750);   // the cap at 3 + 1
      s.unacked(5);
      expect(s.axes()).toEqual(crewAxes(d, { ...NONE, throttleHeld: 1 }, 135));
      s.sent({ ...NONE, rcsX: 1 }); s.unacked(0);
      expect([s.thrMille(), s.helmVent()]).toEqual([100, { x: 1, y: 0, boosted: false }]);
      d.rcsGas = 7;
      expect(s.helmVent()).toEqual({ x: 0, y: 0, boosted: false });
    } finally { disposeDuel(d); }
  });
  it('away from the Helm it shows the replica\'s thrMille and no vent', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 300;
      const s = source(d, 1);
      s.observe(); s.sent({ ...NONE, throttleHeld: 1, rcsX: 1 }); s.unacked(10);
      expect([s.thrMille(), s.helmVent()]).toEqual([300, { x: 0, y: 0, boosted: false }]);
    } finally { disposeDuel(d); }
  });
});
