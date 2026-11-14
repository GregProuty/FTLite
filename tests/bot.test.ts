import { describe, it, expect } from 'vitest';
import { step } from './helpers/rawInput';
import { botIntent, BOT_RECOVER_HEALTH } from './helpers/bot';
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
      if (s.telemetry.encounters === 0) expect(Seated.station[p1]).toBe(-1);   // Demo-xiii: pid 1 takes the guns once the next beacon's enemy arrives (the gunner, spec Demo-xiii section 3); before that it never sits
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

describe('bot self-preservation: valid byte-path fixture', () => {
  const hurt = (s: SimState, pid: number, hp: number): void => { Health.cur[s.crew[pid]!] = hp; };
  it('(d) at health 20 with a Downed teammate in reach it revives first', () => {
    const s = calm(); teleport(s, 0, Position.x[s.crew[1]!]! + 0.5, Position.y[s.crew[1]!]!); hurt(s, 1, 20); downCrew(s, 0);
    expect(botIntent(s, 1).interactHeld).toBe(true);
    let rose = false;
    for (let t = 0; t < 600; t++) { tick(s); if (Life.reviveProgress[s.crew[0]!]! > 0) rose = true; }
    expect(rose).toBe(true);
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
