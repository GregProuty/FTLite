import { describe, it, expect } from 'vitest';
import { DoorState } from '../src/renderer/src/sim/grid';
import { TICK_HZ, VOTE_SECONDS, VOTE_SETTLE, FUEL_COST, SHOP_FUEL } from '../src/renderer/src/sim/tuning';
import { teleport } from './helpers/sim';
import { NodeType, NAV_TEXT_MAX, reachable, navRows, clampNavCursor, jumpShip } from '../src/renderer/src/sim/run';
import { addScrap, spendScrap } from '../src/renderer/src/sim/scrap';
import { EVENTS, EVENT_DEFS, choiceEnabled, choiceLabel, resolveEvent } from '../src/renderer/src/sim/events';
import { SHOP_ITEM_COUNT, itemLabel, itemEnabled, buy } from '../src/renderer/src/sim/shop';
import { failStation } from '../src/renderer/src/sim/power';
import { isOverdriven, heatStep } from '../src/renderer/src/sim/heat';
import { leave } from '../src/renderer/src/sim/enemy';
import { damageBoarder, killBoarderByHazard } from '../src/renderer/src/sim/boarders';
import { downCrew } from '../src/renderer/src/sim/crew';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { freeSites } from '../src/renderer/src/sim/hazards/breach';
import { nextInt, nextFloat } from '../src/shared/rng';
import { HULL_MAX, HEALTH_MAX, TORP_CAP, TORP_START, STATION_MAX, scrapPerJump, scrapEnemy, scrapBoarder, scrapSurrender, scrapField } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, intents, placeEnemy, placeBoarder, chargeJump, seatNavigator, mapM, setNodeTypes, grantScrap, setEvent, room, ahead } from './helpers/sim';

const calm = (seed = 1) => { const s = makeState(2, seed); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); return s; };
const at = (s: ReturnType<typeof makeState>, column: number, node: number) => { s.run.column = column; s.run.node = node; s.run.nodesReached = column; s.telemetry.jumps = column; };

describe('arrival', () => {
  it('a Hazard arrival awards scrapPerJump of the new column and never touches the loot stream; an Event arrival draws the id with exactly one loot draw, by weight', () => {
    const s = calm(); const before = { s: s.rng.loot.s };
    jumpShip(s, ahead(s, 0));
    expect([s.run.scrap, s.telemetry.scrapEarned, s.run.event, s.run.eventChoice]).toEqual([scrapPerJump(1), scrapPerJump(1), -1, -1]);
    expect(s.rng.loot.s).toBe(before.s); expect(nextInt(s.rng.loot, 1000)).toBe(nextInt(before, 1000));
    const e = calm(); setNodeTypes(e, { '1:2': NodeType.Event }); const ref = { s: e.rng.loot.s }; const elig = EVENT_DEFS.map((d, i) => [d, i] as const).filter(([d]) => (d.minDepth ?? 0) <= 1); let u = nextFloat(ref) * elig.reduce((a, [d]) => a + d.weight, 0), id = -1; for (const [d, i] of elig) { u -= d.weight; if (u < 0 && id < 0) id = i; }   // one draw by weight over the events open at depth 1 (spec Loop-v section 2)
    jumpShip(e, ahead(e, 2));
    expect(e.run.event).toBe(id); expect(e.rng.loot.s).toBe(ref.s); expect(e.run.scrap).toBe(scrapPerJump(1));
    const v = calm(); at(v, 4, 0); jumpShip(v, ahead(v, 0)); expect(v.ended).toBe(0); expect(v.run.event).toBe(-1);   // the exit is a Hazard: no event, and arriving there wins nothing (spec Loop-i section 1)
    const bad = calm(); const h = JSON.stringify([bad.run.column, bad.run.scrap, bad.rng.loot.s, bad.rng.director.s]); jumpShip(bad, ahead(bad, 1)); expect(JSON.stringify([bad.run.column, bad.run.scrap, bad.rng.loot.s, bad.rng.director.s])).toBe(h);   // node 1 is not reachable from the start: no-op
  });
  it('a pending event lists four rows, blocks the jump, resolves on Confirm, and the next Confirm jumps from the re-clamped cursor', () => {
    const s = calm(); at(s, 1, 2); setEvent(s, 4); chargeJump(s); const n = seatNavigator(s, 0); run(s, 1);
    const rows = navRows(s);
    expect(rows.map((r) => [r.text, r.select, r.index, r.enabled])).toEqual([[EVENTS[4]!.title, 'none', 0, false], [EVENTS[4]!.text, 'none', 0, false], [EVENTS[4]!.choices[0], 'choice', 0, true], [EVENTS[4]!.choices[1], 'choice', 1, true], ['EVADE: Confirm', 'evade', 0, true]]);   // the evade row last (spec Coop-ii section 1)
    expect(s.stations.cursor[n]).toBe(2); clampNavCursor(s); expect(s.stations.cursor[n]).toBe(2);   // the console's own clamp already ran in the seated tick (spec section 6)
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect([s.run.vote[0], s.run.eventChoice]).toEqual([0, -1]);   // the officer's vote (spec Coop-ii amendment D7)
    run(s, 1, () => intents({}, { confirmPressed: true })); run(s, VOTE_SETTLE * TICK_HZ);                                    // P2 votes option 1 too; it resolves once the votes settle
    expect([s.run.column, s.telemetry.jumps, s.run.jumpCharge, s.run.eventChoice, s.run.scrap, s.telemetry.eventsResolved]).toEqual([1, 1, 1, 0, 40, 1]);
    expect(navRows(s).map((r) => r.select)).toEqual(['jump', 'jump', 'evade']); expect(s.stations.cursor[n]).toBe(2);   // forward Node 3a, sideways Node 2b (spec Loop-i section 1); cursor 2 is now the evade row: kept
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); run(s, 1, () => intents({}, {})); expect(s.stations.cursor[n]).toBe(0); run(s, 1, () => intents({ confirmPressed: true }, {})); run(s, 1, () => intents({}, { confirmPressed: true }));   // the pilot, then the second officer (spec Coop-ii section 3)
    expect([s.run.column, s.run.node]).toEqual([2, 0]);
  });
});

