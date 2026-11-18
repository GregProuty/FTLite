// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §5.2, §9 UI): the crew list. One row per other player, `P<k>  <status>`, the
// status by precedence DOWNED, AWAY, the console sat at, REPAIRING, ON FOOT; derived from the duel state and `me` alone,
// so Single player and every online seat read the same list. READOUT_ROWS holds the longest list at a crew of four.
import { describe, expect, it } from 'vitest';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { crewRows, crewStatus, readoutRows, READOUT_ROWS } from '../src/renderer/src/render/duel/readoutModel';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const pairs = (rows: { label: string; value: string }[]) => rows.map((r) => [r.label, r.value]);

describe('the crew list (spec §5.2)', () => {
  it('a crew of two (Single player): the one other character', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(pairs(crewRows(d, 0))).toEqual([['P2', 'ON FOOT']]);
      sitDown(d.interior, 0, d.nav);
      expect(pairs(crewRows(d, 1))).toEqual([['P1', 'HELM']]);
    } finally { disposeDuel(d); }
  });
  it('a crew of three: every other player in order, an empty seat AWAY', () => {
    const d = createDuel(CUTTER, 5, 0, 3);
    try {
      sitDown(d.interior, 0, d.nav); d.present[2] = false;
      expect(pairs(crewRows(d, 1))).toEqual([['P1', 'HELM'], ['P3', 'AWAY']]);
      expect(pairs(crewRows(d, 2))).toEqual([['P1', 'HELM'], ['P2', 'ON FOOT']]);
    } finally { disposeDuel(d); }
  });
  it('a crew of four: the precedence DOWNED, AWAY, console, REPAIRING, ON FOOT', () => {
    const d = createDuel(CUTTER, 5, 0, 4);
    try {
      sitDown(d.interior, 1, d.weapons); sitDown(d.interior, 2, d.science);
      expect(pairs(crewRows(d, 0))).toEqual([['P2', 'WEAPONS'], ['P3', 'SCIENCE'], ['P4', 'ON FOOT']]);
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
      expect(crewRows(d, 0).find((r) => r.label === 'P2')).toMatchObject({ value: 'DOWNED', emphasis: 'alert' });
    } finally { disposeDuel(d); }
  });
  it('an online replica reads the same list (seat 2 of a crew of three)', () => {
    const d = createDuel(CUTTER, 5, 0, 3);
    try {
      sitDown(d.interior, 0, d.nav);
      const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      try { expect(pairs(crewRows(r, 2))).toEqual([['P1', 'HELM'], ['P2', 'ON FOOT']]); } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('the readout carries the list after HEALTH; a crew of four is two rows longer than two and fits READOUT_ROWS (23)', () => {
    expect(READOUT_ROWS).toBe(23);
    const two = createDuel(CUTTER, 5), four = createDuel(CUTTER, 5, 0, 4);
    try {
      for (const d of [two, four]) placeMissile(d.tactical, 1, { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 });   // TORPEDO INBOUND: the longest interior list
      const a = readoutRows({ duel: two, mode: 'interior', active: 0 }), b = readoutRows({ duel: four, mode: 'interior', active: 0 });
      expect(b.length).toBe(a.length + 2);
      expect(b.length).toBeLessThanOrEqual(READOUT_ROWS);
      const h = b.findIndex((r) => r.label === 'HEALTH');
      expect(b.slice(h + 1, h + 4).map((r) => r.label)).toEqual(['P2', 'P3', 'P4']);
      expect(b.map((r) => r.label)).not.toContain('OTHER');
    } finally { disposeDuel(two); disposeDuel(four); }
  });
});
