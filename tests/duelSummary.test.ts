// The duel end summary maps the telemetry accumulator's numbers to the right fields and ship slots, deeply frozen.
import { describe, expect, it } from 'vitest';
import { duelEndSummary, duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import type { DuelTelemetry } from '../src/renderer/src/sim/duel/telemetry';

describe('duelEndSummary', () => {
  it('maps every field from distinct per-ship and per-player numbers, and freezes the nested arrays', () => {
    const t = {
      ticks: 1234, outcome: 2,
      ships: [
        { laserReleases: 3, laserHits: 5, laserMisses: 99, layersStripped: 98, missilesLaunched: 7, missileHitsByRoom: [1, 2, 4], missileLosses: { planet: 1, asteroid: 2, edge: 3, expired: 4, own: 5, missile: 6 }, planetContacts: 97, asteroidContacts: 96 },
        { laserReleases: 11, laserHits: 13, laserMisses: 95, layersStripped: 94, missilesLaunched: 17, missileHitsByRoom: [20, 30, 40], missileLosses: { missile: 16, own: 15, expired: 14, edge: 13, asteroid: 12, planet: 11 }, planetContacts: 93, asteroidContacts: 92 }
      ],
      players: [{ repairsStarted: 91, repairsFinished: 23, walkingTicks: 90, repairingTicks: 89 }, { repairsStarted: 88, repairsFinished: 29, walkingTicks: 87, repairingTicks: 86 }],
      terminal: [['planet', 'missile'], ['laser']],
      baits: 85, consoleSwaps: 84, helmEmptyTicks: 83, weaponsEmptyTicks: 82, enemyInArcTicks: 81, weaponsIdleTicks: 80
    } as unknown as DuelTelemetry;
    const s = duelEndSummary(t);
    expect(s).toEqual({ outcome: 2, ticks: 1234, terminal: [['planet', 'missile'], ['laser']], laserReleases: [3, 11], laserHits: [5, 13],
      missilesLaunched: [7, 17], missileHits: [7, 90], repairsFinished: [23, 29],
      laserMisses: [99, 95], layersStripped: [98, 94], missileLosses: [{ planet: 1, asteroid: 2, edge: 3, expired: 4, own: 5, missile: 6 }, { planet: 11, asteroid: 12, edge: 13, expired: 14, own: 15, missile: 16 }],
      planetContacts: [97, 93], asteroidContacts: [96, 92], baits: 85, consoleSwaps: 84, helmEmptyTicks: 83, weaponsEmptyTicks: 82, enemyInArcTicks: 81, weaponsIdleTicks: 80,
      repairsStarted: [91, 88], walkingTicks: [90, 87], repairingTicks: [89, 86] });
    expect(Object.keys(s.missileLosses[1])).toEqual(['planet', 'asteroid', 'edge', 'expired', 'own', 'missile']);   // the accumulator's order, whatever the input's
    for (const v of [s, s.terminal, s.terminal[0], s.terminal[1], s.laserReleases, s.laserHits, s.missilesLaunched, s.missileHits, s.repairsFinished,
      s.missileLosses, s.missileLosses[0], s.missileLosses[1], s.repairsStarted, s.walkingTicks, s.repairingTicks])
      expect(Object.isFrozen(v)).toBe(true);
    expect(duelRoundRecord(s, 2, 77, 9000)).toEqual({ ...s, round: 2, seed: 77, baseTick: 9000 });
    expect(Object.isFrozen(duelRoundRecord(s, 2, 77, 9000))).toBe(true);
  });
});
