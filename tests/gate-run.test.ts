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
import { TICK_HZ, RUN_COLUMNS, JUMP_CHARGE_TIME, HULL_MAX, scrapPerJump } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, room, RECRUITS, mapM, setNodeTypes } from './helpers/sim';

describe('run gate: a scripted navigator resolves an event, buys a hull repair and wins', () => {
  it('seed 1, two Recruits: victory with 145 earned, 30 spent, hull full', () => {
    const s = makeState(2, 1, RECRUITS, { quirk: 3 }); quiet(s);   // Lucky Hull: no debris flies in this gate, so the quirk is inert and the end tick stays 25200 (spec Run-iii section 8)
    const silence = () => { s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; }; silence();
    mapM(s); setNodeTypes(s, { '1:0': NodeType.Event, '2:0': NodeType.Shop }); s.hull = 90;
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, A = room(s, 'A'), eid = s.crew[0]!;
    let lastJumps = 0, bought = false, holdOff = false;
    const move = (dy: number) => { holdOff = !holdOff; return holdOff ? { ...NEUTRAL_INTENT, moveY: dy } : { ...NEUTRAL_INTENT }; };   // one stick edge per two ticks: a release between presses
    for (let t = 0; t < 8 * (JUMP_CHARGE_TIME + 10) * TICK_HZ && !s.ended; t++) {
      let p0 = { ...NEUTRAL_INTENT };
      if (Seated.station[eid] === nav) {
        const rows = navRows(s), cur = s.stations.cursor[nav]!, row = rows[cur];
        if (s.run.event >= 0 && s.run.eventChoice < 0) p0 = row?.select === 'choice' && row.index === 0 ? { ...NEUTRAL_INTENT, confirmPressed: true } : move(-1);
        else if (s.run.column === 2 && !bought) { if (row?.select === 'buy' && row.index === 0) { p0 = { ...NEUTRAL_INTENT, confirmPressed: true }; bought = true; } else p0 = move(cur > 1 ? -1 : 1); }
        else if (row?.select === 'jump' && row.index === 0) p0 = { ...NEUTRAL_INTENT, confirmPressed: true };
        else p0 = move(1);
      } else { const c = confirmTarget(s, 0); const atConsole = roomAt(s, Position.x[eid]!, Position.y[eid]!) === A && c.kind === ConfirmKind.Console && c.index === nav; p0 = atConsole ? { ...NEUTRAL_INTENT, confirmPressed: true } : { ...NEUTRAL_INTENT, moveY: -1 }; }
      step(s, [p0, botIntent(s, 1)]);
      if (s.telemetry.jumps !== lastJumps) { lastJumps = s.telemetry.jumps; silence(); if (s.run.column === 1) s.run.event = 4; }   // the arrival drew an id; pin the Supply cache
    }
    expect([s.endReason, s.telemetry.jumps, s.run.column]).toEqual([EndReason.Victory, RUN_COLUMNS - 1, RUN_COLUMNS - 1]);
    let jumpScrap = 0; for (let c = 1; c < RUN_COLUMNS; c++) jumpScrap += scrapPerJump(c);   // each arrival pays its new column (spec Demo-ix amendment B8)
    expect([s.telemetry.scrapEarned, s.telemetry.scrapSpent, s.run.scrap, s.telemetry.eventsResolved, s.telemetry.purchases, s.hull]).toEqual([jumpScrap + 40, 30, jumpScrap + 40 - 30, 1, 1, HULL_MAX]);
    expect(s.crew.filter((e) => Life.state[e] === LifeState.Conscious).length).toBe(2);
  });
});