describe('events: every choice', () => {
  const setup = (id: number, scrap = 100) => { const s = calm(); at(s, 1, 2); setEvent(s, id); grantScrap(s, scrap); return s; };
  it('0 Derelict hulk: salvage adds 25 and ignites the drawn room (one draw); leave does nothing', () => {
    const s = setup(0); const ref = { s: s.rng.loot.s }; const roomIdx = nextInt(ref, s.layout.rooms.length);
    resolveEvent(s, 0); expect(s.run.scrap).toBe(125); expect(s.rooms.fire[roomIdx]).toBeGreaterThan(0); expect(s.rng.loot.s).toBe(ref.s); expect(s.run.eventChoice).toBe(0); expect(s.telemetry.eventsResolved).toBe(1);
    const t = setup(0); const l = t.rng.loot.s; resolveEvent(t, 1); expect(t.run.scrap).toBe(100); expect(Array.from(t.rooms.fire).every((f) => f === 0)).toBe(true); expect(t.rng.loot.s).toBe(l);
  });
  it('1 Distress call: help costs 10 hull for 30 scrap and is disabled at hull 10; ignore does nothing', () => {
    const s = setup(1); s.hull = 61; expect(choiceEnabled(s, 1, 0)).toBe(true); resolveEvent(s, 0); expect([s.hull, s.run.scrap]).toEqual([51, 130]);
    const d = setup(1); d.hull = 10; expect(choiceEnabled(d, 1, 0)).toBe(false); d.hull = 11; expect(choiceEnabled(d, 1, 0)).toBe(true);
    const t = setup(1); resolveEvent(t, 1); expect([t.hull, t.run.scrap, t.run.eventChoice]).toEqual([HULL_MAX, 100, 1]);
  });
  it('2 Smugglers: 20 scrap for 2 torpedoes capped at TORP_CAP, disabled at 19 scrap or full stock; refuse does nothing', () => {
    const s = setup(2); resolveEvent(s, 0); expect([s.weapons.torpedoStock, s.run.scrap, s.telemetry.scrapSpent]).toEqual([TORP_START + 2, 80, 20]);
    const c = setup(2); c.weapons.torpedoStock = TORP_CAP - 1; resolveEvent(c, 0); expect(c.weapons.torpedoStock).toBe(TORP_CAP);
    const p = setup(2, 19); expect(choiceEnabled(p, 2, 0)).toBe(false); const f = setup(2); f.weapons.torpedoStock = TORP_CAP; expect(choiceEnabled(f, 2, 0)).toBe(false);
    const t = setup(2); resolveEvent(t, 1); expect([t.weapons.torpedoStock, t.run.scrap]).toEqual([TORP_START, 100]);
  });
  it('3 Micrometeoroid field: push through adds 20 and breaches the drawn free site (one draw), no draw with no free site; go around resets the charge', () => {
    const s = setup(3); const ref = { s: s.rng.loot.s }; const sites = freeSites(s); const site = sites[nextInt(ref, sites.length)]!;
    resolveEvent(s, 0); expect(s.run.scrap).toBe(120); expect(s.breaches.active[site]).toBe(1); expect(s.rng.loot.s).toBe(ref.s);
    const n = setup(3); n.breaches.active.fill(1); const l = n.rng.loot.s; resolveEvent(n, 0); expect(n.run.scrap).toBe(120); expect(n.rng.loot.s).toBe(l);
    const t = setup(3); t.run.jumpCharge = 0.8; resolveEvent(t, 1); expect([t.run.jumpCharge, t.run.scrap]).toEqual([0, 100]);
  });
  it('4 Supply cache: take adds 40; strip adds 60 and fails the drawn station (one draw), skipping an already failed one', () => {
    const s = setup(4); resolveEvent(s, 0); expect(s.run.scrap).toBe(140); expect(Array.from(s.stations.failed).every((f) => f === 0)).toBe(true);
    const t = setup(4); const ref = { s: t.rng.loot.s }; const i = nextInt(ref, t.stations.level.length);
    resolveEvent(t, 1); expect(t.run.scrap).toBe(160); expect(t.stations.failed[i]).toBe(1); expect(t.rng.loot.s).toBe(ref.s);
    const f = setup(4); const ref2 = { s: f.rng.loot.s }; const j = nextInt(ref2, f.stations.level.length); failStation(f, j); const snapF = JSON.stringify([Array.from(f.stations.failed), Array.from(f.stations.level), Array.from(f.stations.repair)]);
    resolveEvent(f, 1); expect(JSON.stringify([Array.from(f.stations.failed), Array.from(f.stations.level), Array.from(f.stations.repair)])).toBe(snapF); expect(f.rng.loot.s).toBe(ref2.s); expect(f.run.scrap).toBe(160);
  });
  it('5 Medical freighter: 15 scrap heals Conscious crew to full and leaves a Downed member; disabled at 14; decline does nothing', () => {
    const s = setup(5); Health.cur[s.crew[0]!] = 20; downCrew(s, 1); const h1 = Health.cur[s.crew[1]!];
    resolveEvent(s, 0); expect([Health.cur[s.crew[0]!], Health.cur[s.crew[1]!], Life.state[s.crew[1]!], s.run.scrap, s.telemetry.scrapSpent]).toEqual([HEALTH_MAX, h1, LifeState.Downed, 85, 15]);
    const p = setup(5, 14); expect(choiceEnabled(p, 5, 0)).toBe(false); expect(choiceEnabled(p, 5, 1)).toBe(true);
    const t = setup(5); Health.cur[t.crew[0]!] = 20; resolveEvent(t, 1); expect([Health.cur[t.crew[0]!], t.run.scrap]).toEqual([20, 100]);
  });
  it('5 Medical freighter: a Dead member is untouched too', () => {
    const s = setup(5); const dead = s.crew[1]!; Life.state[dead] = LifeState.Dead; Health.cur[dead] = 0; Health.cur[s.crew[0]!] = 20;
    resolveEvent(s, 0); expect([Health.cur[s.crew[0]!], Health.cur[dead], Life.state[dead], s.run.scrap]).toEqual([HEALTH_MAX, 0, LifeState.Dead, 85]);
  });
  it('a disabled choice under Confirm changes nothing; resolveEvent on a resolved or absent event is a no-op', () => {
    const s = setup(5, 14); const n = seatNavigator(s, 0); run(s, 1); chargeJump(s); clampNavCursor(s); expect(s.stations.cursor[n]).toBe(2);
    const h = JSON.stringify([s.run.scrap, s.run.eventChoice, s.telemetry.eventsResolved, Array.from(Health.cur).slice(0, 4)]);
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(JSON.stringify([s.run.scrap, s.run.eventChoice, s.telemetry.eventsResolved, Array.from(Health.cur).slice(0, 4)])).toBe(h); expect(s.run.column).toBe(1);
    const r = setup(4); resolveEvent(r, 0); resolveEvent(r, 1); expect([r.run.scrap, r.telemetry.eventsResolved]).toEqual([140, 1]);
    const a = calm(); resolveEvent(a, 0); expect([a.run.scrap, a.telemetry.eventsResolved]).toEqual([0, 0]);
  });
});

