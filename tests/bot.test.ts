import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { botIntent, BOT_RECOVER_HEALTH } from '../src/renderer/src/sim/bot';
import { EVENTS } from '../src/renderer/src/sim/events';
import { NodeType } from '../src/renderer/src/sim/run';
import { failStation } from '../src/renderer/src/sim/power';
import { igniteRoom, extinguishRoom } from '../src/renderer/src/sim/hazards/fire';
import { downCrew } from '../src/renderer/src/sim/crew';
import { roomAt, conditionRoomAt, DoorState } from '../src/renderer/src/sim/grid';
import { Life, LifeState, Seated, Position, Health } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import type { SimState } from '../src/renderer/src/sim/state';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { makeState, quiet, mapM, setNodeTypes, setEvent, grantScrap, chargeJump, placeBoarder, teleport, setMap, MAP_M_NODES, MAP_M_MASKS } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { EndReason } from '../src/renderer/src/sim/crew';
import { SECTORS, SECTOR_COLUMNS } from '../src/renderer/src/sim/tuning';

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
  it('(3) never buys at a shop: jumps on, scrap is 100 + scrapPerJump(2) = 118 at the next arrival', () => {
    const s = calm(); setNodeTypes(s, { '1:0': NodeType.Shop }); chargeJump(s);
    let granted = false;
    for (let t = 0; t < 12000 && s.telemetry.jumps < 2; t++) {
      tick(s);
      if (!granted && s.telemetry.jumps === 1) { granted = true; grantScrap(s, 100); }
    }
    expect(s.telemetry.jumps).toBe(2); expect(s.telemetry.purchases).toBe(0); expect(s.run.scrap).toBe(118);   // grantScrap sets the total; the arrival at column 2 pays 18 (spec Demo-ix section 2)
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
    expect(EVENTS.slice(0, 6).map((e) => e.safeChoice)).toEqual([1, 1, 1, 1, 0, 1]);   // the six Run-ii events (spec Loop-v section 2)
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
  it('(a) at health 20 it never enters a burning corridor on its route to a hazard goal, and reaches the goal once the fire is out', () => {
    const s = calm(); failStation(s, s.derived.stationOfKind[StationKind.Medbay]!);   // no Medbay to retreat to: ordinary duty
    failStation(s, 2); teleport(s, 1, 3.5, 9.5);   // room 6, below the corridor (room 5); Weapons (room 1) lies beyond it
    const lone = (): void => step(s, [NEUTRAL_INTENT, botIntent(s, 1)]);   // pid 0 stands still so only pid 1 can reach the console
    expect(roomOf(s, 1)).toBe(6); expect(s.derived.stationRoom[2]).toBe(1);
    burn(s, 5); hurt(s, 1, 20); hurt(s, 0, 100);
    for (let t = 0; t < 600; t++) { lone(); hurt(s, 1, 20); s.rooms.fire[5] = 1e6; expect(roomOf(s, 1)).not.toBe(5); }
    expect(s.stations.failed[2]).toBe(1);
    extinguishRoom(s, 5);
    let fixed = false;
    for (let t = 0; t < 3000 && !fixed; t++) { lone(); hurt(s, 1, 20); if (!s.stations.failed[2]) fixed = true; }
    expect(fixed).toBe(true);
  });
  it('(f) trapped at health 20 in a burning room with the corridor burning too, it fights or walks and never idles', () => {
    const s = calm(); teleport(s, 1, 7.5, 2.5); teleport(s, 0, 2.5, 9.5); burn(s, 1); burn(s, 5); hurt(s, 1, 20);
    let fought = 0, safe = false;
    for (let t = 0; t < 600 && !safe; t++) {
      const i = botIntent(s, 1), r = roomOf(s, 1);
      if (r >= 0 && s.rooms.fire[r]! <= 0) { safe = true; break; }   // reached a room that is not burning
      expect(i.interactHeld || i.moveX !== 0 || i.moveY !== 0).toBe(true);   // never idles while it burns
      if (i.interactHeld) fought++;
      step(s, [botIntent(s, 0), i]); hurt(s, 1, 20); s.rooms.fire[1] = 1e6; s.rooms.fire[5] = 1e6;
    }
    expect(safe || fought > 0).toBe(true);   // the fallback either walked it out to a fire-free room or it fought the fire it stood in
  });
  it('(g) the captain at 20 health with a ready drive and the Medbay offline never walks into a burning corridor', () => {
    const s = calm(); failStation(s, s.derived.stationOfKind[StationKind.Medbay]!); chargeJump(s); burn(s, 5); hurt(s, 0, 20); hurt(s, 1, 100);
    for (let t = 0; t < 600; t++) { tick(s); hurt(s, 0, 20); s.rooms.fire[5] = 1e6; expect(roomOf(s, 0)).not.toBe(5); }
  });
  it('(b) at health 20 inside a burning room it leaves within 120 ticks', () => {
    const s = calm(); burn(s, 1); teleport(s, 1, 7.5, 2.5); hurt(s, 1, 20);
    let out = -1;
    for (let t = 0; t < 120 && out < 0; t++) { tick(s); hurt(s, 1, 20); s.rooms.fire[1] = 1e6; if (roomOf(s, 1) !== 1) out = t; }
    expect(out).toBeGreaterThanOrEqual(0);
  });
  it('(c) at health 20 with the Medbay online it walks there and stays until health 60 despite a hazard goal, then leaves', () => {
    const s = calm(); hurt(s, 1, 20); hurt(s, 0, 100); teleport(s, 0, 2.5, 3.5);
    const mr = mbRoom(s);
    let far = -1; for (let r = 0; r < s.rooms.fire.length && far < 0; r++) if (r !== mr && r !== roomOf(s, 1) && r !== roomOf(s, 0)) far = r;
    expect(far).toBeGreaterThanOrEqual(0);
    burn(s, far);   // a hazard goal exists before the bot reaches 30
    let arrived = false, healedAt = -1, leftAt = -1;
    for (let t = 0; t < 6000 && leftAt < 0; t++) {
      tick(s); s.rooms.fire[far] = 1e6;
      const hp = Health.cur[s.crew[1]!]!;
      if (roomOf(s, 1) === mr) arrived = true;
      if (arrived && hp < BOT_RECOVER_HEALTH) expect(roomOf(s, 1)).toBe(mr);
      if (healedAt < 0 && hp >= BOT_RECOVER_HEALTH) healedAt = t;
      if (healedAt >= 0 && roomOf(s, 1) !== mr) leftAt = t;
    }
    expect(arrived).toBe(true); expect(healedAt).toBeGreaterThan(0); expect(leftAt).toBeGreaterThan(healedAt);
  });
  it('(d) at health 20 with a Downed teammate in reach it revives first', () => {
    const s = calm(); teleport(s, 0, Position.x[s.crew[1]!]! + 0.5, Position.y[s.crew[1]!]!); hurt(s, 1, 20); downCrew(s, 0);
    expect(botIntent(s, 1).interactHeld).toBe(true);
    let rose = false;
    for (let t = 0; t < 600; t++) { tick(s); if (Life.reviveProgress[s.crew[0]!]! > 0) rose = true; }
    expect(rose).toBe(true);
  });
  // Demo-v (docs/superpowers/specs/2026-11-12-bot-fire-design.md): door (9, 7) joins the corridor (room 5) above to room 7 below; room 7's only way out is the corridor
  const atDoor = (s: SimState, pid: number): void => { teleport(s, pid, 9.5, 7.5); s.doors.state[s.derived.doorTileToEdge[7 * s.derived.width + 9]!] = DoorState.Open; };   // standing in the open doorway
  const inFire = (s: SimState, pid: number): boolean => { const r = conditionRoomAt(s, Position.x[s.crew[pid]!]!, Position.y[s.crew[pid]!]!); return r >= 0 && s.rooms.fire[r]! > 0; };
  it('(h) at health 20 in a doorway beside a burning corridor, with the Medbay cut off and a healthy teammate, it steps out of the doorway within 60 ticks', () => {
    const s = calm(); atDoor(s, 1); teleport(s, 0, 2.5, 9.5); burn(s, 5); hurt(s, 1, 20); hurt(s, 0, 100);
    expect(roomOf(s, 1)).toBe(-1); expect(inFire(s, 1)).toBe(true);
    let out = -1;
    for (let t = 0; t < 60 && out < 0; t++) { step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); hurt(s, 1, 20); s.rooms.fire[5] = 1e6; if (roomOf(s, 1) >= 0 && !inFire(s, 1)) out = t; }
    expect(out).toBeGreaterThanOrEqual(0);
  });
  for (const mate of [100, 20]) {
    it(`(i) at health 20 at a burning doorway with no safe Medbay (teammate at ${mate}) it leaves for good or holds Interact on the fire, and never dithers`, () => {
      const s = calm(); failStation(s, s.derived.stationOfKind[StationKind.Medbay]!);
      atDoor(s, 1); teleport(s, 0, 2.5, 9.5); burn(s, 5); hurt(s, 1, 20); hurt(s, 0, mate);
      let reversals = 0, lastX = 0, lastY = 0, outSince = -1, fightSince = -1;
      for (let t = 0; t < 600; t++) {
        const i = botIntent(s, 1);
        const sx = Math.sign(Math.round(i.moveX * 10)), sy = Math.sign(Math.round(i.moveY * 10));
        if (sx !== 0) { if (lastX !== 0 && sx !== lastX) reversals++; lastX = sx; }
        if (sy !== 0) { if (lastY !== 0 && sy !== lastY) reversals++; lastY = sy; }
        step(s, [NEUTRAL_INTENT, i]); hurt(s, 1, 20); hurt(s, 0, mate); s.rooms.fire[5] = 1e6;
        for (let r = 0; r < s.rooms.fire.length; r++) if (r !== 5 && s.rooms.fire[r]! > 0) extinguishRoom(s, r);   // a fixed state: no spread
        const out = roomOf(s, 1) >= 0 && !inFire(s, 1), fight = i.interactHeld && roomOf(s, 1) === 5;
        outSince = out ? (outSince < 0 ? t : outSince) : -1; fightSince = fight ? (fightSince < 0 ? t : fightSince) : -1;
      }
      expect(reversals).toBeLessThanOrEqual(2);
      expect(outSince >= 0 || fightSince >= 0).toBe(true);   // at the end it is out of the fire, or holding Interact in the burning corridor
      expect(Math.max(outSince, fightSince)).toBeLessThanOrEqual(300);   // and has been for at least the second half
      if (mate === 100) expect(outSince).toBeGreaterThanOrEqual(0);   // a healthy teammate is the one to fight it: the hurt bot waits outside
      else expect(fightSince).toBeGreaterThanOrEqual(0);   // nobody healthier: it fights the fire rather than idling while the ship burns
    });
  }
  it('(e) at health 80 it still walks into a burning room to fight the fire', () => {
    const s = calm(); burn(s, 1); hurt(s, 1, 80); hurt(s, 0, 80);
    let entered = false;
    for (let t = 0; t < 600 && !entered; t++) { tick(s); hurt(s, 1, 80); s.rooms.fire[1] = 1e6; if (roomOf(s, 1) === 1) entered = true; }
    expect(entered).toBe(true);
  });
});

