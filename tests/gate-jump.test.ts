import { describe, it, expect } from 'vitest';
import { tracedStep as step, beginGateTrace, assertGateTrace } from './helpers/gateTrace';
import { botIntent } from './helpers/bot';
import { confirmTarget, ConfirmKind } from '../src/renderer/src/sim/interact';
import { roomAt } from '../src/renderer/src/sim/grid';
import { EndReason } from '../src/renderer/src/sim/crew';
import { Position, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { TICK_HZ, SECTORS, SECTOR_COLUMNS, JUMP_CHARGE_TIME, WAIT_SECONDS } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, room, RECRUITS, allHazard } from './helpers/sim';

// Spec Loop-i sections 1 and 2: the run is three sectors of six columns, five jumps across each and the sector jump out of it (18 jumps, the last to the final beacon: spec Loop-iv section 3); fuel runs out on the way, so the navigator's Confirm on the only row also waits for help. No enemy comes before the final beacon, so the bot gunner (Demo-xiii) never fires here: the gate ends when the Warden arrives.
const JUMPS = SECTORS * SECTOR_COLUMNS;
const WAITS_MAX = 12;
describe('jump gate: a scripted navigator jumps the quiet ship through every sector', () => {
  it('seed 1, two Recruits: eighteen jumps with waits for fuel, the final beacon and the Warden arriving, both alive, within 18 x (charge + 10) + 12 waits seconds', { timeout: 60_000 }, () => {
    const s = makeState(2, 1, RECRUITS, { quirk: 3 }); quiet(s);   // Lucky Hull: no debris flies in this gate, so the quirk is inert
    allHazard(s); const silence = () => { if (!s.run.finalBeacon) s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; };   // a quiet ship: no enemy (pursuit fights included) before the final beacon and no boarders, every tick
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, A = room(s, 'A'), eid = s.crew[0]!;
    let seatedOnce = false, waits = 0, lastSector = 0, wasWaiting = false;
    const limit = (JUMPS * (JUMP_CHARGE_TIME + 10) + WAITS_MAX * WAIT_SECONDS) * TICK_HZ;
    beginGateTrace(s, 'jump:1');
    for (let t = 0; t < limit && !s.ended && !(s.run.finalBeacon && s.enemy.present); t++) {
      silence();
      let p0 = { ...NEUTRAL_INTENT };
      if (Seated.station[eid] === nav) { seatedOnce = true; p0 = { ...NEUTRAL_INTENT, confirmPressed: true }; }
      else { const c = confirmTarget(s, 0); const atConsole = roomAt(s, Position.x[eid]!, Position.y[eid]!) === A && c.kind === ConfirmKind.Console && c.index === nav; p0 = atConsole ? { ...NEUTRAL_INTENT, confirmPressed: true } : { ...NEUTRAL_INTENT, moveY: -1 }; }
      step(s, [p0, botIntent(s, 1)]);
      if (s.run.sector !== lastSector) { lastSector = s.run.sector; allHazard(s); }   // each new sector's map is quiet too
      const waiting = s.run.waitUntilTick >= 0; if (waiting && !wasWaiting) waits++; wasWaiting = waiting;
    }
    assertGateTrace(s);
    expect(seatedOnce).toBe(true);
    expect([s.telemetry.jumps, s.run.sector, s.run.column, s.run.finalBeacon, s.enemy.present, s.ended, s.endReason]).toEqual([JUMPS, SECTORS - 1, SECTOR_COLUMNS - 1, 1, 1, 0, EndReason.None]);   // the Warden has arrived
    expect(waits).toBeGreaterThan(0);   // eight fuel do not cover eighteen jumps (spec section 2)
    expect(s.crew.filter((e) => Life.state[e] === LifeState.Conscious).length).toBe(2);
    expect(s.tick).toBeLessThan(limit);
    expect([s.tick, waits]).toEqual([GATE_END_TICK, GATE_WAITS]);   // recorded on the first run (Loop-i Task 5)
  });
});
const GATE_END_TICK = 56995, GATE_WAITS = 6;   // Demo-xi P1: 65298 -> 56995, the drive is full at the three calm arrivals (the start and two sector arrivals), so the navigator leaves them without the charge wait; 18 charges of 3600 ticks and one tick each for the second Confirm; the six waits ran while the drive charged; Loop-iv: 64818 -> 65298, the run no longer ends on the last jump but ENCOUNTER_START seconds later (480 ticks), when the Warden arrives
