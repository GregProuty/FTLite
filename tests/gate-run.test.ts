import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { confirmTarget, ConfirmKind } from '../src/renderer/src/sim/interact';
import { roomAt } from '../src/renderer/src/sim/grid';
import { EndReason } from '../src/renderer/src/sim/crew';
import { Position, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { NodeType, navRows } from '../src/renderer/src/sim/run';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { TICK_HZ, SECTORS, SECTOR_COLUMNS, JUMP_CHARGE_TIME, WAIT_SECONDS, HULL_MAX, scrapPerJump, WARDEN_HULL_MULT } from '../src/renderer/src/sim/tuning';
import { enemyMaxHull } from '../src/renderer/src/sim/enemy';
import { makeState, quiet, room, RECRUITS, mapM, setNodeTypes, allHazard } from './helpers/sim';

// Spec Loop-i sections 1 and 2, Loop-iv section 3: three sectors, then the last exit's jump to the final beacon, where the Warden arrives. Bots never fire, so the gate ends at its arrival (the scripted gunner in finalBattle.test.ts wins the fight).
const JUMPS = SECTORS * SECTOR_COLUMNS;
describe('run gate: a scripted navigator resolves an event, buys a hull repair and reaches the Warden', () => {
  it('seed 1, two Recruits: the final beacon and the Warden arriving, every arrival paid, the event\'s 40, 30 spent, hull full', () => {
    const s = makeState(2, 1, RECRUITS, { quirk: 3 }); quiet(s);   // Lucky Hull: no debris flies in this gate, so the quirk is inert
    const silence = () => { if (!s.run.finalBeacon) s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; };   // no enemy until the final beacon, where the Warden comes (spec Loop-iv section 3)
    mapM(s); setNodeTypes(s, { '1:0': NodeType.Event, '2:0': NodeType.Shop }); s.hull = 90;
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, A = room(s, 'A'), eid = s.crew[0]!;
    let lastJumps = 0, bought = false, holdOff = false, lastSector = 0;
    const move = (dy: number) => { holdOff = !holdOff; return holdOff ? { ...NEUTRAL_INTENT, moveY: dy } : { ...NEUTRAL_INTENT }; };   // one stick edge per two ticks: a release between presses
    const limit = (JUMPS * (JUMP_CHARGE_TIME + 10) + 12 * WAIT_SECONDS) * TICK_HZ;
    for (let t = 0; t < limit && !s.ended && !(s.run.finalBeacon && s.enemy.present); t++) {
      silence();
      let p0 = { ...NEUTRAL_INTENT };
      if (Seated.station[eid] === nav) {
        const rows = navRows(s), cur = s.stations.cursor[nav]!, row = rows[cur];
        const way = rows.findIndex((r) => r.select === 'jump' || r.select === 'sector' || r.select === 'wait');   // the first way on: the lowest forward destination, the exit's sector jump, or Wait for help
        if (s.run.event >= 0 && s.run.eventChoice < 0) p0 = row?.select === 'choice' && row.index === 0 ? { ...NEUTRAL_INTENT, confirmPressed: true } : move(-1);
        else if (s.run.sector === 0 && s.run.column === 2 && !bought) { if (row?.select === 'buy' && row.index === 0) { p0 = { ...NEUTRAL_INTENT, confirmPressed: true }; bought = true; } else p0 = move(cur > 1 ? -1 : 1); }
        else if (cur === way) p0 = { ...NEUTRAL_INTENT, confirmPressed: true };
        else p0 = move(cur < way ? 1 : -1);
      } else { const c = confirmTarget(s, 0); const atConsole = roomAt(s, Position.x[eid]!, Position.y[eid]!) === A && c.kind === ConfirmKind.Console && c.index === nav; p0 = atConsole ? { ...NEUTRAL_INTENT, confirmPressed: true } : { ...NEUTRAL_INTENT, moveY: -1 }; }
      step(s, [p0, botIntent(s, 1)]);
      if (s.run.sector !== lastSector) { lastSector = s.run.sector; allHazard(s); }   // the later sectors' maps are quiet: one event and one shop in this gate
      if (s.telemetry.jumps !== lastJumps) { lastJumps = s.telemetry.jumps; if (s.run.sector === 0 && s.run.column === 1) s.run.event = 4; }   // the arrival drew an id; pin the Supply cache
    }
    expect([s.ended, s.endReason, s.run.finalBeacon, s.enemy.present, s.enemy.maxHull, s.telemetry.jumps, s.run.sector, s.run.column]).toEqual([0, EndReason.None, 1, 1, Math.round(enemyMaxHull(SECTORS * SECTOR_COLUMNS - 1) * WARDEN_HULL_MULT), JUMPS, SECTORS - 1, SECTOR_COLUMNS - 1]);   // the Warden, not a victory
    let jumpScrap = 0; for (let d = 1; d < SECTORS * SECTOR_COLUMNS; d++) jumpScrap += scrapPerJump(d);   // every arrival pays its depth, the sector arrivals at depths 6 and 12 included; the jump to the final beacon pays nothing
    expect([s.telemetry.scrapEarned, s.telemetry.scrapSpent, s.run.scrap, s.telemetry.eventsResolved, s.telemetry.purchases, s.hull]).toEqual([jumpScrap + 40, 30, jumpScrap + 40 - 30, 1, 1, HULL_MAX]);
    expect(s.crew.filter((e) => Life.state[e] === LifeState.Conscious).length).toBe(2);
  });
});
