// Duel health views (duel-health spec §2): the HEALTH row helper (healthRow), the crew status DOWNED, the interior health
// bars and the downed label. UI round §2.2: the readout panel, its row list and help are gone.
import { describe, expect, it } from 'vitest';
import { Health, Life, LifeState, Position, Seated } from '../src/renderer/src/sim/components';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { interiorOverlay } from '../src/renderer/src/render/duel/interiorModel';
import { crewStatus, healthRow } from '../src/renderer/src/render/duel/readoutModel';
import { TEXT, WARN } from '../src/renderer/src/render/theme';
import { TILE_PX } from '../src/shared/resolution';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;

describe('duel health views (spec §2)', () => {
  it('the HEALTH row shows the shown character: 72/100, red under 30, DOWNED when downed', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect(healthRow(d, 0)).toMatchObject({ label: 'HEALTH', value: '100/100', valueTint: TEXT });
      Health.cur[d.interior.crew[0]!] = 71.4;
      expect(healthRow(d, 0)).toMatchObject({ value: '72/100', valueTint: TEXT });
      expect(healthRow(d, 1).value).toBe('100/100');
      Health.cur[d.interior.crew[0]!] = 29;
      expect(healthRow(d, 0)).toMatchObject({ value: '29/100', valueTint: WARN, emphasis: 'alert' });
      Health.cur[d.interior.crew[0]!] = 0.01;
      expect(healthRow(d, 0).value).toBe('1/100');
      Health.cur[d.interior.crew[0]!] = 0; Life.state[d.interior.crew[0]!] = LifeState.Downed;
      expect(healthRow(d, 0)).toMatchObject({ value: 'DOWNED', valueTint: WARN, emphasis: 'alert' });
    } finally { disposeDuel(d); }
  });
  it('the interior draws a health bar below full, and DOWNED - STAY CLOSE while a downed character is picked up', () => {
    const d = createSeatedDuel(CUTTER, 5), [a, b] = d.interior.crew as [number, number];
    try {
      expect(interiorOverlay(d).crew.map((c) => [c.bar, c.downed, c.label])).toEqual([[false, false, ''], [false, false, '']]);
      Health.cur[a] = 40;
      expect(interiorOverlay(d).crew[0]).toMatchObject({ pid: 0, x: Position.x[a]! * TILE_PX, y: Position.y[a]! * TILE_PX, fill: 0.4, bar: true, downed: false, label: '' });
      Health.cur[b] = 0; Life.state[b] = LifeState.Downed;
      expect(interiorOverlay(d).crew[1]).toMatchObject({ bar: false, downed: true, revive: 0, label: 'DOWNED' });
      Life.reviveProgress[b] = 0.5;
      expect(interiorOverlay(d).crew[1]).toMatchObject({ revive: 0.5, label: 'DOWNED - STAY CLOSE' });
    } finally { disposeDuel(d); }
  });
  it('the crew status reads the other character DOWNED, on the duel and on an online replica (Sci-2 spec §5.2)', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect(crewStatus(d, 1)).toBe('WEAPONS');
      const e = d.interior.crew[1]!;
      Seated.station[e] = -1; d.interior.stations.occupant[d.weapons] = -1; Health.cur[e] = 0; Life.state[e] = LifeState.Downed;
      expect(crewStatus(d, 1)).toBe('DOWNED');
      const replica = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      try { expect(crewStatus(replica, 1)).toBe('DOWNED'); } finally { disposeDuel(replica); }
    } finally { disposeDuel(d); }
  });
});
