// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, Decision 15): telemetry's bait manoeuvre counts the crew
// Helm acting by a held face or aim, a vented thruster, or a held throttle that is not 0; never by moveX.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** One tick with the Helm holding `h`, the Hunter parked 200 u from the crew ship (inside the bait range); the manoeuvre tick. */
function acted(h: HeldInput): number {
  const d = createSeatedDuel(CUTTER, 5), t = createTelemetry(d);
  try {
    const s = d.tactical.ships[0];
    Object.assign(d.tactical.ships[1], { x: s.x + 200, y: s.y, vx: 0, vy: 0 });
    const input = { held: [h, NONE], commands: [] };
    stepDuelTick(d, input); recordTick(t, d, input);
    return t.manoeuvre.tick;
  } finally { disposeDuel(d); }
}

describe('the crew Helm\'s manoeuvre (Decision 15)', () => {
  it('a held throttle, a thruster, an aim or auto-face is a manoeuvre; moveX alone and nothing are not', () => {
    expect([acted({ ...NONE, throttleHeld: 1 }), acted({ ...NONE, rcsX: 1 }), acted({ ...NONE, aim: 100 }), acted({ ...NONE, face: true })]).toEqual([0, 0, 0, 0]);
    expect([acted(NONE), acted({ ...NONE, moveX: 1 })]).toEqual([-1, -1]);
  });
});
