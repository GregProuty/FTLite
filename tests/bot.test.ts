import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { botIntent, BOT_RECOVER_HEALTH } from '../src/renderer/src/sim/bot';
import { EVENTS } from '../src/renderer/src/sim/events';
import { NodeType } from '../src/renderer/src/sim/run';
import { failStation } from '../src/renderer/src/sim/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { downCrew } from '../src/renderer/src/sim/crew';
import { roomAt } from '../src/renderer/src/sim/grid';
import { Life, LifeState, Seated, Position, Health } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import type { SimState } from '../src/renderer/src/sim/state';
import { MEDBAY_HEAL } from '../src/renderer/src/sim/tuning';
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
    expect(stoodAt).toBeGreaterThanOrEqual(jumpAt); expect(stoodAt - jumpAt).toBeLessThanOrEqual(120);   // the bot really stood, within two seconds of the jump
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
  it('(7) leaves a failed Navigation console to the repair, and does not sit at it while it is failed; it is repaired powered', () => {
    const s = calm(); chargeJump(s); failStation(s, nav(s));
    let held = false, repairedAt = -1;
    for (let t = 0; t < 3600; t++) {
      const i0 = botIntent(s, 0); if (s.stations.failed[nav(s)] && i0.interactHeld) held = true;
      step(s, [i0, botIntent(s, 1)]);
      if (s.stations.failed[nav(s)]) expect(Seated.station[s.crew[0]!]).toBe(-1);   // no seat while the console is failed (a repaired console returns powered and may be sat at: spec Demo-ii section 3)
      if (repairedAt < 0 && s.stations.failed[nav(s)] === 0) repairedAt = s.tick;
    }
    expect(repairedAt).toBeGreaterThan(0); expect(held).toBe(true);
    expect(s.stations.level[nav(s)]).toBe(1);   // repaired with a free bar: it returns online at level 1 (spec Demo-ii section 3)
  });
});

describe('bot self-preservation (spec Demo-ii section 10)', () => {
  const mbRoom = (s: SimState): number => s.derived.stationRoom[s.derived.stationOfKind[StationKind.Medbay]!]!;
  const roomOf = (s: SimState, pid: number): number => roomAt(s, Position.x[s.crew[pid]!]!, Position.y[s.crew[pid]!]!);
  const hurt = (s: SimState, pid: number, hp: number): void => { Health.cur[s.crew[pid]!] = hp; };
  const burn = (s: SimState, r: number): void => { igniteRoom(s, r); s.rooms.fire[r] = 1e6; };
  it('(a) at health 20 it never enters a burning room that lies on its path to a hazard goal', () => {
    const s = calm(); failStation(s, s.derived.stationOfKind[StationKind.Medbay]!);   // no Medbay to retreat to: ordinary duty
    failStation(s, 3); burn(s, 1); hurt(s, 1, 20); hurt(s, 0, 100);
    for (let t = 0; t < 600; t++) { tick(s); hurt(s, 1, 20); s.rooms.fire[1] = 1e6; expect(roomOf(s, 1)).not.toBe(1); }
  });
  it('(b) at health 20 inside a burning room it leaves within 120 ticks', () => {
    const s = calm(); burn(s, 1); teleport(s, 1, 7.5, 2.5); hurt(s, 1, 20);
    let out = -1;
    for (let t = 0; t < 120 && out < 0; t++) { tick(s); hurt(s, 1, 20); s.rooms.fire[1] = 1e6; if (roomOf(s, 1) !== 1) out = t; }
    expect(out).toBeGreaterThanOrEqual(0);
  });
  it('(c) at health 20 with the Medbay online it walks there and stays until health 60, then leaves', () => {
    const s = calm(); hurt(s, 1, 20); hurt(s, 0, 100); teleport(s, 0, 2.5, 3.5);
    const mr = mbRoom(s); let healedAt = -1, leftAt = -1;
    for (let t = 0; t < 3000 && leftAt < 0; t++) {
      tick(s);
      if (healedAt < 0 && Health.cur[s.crew[1]!]! >= BOT_RECOVER_HEALTH) { healedAt = t; failStation(s, 3); }   // a hazard appears once it is healed
      if (healedAt < 0 && Health.cur[s.crew[1]!]! > 20) expect(roomOf(s, 1)).toBe(mr);
      if (healedAt >= 0 && roomOf(s, 1) !== mr) leftAt = t;
    }
    expect(healedAt).toBeGreaterThan(0); expect(leftAt).toBeGreaterThan(healedAt);
    expect(MEDBAY_HEAL).toBeGreaterThan(0);
  });
  it('(d) at health 20 with a Downed teammate in reach it revives first', () => {
    const s = calm(); teleport(s, 0, Position.x[s.crew[1]!]! + 0.5, Position.y[s.crew[1]!]!); hurt(s, 1, 20); downCrew(s, 0);
    expect(botIntent(s, 1).interactHeld).toBe(true);
    let rose = false;
    for (let t = 0; t < 600; t++) { tick(s); if (Life.reviveProgress[s.crew[0]!]! > 0) rose = true; }
    expect(rose).toBe(true);
  });
  it('(e) at health 80 it still walks into a burning room to fight the fire', () => {
    const s = calm(); burn(s, 1); hurt(s, 1, 80); hurt(s, 0, 80);
    let entered = false;
    for (let t = 0; t < 600 && !entered; t++) { tick(s); hurt(s, 1, 80); s.rooms.fire[1] = 1e6; if (roomOf(s, 1) === 1) entered = true; }
    expect(entered).toBe(true);
  });
});