describe('shops', () => {
  const shop = (scrap = 100) => { const s = calm(); at(s, 1, 0); setNodeTypes(s, { '1:0': NodeType.Shop }); grantScrap(s, scrap); return s; };
  it('lists the header, three items in order (hull, torpedoes, fuel: upgrades moved to Engineering, spec Loop-ii section 3) and the destinations; enabled per item', () => {
    const s = shop(); const rows = navRows(s);
    expect(SHOP_ITEM_COUNT).toBe(3);
    expect(rows).toHaveLength(7); expect(rows[0]).toEqual({ text: 'Shop   scrap 100', select: 'none', index: 0, enabled: false });   // mask 1:0 = 1: one forward destination (Node 3a) and the sideways Node 2b
    expect(rows.slice(1, 4).map((r) => [r.text, r.select, r.index])).toEqual([['Hull +25 (30 scrap)', 'buy', 0], ['Torpedoes +2 (20 scrap)', 'buy', 1], ['Fuel +2 (12 scrap)', 'buy', 2]]);
    expect(rows.some((r) => r.text.includes('bar'))).toBe(false);
    expect(rows.slice(4).map((r) => [r.text, r.select, r.index])).toEqual([['Node 3a  ?', 'jump', 8], ['Node 2b  ?', 'jump', 5], ['EVADE: Confirm', 'evade', 0]]);   // unvisited beacons read ? (spec Loop-i section 4b)   // row indices are beacon indices (column x 4 + node)
    expect(rows[1]!.enabled).toBe(false); s.hull = 90; expect(navRows(s)[1]!.enabled).toBe(true);
    expect(rows[2]!.enabled).toBe(true); s.weapons.torpedoStock = TORP_CAP; expect(navRows(s)[2]!.enabled).toBe(false);
    expect(rows[3]!.enabled).toBe(true);
    const poor = shop(29); expect(navRows(poor).slice(1, 4).map((r) => r.enabled)).toEqual([false, true, true]);
    const broke = shop(11); expect(navRows(broke)[3]!.enabled).toBe(false);
    const h = calm(); at(h, 1, 0); expect(navRows(h).map((r) => r.select)).toEqual(['jump', 'jump', 'evade']);
  });
  it('listing and buying never touch the loot stream', () => {
    const s = shop(); s.hull = 90; const l = s.rng.loot.s; navRows(s); buy(s, 0); buy(s, 1); buy(s, 2); expect(s.telemetry.purchases).toBe(3); expect(s.rng.loot.s).toBe(l);
  });
  it('buys: hull capped, torpedoes capped; a bought level is no overdrive (heat follows baseMax, spec Loop-ii rule U3)', () => {
    const s = shop(); s.hull = 90; buy(s, 0); expect([s.hull, s.run.scrap, s.telemetry.scrapSpent, s.telemetry.purchases]).toEqual([HULL_MAX, 70, 30, 1]);
    s.weapons.torpedoStock = TORP_CAP - 1; buy(s, 1); expect([s.weapons.torpedoStock, s.run.scrap]).toEqual([TORP_CAP, 50]);
    const before = [s.run.scrap, s.telemetry.purchases]; buy(s, 1); expect([s.run.scrap, s.telemetry.purchases]).toEqual(before);   // capped: disabled
    s.run.upgrades[StationKind.Weapons] = 2; const wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    s.stations.level[wpn] = STATION_MAX[StationKind.Weapons]! + 2; expect(isOverdriven(s, wpn)).toBe(false); for (let k = 0; k < 5; k++) heatStep(s); expect(s.stations.heat[wpn]).toBe(0);
    s.stations.level[wpn] = STATION_MAX[StationKind.Weapons]! + 3; expect(isOverdriven(s, wpn)).toBe(true);
  });
  it('cursor rules: a buy keeps the cursor on its (now disabled) row, the header is skipped, wrap crosses the ends, a shrink moves to the first selectable row', () => {
    const s = shop(); s.hull = 90; const n = seatNavigator(s, 0); run(s, 1);
    run(s, 1, () => intents({}, {})); expect(s.stations.cursor[n]).toBe(1);                                   // header skipped
    run(s, 1, () => intents({ moveY: -1 }, {})); expect(s.stations.cursor[n]).toBe(6);                       // Up from row 1 wraps to the last row (the evade row, spec Coop-ii section 1)
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(1);   // Down from the last wraps to row 1
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.hull).toBe(HULL_MAX); expect(s.stations.cursor[n]).toBe(1); expect(navRows(s)[1]!.enabled).toBe(false);
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.scrap).toBe(70);   // disabled: nothing
    const e = shop(); setEvent(e, 4); const m = seatNavigator(e, 0); run(e, 1); e.stations.cursor[m] = 3; run(e, 1, () => intents({ confirmPressed: true }, {})); run(e, 2, () => intents({}, { confirmPressed: true })); run(e, VOTE_SETTLE * TICK_HZ);   // P2 votes 1, then 2: both for option 2
    expect(e.run.eventChoice).toBe(1); expect(e.stations.cursor[m]).toBe(3);                                  // row 3 exists in the shop list (an item): kept
    expect(navRows(e)).toHaveLength(7);
  });
});

