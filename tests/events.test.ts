import { describe, it, expect } from 'vitest';
import { NodeType, NAV_TEXT_MAX, reachable, navRows, clampNavCursor, jumpShip } from '../src/renderer/src/sim/run';
import { addScrap, spendScrap } from '../src/renderer/src/sim/scrap';
import { EVENTS, choiceEnabled, resolveEvent } from '../src/renderer/src/sim/events';
import { UPGRADE_KINDS, itemLabel, itemEnabled, buy } from '../src/renderer/src/sim/shop';
import { baseMax, maxLevel, shiftBar, failStation } from '../src/renderer/src/sim/power';
import { isOverdriven, heatStep } from '../src/renderer/src/sim/heat';
import { leave } from '../src/renderer/src/sim/enemy';
import { damageBoarder } from '../src/renderer/src/sim/boarders';
import { downCrew } from '../src/renderer/src/sim/crew';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { StationKind, STATION_NAMES } from '../src/renderer/src/sim/stationKinds';
import { freeSites } from '../src/renderer/src/sim/hazards/breach';
import { nextInt } from '../src/shared/rng';
import { HULL_MAX, HEALTH_MAX, TORP_CAP, TORP_START, STATION_MAX, STATION_OVERDRIVE, SCRAP_PER_JUMP, SCRAP_ENEMY, SCRAP_BOARDER, EVENT_COUNT } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, intents, placeEnemy, placeBoarder, chargeJump, seatNavigator, mapM, setNodeTypes, grantScrap, setEvent, room } from './helpers/sim';

const calm = (seed = 1) => { const s = makeState(2, seed); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); return s; };
const at = (s: ReturnType<typeof makeState>, column: number, node: number) => { s.run.column = column; s.run.node = node; s.run.nodesReached = column; s.telemetry.jumps = column; };

