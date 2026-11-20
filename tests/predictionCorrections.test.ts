// Net-4a gate G4: the scripted pair over the impaired link at 50 to 200 ms round trip: the own-ship correction p95 at
// most 1 u and max at most 5 u; this seat's own character corrected by at most half a tile (Net-0's gate) where its seat did not change, and at most
// 3 reseat corrections (plan deviation 3). Each seat's
// script reads that seat's own predicted view, as a player reads the screen.
import { beforeEach, describe, expect, it } from 'vitest';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { impairedPair } from './helpers/impairedLink';
import { onlineDuel } from './helpers/onlineDuel';
import { predictedSeat } from './helpers/predictedSeat';

const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]! : 0; };
beforeEach(() => new Promise<void>((resolve) => setImmediate(resolve)));   // R1-F10, as tests/duelOnline.test.ts
describe('G4: small corrections (Net-4a §6)', { timeout: 300_000 }, () => {
  for (const rttMs of [50, 100, 200]) it(`scripted pair at ${rttMs} ms: own ship p95 <= 1 u, max <= 5 u; character <= 0.5 tile`, () => {
    const w = onlineDuel(5, { link: (peer) => impairedPair(peer, { seed: 11, now: () => w.nowMs(), up: { delayMs: rttMs / 2, jitterMs: 5 }, down: { delayMs: rttMs / 2, jitterMs: 5 } }) });
    w.connect(0); w.connect(1);
    const pairs = [createScriptedPair(5), createScriptedPair(5)];
    const seats = [0, 1].map((seat) => predictedSeat(w, seat, (_L, view) => {
      const input = scriptedInput(pairs[seat]!, view);
      return { held: input.held[seat] ?? { moveX: 0, moveY: 0, interactHeld: false }, commands: input.commands.filter((c) => c.id.player === seat).map((c) => c.command) };
    }));
    for (let k = 0; k < 60 * 60; k++) { w.tick(); for (const s of seats) s.step(); }
    for (const s of seats) {
      // Plan deviation 3: a correction that changes this seat's seated station takes back a refused (or moved) sit or
      // stand (§3.7); the half-tile bound is for position error, so it applies to the rest, and reseats are counted.
      const all = s.results.flatMap((r) => (r.correction ? [r.correction] : [])), ship = all.map((c) => c.ship);
      const character = all.filter((c) => !c.reseated).map((c) => c.character), reseats = all.filter((c) => c.reseated).length;
      console.log(`G4 ${rttMs} ms: ${ship.length} corrections, ship p95 ${p95(ship).toFixed(3)} max ${Math.max(0, ...ship).toFixed(3)}, character max ${Math.max(0, ...character).toFixed(3)} (not reseated), reseats ${reseats}`);
      expect(p95(ship)).toBeLessThanOrEqual(1);
      expect(Math.max(0, ...ship)).toBeLessThanOrEqual(5);
      expect(Math.max(0, ...character)).toBeLessThanOrEqual(0.5);
      expect(reseats).toBeLessThanOrEqual(3);
    }
  });
});