describe('scrap sources', () => {
  it('at column 0 a destroyed enemy pays scrapEnemy(0), a withdrawal pays nothing, a boarder kill pays scrapBoarder(0), and the counters reconcile', () => {
    const s = calm(); placeEnemy(s); leave(s, true); expect([s.run.scrap, s.telemetry.scrapEarned]).toEqual([scrapEnemy(0), scrapEnemy(0)]);
    placeEnemy(s); leave(s, false); expect(s.run.scrap).toBe(scrapEnemy(0));
    const b = placeBoarder(s, room(s, 'G'), 5); damageBoarder(s, b, 5, 0); expect(s.run.scrap).toBe(scrapEnemy(0) + scrapBoarder(0));
    spendScrap(s, 10); addScrap(s, 3); expect(s.run.scrap).toBe(s.telemetry.scrapEarned - s.telemetry.scrapSpent);
  });
});

describe('Navigation text budget', () => {
  it('every event title, text, choice, shop item label and the shop header fit NAV_TEXT_MAX', () => {
    const texts: string[] = [];
    const deep = calm(); deep.run.sector = 2; deep.run.column = 5;   // depth 17: the largest scaled amounts (spec Loop-v section 1)
    for (let id = 0; id < EVENT_DEFS.length; id++) { const e = EVENT_DEFS[id]!; texts.push(e.title, ...e.text); for (let k = 0; k < e.choices.length; k++) texts.push(choiceLabel(calm(), id, k), choiceLabel(deep, id, k)); }
    const s = calm(); for (let i = 0; i < SHOP_ITEM_COUNT; i++) texts.push(itemLabel(s, i));
    texts.push('Shop   scrap 100');
    for (const t of texts) expect(t.length, t).toBeLessThanOrEqual(NAV_TEXT_MAX);
  });
  it('jumpShip at the last column is a no-op', () => {
    const s = calm(); at(s, 5, 0); expect(reachable(s)).toEqual([]);
    const snap = () => JSON.stringify([s.run.column, s.run.node, s.run.nodesReached, s.run.jumpCharge, s.run.scrap, s.run.event, s.telemetry.jumps, s.rng.loot.s, s.rng.director.s]);
    const before = snap(); jumpShip(s, ahead(s, 0)); expect(snap()).toBe(before);
  });
});

