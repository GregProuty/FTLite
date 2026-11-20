// Helm round 2 (spec 2026-11-19-helm-round2-design §4, §7) online, the view source: its axes fly the drawn state's throttle
// and latch (Net-4a §3.9: P holds the seat's ramp, cut and latch); the right drag pans the crew Helm's map. The session's
// own sends, and the cut in P, are in onlineDuelSession.test.ts.
import { describe, expect, it } from 'vitest';
import { emptyPresses, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { crewAxes } from '../src/renderer/src/sim/duel/step';
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

// Net-4a §3.9: the hand ramp, the cut in flight (cutBase) and the predicted latch went into P: the source draws P and flies
// the sim's own crewAxes on it, so these cases are rewritten against the drawn state (the session's P cases are in
// onlineDuelSession.test.ts).
describe('the online throttle prediction (spec §7, Net-4a §3.9)', () => {
  it('the drawn state is the base: no ramp, cut or unacked count of the source’s own; the axes are the sim’s on it', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 400;
      const { s } = source(d);
      for (const k of ['thrMille', 'cutBase', 'unacked']) expect(s, k).not.toHaveProperty(k);
      s.sent(W); expect(s.axes()).toEqual(crewAxes(d, W));   // one tick of the ramp on 400, as the sim flies it
      expect(crewAxes(d, W).thrust).toBeGreaterThan(crewAxes(d, NONE).thrust);
      s.sent(NONE); expect(s.axes()).toEqual(crewAxes(d, NONE));   // holds after release
    } finally { disposeDuel(d); }
  });
  it('the latch is the drawn state’s own thrCut: S does not ramp while it holds; the axes follow it when it clears', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const { s, publish } = source(d);
      d.thrCut = true; publish(); s.sent(S);
      expect(s.axes()).toEqual(crewAxes(d, S, d.thrMille, true));
      expect(s.axes().thrust).toBe(crewAxes(d, NONE).thrust);   // latched: S does not ramp
      d.thrCut = false; publish();
      expect(s.axes()).toEqual(crewAxes(d, S));
      expect(s.axes().thrust).not.toBe(crewAxes(d, NONE).thrust);   // released: S ramps
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
