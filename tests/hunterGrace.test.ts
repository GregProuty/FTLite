// The Hunter's grace (hunter grace spec, owner 2026-11-17): the first 30 s of each round it holds position and fire, unless
// the crew fires first; the music is calm until it turns hostile.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { hunterHostile } from '../src/renderer/src/sim/duel/hostility';
import { HUNTER_GRACE_TICKS } from '../src/renderer/src/sim/duel/tuning';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(hound);
let seq = 0;
const step = (d: DuelState, commands: { player: number; command: DuelCommand }[] = []) =>
  stepDuelTick(d, { held: [], commands: commands.map((c) => ({ runId: 'duel', id: { player: c.player, sequence: ++seq }, requestedTick: d.interior.tick, command: c.command })) });
const speed = (d: DuelState) => Math.hypot(d.tactical.ships[1]!.vx, d.tactical.ships[1]!.vy);

describe('the Hunter grace (hunter grace spec)', () => {
  it('holds position and fire for HUNTER_GRACE_TICKS (30 s), then turns hostile and charges', () => {
    const d = createDuel(layout, 1);
    try {
      expect(HUNTER_GRACE_TICKS).toBe(1800);
      const v0 = speed(d), h0 = d.tactical.ships[1]!.heading;
      for (let k = 0; k < HUNTER_GRACE_TICKS; k++) {
        expect(hunterHostile(d)).toBe(false);
        step(d);
        expect(speed(d)).toBeLessThanOrEqual(v0);   // no thrust: its spawn drift only slows (gravity aside)
        expect(d.tactical.systems[1]!.fireHeld).toBe(false);
      }
      expect(d.tactical.ships[1]!.heading).toBe(h0);
      expect(d.tactical.systems[1]!.missilesLaunched).toBe(0);
      expect(hunterHostile(d)).toBe(true);
      step(d);
      expect(d.tactical.systems[1]!.fireHeld).toBe(true);   // its first hostile tick presses its laser charge
    } finally { disposeDuel(d); }
  });
  it('the crew firing first provokes it at once', () => {
    const d = createDuel(layout, 1);
    try {
      seatDuelCrew(d);
      for (let k = 0; k < 60; k++) step(d);
      expect(hunterHostile(d)).toBe(false);
      step(d, [{ player: 1 - d.helmPlayer, command: { kind: 'missileLaunch' } }]);
      expect(d.tactical.systems[0]!.missilesLaunched).toBe(1);
      expect(hunterHostile(d)).toBe(true);
      step(d);
      expect(d.tactical.systems[1]!.fireHeld).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('every round has its own grace, counted from its base tick', () => {
    const d = createDuel(layout, 1);
    try {
      d.baseTick = 5000; d.tactical.tick = 5000 + HUNTER_GRACE_TICKS - 1;
      expect(hunterHostile(d)).toBe(false);
      d.tactical.tick += 1;
      expect(hunterHostile(d)).toBe(true);
    } finally { disposeDuel(d); }
  });
});
