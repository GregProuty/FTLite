// Spike ii impl review R1-F1 (§3.1 focus invariant 6): the transient masks must be empty between ticks, as they are in
// a clone or a restore, so that a read between ticks (the scripted pair's laserEligible, the view's lineOfSight)
// decides the same on a live state as on a restored one.
import { describe, expect, it } from 'vitest';
import { cloneTactical } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { rockAlive, rockAt, rockSlots, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { arena, rockEvents, shaped, tmplOf } from './helpers/rockArena';

describe('the transient masks between ticks (R1-F1)', () => {
  it('are all zero after stepDuel returns, so a line of sight across a new piece reads the same live and restored', () => {
    const st = arena();
    const before = Array.from({ length: rockSlots(st) }, (_, k) => rockAlive(st, k));
    // Asteroids-iv: a plain rock now turns to dust whole when it breaks (it has no cells to divide), so the pair is two cell
    // rocks of one 19-cell template, worn to hp 1, meeting head on: each divides into real pieces.
    const t = tmplOf(st, 19);
    shaped(st, 100, t, -30, 2000, 200, 0); shaped(st, 101, t, 30, 2000, -200, 0);
    st.rocks[100 * ROCK_STRIDE + 6] = 1; st.rocks[101 * ROCK_STRIDE + 6] = 1;
    stepDuel(st, IDLE_INPUT);
    expect(rockEvents(st, 'split').length + rockEvents(st, 'dust').length).toBeGreaterThan(0);
    const pieces = Array.from({ length: rockSlots(st) }, (_, k) => k).filter((k) => rockAlive(st, k) && (!before[k] || k === 100 || k === 101));
    expect(pieces.length).toBeGreaterThan(0);
    const p = rockAt(st, pieces[0]!), restored = cloneTactical(st);
    const live = lineOfSight(st, p.x - 200, p.y, p.x + 200, p.y), again = lineOfSight(restored, p.x - 200, p.y, p.x + 200, p.y);
    expect(live).toBe(again);
    expect(live).toBe(false);   // the piece is in the way once its tick is over
    expect(Array.from(st.rockBorn).every((b) => b === 0)).toBe(true);
    expect(Array.from(st.rockDone).every((b) => b === 0)).toBe(true);
  });
});
