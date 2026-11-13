import { describe, it, expect } from 'vitest';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { reachable, beaconIndex } from '../src/renderer/src/sim/run';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown, selectTab } from '../src/renderer/src/sim/stations';
import { Seated } from '../src/renderer/src/sim/components';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { botIntent } from '../src/renderer/src/sim/bot';
import { makeState, run, quiet, intents, chargeJump, seatNavigator, allHazard, setEvent, setNodeTypes, mapM, grantScrap, RECRUITS } from './helpers/sim';
import { NodeType } from '../src/renderer/src/sim/run';
import { WEAPON_ITEM } from '../src/renderer/src/sim/shop';
import { VOTE_SETTLE, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { EVENT_DEFS, EVENTS } from '../src/renderer/src/sim/events';
import { navRows } from '../src/renderer/src/sim/run';

const SKIFF = parseShip(skiff);
/** Two players, a quiet hazard map, the drive charged, P1 (pid 0) seated at Navigation with the cursor on the first jump row. */
function ready() {
  const s = makeState(2); quiet(s); allHazard(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
  const n = seatNavigator(s, 0); run(s, 1); chargeJump(s); s.stations.cursor[n] = 0; return { s, n };
}
const seat = (s: ReturnType<typeof makeState>, pid: number, kind: number): number => { const i = s.derived.stationOfKind[kind]!; sitDown(s, pid, i); if (kind === StationKind.Engineering) s.stations.cursor[i] = StationKind.Navigation; return i; };   // Engineering's cursor on the Navigation row: a Confirm there cycles its coolant

describe('B1: any other player agrees to a jump (spec Demo-xi section 1)', () => {
  it('a seated non-Navigation Confirm agrees and is consumed: its card did not act', () => {
    const { s, n } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    const dest = reachable(s)[0]!, coolant = s.stations.coolant[n]!;   // Engineering's cursor 0 is the Navigation row: a Confirm there would cycle its coolant
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.run.jumpPending).toBe(beaconIndex(dest.column, dest.node));
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect([s.run.column, s.run.node, s.run.jumpPending]).toEqual([1, dest.node, -1]);
    expect(s.stations.coolant[n]).toBe(coolant);
  });
  it('without a pending jump the same seated Confirm acts on the card', () => {
    const { s, n } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    const coolant = s.stations.coolant[n]!;
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect(s.stations.coolant[n]).not.toBe(coolant);
  });
  it('the Navigation occupant\'s own Confirm does not agree', () => {
    const { s } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    run(s, 1, () => intents({ confirmPressed: true }, {})); run(s, 1);
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.run.column).toBe(0); expect(s.run.jumpPending).toBeGreaterThanOrEqual(0);
  });
  it('a standing Confirm still agrees', () => {
    const { s } = ready();
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect([s.run.column, s.run.jumpPending]).toEqual([1, -1]);
  });
  it('the Helm officer on the Skiff\'s Weapons tab is still the Navigation occupant: the Confirm does not agree (amendment 1)', () => {
    const s = createSimState(SKIFF, 2, 1, RECRUITS); quiet(s); allHazard(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, wpn = s.derived.stationOfKind[StationKind.Weapons]!, g = s.derived.stationGroup[nav]!;
    expect(g).toBeGreaterThanOrEqual(0); expect(s.derived.stationGroup[wpn]).toBe(g);
    sitDown(s, 0, nav); run(s, 1); chargeJump(s);
    const dest = reachable(s)[0]!; s.run.jumpPending = beaconIndex(dest.column, dest.node); s.run.jumpPendingTick = s.tick;
    selectTab(s, 0, g, s.derived.groupStations[g]!.indexOf(wpn)); expect(Seated.station[s.crew[0]!]).toBe(wpn);
    step(s, intents({ confirmPressed: true }, {}));
    expect([s.run.column, s.run.jumpPending]).toEqual([0, beaconIndex(dest.column, dest.node)]);
  });
  it('the captain bot still gets its jump agreed by the other bot (bot.ts)', () => {
    const { s } = ready(); run(s, 1, () => intents({ confirmPressed: true }, {}));
    step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); expect(s.run.column).toBe(1);
  });
});

describe('B1: seated bots agree from their seats (spec Demo-xi amendment 4)', () => {
  it('a bot seated at a non-Navigation console presses Confirm while a jump is pending, and the jump goes', () => {
    const { s } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    expect(botIntent(s, 1).confirmPressed).toBe(false);
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(botIntent(s, 1).confirmPressed).toBe(true);
    step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); expect(s.run.column).toBe(1);
  });
  it('the seated captain bot never agrees to its own jump', () => {
    const { s } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    step(s, [botIntent(s, 0), NEUTRAL_INTENT]); expect(s.run.column).toBe(0);
  });
});

