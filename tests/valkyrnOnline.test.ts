// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §7.3, §10 Null laser): the online view derives a gun hit from each
// gunHits increment (the Valkyrn is not online; this is for completeness), the telemetry builds for the gun Valkyrn
// with no laser counts, and a gun kill's terminal cause is `gun`, after `laser` in TERMINAL_CAUSES.
import { describe, expect, it } from 'vitest';
import { duelCounters, gapEvents } from '../src/renderer/src/app/duel/onlineSource';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelEndSummary, TERMINAL_CAUSES } from '../src/renderer/src/sim/duel/summary';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';
import { createTacticalState, Outcome } from '../src/renderer/src/sim/tactical/state';
import { createSeatedValkyrn, createValkyrnDuel } from './helpers/valkyrnDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };

describe('the online view (spec §7.3)', () => {
  it('each gunHits increment is a gunHit on the target at its position, Room and strip unknown', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), before = [duelCounters(st, 0), duelCounters(st, 1)];
    expect(before[0]!.gunHits).toBe(0);
    st.systems[0].gunHits += 3;
    const hits = gapEvents(before, [null, null], st).filter((e) => e.kind === 'gunHit');
    expect(hits).toEqual(Array.from({ length: 3 }, () => ({ kind: 'gunHit', ship: 1, room: -1, stripped: false, hull: false, level: false, x: st.ships[1].x, y: st.ships[1].y })));
    expect(gapEvents([duelCounters(createTacticalState(5), 0), duelCounters(createTacticalState(5), 1)], [null, null], createTacticalState(5)).some((e) => e.kind === 'gunHit')).toBe(false);
  });
});

describe('telemetry (spec §7.3)', () => {
  it('builds for the gun Valkyrn firing for 120 ticks, with no laser counts', () => {
    const d = createSeatedValkyrn(5), t = createTelemetry(d);
    try {
      for (let k = 0; k < 120 && d.tactical.outcome === Outcome.Running; k++) { const input = { held: [{ ...NONE, gunHeld: true }], commands: [] }; stepDuelTick(d, input); recordTick(t, d, input); }
      expect(d.tactical.systems[0].gunShots).toBeGreaterThan(0);
      expect([t.ships[0].laserReleases, t.ships[0].laserHits, t.ships[0].laserMisses, t.weaponsIdleTicks]).toEqual([0, 0, 0, 0]);
    } finally { disposeDuel(d); }
  });
  it('a gun kill is the terminal cause gun, after laser in TERMINAL_CAUSES', () => {
    expect(TERMINAL_CAUSES).toEqual(['planet', 'asteroid', 'ship', 'laser', 'gun', 'pew', 'missile', 'downed']);   // W-1 appended 'pew' after 'gun'
    const d = createValkyrnDuel(5), t = createTelemetry(d);
    try {
      const h = d.tactical.ships[1], hs = d.tactical.systems[1];
      hs.shields = 0; hs.hull = 1; hs.gunHull = GUN.hitsPerHull - 1;
      placeRound(d.tactical, { x: h.x - 30, y: h.y, vx: 700 + h.vx, vy: h.vy, age: 0, owner: 0 });
      const input = { held: [NONE], commands: [] };
      stepDuelTick(d, input); recordTick(t, d, input);
      expect([d.tactical.outcome, t.terminal[1]]).toEqual([Outcome.CrewWins, ['gun']]);
      expect(duelEndSummary(t).terminal[1]).toEqual(['gun']);
    } finally { disposeDuel(d); }
  });
  it('a gun hit that only adds wear (no hull point) is not a terminal cause (spec §7.3)', () => {
    const d = createValkyrnDuel(5), t = createTelemetry(d);
    try {
      const h = d.tactical.ships[1], hs = d.tactical.systems[1];
      hs.shields = 0; hs.hull = 1; hs.gunHull = 0;
      placeRound(d.tactical, { x: h.x - 30, y: h.y, vx: 700 + h.vx, vy: h.vy, age: 0, owner: 0 });
      const input = { held: [NONE], commands: [] };
      stepDuelTick(d, input);
      const hit = d.tactical.events.find((e) => e.kind === 'gunHit');
      expect(hit).toMatchObject({ ship: 1, hull: false });
      expect([hs.hull, hs.gunHull]).toEqual([1, 1]);
      // The hull reaches 0 on this tick by some other, unattributed means: the wear-only gun hit is not credited.
      hs.hull = 0; d.tactical.outcome = Outcome.CrewWins;
      recordTick(t, d, input);
      expect(t.terminal[1]).toEqual([]);
    } finally { disposeDuel(d); }
  });
});