describe('scrap by column (spec Demo-ix section 2, amendment B8)', () => {
  it('each helper at columns 0, 3 and 7', () => {
    const at = (f: (c: number) => number) => [0, 3, 7].map(f);
    expect(at(scrapPerJump)).toEqual([10, 22, 38]);
    expect(at(scrapEnemy)).toEqual([20, 38, 62]);
    expect(at(scrapSurrender)).toEqual([15, 27, 43]);
    expect(at(scrapBoarder)).toEqual([8, 14, 22]);
    expect(at(scrapField)).toEqual([15, 30, 50]);
  });
  it('arrival pays the column the jump advanced to: 0 -> 1 pays 14, 3 -> 4 pays 26', () => {
    const s = calm(); jumpShip(s, ahead(s, 0)); expect(s.run.scrap).toBe(14);
    const t = calm(); at(t, 3, 0); const reach = reachable(t); expect(reach.length).toBeGreaterThan(0);
    jumpShip(t, reach[0]!); expect([t.run.column, t.run.scrap]).toEqual([4, scrapPerJump(4)]); expect(t.run.scrap).toBe(26);
  });
  it('at column 3: a kill pays 38, a surrender 27, a melee boarder kill 14, a hazard boarder kill 14', () => {
    const k = calm(); at(k, 3, 0); placeEnemy(k); leave(k, true); expect(k.run.scrap).toBe(38);
    const f = calm(); at(f, 3, 0); placeEnemy(f); f.enemy.fleeing = 1; f.enemy.surrenderIntact = 1; leave(f, false); expect([f.run.scrap, f.telemetry.surrenders]).toEqual([27, 1]);
    const b = calm(); at(b, 3, 0); const k1 = placeBoarder(b, room(b, 'G'), 5); damageBoarder(b, k1, 5, 0); expect(b.run.scrap).toBe(14);
    const v = calm(); at(v, 3, 0); const k2 = placeBoarder(v, room(v, 'G')); killBoarderByHazard(v, k2); expect([v.run.scrap, v.telemetry.boardersVented]).toEqual([14, 1]);
  });
});

