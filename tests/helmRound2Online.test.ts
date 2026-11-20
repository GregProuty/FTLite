// Helm round 2 (spec 2026-11-19-helm-round2-design §4, §7) online, the view source: the seat's predicted throttle holds after
// release; after a sent cut it reads 0 until the cut's result, then the replica again; the latch is predicted, from a cut in
// flight or the replica's thrCut, until the seat's throttleHeld has been 0; its axes fly the predicted latch; the right drag
// pans the crew Helm's map. The session's own sends are in onlineDuelSession.test.ts.
import { describe, expect, it } from 'vitest';
import { emptyPresses, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { crewAxes } from '../src/renderer/src/sim/duel/step';
import { THR_RAMP } from '../src/renderer/src/sim/duel/tuning';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE = { moveX: 0, moveY: 0, interactHeld: false }, W = { ...NONE, throttleHeld: 1 }, S = { ...NONE, throttleHeld: -1 };
/** The source over `d` as the replica (seat 0, the Helm); `publish` makes the next observe see a new publication. */
function source(d: DuelState) {
  let sequence = 1;
  const s = createOnlineDuelSource({ client: { state: () => d, publication: () => ({ publicationSequence: sequence, tick: d.interior.tick, phase: 'running' }) }, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
  s.observe();
  return { s, publish: (): void => { sequence++; s.observe(); } };
}

describe('the online throttle prediction (spec §7)', () => {
  it('holds after release: the replica, with the ramp only while a key is held', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 400;
      const { s } = source(d);
      s.sent(W); s.unacked(3); expect(s.thrMille()).toBe(400 + 3 * THR_RAMP);
      s.sent(NONE); expect(s.thrMille()).toBe(400);
    } finally { disposeDuel(d); }
  });
  it('after a sent cut it reads 0 until the result; let go and pressed again it ramps from 0 at once; the result hands the base back', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 400;
      const { s } = source(d);
      s.unacked(3);
      s.cutBase(true); s.sent(S);   // the cut is in flight and a late S still rides the frame
      expect(s.thrMille()).toBe(0);
      s.sent(NONE); expect(s.thrMille()).toBe(0);
      s.sent(W); expect(s.thrMille()).toBe(3 * THR_RAMP);   // the key came up, so W ramps from the cut's 0
      s.cutBase(false); expect(s.thrMille()).toBe(400 + 3 * THR_RAMP);   // the result: the replica is the base again
    } finally { disposeDuel(d); }
  });
  it('the replica\'s latch is predicted too, until throttleHeld has been 0 on a frame since it was first seen; the axes follow', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const { s, publish } = source(d);
      s.unacked(2); s.sent(S);
      d.thrCut = true; publish();
      expect(s.thrMille()).toBe(0);   // latched: S does not ramp
      expect(s.axes()).toEqual(crewAxes(d, S, 0, true));
      s.sent(NONE); s.sent(S);
      expect(s.thrMille()).toBe(-2 * THR_RAMP);   // released here while the replica still shows the latch
      expect(s.axes()).toEqual(crewAxes(d, S, -2 * THR_RAMP, false));
    } finally { disposeDuel(d); }
  });
});

describe('the right drag online (spec §4)', () => {
  it('pans the crew Helm\'s camera; on the Valkyrn class\'s Helm it aims, so the camera stays on the ship', () => {
    for (const [cls, follow] of [[undefined, 'free'], [ShipClass.Valkyrn, 'ship']] as const) {
      const d = createSeatedDuel(CUTTER, 5, 0, 2, cls);
      try {
        const { s } = source(d);
        const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
        const drag: PointerSample = { x: 640, y: 360, wheel: 0, dragX: 40, dragY: 0, rightX: 40, rightY: 0 };
        s.frame(1 / 60, keys, drag);
        expect(s.cameras.helm.follow, String(cls)).toBe(follow);
      } finally { disposeDuel(d); }
    }
  });
});