describe('arrival', () => {
  it('a Hazard arrival awards SCRAP_PER_JUMP and never touches the loot stream; an Event arrival draws the id with exactly one loot draw', () => {
    const s = calm(); const before = { s: s.rng.loot.s };
    jumpShip(s, 0);
    expect([s.run.scrap, s.telemetry.scrapEarned, s.run.event, s.run.eventChoice]).toEqual([SCRAP_PER_JUMP, SCRAP_PER_JUMP, -1, -1]);
    expect(s.rng.loot.s).toBe(before.s); expect(nextInt(s.rng.loot, 1000)).toBe(nextInt(before, 1000));
    const e = calm(); setNodeTypes(e, { '1:2': NodeType.Event }); const ref = { s: e.rng.loot.s }; const id = nextInt(ref, EVENT_COUNT);
    jumpShip(e, 2);
    expect(e.run.event).toBe(id); expect(e.rng.loot.s).toBe(ref.s); expect(e.run.scrap).toBe(SCRAP_PER_JUMP);
    const v = calm(); at(v, 6, 0); jumpShip(v, 0); expect(v.ended).toBe(1); expect(v.run.event).toBe(-1);   // the last column is Hazard
    const bad = calm(); const h = JSON.stringify([bad.run.column, bad.run.scrap, bad.rng.loot.s, bad.rng.director.s]); jumpShip(bad, 1); expect(JSON.stringify([bad.run.column, bad.run.scrap, bad.rng.loot.s, bad.rng.director.s])).toBe(h);   // node 1 is not reachable from the start: no-op
  });
  it('a pending event lists four rows, blocks the jump, resolves on Confirm, and the next Confirm jumps from the re-clamped cursor', () => {
    const s = calm(); at(s, 1, 2); setEvent(s, 4); chargeJump(s); const n = seatNavigator(s, 0); run(s, 1);
    const rows = navRows(s);
    expect(rows.map((r) => [r.text, r.select, r.index, r.enabled])).toEqual([[EVENTS[4]!.title, 'none', 0, false], [EVENTS[4]!.text, 'none', 0, false], [EVENTS[4]!.choices[0], 'choice', 0, true], [EVENTS[4]!.choices[1], 'choice', 1, true]]);
    expect(s.stations.cursor[n]).toBe(2); clampNavCursor(s); expect(s.stations.cursor[n]).toBe(2);   // the console's own clamp already ran in the seated tick (spec section 6)
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect([s.run.column, s.telemetry.jumps, s.run.jumpCharge, s.run.eventChoice, s.run.scrap, s.telemetry.eventsResolved]).toEqual([1, 1, 1, 0, 40, 1]);
    expect(navRows(s).map((r) => r.select)).toEqual(['jump']); expect(s.stations.cursor[n]).toBe(0);   // cursor 2 does not exist in the new list: first selectable
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ confirmPressed: true }, {}));
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
  it('lists the header, eight items in order and the destinations; enabled per item', () => {
    const s = shop(); const rows = navRows(s);
    expect(rows).toHaveLength(10); expect(rows[0]).toEqual({ text: 'Shop   scrap 100', select: 'none', index: 0, enabled: false });   // mask 1:0 = 1: one destination (Node 3a)
    expect(rows.slice(1, 9).map((r) => r.text)).toEqual(['Hull +25 (30 scrap)', 'Torpedoes +2 (20 scrap)', ...UPGRADE_KINDS.map((k) => `${STATION_NAMES[k]} +1 bar (50 scrap)`)]);
    expect(UPGRADE_KINDS).toEqual([StationKind.Navigation, StationKind.Weapons, StationKind.Science, StationKind.LifeSupport, StationKind.Medbay, StationKind.Doors]);
    expect(rows.slice(9).map((r) => [r.text, r.select, r.index])).toEqual([['Node 3a', 'jump', 0]]);
    expect(rows[1]!.enabled).toBe(false); s.hull = 90; expect(navRows(s)[1]!.enabled).toBe(true);
    expect(rows[2]!.enabled).toBe(true); s.weapons.torpedoStock = TORP_CAP; expect(navRows(s)[2]!.enabled).toBe(false);
    expect(rows.slice(3, 9).every((r) => r.enabled)).toBe(true);
    const poor = shop(29); expect(navRows(poor).slice(1, 9).map((r) => r.enabled)).toEqual([false, true, false, false, false, false, false, false]);
    const h = calm(); at(h, 1, 0); expect(navRows(h).map((r) => r.select)).toEqual(['jump']);
  });
  it('listing and buying never touch the loot stream', () => {
    const s = shop(); s.hull = 90; const l = s.rng.loot.s; navRows(s); buy(s, 0); buy(s, 1); buy(s, 2 + UPGRADE_KINDS.indexOf(StationKind.Weapons)); expect(s.telemetry.purchases).toBe(3); expect(s.rng.loot.s).toBe(l);
  });
  it('buys: hull capped, torpedoes capped, the upgrade raises baseMax and maxLevel for its kind only and shows (owned)', () => {
    const s = shop(); s.hull = 90; buy(s, 0); expect([s.hull, s.run.scrap, s.telemetry.scrapSpent, s.telemetry.purchases]).toEqual([HULL_MAX, 70, 30, 1]);
    s.weapons.torpedoStock = TORP_CAP - 1; buy(s, 1); expect([s.weapons.torpedoStock, s.run.scrap]).toEqual([TORP_CAP, 50]);
    const w = 2 + UPGRADE_KINDS.indexOf(StationKind.Weapons);   // item index 3 (navRows row 4)
    buy(s, w); expect(s.run.upgrades[StationKind.Weapons]).toBe(1); expect(s.run.scrap).toBe(0); expect(s.telemetry.purchases).toBe(3);
    expect(baseMax(s, StationKind.Weapons)).toBe(STATION_MAX[StationKind.Weapons]! + 1); expect(maxLevel(s, StationKind.Weapons)).toBe(STATION_MAX[StationKind.Weapons]! + 1 + STATION_OVERDRIVE);
    for (const k of [StationKind.Navigation, StationKind.Science, StationKind.Engineering, StationKind.LifeSupport, StationKind.Medbay, StationKind.Doors]) expect(maxLevel(s, k)).toBe(STATION_MAX[k]! + (k === StationKind.Engineering ? 0 : STATION_OVERDRIVE));
    expect(itemLabel(s, w)).toBe('Weapons +1 bar (owned)'); expect(itemEnabled(s, w)).toBe(false); grantScrap(s, 100); expect(itemEnabled(s, w)).toBe(false);
    const before = [s.run.scrap, s.telemetry.purchases]; buy(s, w); expect([s.run.scrap, s.telemetry.purchases]).toEqual(before);
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!; s.stations.level.fill(0); s.stations.level[s.derived.stationOfKind[StationKind.Engineering]!] = 1;
    while (shiftBar(s, wpn, 1)) { /* fill */ } expect(s.stations.level[wpn]).toBe(STATION_MAX[StationKind.Weapons]! + 1 + STATION_OVERDRIVE);
    s.stations.level[wpn] = STATION_MAX[StationKind.Weapons]! + 1; expect(isOverdriven(s, wpn)).toBe(false); for (let k = 0; k < 5; k++) heatStep(s); expect(s.stations.heat[wpn]).toBe(0);
    s.stations.level[wpn] = STATION_MAX[StationKind.Weapons]! + 2; expect(isOverdriven(s, wpn)).toBe(true);
  });
  it('cursor rules: a buy keeps the cursor on its (now disabled) row, the header is skipped, wrap crosses the ends, a shrink moves to the first selectable row', () => {
    const s = shop(); s.hull = 90; const n = seatNavigator(s, 0); run(s, 1);
    run(s, 1, () => intents({}, {})); expect(s.stations.cursor[n]).toBe(1);                                   // header skipped
    run(s, 1, () => intents({ moveY: -1 }, {})); expect(s.stations.cursor[n]).toBe(9);                       // Up from row 1 wraps to the last row (the single destination)
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(1);   // Down from the last wraps to row 1
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.hull).toBe(HULL_MAX); expect(s.stations.cursor[n]).toBe(1); expect(navRows(s)[1]!.enabled).toBe(false);
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.scrap).toBe(70);   // disabled: nothing
    const e = shop(); setEvent(e, 4); const m = seatNavigator(e, 0); run(e, 1); e.stations.cursor[m] = 3; run(e, 1, () => intents({ confirmPressed: true }, {}));
    expect(e.run.eventChoice).toBe(1); expect(e.stations.cursor[m]).toBe(3);                                  // row 3 exists in the shop list (an item): kept
    expect(navRows(e)).toHaveLength(10);
  });
});