describe('crew votes (spec Coop-ii section 3, amendments D6-D8)', () => {
  const T = TICK_HZ, SETTLE = VOTE_SETTLE * TICK_HZ;
  /** A quiet state at node 2c with event `id` open and the crew standing in the corridor (no door or console in reach). */
  const open = (id = 4, players = 2) => { const s = makeState(players, 1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); at(s, 1, 2); setEvent(s, id); return s; };
  const press = (...pids: number[]) => (tick: number) => intents(...[0, 1, 2, 3].map((p) => ({ confirmPressed: pids.includes(p) && tick >= 0 })));
  it('a standing Confirm votes option 1, then toggles; it never seals a door or sits while an event is open', () => {
    const s = open(); const d = s.derived, e = d.doorEdges[0]!, t = d.edgeTile[e]!; teleport(s, 0, t % d.width + 0.5, Math.floor(t / d.width) + 0.5);
    run(s, 1, press(0)); expect([s.run.vote[0], s.doors.sealRequested[e], s.scratch.doorToggles.size, s.scratch.doorCycles.size]).toEqual([0, 0, 0, 0]); expect(s.doors.state[e]).not.toBe(DoorState.Sealed);
    run(s, 1, press(0)); expect(s.run.vote[0]).toBe(1);
    run(s, 1, press(0)); expect(s.run.vote[0]).toBe(0);
    const n = s.derived.stationOfKind[StationKind.Navigation]!, nt = d.stationTile[n]!; teleport(s, 1, nt % d.width + 0.5, Math.floor(nt / d.width) + 0.5);
    run(s, 1, press(1)); expect([s.run.vote[1], s.stations.occupant[n]]).toEqual([0, -1]);
  });
  it('the seated Navigation officer votes with the rows', () => {
    const s = open(); const n = seatNavigator(s, 0); run(s, 1); s.stations.cursor[n] = 3;
    run(s, 1, press(0)); expect(s.run.vote[0]).toBe(1); expect(s.run.eventChoice).toBe(-1);
  });
  it('resolves once every conscious player has an enabled vote (settled for VOTE_SETTLE), the majority wins', () => {
    const s = open(4, 3); run(s, 1, press(0, 1, 2)); run(s, 1, press(2));   // votes 0, 0, 1
    expect(s.run.eventChoice).toBe(-1);
    run(s, SETTLE); expect(s.run.eventChoice).toBe(0); expect(s.telemetry.eventsResolved).toBe(1);
    expect([s.telemetry.votesUnanimous, s.telemetry.votesSplit]).toEqual([0, 1]);
    expect(Array.from(s.run.vote).slice(0, 3)).toEqual([-1, -1, -1]);
  });
  it('a change of vote restarts the settle; the last voter can still switch to option 2', () => {
    const s = open(4, 2); run(s, 1, press(0, 1));                // both 0
    run(s, SETTLE - 5); run(s, 1, press(1));                       // 1 switches to 1 before the settle ends
    expect(s.run.eventChoice).toBe(-1);
    run(s, SETTLE - 2); expect(s.run.eventChoice).toBe(-1); run(s, 3); expect(s.run.eventChoice).toBeGreaterThanOrEqual(0);
  });
  it('a tie goes to the seated Navigation officer, else to the lowest option', () => {
    const s = open(4, 2); const n = seatNavigator(s, 0); run(s, 1); s.stations.cursor[n] = 3;
    run(s, 1, press(0, 1)); run(s, SETTLE + 1); expect(s.run.eventChoice).toBe(1);   // officer 1, the other 0
    const t = open(4, 2); run(t, 1, press(0, 1)); run(t, 1, press(1)); run(t, SETTLE + 1); expect(t.run.eventChoice).toBe(0);
  });
  it('at VOTE_SECONDS missing votes are ignored; with no valid votes the safe choice applies', () => {
    const s = open(0, 2); run(s, 1, press(0)); run(s, 1, press(0));   // P1 votes Leave it; P2 never votes
    run(s, VOTE_SECONDS * T - 4); expect(s.run.eventChoice).toBe(-1);
    run(s, 4); expect(s.run.eventChoice).toBe(1);
    const t = open(4, 2); run(t, VOTE_SECONDS * T + 2); expect(t.run.eventChoice).toBe(EVENTS[4]!.safeChoice);
    expect([t.telemetry.votesUnanimous, t.telemetry.votesSplit]).toEqual([0, 0]);
  });
  it('a downed player leaves the electorate and their vote is discarded; a vote for a disabled option is discarded', () => {
    const s = open(4, 2); run(s, 1, press(0)); run(s, 1, press(1)); run(s, 1, press(1)); downCrew(s, 1);   // P2's vote 1 is discarded
    run(s, SETTLE + 2); expect(s.run.eventChoice).toBe(0);
    const d = open(1, 2); run(d, 1, press(0, 1)); d.hull = 10;   // both vote Help them, which becomes disabled (hull 10)
    run(d, SETTLE + 2); expect(d.run.eventChoice).toBe(-1);
    run(d, VOTE_SECONDS * TICK_HZ); expect(d.run.eventChoice).toBe(EVENTS[1]!.safeChoice);
  });
  it('one player decides alone; two who agree are unanimous', () => {
    const s = open(4, 1); run(s, 1, press(0)); run(s, SETTLE + 1); expect(s.run.eventChoice).toBe(0);
    expect([s.telemetry.votesUnanimous, s.telemetry.votesSplit]).toEqual([0, 0]);
    const u = open(4, 2); run(u, 1, press(0, 1)); run(u, SETTLE + 1); expect([u.run.eventChoice, u.telemetry.votesUnanimous]).toEqual([0, 1]);
  });
});