describe('B3: every player votes in an event (spec Demo-xi section 2)', () => {
  /** Event 4 open (three choices or two), P1 at Navigation, P2 seated at Engineering on the Navigation coolant row. */
  const open = () => { const { s, n } = ready(); setEvent(s, 4); const e = seat(s, 1, StationKind.Engineering); run(s, 1); return { s, n, e }; };
  it('a seated non-Navigation Confirm cycles that player\'s vote (1, 2, ...) and is consumed', () => {
    const { s, n } = open(); const coolant = s.stations.coolant[n]!, k = EVENT_DEFS[4]!.choices.length;
    run(s, 1, () => intents({}, { confirmPressed: true })); expect(s.run.vote[1]).toBe(0);
    run(s, 1, () => intents({}, { confirmPressed: true })); expect(s.run.vote[1]).toBe(1 % k);
    expect(s.stations.coolant[n]).toBe(coolant); expect(Seated.station[s.crew[1]!]).toBeGreaterThanOrEqual(0);
  });
  it('the Navigation officer still picks with the rows, and its Confirm is not a vote press', () => {
    const { s, n } = open(); const rows = navRows(s), last = rows.map((r) => r.select).lastIndexOf('choice');
    s.stations.cursor[n] = last;
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.vote[0]).toBe(rows[last]!.index);
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.vote[0]).toBe(rows[last]!.index);   // a second press on the same row does not cycle it
  });
  it('an open event takes the press before a pending jump (amendment 2)', () => {
    const { s } = open(); const dest = reachable(s)[0]!; s.run.jumpPending = beaconIndex(dest.column, dest.node); s.run.jumpPendingTick = s.tick;
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect(s.run.vote[1]).toBe(0); expect(s.run.column).toBe(0);
  });
  it('a seated bot votes for the safe choice and then stops pressing', () => {
    const { s } = open(); const safe = EVENTS[4]!.safeChoice;
    for (let t = 0; t < 10; t++) step(s, [NEUTRAL_INTENT, botIntent(s, 1)]);
    expect(s.run.vote[1]).toBe(safe); expect(botIntent(s, 1).confirmPressed).toBe(false);
  });
});

describe('B2: the Navigation cursor never lands on a jump row by itself (spec Demo-xi section 3)', () => {
  /** One player (no agreement needed), map M, a shop at column 1 node 0 offering a weapon, P1 seated at Navigation. */
  const shop = () => {
    const s = makeState(1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s);
    s.run.column = 1; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Shop }); s.run.shopWeapon = 1; grantScrap(s, 999);
    const n = seatNavigator(s, 0); run(s, 1); return { s, n };
  };
  const key = (s: ReturnType<typeof makeState>, n: number) => { const r = navRows(s)[s.stations.cursor[n]!]!; return [r.select, r.index]; };
  it('a row above the cursor disappearing leaves the cursor on the same row', () => {
    const { s, n } = shop(); const rows = navRows(s), j = rows.map((r) => r.select).lastIndexOf('jump');
    s.stations.cursor[n] = j; run(s, 1); const before = key(s, n);
    s.run.shopWeapon = 0; run(s, 1);   // the weapon row above the cursor is gone (sold)
    expect(key(s, n)).toEqual(before); expect(s.stations.cursor[n]).toBe(j - 1);
  });
  it('buying a shop item keeps the cursor on that item\'s row; buying the weapon (its row gone) moves to the top, never onto a jump row', () => {
    const { s, n } = shop(); s.hull = 90;
    s.stations.cursor[n] = 1; run(s, 1); run(s, 1, () => intents({ confirmPressed: true })); expect(key(s, n)).toEqual(['buy', 0]);
    const w = navRows(s).findIndex((r) => r.select === 'buy' && r.index === WEAPON_ITEM); expect(navRows(s)[w + 1]!.select).toBe('jump');
    s.stations.cursor[n] = w; run(s, 1); run(s, 1, () => intents({ confirmPressed: true }));
    expect(s.run.shopWeapon).toBe(0); expect(s.run.column).toBe(1);
    expect(s.stations.cursor[n]).toBe(1); expect(key(s, n)).toEqual(['buy', 0]);   // row 0 is the shop header: the first selectable row
    run(s, 1, () => intents({ confirmPressed: true })); expect(s.run.column).toBe(1);   // the next Confirm does not leave
  });
  it('a resolved event puts the cursor on row 0, not on the jump row at its old row number', () => {
    const s = makeState(1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); s.run.column = 1; s.run.node = 1; setEvent(s, 4);   // map M node 1b: three destinations, so the old row number is a jump row
    const n = seatNavigator(s, 0); run(s, 1);
    const choice = navRows(s).map((r) => r.select).indexOf('choice'); s.stations.cursor[n] = choice;
    run(s, 1, () => intents({ confirmPressed: true })); run(s, VOTE_SETTLE * TICK_HZ + 1);
    expect(s.run.eventChoice).toBeGreaterThanOrEqual(0); expect(navRows(s)[choice]!.select).toBe('jump');
    expect(s.stations.cursor[n]).toBe(0);
  });
  it('after a jump the cursor is on row 0 (unchanged)', () => {
    const { s, n } = shop(); s.stations.cursor[n] = navRows(s).map((r) => r.select).lastIndexOf('jump'); run(s, 1); chargeJump(s);
    run(s, 1, () => intents({ confirmPressed: true })); expect(s.run.column).toBeGreaterThanOrEqual(1); expect(s.run.nodesReached).toBeGreaterThan(0);
    expect(s.stations.cursor[n]).toBe(0);
  });
  it('the Navigation officer\'s own moves are kept', () => {
    const { s, n } = shop(); run(s, 1, () => intents({ moveY: 1 })); const c = s.stations.cursor[n]!; run(s, 3); expect(s.stations.cursor[n]).toBe(c);
  });
});