describe('scrap sources', () => {
  it('a destroyed enemy pays SCRAP_ENEMY, a withdrawal pays nothing, a boarder kill pays SCRAP_BOARDER, and the counters reconcile', () => {
    const s = calm(); placeEnemy(s); leave(s, true); expect([s.run.scrap, s.telemetry.scrapEarned]).toEqual([SCRAP_ENEMY, SCRAP_ENEMY]);
    placeEnemy(s); leave(s, false); expect(s.run.scrap).toBe(SCRAP_ENEMY);
    const b = placeBoarder(s, room(s, 'G'), 5); damageBoarder(s, b, 5, 0); expect(s.run.scrap).toBe(SCRAP_ENEMY + SCRAP_BOARDER);
    spendScrap(s, 10); addScrap(s, 3); expect(s.run.scrap).toBe(s.telemetry.scrapEarned - s.telemetry.scrapSpent);
  });
});

describe('Navigation text budget', () => {
  it('every event title, text, choice, shop item label (priced and owned) and the shop header fit NAV_TEXT_MAX', () => {
    const texts: string[] = [];
    for (const e of EVENTS) texts.push(e.title, e.text, e.choices[0], e.choices[1]);
    const s = calm(); for (let i = 0; i < 8; i++) texts.push(itemLabel(s, i));
    for (const k of UPGRADE_KINDS) s.run.upgrades[k] = 1;
    for (let i = 0; i < 8; i++) texts.push(itemLabel(s, i));
    texts.push('Shop   scrap 100');
    for (const t of texts) expect(t.length, t).toBeLessThanOrEqual(NAV_TEXT_MAX);
  });
  it('jumpShip at the last column is a no-op', () => {
    const s = calm(); at(s, 7, 0); expect(reachable(s)).toEqual([]);
    const snap = () => JSON.stringify([s.run.column, s.run.node, s.run.nodesReached, s.run.jumpCharge, s.run.scrap, s.run.event, s.telemetry.jumps, s.rng.loot.s, s.rng.director.s]);
    const before = snap(); jumpShip(s, 0); expect(snap()).toBe(before);
  });
});