describe('the fuel row (spec Loop-i section 2)', () => {
  it('Fuel +2 for 12 scrap: adds two fuel, spends the scrap, counts a purchase; disabled below 12 scrap', () => {
    expect([FUEL_COST, SHOP_FUEL, SHOP_ITEM_COUNT]).toEqual([12, 2, 3]);
    const s = makeState(2); quiet(s); grantScrap(s, 30); const i = SHOP_ITEM_COUNT - 1;
    expect([itemLabel(s, i), itemEnabled(s, i)]).toEqual(['Fuel +2 (12 scrap)', true]);
    buy(s, i); expect([s.run.fuel, s.run.scrap, s.telemetry.scrapSpent, s.telemetry.purchases]).toEqual([10, 18, 12, 1]);
    buy(s, i); expect([s.run.fuel, s.run.scrap]).toEqual([12, 6]); expect(itemEnabled(s, i)).toBe(false); buy(s, i); expect(s.run.fuel).toBe(12);
  });
});

// ---- Loop-iii: a weapon for sale at every shop (spec Loop-iii section 3) ----
import { WEAPON_ITEM } from '../src/renderer/src/sim/shop';
import { WEAPON_DEFS, LootWeapon, LOOT_WEAPON_TYPES } from '../src/renderer/src/sim/weaponDefs';

