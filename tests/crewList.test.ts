// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §5.2, §9 UI): the crew list. One row per other player, `P<k>  <status>`, the
// status by precedence DOWNED, AWAY, the console sat at, REPAIRING, ON FOOT; derived from the duel state and `me` alone,
// so Single player and every online seat read the same list. UI round §2.2: the readout's crew rows are gone; these pin
// crewStatus, which the ship view uses (Task 5).
import { describe, expect, it } from 'vitest';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { crewStatus } from '../src/renderer/src/render/duel/readoutModel';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
type Duel = ReturnType<typeof createDuel>;
/** Every other player's `P<k>` and crewStatus, in player order (what the crew list read). */
const crewRows = (d: Duel, me: number): string[][] => Array.from({ length: d.interior.playerCount }, (_, pid) => pid).filter((pid) => pid !== me).map((pid) => [`P${pid + 1}`, crewStatus(d, pid)]);


describe('the crew list (spec §5.2)', () => {
  it('a crew of two (Single player): the one other character', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(crewRows(d, 0)).toEqual([['P2', 'ON FOOT']]);
      sitDown(d.interior, 0, d.nav);
      expect(crewRows(d, 1)).toEqual([['P1', 'HELM']]);
    } finally { disposeDuel(d); }
  });
  it('a crew of three: every other player in order, an empty seat AWAY', () => {
    const d = createDuel(CUTTER, 5, 0, 3);
    try {
      sitDown(d.interior, 0, d.nav); d.present[2] = false;
      expect(crewRows(d, 1)).toEqual([['P1', 'HELM'], ['P3', 'AWAY']]);
      expect(crewRows(d, 2)).toEqual([['P1', 'HELM'], ['P2', 'ON FOOT']]);
    } finally { disposeDuel(d); }
  });
  it('a crew of four: the precedence DOWNED, AWAY, console, REPAIRING, ON FOOT', () => {
    const d = createDuel(CUTTER, 5, 0, 4);
    try {
      sitDown(d.interior, 1, d.weapons); sitDown(d.interior, 2, d.science);
      expect(crewRows(d, 0)).toEqual([['P2', 'WEAPONS'], ['P3', 'SCIENCE'], ['P4', 'ON FOOT']]);
      d.present[1] = false;
      expect(crewStatus(d, 1)).toBe('AWAY');                           // a seated away character reads AWAY
      Life.state[d.interior.crew[1]!] = LifeState.Downed;
      expect(crewStatus(d, 1)).toBe('DOWNED');                         // DOWNED before AWAY
      const p = d.points[0]!, w = d.interior.derived.width, e3 = d.interior.crew[3]!;
      Position.x[e3] = (p.tile % w) + 0.5; Position.y[e3] = Math.floor(p.tile / w) + 0.5;
      expect(crewStatus(d, 3)).toBe('ON FOOT');                        // at the point, nothing to repair
      d.tactical.systems[0].rooms[p.tacticalRoom] = 1;
      expect(crewStatus(d, 3)).toBe('ON FOOT');                        // in reach of a point that needs work, no work yet
      d.repair[p.tacticalRoom] = 1;
      expect(crewStatus(d, 3)).toBe('REPAIRING');                      // the repair has started
    } finally { disposeDuel(d); }
  });
  it('an online replica reads the same list (seat 2 of a crew of three)', () => {
    const d = createDuel(CUTTER, 5, 0, 3);
    try {
      sitDown(d.interior, 0, d.nav);
      const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      try { expect(crewRows(r, 2)).toEqual([['P1', 'HELM'], ['P2', 'ON FOOT']]); } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
});
