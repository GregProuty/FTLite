// The duel end summary maps the telemetry accumulator's numbers to the right fields and ship slots, deeply frozen.
import { describe, expect, it } from 'vitest';
import { duelEndSummary } from '../src/renderer/src/sim/duel/summary';
import type { DuelTelemetry } from '../src/renderer/src/sim/duel/telemetry';

describe('duelEndSummary', () => {
  it('maps every field from distinct per-ship and per-player numbers, and freezes the nested arrays', () => {
    const t = {
      ticks: 1234, outcome: 2,
      ships: [
        { laserReleases: 3, laserHits: 5, laserMisses: 99, layersStripped: 98, missilesLaunched: 7, missileHitsByRoom: [1, 2, 4], missileLosses: {}, planetContacts: 97, asteroidContacts: 96 },
        { laserReleases: 11, laserHits: 13, laserMisses: 95, layersStripped: 94, missilesLaunched: 17, missileHitsByRoom: [20, 30, 40], missileLosses: {}, planetContacts: 93, asteroidContacts: 92 }
      ],
      players: [{ repairsStarted: 91, repairsFinished: 23, walkingTicks: 90, repairingTicks: 89 }, { repairsStarted: 88, repairsFinished: 29, walkingTicks: 87, repairingTicks: 86 }],
      terminal: [['planet', 'missile'], ['laser']]
    } as unknown as DuelTelemetry;
    const s = duelEndSummary(t);
    expect(s).toEqual({ outcome: 2, ticks: 1234, terminal: [['planet', 'missile'], ['laser']], laserReleases: [3, 11], laserHits: [5, 13],
      missilesLaunched: [7, 17], missileHits: [7, 90], repairsFinished: [23, 29] });
    for (const v of [s, s.terminal, s.terminal[0], s.terminal[1], s.laserReleases, s.laserHits, s.missilesLaunched, s.missileHits, s.repairsFinished])
      expect(Object.isFrozen(v)).toBe(true);
  });
});