describe('shops: the offered weapon', () => {
  it('arrival at a shop draws the offer with exactly one loot draw; the type follows the seed; other arrivals offer nothing', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = calm(seed); setNodeTypes(s, { '1:0': NodeType.Shop }); const ref = { s: s.rng.loot.s }, want = 1 + nextInt(ref, LOOT_WEAPON_TYPES);
      jumpShip(s, ahead(s, 0)); expect(s.run.shopWeapon).toBe(want); expect(s.rng.loot.s).toBe(ref.s); seen.add(want);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
    const h = calm(); h.run.shopWeapon = 2; jumpShip(h, ahead(h, 0)); expect(h.run.shopWeapon).toBe(0);   // a Hazard beacon: the old offer is gone
  });
  it('the offer is a buy row after the fuel, at its price; buying fills a slot, spends the scrap and sells out the offer', () => {
    const s = calm(); at(s, 1, 0); setNodeTypes(s, { '1:0': NodeType.Shop }); s.run.shopWeapon = LootWeapon.Heavy; grantScrap(s, 100);
    expect([WEAPON_ITEM, WEAPON_DEFS.slice(1).map((d) => d.price)]).toEqual([3, [60, 70, 55, 65]]);
    const rows = navRows(s); expect(rows.slice(1, 5).map((r) => [r.text, r.select, r.index])).toEqual([['Hull +25 (30 scrap)', 'buy', 0], ['Torpedoes +2 (20 scrap)', 'buy', 1], ['Fuel +2 (12 scrap)', 'buy', 2], ['Heavy Laser (70 scrap)', 'buy', WEAPON_ITEM]]);
    expect(rows[4]!.enabled).toBe(true); expect(rows.every((r) => r.text.length <= NAV_TEXT_MAX)).toBe(true);
    buy(s, WEAPON_ITEM);
    expect([s.run.scrap, s.telemetry.scrapSpent, s.telemetry.purchases, s.weapons.slot[0], s.run.shopWeapon, s.weapons.lootBought]).toEqual([30, 70, 1, LootWeapon.Heavy, 0, 1]);
    expect(navRows(s).some((r) => r.index === WEAPON_ITEM && r.select === 'buy')).toBe(false);
    const poor = calm(); at(poor, 1, 0); setNodeTypes(poor, { '1:0': NodeType.Shop }); poor.run.shopWeapon = LootWeapon.Ion; grantScrap(poor, 54);
    expect(itemEnabled(poor, WEAPON_ITEM)).toBe(false); buy(poor, WEAPON_ITEM); expect([poor.run.scrap, poor.weapons.slot[0]]).toEqual([54, 0]);
    const full = calm(); full.run.shopWeapon = LootWeapon.Ion; grantScrap(full, 100); full.weapons.slot[0] = 1; full.weapons.slot[1] = 2; full.weapons.cargo = 4;
    expect(itemEnabled(full, WEAPON_ITEM)).toBe(false);   // nowhere to put it: buying would only sell it back
    const none = calm(); grantScrap(none, 100); expect(itemEnabled(none, WEAPON_ITEM)).toBe(false);
  });
});
