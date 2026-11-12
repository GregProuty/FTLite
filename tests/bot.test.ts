import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { EVENTS } from '../src/renderer/src/sim/events';
import { NodeType } from '../src/renderer/src/sim/run';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { downCrew } from '../src/renderer/src/sim/crew';
import { roomAt } from '../src/renderer/src/sim/grid';
import { Life, LifeState, Seated, Position } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import type { SimState } from '../src/renderer/src/sim/state';
import { makeState, quiet, mapM, setNodeTypes, setEvent, grantScrap, chargeJump, placeBoarder, teleport } from './helpers/sim';

/** A quiet two-Recruit state on map M, all Hazard, enemy and boarders silenced (spec Demo-i section 8). */
function calm(): SimState {
  const s = makeState(2, 1); quiet(s); mapM(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
  return s;
}
const tick = (s: SimState): void => step(s, [botIntent(s, 0), botIntent(s, 1)]);
const nav = (s: SimState): number => s.derived.stationOfKind[StationKind.Navigation]!;

describe('the captain bot (spec Demo-i section 6)', () => {
  it('(1) sits at Navigation by tick 1200, jumps by 1500, stands within 120 ticks of the jump; pid 1 never sits; a fire is ignored', () => {
    const s = calm(); chargeJump(s); igniteRoom(s, roomAt(s, Position.x[s.crew[0]!]!, Position.y[s.crew[0]!]!));   // a fire in the spawn room
    const p1 = s.crew[1]!;
    let seatedAt = -1, jumpAt = -1, stoodAt = -1;
    for (let t = 0; t < 1700; t++) {
      tick(s);
      expect(Seated.station[p1]).toBe(-1);
      if (seatedAt < 0 && Seated.station[s.crew[0]!] === nav(s)) seatedAt = s.tick;
      if (jumpAt < 0 && s.telemetry.jumps === 1) jumpAt = s.tick;
      if (jumpAt >= 0 && stoodAt < 0 && Seated.station[s.crew[0]!] === -1) stoodAt = s.tick;
    }
    expect(seatedAt).toBeGreaterThan(0); expect(seatedAt).toBeLessThanOrEqual(1200);
    expect(jumpAt).toBeGreaterThan(0); expect(jumpAt).toBeLessThanOrEqual(1500);
    expect(stoodAt - jumpAt).toBeLessThanOrEqual(120);
  });
  it('(2) takes each event\'s safe choice: supply cache takes the scrap (no station fails); derelict hulk leaves it', () => {
    for (const [id, choice] of [[4, 0], [0, 1]] as const) {
      const s = calm(); setNodeTypes(s, { '1:0': NodeType.Event }); chargeJump(s);
      let armed = false, scrap0 = 0;
      for (let t = 0; t < 2400 && s.run.eventChoice < 0; t++) {
        tick(s);
        if (!armed && s.telemetry.jumps === 1) { armed = true; setEvent(s, id); scrap0 = s.run.scrap; }
      }
      expect(s.run.eventChoice).toBe(choice); expect(choice).toBe(EVENTS[id]!.safeChoice);
      expect(s.run.scrap - scrap0).toBe(id === 4 ? 40 : 0);
      expect(s.stations.failed.some((f) => f)).toBe(false);
      expect(s.rooms.fire.some((f) => f > 0)).toBe(false);
    }
  });
  it('(3) never buys at a shop: jumps on, scrap is 100 + 15 at the next arrival', () => {
    const s = calm(); setNodeTypes(s, { '1:0': NodeType.Shop }); chargeJump(s);
    let granted = false;
    for (let t = 0; t < 12000 && s.telemetry.jumps < 2; t++) {
      tick(s);
      if (!granted && s.telemetry.jumps === 1) { granted = true; grantScrap(s, 100); }
    }
    expect(s.telemetry.jumps).toBe(2); expect(s.telemetry.purchases).toBe(0); expect(s.run.scrap).toBe(115);
  });
  it('(4) revives a Downed pid 1 before sitting, then jumps', () => {
    const s = calm(); chargeJump(s);
    teleport(s, 1, Position.x[s.crew[0]!]! + 0.5, Position.y[s.crew[0]!]!); downCrew(s, 1);
    let rose = false;
    for (let t = 0; t < 3000 && s.telemetry.jumps === 0; t++) {
      tick(s);
      if (Life.reviveProgress[s.crew[1]!]! > 0) rose = true;
      if (Seated.station[s.crew[0]!] === nav(s)) { expect(rose).toBe(true); expect(Life.state[s.crew[1]!]).toBe(LifeState.Conscious); }
      if (Life.state[s.crew[1]!] !== LifeState.Conscious) expect(s.telemetry.jumps).toBe(0);
    }
    expect(rose).toBe(true); expect(s.telemetry.jumps).toBe(1);
  });
  it('(5) fights a boarder in its room and does not sit until it is dead', () => {
    const s = calm(); chargeJump(s);
    const slot = placeBoarder(s, roomAt(s, Position.x[s.crew[0]!]!, Position.y[s.crew[0]!]!)); s.boarders.nextMoveTick[slot] = 1e9;
    expect(botIntent(s, 0).interactHeld).toBe(true);
    for (let t = 0; t < 900 && s.boarders.active[slot]; t++) { tick(s); expect(Seated.station[s.crew[0]!]).toBe(-1); }
    expect(s.boarders.active[slot]).toBe(0);
    for (let t = 0; t < 1500 && s.telemetry.jumps === 0; t++) tick(s);
    expect(s.telemetry.jumps).toBe(1);
  });
  it('(6) EVENTS safeChoice is [1, 1, 1, 1, 0, 1]', () => {
    expect(EVENTS.map((e) => e.safeChoice)).toEqual([1, 1, 1, 1, 0, 1]);
  });
});
