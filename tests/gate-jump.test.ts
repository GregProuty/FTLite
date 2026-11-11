import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { confirmTarget, ConfirmKind } from '../src/renderer/src/sim/interact';
import { roomAt } from '../src/renderer/src/sim/grid';
import { EndReason } from '../src/renderer/src/sim/crew';
import { Position, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { TICK_HZ, RUN_COLUMNS, JUMP_CHARGE_TIME } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, room, RECRUITS } from './helpers/sim';

describe('jump gate: a scripted navigator jumps the quiet ship through every column', () => {
  it('seed 1, two Recruits: seven jumps, victory, both alive, within 8 x (charge + 10) seconds', () => {
    const s = makeState(2, 1, RECRUITS); quiet(s); const silence = () => { s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; }; silence();
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, A = room(s, 'A'), eid = s.crew[0]!;
    let seatedOnce = false, lastJumps = 0;
    for (let t = 0; t < 8 * (JUMP_CHARGE_TIME + 10) * TICK_HZ && !s.ended; t++) {
      let p0 = { ...NEUTRAL_INTENT };
      if (Seated.station[eid] === nav) { seatedOnce = true; p0 = { ...NEUTRAL_INTENT, confirmPressed: true }; }
      else { const c = confirmTarget(s, 0); const atConsole = roomAt(s, Position.x[eid]!, Position.y[eid]!) === A && c.kind === ConfirmKind.Console && c.index === nav; p0 = atConsole ? { ...NEUTRAL_INTENT, confirmPressed: true } : { ...NEUTRAL_INTENT, moveY: -1 }; }
      step(s, [p0, botIntent(s, 1)]);
      if (s.telemetry.jumps !== lastJumps) { lastJumps = s.telemetry.jumps; silence(); }
    }
    expect(seatedOnce).toBe(true);
    expect([s.telemetry.jumps, s.run.column, s.endReason]).toEqual([RUN_COLUMNS - 1, RUN_COLUMNS - 1, EndReason.Victory]);
    expect(s.crew.filter((e) => Life.state[e] === LifeState.Conscious).length).toBe(2);
    expect(s.tick).toBeLessThan(8 * (JUMP_CHARGE_TIME + 10) * TICK_HZ);
  });
});