describe('bots and crew votes (spec Coop-ii amendment D6)', () => {
  it('a standing bot votes the safe choice from the first tick the event is open, and holds it', () => {
    for (const id of [0, 4]) {
      const s = calm(); s.run.column = 1; s.run.node = 2; setEvent(s, id);
      for (let k = 0; k < 3; k++) step(s, [NEUTRAL_INTENT, botIntent(s, 1)]);
      expect(s.run.vote[1]).toBe(EVENTS[id]!.safeChoice);
      for (let k = 0; k < 10; k++) step(s, [NEUTRAL_INTENT, botIntent(s, 1)]);
      expect(s.run.vote[1]).toBe(EVENTS[id]!.safeChoice);
    }
  });
  it('two bots resolve an event by votes and jump on with the second confirmation', () => {
    const s = calm(); setNodeTypes(s, { '1:0': NodeType.Event, '1:2': NodeType.Event }); chargeJump(s);
    let resolved = false;
    for (let t = 0; t < 120 * 60 && s.run.column < 2; t++) { step(s, [botIntent(s, 0), botIntent(s, 1)]); if (s.run.eventChoice >= 0) resolved = true; }
    expect(resolved).toBe(true); expect(s.telemetry.eventsResolved).toBe(1); expect(s.run.column).toBeGreaterThanOrEqual(1);
  });
});

describe('the captain bot on the sector map (spec Loop-i section 5)', () => {
  const seated = (setup: (s: SimState) => void) => { const s = calm(); setup(s); chargeJump(s); const n = nav(s); sitDown(s, 0, n); step(s, [NEUTRAL_INTENT, NEUTRAL_INTENT]); return s; };
  const fly = (s: SimState, until: (s: SimState) => boolean, ticks = 600) => { for (let t = 0; t < ticks && !until(s); t++) { s.run.jumpCharge = 1; step(s, [botIntent(s, 0), botIntent(s, 1)]);   // the second bot confirms the jump (spec Coop-ii section 3)
    s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; } };
  it('takes the lowest forward destination and never a sideways one', () => {
    const s = seated((x) => { x.run.column = 1; x.run.node = 1; });   // forward 2a; sideways 2a and 2c come after it
    fly(s, (x) => x.telemetry.jumps > 0); expect([s.run.column, s.run.node]).toEqual([2, 0]);
    const t = seated((x) => { x.run.column = 0; }); fly(t, (x) => x.telemetry.jumps > 0); expect([t.run.column, t.run.node]).toEqual([1, 0]);
  });
  it('treats an overrun destination as a last resort', () => {
    const s = seated((x) => { setMap(x, MAP_M_NODES, { ...MAP_M_MASKS, '1:1': 0b11 }); x.run.column = 1; x.run.node = 1; x.run.pursuit = 0; });
    fly(s, (x) => x.telemetry.jumps > 0); expect([s.run.column, s.run.node]).toEqual([2, 0]);   // both forward beacons free: the lowest
    const o = seated((x) => { x.run.column = 1; x.run.node = 1; x.run.pursuit = 2.25; });   // every destination overrun (FLEET): it still goes forward
    fly(o, (x) => x.telemetry.jumps > 0); expect([o.run.column, o.run.node]).toEqual([2, 0]);
  });
  it('takes the sector jump at the exit, and engages the Warden in the last sector (spec Loop-iv section 3)', () => {
    const s = seated((x) => { x.run.column = SECTOR_COLUMNS - 1; x.run.node = 0; });
    fly(s, (x) => x.run.sector > 0); expect([s.run.sector, s.run.column]).toEqual([1, 0]);
    const e = seated((x) => { x.run.sector = SECTORS - 1; x.run.column = SECTOR_COLUMNS - 1; x.run.node = 0; });
    fly(e, (x) => x.run.finalBeacon === 1); expect([e.run.finalBeacon, e.ended, e.endReason]).toEqual([1, 0, EndReason.None]);
  });
  it('waits for help only when out of fuel, and then always waits', () => {
    const s = seated((x) => { x.run.column = 1; x.run.node = 1; x.run.fuel = 0; });
    fly(s, (x) => x.run.waitUntilTick >= 0); expect(s.run.waitUntilTick).toBeGreaterThan(0);
    fly(s, (x) => x.run.fuel > 0, 60 * 60 * 5); expect(s.run.fuel).toBe(2);
    fly(s, (x) => x.telemetry.jumps > 0); expect(s.telemetry.jumps).toBe(1);
    const f = seated((x) => { x.run.column = 1; x.run.node = 1; }); fly(f, (x) => x.telemetry.jumps > 0); expect(f.run.waitUntilTick).toBe(-1);
  });
});
