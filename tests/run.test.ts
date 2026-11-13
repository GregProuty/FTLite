import { describe, it, expect } from 'vitest';
import { DoorState } from '../src/renderer/src/sim/grid';
import { CONFIRM_SECONDS } from '../src/renderer/src/sim/tuning';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { generateMap, reachable, jumpShip, nodeLabel, assignNodeTypes, NodeType, navRows, NAV_TEXT_MAX, beaconIndex, sectorJump, startWait, EXIT_JUMP, overrun } from '../src/renderer/src/sim/run';
import { Encounter, enemyMaxHull, enemyShieldMax, leave, fireInterval, EnemyRoom } from '../src/renderer/src/sim/enemy';
import { depthOf } from '../src/renderer/src/sim/depth';
import { FUEL_START, PURSUIT_START, PURSUIT_STEP, WAIT_SECONDS, WAIT_FUEL_CHANCE, WAIT_FUEL, FIELD_FUEL, PURSUIT_HULL_MULT, PURSUIT_FIRE_MULT } from '../src/renderer/src/sim/tuning';
import { deriveStreams } from '../src/renderer/src/sim/state';
import { Phase, enterPhase, minutesOf } from '../src/renderer/src/sim/director';
import { step } from '../src/renderer/src/sim/step';
import { EndReason, downCrew } from '../src/renderer/src/sim/crew';
import { Health, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { failStation } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, DT, SECTORS, SECTOR_COLUMNS, NODE_STRIDE, EDGE_CHANCE, SHOP_CHANCE, EVENT_CHANCE, ASTEROID_CHANCE, EMPTY_CHANCE, JUMP_CHARGE_TIME, BOARDING_AFTER_JUMP, DEBRIS_SLOTS, HULL_MAX, ENCOUNTER_START, ENCOUNTER_BOOST, NEVER } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, intents, teleport, placeDebris, placeShot, placeEnemy, placeBoarder, chargeJump, seatNavigator, setMap, room, setSkill, allHazard, mapM, setNodeTypes, at, MAP_M_NODES, MAP_M_MASKS, grantScrap } from './helpers/sim';
import { Skill } from '../src/renderer/src/sim/skills';
import { fieldSystem, endField } from '../src/renderer/src/sim/run';
import { spawnFieldRock, ObjectKind, activeDebrisCount } from '../src/renderer/src/sim/debris';
import { FIELD_INTERVAL, FIELD_FLIGHT, FIELD_SECONDS, scrapField, scrapPerJump, FREQ_COUNT } from '../src/renderer/src/sim/tuning';
import { EVADE_WINDOW, EVADE_COOLDOWN } from '../src/renderer/src/sim/tuning';
import { botIntent } from '../src/renderer/src/sim/bot';

const T = TICK_HZ;
const calm = (players = 2, seed = 1) => { const s = makeState(players, seed); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; return s; };

/** The spec Loop-i section 1 procedure for one sector, replayed on a reference stream: column counts, forward edges, then node types (Empty included) and the shop fallback. */
function replayMap(rng: { s: number }) {
  const columns = SECTOR_COLUMNS, S = NODE_STRIDE, colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * S);
  colNodes[0] = 1; colNodes[columns - 1] = 1;
  for (let c = 1; c < columns - 1; c++) colNodes[c] = 2 + nextInt(rng, 3);
  for (let c = 0; c < columns - 1; c++) {
    const next = colNodes[c + 1]!;
    for (let n = 0; n < colNodes[c]!; n++) { let mask = 0; for (let d = 0; d < next; d++) if (nextFloat(rng) < EDGE_CHANCE) mask |= 1 << d; if (mask === 0) mask = 1 << nextInt(rng, next); edgeMask[c * S + n] = mask; }
    for (let d = 0; d < next; d++) { let incoming = false; for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * S + n]! & (1 << d)) incoming = true; if (!incoming) { const n = nextInt(rng, colNodes[c]!); edgeMask[c * S + n] = edgeMask[c * S + n]! | (1 << d); } }
  }
  const nodeType = new Uint8Array(columns * S);
  for (let c = 2; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) { const u = nextFloat(rng); nodeType[c * S + n] = u < 0.15 ? 2 : u < 0.40 ? 1 : u < 0.55 ? 3 : u < 0.60 && c > 2 ? 4 : 0; }   // column 1 all Hazard without a draw, no Empty in column 2 (spec Demo-x-b section 2)
  let shop = false; for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) if (nodeType[c * S + n] === 2) shop = true;
  if (!shop) nodeType[Math.floor(columns / 2) * S] = 2;
  const ambush = new Uint8Array(columns * S), cache = new Uint8Array(columns * S);   // the hidden ambushers, then the caches (spec Demo-x-b section 3)
  for (let k = 0; k < columns * S; k++) if (nodeType[k] === 4 || nodeType[k] === 1) ambush[k] = nextFloat(rng) < (nodeType[k] === 4 ? 0.5 : 0.2) ? 1 : 0;
  for (let k = 0; k < columns * S; k++) if (nodeType[k] === 4) cache[k] = nextFloat(rng) < 0.4 ? 1 : 0;
  return { colNodes, edgeMask, nodeType, ambush, cache };
}

describe('run: the sector map (spec Loop-i sections 1 and 4)', () => {
  it('is well-formed for seeds 1..50: six columns, one beacon at each end, 2 to 4 in the middle, stride 4, every beacon has a way forward and a way in, no bit past the next column, the exit has no forward edges', () => {
    expect([SECTORS, SECTOR_COLUMNS, NODE_STRIDE]).toEqual([3, 6, 4]);
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const { colNodes, edgeMask, nodeType } = generateMap(createRng(seed));
      expect([colNodes.length, edgeMask.length, nodeType.length]).toEqual([SECTOR_COLUMNS, SECTOR_COLUMNS * NODE_STRIDE, SECTOR_COLUMNS * NODE_STRIDE]);
      expect(colNodes[0]).toBe(1); expect(colNodes[SECTOR_COLUMNS - 1]).toBe(1);
      for (let c = 1; c < SECTOR_COLUMNS - 1; c++) { expect([2, 3, 4]).toContain(colNodes[c]); sizes.add(colNodes[c]!); }
      for (let c = 0; c < SECTOR_COLUMNS - 1; c++) {
        const next = colNodes[c + 1]!;
        for (let n = 0; n < colNodes[c]!; n++) { const m = edgeMask[c * NODE_STRIDE + n]!; expect(m).toBeGreaterThan(0); expect(m >> next).toBe(0); }
        for (let n = colNodes[c]!; n < NODE_STRIDE; n++) expect(edgeMask[c * NODE_STRIDE + n]).toBe(0);
        for (let d = 0; d < next; d++) { let incoming = 0; for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * NODE_STRIDE + n]! & (1 << d)) incoming++; expect(incoming).toBeGreaterThan(0); }
      }
      for (let n = 0; n < NODE_STRIDE; n++) expect(edgeMask[(SECTOR_COLUMNS - 1) * NODE_STRIDE + n]).toBe(0);
    }
    expect([...sizes].sort()).toEqual([2, 3, 4]);   // four beacons in a column does happen
  });
  it('node types: equal to the replay for seeds 7, 1 and 23; for seeds 1-50 the ends and unused slots are Hazard, the middle any of the five types, at least one shop; the shop fallback lands on column 3 node 0', () => {
    for (const seed of [7, 1, 23]) { const s = makeState(2, seed), e = replayMap(deriveStreams(seed).map); expect(Array.from(s.run.nodeType)).toEqual(Array.from(e.nodeType)); expect(Array.from(s.run.ambush)).toEqual(Array.from(e.ambush)); expect(Array.from(s.run.cache)).toEqual(Array.from(e.cache)); }
    for (let seed = 1; seed <= 50; seed++) {
      const g = generateMap(createRng(seed)), t = g.nodeType; let shops = 0;
      for (let c = 0; c < SECTOR_COLUMNS; c++) for (let n = 0; n < NODE_STRIDE; n++) {
        const v = t[c * NODE_STRIDE + n]!;
        if (n >= g.colNodes[c]! || c === 0 || c === SECTOR_COLUMNS - 1) expect(v).toBe(NodeType.Hazard); else { expect([0, 1, 2, 3, 4]).toContain(v); if (v === NodeType.Shop) shops++; }
      }
      expect(shops).toBeGreaterThanOrEqual(1);
    }
    const t = new Uint8Array(SECTOR_COLUMNS * NODE_STRIDE); assignNodeTypes(createRng(1), makeState(2, 1).run.colNodes, t, () => 0.99);
    for (let k = 0; k < t.length; k++) expect(t[k]).toBe(k === 3 * NODE_STRIDE ? NodeType.Shop : NodeType.Hazard);
    const all = makeState(2, 1); assignNodeTypes(createRng(1), all.run.colNodes, t, () => 0.1);
    for (let c = 1; c < SECTOR_COLUMNS - 1; c++) for (let n = 0; n < all.run.colNodes[c]!; n++) expect(t[c * NODE_STRIDE + n]).toBe(c === 1 ? NodeType.Hazard : NodeType.Shop);   // column 1 is all Hazard (spec Demo-x-b section 2)
  });
  // the node type thresholds: tests/pacing.test.ts (spec Demo-x-b section 2)
  it('the map stream ends where the replay ends for seeds 1-3 (draws only from the given stream, in the fixed order)', () => {
    for (const seed of [1, 2, 3]) { const r = deriveStreams(seed).map, g = generateMap(r), ref = deriveStreams(seed).map, e = replayMap(ref); expect(Array.from(g.colNodes)).toEqual(Array.from(e.colNodes)); expect(Array.from(g.edgeMask)).toEqual(Array.from(e.edgeMask)); expect(r.s).toBe(ref.s); }
  });
  it('reachable: the forward destinations ascending, then the sideways neighbours above and below in a middle column; none from the exit', () => {
    const s = calm(2); mapM(s);
    expect(reachable(s)).toEqual([at(1, 0), at(1, 2)]);
    s.run.column = 1; s.run.node = 1; expect(reachable(s)).toEqual([at(2, 0), at(1, 0), at(1, 2)]);
    s.run.node = 0; expect(reachable(s)).toEqual([at(2, 0), at(1, 1)]);
    s.run.node = 2; expect(reachable(s)).toEqual([at(2, 0), at(1, 1)]);
    s.run.column = 4; s.run.node = 1; expect(reachable(s)).toEqual([at(5, 0), at(4, 0)]);
    s.run.column = 5; s.run.node = 0; expect(reachable(s)).toEqual([]);
    for (let seed = 1; seed <= 20; seed++) {   // every middle beacon of a generated map is joined to its vertical neighbours
      const g = makeState(2, seed);
      for (let c = 1; c < SECTOR_COLUMNS - 1; c++) for (let n = 0; n < g.run.colNodes[c]!; n++) {
        g.run.column = c; g.run.node = n; const side = reachable(g).filter((b) => b.column === c).map((b) => b.node);
        expect(side).toEqual([n - 1, n + 1].filter((k) => k >= 0 && k < g.run.colNodes[c]!));
      }
    }
  });
  it('the Navigation rows list every reachable destination, sideways ones included, each within NAV_TEXT_MAX', () => {
    const s = calm(2); mapM(s); s.run.column = 1; s.run.node = 1;
    const rows = navRows(s).filter((r) => r.select === 'jump');
    expect(rows.map((r) => r.index)).toEqual([2 * NODE_STRIDE + 0, 1 * NODE_STRIDE + 0, 1 * NODE_STRIDE + 2]);
    expect(rows.map((r) => r.text.slice(0, 7))).toEqual(['Node 3a', 'Node 2a', 'Node 2c']);
    for (const r of rows) expect(r.text.length).toBeLessThanOrEqual(NAV_TEXT_MAX);
  });
  it('createSimState draws the first sector map from the map stream exactly as the replay does, leaves the other streams as before, and is seed-deterministic', () => {
    for (const seed of [1, 23]) { const r = deriveStreams(seed).map; replayMap(r); expect(makeState(2, seed).rng.map.s).toBe(r.s); }
    const ref = deriveStreams(7).map; const expected = replayMap(ref);
    const s = makeState(2, 7);
    expect(Array.from(s.run.colNodes)).toEqual(Array.from(expected.colNodes)); expect(Array.from(s.run.edgeMask)).toEqual(Array.from(expected.edgeMask)); expect(s.rng.map.s).toBe(ref.s);
    expect([s.run.column, s.run.node, s.run.nodesReached, s.run.jumpCharge]).toEqual([0, 0, 0, 0]);
    const one = deriveStreams(1);
    expect([one.hazards.s, one.director.s, one.combat.s]).toEqual([2693262067, 11749833, 2265367787]);   // the pre-feature values (Step 0): the five old streams keep their seeds
    expect(Array.from(makeState(2, 1).run.edgeMask)).toEqual(Array.from(makeState(3, 1).run.edgeMask));
    expect(Array.from(makeState(2, 1).run.edgeMask)).not.toEqual(Array.from(makeState(2, 2).run.edgeMask));
    expect(nodeLabel(0, 0)).toBe('Node 1a'); expect(nodeLabel(3, 3)).toBe('Node 4d');
  });
});

describe('run: charge and Navigation input', () => {
  it('the charge grows DT/60 per tick to 1 and stays, seated or not; a Confirm edge on the ready tick jumps; after a jump the end-of-tick charge is 0', () => {
    const s = calm(); run(s, 1); expect(s.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
    run(s, JUMP_CHARGE_TIME * T - 2); expect(s.run.jumpCharge).toBeLessThan(1);
    seatNavigator(s, 0); run(s, 1);                                                      // the seating tick (sat this tick: no action)
    expect(s.run.jumpCharge).toBeCloseTo(1, 12); run(s, 5); expect(s.run.jumpCharge).toBe(1);
    const r = calm(1); seatNavigator(r, 0); run(r, 1); run(r, JUMP_CHARGE_TIME * T - 2, () => intents({}, {}));   // a lone pilot jumps on the Confirm itself (spec Coop-ii section 3)   // 1 + 3598 = 3599 ticks so far: charge just under 1
    expect(r.run.jumpCharge).toBeLessThan(1);
    run(r, 1, () => intents({ confirmPressed: true }, {}));                              // tick 3600 reaches 1 (jumpStep runs first) and the edge jumps
    expect(r.run.nodesReached).toBe(1); expect(r.run.jumpCharge).toBe(0);
    run(r, 1); expect(r.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
  });
  it('reachable, cycling with wrap, Left/Right ignored, Confirm before ready does nothing, a held Confirm does not jump at readiness, stick edge before Confirm, the seating Confirm never jumps', () => {
    const MAP = MAP_M_MASKS;
    const s = calm(1); setMap(s, MAP_M_NODES, MAP);   // one player: the pilot's Confirm jumps (spec Coop-ii section 3)
    expect(reachable(s)).toEqual([at(1, 0), at(1, 2)]);
    const reachableBefore = reachable(s);
    const n = seatNavigator(s, 0); run(s, 1);
    const d0 = s.rng.director.s;
    run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(1);
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(2);           // the evade row, always last (spec Coop-ii section 1)
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(0);           // wraps
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: -1 }, {})); expect(s.stations.cursor[n]).toBe(2);          // Up wraps the other way
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: -1 }, {})); expect(s.stations.cursor[n]).toBe(1);
    run(s, 1, () => intents({ moveX: 1 }, {})); run(s, 1, () => intents({ moveX: -1 }, {})); expect(s.stations.cursor[n]).toBe(1);
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.nodesReached).toBe(0); expect(s.rng.director.s).toBe(d0);   // not ready
    chargeJump(s); run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.run.nodesReached).toBe(1); expect(s.run.column).toBe(1); expect(s.run.node).toBe(reachableBefore[1]!.node); expect(s.run.node).toBe(2); expect(s.stations.cursor[n]).toBe(0);   // cursor 1 -> destination 2
    const h = calm(1); setMap(h, MAP_M_NODES, MAP);
    seatNavigator(h, 0); run(h, 1); h.run.jumpCharge = 1 - 1.5 * DT / JUMP_CHARGE_TIME;
    run(h, 3, () => intents({}, {}));                                                    // neutral intents: the dispatch only sends Confirm edges, and none is sent while the charge becomes ready
    expect(h.run.nodesReached).toBe(0); expect(h.run.jumpCharge).toBe(1);
    run(h, 1, () => intents({ confirmPressed: true }, {})); expect(h.run.nodesReached).toBe(1);
    const e = calm(1); setMap(e, MAP_M_NODES, MAP);
    seatNavigator(e, 0); run(e, 1); chargeJump(e);
    run(e, 1, () => intents({ moveY: 1, confirmPressed: true }, {})); expect(e.run.node).toBe(2);   // Down applied first, then Confirm: destination 2
    const seat = calm(); teleport(seat, 0, 2.5, 2.5); chargeJump(seat);
    run(seat, 1, () => intents({ confirmPressed: true }, {}));                           // the seating Confirm
    expect(Seated.station[seat.crew[0]!]).toBeGreaterThanOrEqual(0); expect(seat.run.nodesReached).toBe(0);
    const w = calm(); sitDown(w, 0, w.derived.stationOfKind[StationKind.Weapons]!); chargeJump(w); run(w, 2, () => intents({ confirmPressed: true }, {})); expect(w.run.nodesReached).toBe(0);
    const u = calm(); chargeJump(u); teleport(u, 0, 2.5, 9.5); run(u, 2, () => intents({ confirmPressed: true }, {})); expect(u.run.nodesReached).toBe(0);
  });
});

describe('run: the jump', () => {
  const loaded = () => {
    const s = calm(2); const A = room(s, 'A'), G = room(s, 'G');
    placeEnemy(s); placeShot(s, A, 600, 1); placeDebris(s, A, 600, 1); placeDebris(s, G, 900, 1); placeBoarder(s, G, 33);
    igniteRoom(s, A); activateBreach(s, 6); failStation(s, s.derived.stationOfKind[StationKind.Doors]!);
    s.hull = 61; Health.cur[s.crew[1]!] = 40; setSkill(s, 0, Skill.Repair, 2); s.weapons.charge = 0.7; s.weapons.torpedoLoaded = 1; s.weapons.selector = 2;
    const sci = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 1, sci); s.stations.cursor[sci] = 1; s.science.scanning = 1;
    const nav = seatNavigator(s, 0); s.run.jumpCharge = 1; s.director.stress = 0.42;
    return { s, nav, sci, A, G };
  };
  it('clears the encounter and keeps the ship: objects gone, cursors -1, scanning 0, enemy withdrawn (not destroyed) and the next node armed, boarder kept, director in Build Up with stress kept, everything else untouched; one director draw with or without the enemy (Demo-vi: the withdrawal no longer draws a cooldown)', () => {
    const { s, nav, sci, A } = loaded();
    const tick = s.tick, before = { stress: s.director.stress, boarderRoom: s.boarders.room[0], boarderHealth: s.boarders.health[0], boarderMove: s.boarders.nextMoveTick[0], boardArrival: s.boarders.nextArrivalTick, xp: s.skills.xp[Skill.Repair], hull: s.hull, h1: Health.cur[s.crew[1]!], charge: s.weapons.charge, loaded: s.weapons.torpedoLoaded, selector: s.weapons.selector, fire: s.rooms.fire[A], breach: s.breaches.active[6], failed: s.stations.failed[s.derived.stationOfKind[StationKind.Doors]!] };
    const dr = createRng(s.rng.director.s); nextFloat(dr); const h0 = s.rng.hazards.s, c0 = s.rng.combat.s, m0 = s.rng.map.s;
    const reachableBefore = reachable(s);
    jumpShip(s, reachable(s)[0]!);
    expect([s.run.column, s.run.nodesReached, s.run.jumpCharge, s.telemetry.jumps]).toEqual([1, 1, 0, 1]); expect(s.run.node).toBe(reachableBefore[0]!.node); expect(s.stations.cursor[nav]).toBe(0);
    expect(Array.from(s.debris.active)).toEqual(new Array(DEBRIS_SLOTS).fill(0)); expect(s.stations.cursor[s.derived.stationOfKind[StationKind.Weapons]!]).toBe(-1); expect(s.stations.cursor[sci]).toBe(-1); expect(s.science.scanning).toBe(0);
    expect([s.enemy.present, s.telemetry.enemiesDestroyed, s.enemy.nextArrivalTick]).toEqual([0, 0, s.run.nodeType[NODE_STRIDE + s.run.node] === NodeType.Hazard ? tick + ENCOUNTER_START * T : NEVER]);
    expect([s.boarders.active[0], s.boarders.room[0], s.boarders.health[0], s.boarders.nextMoveTick[0], s.boarders.nextArrivalTick]).toEqual([1, before.boarderRoom, before.boarderHealth, before.boarderMove, before.boardArrival]);
    expect([s.director.phase, s.director.phaseTick, s.director.stress]).toEqual([Phase.BuildUp, tick, before.stress]);
    expect([s.hull, Health.cur[s.crew[1]!], s.skills.xp[Skill.Repair], s.weapons.charge, s.weapons.torpedoLoaded, s.weapons.selector, s.rooms.fire[A], s.breaches.active[6], s.stations.failed[s.derived.stationOfKind[StationKind.Doors]!]]).toEqual([before.hull, before.h1, before.xp, before.charge, before.loaded, before.selector, before.fire, before.breach, before.failed]);
    expect(Seated.station[s.crew[0]!]).toBe(nav); expect(Seated.station[s.crew[1]!]).toBe(sci);
    expect(s.rng.director.s).toBe(dr.s); expect([s.rng.hazards.s, s.rng.combat.s, s.rng.map.s]).toEqual([h0, c0, m0]);
    const q = calm(2); const d1 = createRng(q.rng.director.s); nextFloat(d1); q.run.jumpCharge = 1; const t1 = q.tick;
    jumpShip(q, reachable(q)[0]!); expect(q.rng.director.s).toBe(d1.s); expect(q.boarders.nextArrivalTick).toBe(t1 + BOARDING_AFTER_JUMP * T);
    const sc = calm(2); const k = placeDebris(sc, room(sc, 'A'), 600, 1); const c2 = sc.derived.stationOfKind[StationKind.Science]!; sitDown(sc, 1, c2); sc.stations.cursor[c2] = k; sc.science.scanning = 1; sc.run.jumpCharge = 1;
    jumpShip(sc, reachable(sc)[0]!); expect(sc.science.scanning).toBe(0);                                  // no enemy: scanning still cleared
  });
  it('persistence of the finer state: life, bleed and revive, stamps, oxygen and repair progress, doors, heat and coolant, torpedo loading and regeneration, boarder clocks', () => {
    const s = calm(2); const A = room(s, 'A'); downCrew(s, 1); Life.bleed[s.crew[1]!] = 12.5; Life.reviveProgress[s.crew[1]!] = 0.3; Life.reviverPid[s.crew[1]!] = 0;
    s.skills.lastEngChangeTick = 11; s.skills.lastDoorToggleTick = 22; s.skills.lsDeliveredTick = 33; s.skills.lastShotTick = 44;
    s.rooms.o2[A] = s.derived.volume[A]! * 0.4; s.rooms.fire[A] = 0.6; s.rooms.fireRepair[A] = 0.2; activateBreach(s, 6); s.breaches.repair[6] = 0.5;
    const doors = s.derived.stationOfKind[StationKind.Doors]!, wpn = s.derived.stationOfKind[StationKind.Weapons]!; failStation(s, doors); s.stations.repair[doors] = 0.7; s.stations.heat[wpn] = 120; s.stations.coolant[wpn] = 2;
    s.doors.state[0] = 2; s.doors.closeTimer[0] = 0.5; s.doors.sealRequested[0] = 1;
    s.weapons.torpedoStock = 4; s.weapons.torpedoLoad = 0.3; s.weapons.torpedoRegen = 0.4;
    const b = placeBoarder(s, room(s, 'G'), 33); s.boarders.nextMoveTick[b] = 777; s.boarders.aloneSince[b] = -2;
    const snap = () => JSON.stringify([Life.state[s.crew[1]!], Life.bleed[s.crew[1]!], Life.reviveProgress[s.crew[1]!], Life.reviverPid[s.crew[1]!], s.skills.lastEngChangeTick, s.skills.lastDoorToggleTick, s.skills.lsDeliveredTick, s.skills.lastShotTick, s.rooms.o2[A], s.rooms.fire[A], s.rooms.fireRepair[A], s.breaches.repair[6], s.stations.repair[doors], s.stations.heat[wpn], s.stations.coolant[wpn], s.doors.state[0], s.doors.closeTimer[0], s.doors.sealRequested[0], s.weapons.torpedoStock, s.weapons.torpedoLoad, s.weapons.torpedoRegen, s.boarders.nextMoveTick[b], s.boarders.aloneSince[b]]);
    const before = snap(); s.run.jumpCharge = 1; jumpShip(s, reachable(s)[0]!); expect(snap()).toBe(before);
  });
  it('the last exit (spec Loop-i section 1, Loop-iv section 1): from nodesReached 16, jumps 16 the jump to the final beacon gives both counters 17 and does not end the run; the Warden destroyed on a tick the navigator goes down, or with the hull already 0, is a Victory crewSystem does not overwrite; the next step is a no-op', () => {
    const s = calm(2); s.run.sector = SECTORS - 1; s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0; s.run.nodesReached = 16; s.telemetry.jumps = 16; s.run.jumpCharge = 1;
    sectorJump(s);
    expect([s.run.column, s.run.nodesReached, s.telemetry.jumps, s.ended, s.run.finalBeacon]).toEqual([SECTOR_COLUMNS - 1, 17, 17, 0, 1]);
    const dying = (q: ReturnType<typeof calm>) => { placeEnemy(q, 0.001); q.enemy.roomFire[EnemyRoom.Bridge] = 5; q.enemy.nextShotTick = 1e9; };   // its own fire destroys the Warden in the enemy step
    const p = calm(2); allHazard(p); p.run.sector = SECTORS - 1; p.run.column = SECTOR_COLUMNS - 1; p.run.node = 0; chargeJump(p); sectorJump(p); p.boarders.nextArrivalTick = 1e9;
    seatNavigator(p, 0); run(p, 1); teleport(p, 1, 2.5, 2.5); downCrew(p, 1); Health.cur[p.crew[0]!] = 0.05; placeBoarder(p, room(p, 'A')); dying(p);   // a boarder in A will down the navigator later this tick
    run(p, 1);
    expect(p.endReason).toBe(EndReason.Victory); expect(p.ended).toBe(1); expect(Life.state[p.crew[0]!]).toBe(LifeState.Downed); expect(p.telemetry.firstDownTick).toBe(p.tick - 1);
    const h = calm(1); allHazard(h); h.run.sector = SECTORS - 1; h.run.column = SECTOR_COLUMNS - 1; chargeJump(h); sectorJump(h); h.boarders.nextArrivalTick = 1e9; dying(h); h.hull = 0;   // hull already 0 when the tick runs
    run(h, 1); expect(h.endReason).toBe(EndReason.Victory);
    const t = h.tick; run(h, 3); expect(h.tick).toBe(t);
    void HULL_MAX;
  });
  it('post-jump re-arms are the same for crews of two and four (spec Demo-i section 5: only the first arrival differs)', () => {
    for (const p of [2, 4]) {
      const q = calm(p); allHazard(q); q.run.jumpCharge = 1; q.tick = 1000; jumpShip(q, reachable(q)[0]!);
      expect([q.enemy.nextArrivalTick, q.boarders.nextArrivalTick]).toEqual([q.tick + ENCOUNTER_START * T, q.tick + BOARDING_AFTER_JUMP * T]);
    }
  });
});

describe('encounters at nodes (spec Demo-vi section 2)', () => {
  const arriveAt = (type: number) => { const s = calm(2); mapM(s); setNodeTypes(s, { '1:0': type }); chargeJump(s); s.tick = 1000; jumpShip(s, at(1, 0)); s.boarders.nextArrivalTick = 1e9; return s; };
  it('a jump to a Hazard node: encounter pending, the enemy at +8 s exactly, the fight starts on arrival', () => {
    const s = arriveAt(NodeType.Hazard), t0 = s.tick;
    expect([s.run.encounter, s.run.encounterTick, s.enemy.nextArrivalTick]).toEqual([Encounter.Pending, t0, t0 + ENCOUNTER_START * T]);
    expect(ENCOUNTER_START).toBe(8);
    run(s, ENCOUNTER_START * T); expect(s.enemy.present).toBe(0);
    run(s, 1); expect([s.enemy.present, s.run.encounter, s.run.encounterTick]).toEqual([1, Encounter.Fighting, t0 + ENCOUNTER_START * T]);
  });
  for (const [name, type] of [['Event', NodeType.Event], ['Shop', NodeType.Shop], ['Empty', NodeType.Empty]] as const) {
    it(`a jump to an ${name} node is quiet: encounter 0, NEVER, no enemy over 600 s`, () => {
      const s = arriveAt(type);
      expect([s.run.encounter, s.enemy.nextArrivalTick]).toEqual([Encounter.None, NEVER]);
      run(s, 600 * T);
      expect([s.enemy.present, s.telemetry.encounters]).toEqual([0, 0]);
    });
  }
  it('a jump with the enemy present ends its encounter without reward and arms the next node', () => {
    const s = calm(2); mapM(s); placeEnemy(s); s.run.encounter = Encounter.Fighting; s.hull = 60; chargeJump(s); jumpShip(s, at(1, 0));
    expect([s.enemy.present, s.hull, s.run.driveBoost, s.telemetry.encountersWon, s.run.encounter, s.enemy.nextArrivalTick]).toEqual([0, 60, 0, 0, Encounter.Pending, s.tick + ENCOUNTER_START * T]);
  });
  it('the last sector exit is not an encounter (spec Loop-i section 4)', () => {
    const s = calm(2); s.run.sector = SECTORS - 1; s.run.column = 4; s.run.node = 0; chargeJump(s); jumpShip(s, reachable(s)[0]!);
    expect([s.ended, s.run.encounter, s.enemy.nextArrivalTick]).toEqual([0, Encounter.None, NEVER]);
  });
  it('the drive boost charges ENCOUNTER_BOOST times as fast and the jump clears it', () => {
    const s = calm(2); mapM(s); s.run.quirk = 0; s.run.driveBoost = 1; run(s, 1);   // quirk 0 leaves the charge rate alone
    expect(s.run.jumpCharge).toBeCloseTo(ENCOUNTER_BOOST * DT / JUMP_CHARGE_TIME, 12);
    expect(ENCOUNTER_BOOST).toBe(4);
    run(s, (JUMP_CHARGE_TIME / ENCOUNTER_BOOST) * T + 1); expect(s.run.jumpCharge).toBe(1);
    jumpShip(s, at(1, 0)); expect([s.run.driveBoost, s.run.jumpCharge]).toEqual([0, 0]);
    run(s, 1); expect(s.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
  });
});

describe('asteroid fields (spec Demo-viii section 1)', () => {
  const arriveField = () => { const s = calm(2); mapM(s); setNodeTypes(s, { '1:0': NodeType.Asteroid }); chargeJump(s); s.tick = 1000; jumpShip(s, at(1, 0)); s.boarders.nextArrivalTick = 1e9; return s; };
  /** Step with the ship and crew kept whole, so a minute of rocks never ends the run. */
  const steady = (s: ReturnType<typeof calm>, ticks: number, each: () => void = () => {}) => { for (let i = 0; i < ticks; i++) { step(s, []); s.hull = HULL_MAX; for (const eid of s.crew) Health.cur[eid] = 100; each(); } };
  it('the constants', () => {
    expect([FIELD_INTERVAL, FIELD_FLIGHT, FIELD_SECONDS, scrapField(1)]).toEqual([6, 10, 60, 20]);
  });
  it('a jump to an Asteroid node: pending with no enemy arrival; the field starts at +8 s with a rock on the start tick; no enemy ever', () => {
    const s = arriveField(), t0 = s.tick;
    expect([s.run.encounter, s.run.encounterTick, s.enemy.nextArrivalTick, s.run.fieldNextTick]).toEqual([Encounter.Pending, t0, NEVER, -1]);
    steady(s, ENCOUNTER_START * T); expect([s.run.encounter, activeDebrisCount(s)]).toEqual([Encounter.Pending, 0]);
    steady(s, 1); expect([s.run.encounter, s.run.encounterTick, activeDebrisCount(s), s.enemy.present]).toEqual([Encounter.Fighting, t0 + ENCOUNTER_START * T, 1, 0]);
    steady(s, 90 * T); expect([s.enemy.present, s.telemetry.encounters]).toEqual([0, 0]);
  });
  it('one spawn: the three spawn draws (room, flight 10 +/- 2 s, frequency) then one hazards draw re-arms 6 s +/- 20%', () => {
    const s = arriveField(); s.run.encounter = Encounter.Fighting; s.run.encounterTick = s.tick; s.run.fieldNextTick = s.tick;
    const ref = { s: s.rng.hazards.s }, t = s.tick;
    fieldSystem(s);
    const roomU = nextInt(ref, s.derived.volume.length), flight = FIELD_FLIGHT + (2 * nextFloat(ref) - 1) * 2, freq = 1 + nextInt(ref, FREQ_COUNT), u = nextFloat(ref);
    const k = s.debris.active.indexOf(1);
    expect([s.debris.kind[k], s.debris.room[k], s.debris.impactTick[k], s.debris.frequency[k]]).toEqual([ObjectKind.Rock, roomU, t + Math.round(flight * T), freq]);
    expect(s.run.fieldNextTick).toBe(t + Math.round(FIELD_INTERVAL * T * (1 + 0.2 * (2 * u - 1))));
    expect(s.rng.hazards.s).toBe(ref.s);
  });
  it('spawnFieldRock uses the field flight, always within 8..12 s', () => {
    const s = calm(2);
    for (let i = 0; i < 8; i++) { const k = spawnFieldRock(s); expect(k).toBeGreaterThanOrEqual(0); const f = (s.debris.impactTick[k]! - s.tick) / T; expect(f).toBeGreaterThanOrEqual(8); expect(f).toBeLessThanOrEqual(12); }
    expect(spawnFieldRock(s)).toBe(-1);
  });
  it('a full debris table skips the spawn (no spawn draws) and the re-arm still makes its one draw', () => {
    const s = arriveField(); s.run.encounter = Encounter.Fighting; s.run.encounterTick = s.tick; s.run.fieldNextTick = s.tick;
    for (let i = 0; i < DEBRIS_SLOTS; i++) placeDebris(s, 0, 10000);
    const ref = { s: s.rng.hazards.s }, t = s.tick; fieldSystem(s);
    const u = nextFloat(ref); expect(s.rng.hazards.s).toBe(ref.s);
    expect(s.run.fieldNextTick).toBe(t + Math.round(FIELD_INTERVAL * T * (1 + 0.2 * (2 * u - 1))));
  });
  it('spawns every 6 s +/- 20% for 60 s, then stops; clears at +72 s with +20 scrap, the drive boost and a win', () => {
    const s = arriveField(); steady(s, ENCOUNTER_START * T + 1);
    const start = s.run.encounterTick, spawns: number[] = [start], seen = new Set<number>(Array.from(s.debris.stableId).filter((x) => x > 0));
    const scrap0 = s.run.scrap;
    steady(s, (FIELD_SECONDS + 12) * T - 1, () => { for (let k = 0; k < DEBRIS_SLOTS; k++) { const id = s.debris.stableId[k]!; if (id > 0 && !seen.has(id)) { seen.add(id); spawns.push(s.tick - 1); } } });
    expect(s.run.encounter).toBe(Encounter.Fighting);
    for (let i = 1; i < spawns.length; i++) { const gap = spawns[i]! - spawns[i - 1]!; expect(gap).toBeGreaterThanOrEqual(Math.round(FIELD_INTERVAL * T * 0.8)); expect(gap).toBeLessThanOrEqual(Math.round(FIELD_INTERVAL * T * 1.2)); }
    expect(spawns.length).toBeGreaterThanOrEqual(9); expect(spawns.length).toBeLessThanOrEqual(13);
    expect(spawns[spawns.length - 1]!).toBeLessThan(start + FIELD_SECONDS * T);
    expect(s.run.fieldNextTick).toBe(-1);
    expect(activeDebrisCount(s)).toBe(0);
    steady(s, 1);
    expect([s.run.encounter, s.run.encounterTick, s.run.scrap - scrap0, s.run.driveBoost, s.telemetry.encountersWon, s.run.fieldNextTick]).toEqual([Encounter.Won, start + (FIELD_SECONDS + 12) * T, scrapField(1), 1, 1, -1]);
    steady(s, 60 * T); expect([s.run.encounter, s.telemetry.encountersWon, activeDebrisCount(s)]).toEqual([Encounter.Won, 1, 0]);
  });
  it('the director interval doubles while the field is fighting', () => {
    const a = arriveField(), b = arriveField(); steady(a, ENCOUNTER_START * T + 1); steady(b, ENCOUNTER_START * T + 1); expect(a.run.encounter).toBe(Encounter.Fighting);
    b.run.encounter = Encounter.None;
    for (const x of [a, b]) { x.director.nextSpawnTick = 0; enterPhase(x, Phase.BuildUp); }
    expect((a.director.nextSpawnTick - a.tick) / (b.director.nextSpawnTick - b.tick)).toBeCloseTo(2, 2);
  });
  it('an early jump: no reward, the rocks left behind, the field clock stopped; endField sets the encounter over', () => {
    const s = arriveField(); steady(s, (ENCOUNTER_START + 30) * T);
    const scrap0 = s.run.scrap; chargeJump(s); jumpShip(s, at(2, 0));
    expect([s.run.scrap - scrap0, s.run.driveBoost, s.telemetry.encountersWon, s.run.fieldNextTick, activeDebrisCount(s)]).toEqual([scrapPerJump(2), 0, 0, -1, 0]);
    const f = arriveField(); steady(f, (ENCOUNTER_START + 5) * T); endField(f);
    expect([f.run.encounter, f.run.encounterTick, f.run.fieldNextTick, f.telemetry.encountersWon]).toEqual([Encounter.Over, f.tick, -1, 0]);
    steady(f, 80 * T); expect([f.run.encounter, f.telemetry.encountersWon]).toEqual([Encounter.Over, 0]);
  });
});

describe('the evasive manoeuvre (spec Coop-ii section 1, amendments D1-D3)', () => {
  const evadeRow = (s: ReturnType<typeof makeState>) => navRows(s).findIndex((r) => r.select === 'evade');
  const seated = () => { const s = makeState(2); quiet(s); allHazard(s); const n = seatNavigator(s, 0); run(s, 1); s.stations.cursor[n] = evadeRow(s); return { s, n }; };
  it('the Navigation rows end with the evade row: EVADE: Confirm while ready', () => {
    const { s } = seated(); const rows = navRows(s);
    expect(rows[rows.length - 1]).toEqual({ text: 'EVADE: Confirm', select: 'evade', index: 0, enabled: true });
  });
  it('a seated Confirm on the row opens the window [start, start + 60) and the 6 s cooldown after it', () => {
    const { s } = seated(); const start = s.tick;
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect([s.run.evadeUntilTick, s.run.evadeReadyTick]).toEqual([start + EVADE_WINDOW * TICK_HZ, start + (EVADE_WINDOW + EVADE_COOLDOWN) * TICK_HZ]);
    expect(navRows(s)[evadeRow(s)]!).toMatchObject({ text: 'EVADING', enabled: false });
    run(s, EVADE_WINDOW * TICK_HZ - 1); expect(navRows(s)[evadeRow(s)]!).toMatchObject({ text: `EVADE ${EVADE_COOLDOWN}s`, enabled: false });
  });
  it('no start during the cooldown; ready again at evadeReadyTick', () => {
    const { s } = seated(); run(s, 1, () => intents({ confirmPressed: true }, {}));
    const until = s.run.evadeUntilTick, ready = s.run.evadeReadyTick;
    run(s, 100, () => intents({ confirmPressed: true }, {}));
    expect([s.run.evadeUntilTick, s.run.evadeReadyTick]).toEqual([until, ready]);
    run(s, ready - s.tick); expect(navRows(s)[evadeRow(s)]!).toMatchObject({ text: 'EVADE: Confirm', enabled: true });
    const t = s.tick; run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.evadeUntilTick).toBe(t + EVADE_WINDOW * TICK_HZ);
  });
  it('an offline Navigation cannot start one; a standing player cannot either', () => {
    const { s, n } = seated(); s.stations.level[n] = 0;
    expect(navRows(s)[evadeRow(s)]!.enabled).toBe(false);
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.evadeUntilTick).toBe(-1);
    const u = makeState(2); quiet(u); run(u, 5, () => intents({ confirmPressed: true }, { confirmPressed: true })); expect(u.run.evadeUntilTick).toBe(-1);
  });
  it('the captain bot never starts one', () => {
    const s = makeState(2, 3); quiet(s); chargeJump(s);
    for (let t = 0; t < 120 * TICK_HZ && !s.ended; t++) step(s, [botIntent(s, 0), botIntent(s, 1)]);
    expect(s.run.evadeUntilTick).toBe(-1);
  });
});

describe('the jump confirmation (spec Coop-ii section 3, amendment D7)', () => {
  const ready = (players = 2) => { const s = makeState(players); quiet(s); allHazard(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; const n = seatNavigator(s, 0); run(s, 1); chargeJump(s); s.stations.cursor[n] = 0; return { s, n }; };
  it('with two conscious players the pilot\'s Confirm opens a 5 s confirmation; a standing Confirm jumps', () => {
    const { s } = ready(); const dest = reachable(s)[0]!;
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect([s.run.column, s.run.jumpPending]).toEqual([0, beaconIndex(dest.column, dest.node)]);
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect([s.run.column, s.run.node, s.run.jumpPending]).toEqual([1, dest.node, -1]);
  });
  it('without a second Confirm within CONFIRM_SECONDS it is cancelled, the drive stays charged; a standing Confirm meanwhile seals no door', () => {
    const { s } = ready(); const d = s.derived, e = d.doorEdges[0]!, t = d.edgeTile[e]!;
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    run(s, CONFIRM_SECONDS * TICK_HZ - 2); expect(s.run.jumpPending).toBeGreaterThanOrEqual(0);
    run(s, 2); expect([s.run.jumpPending, s.run.column, s.run.jumpCharge]).toEqual([-1, 0, 1]);
    run(s, 1, () => intents({ confirmPressed: true }, {})); teleport(s, 1, t % d.width + 0.5, Math.floor(t / d.width) + 0.5);
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect(s.doors.sealRequested[e]).toBe(0); expect(s.doors.state[e]).not.toBe(DoorState.Sealed); expect(s.scratch.doorToggles.size + s.scratch.doorCycles.size).toBe(0); expect(s.run.column).toBe(1);
  });
  it('alone, or with the others downed, the pilot jumps at once', () => {
    const a = ready(1).s; run(a, 1, () => intents({ confirmPressed: true })); expect([a.run.column, a.run.jumpPending]).toEqual([1, -1]);
    const b = ready(2).s; downCrew(b, 1); run(b, 1, () => intents({ confirmPressed: true }, {})); expect(b.run.column).toBe(1);
    const c = ready(2).s; run(c, 1, () => intents({ confirmPressed: true }, {})); expect(c.run.column).toBe(0); downCrew(c, 1); run(c, 1); expect(c.run.column).toBe(1);   // the second officer went down while it waited
  });
  it('bots other than the pilot confirm a pending jump', () => {
    const { s } = ready(); run(s, 1, () => intents({ confirmPressed: true }, {}));
    step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); expect(s.run.column).toBe(1);
  });
});

describe('sectors, fuel and waiting (spec Loop-i sections 1 and 2, amendments S1-S3)', () => {
  const ready = (players = 1) => { const s = calm(players); mapM(s); chargeJump(s); return s; };
  const exitAt = (s: ReturnType<typeof calm>, sector: number) => { s.run.sector = sector; s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0; chargeJump(s); };
  it('the run starts in sector 1 with FUEL_START fuel, the pursuit at PURSUIT_START and no wait; every jump costs 1 fuel: forward, sideways and to the next sector', () => {
    expect([FUEL_START, SECTORS, PURSUIT_START, PURSUIT_STEP, WAIT_SECONDS, WAIT_FUEL_CHANCE, WAIT_FUEL]).toEqual([8, 3, -1.5, 0.75, 20, 0.6, 2]);
    const s = ready(); expect([s.run.sector, s.run.fuel, s.run.pursuit, s.run.waitUntilTick]).toEqual([0, 8, -1.5, -1]);
    jumpShip(s, at(1, 0)); expect(s.run.fuel).toBe(7);
    chargeJump(s); jumpShip(s, at(1, 1)); expect([s.run.column, s.run.node, s.run.fuel]).toEqual([1, 1, 6]);   // sideways
    exitAt(s, 0); sectorJump(s); expect([s.run.sector, s.run.column, s.run.node, s.run.fuel]).toEqual([1, 0, 0, 5]);
  });
  it('with no fuel a jump is a no-op and Navigation offers only Wait for help, the exit included (S2)', () => {
    const s = ready(); s.run.fuel = 0; const before = JSON.stringify([s.run.column, s.run.node, s.run.nodesReached, s.telemetry.jumps]);
    jumpShip(s, at(1, 0)); expect(JSON.stringify([s.run.column, s.run.node, s.run.nodesReached, s.telemetry.jumps])).toBe(before);
    expect(navRows(s).map((r) => [r.text, r.select, r.enabled])).toEqual([['Wait for help', 'wait', true], ['EVADE: Confirm', 'evade', true]]);
    exitAt(s, 0); expect(navRows(s).map((r) => r.select)).toEqual(['wait', 'evade']); sectorJump(s); expect([s.run.sector, s.run.column]).toEqual([0, SECTOR_COLUMNS - 1]);
    setNodeTypes(s, { '5:0': NodeType.Shop }); grantScrap(s, 100); expect(navRows(s).map((r) => r.select).slice(-2)).toEqual(['wait', 'evade']);   // a shop's items stay, then Wait
  });
  it('the exit rows (S1): Jump to sector 2 and 3, Engage the Warden in the last (spec Loop-iv section 1); only at the exit, never a destination row there', () => {
    const s = ready();
    for (const [sector, text] of [[0, 'Jump to sector 2'], [1, 'Jump to sector 3'], [2, 'Engage the Warden']] as const) {
      exitAt(s, sector); expect(navRows(s).map((r) => [r.text, r.select, r.index, r.enabled])).toEqual([[text, 'sector', EXIT_JUMP, true], ['EVADE: Confirm', 'evade', 0, true]]);
    }
    const m = ready(); m.run.column = 4; m.run.node = 1; sectorJump(m); expect([m.run.sector, m.run.column, m.run.fuel]).toEqual([0, 4, 8]);   // not at the exit: no-op
    expect(navRows(m).some((r) => r.select === 'sector')).toBe(false);
    for (const r of navRows(s)) expect(r.text.length).toBeLessThanOrEqual(NAV_TEXT_MAX);
  });
  it('the exit row through the console: a lone pilot\'s Confirm with a ready drive jumps to the next sector; before the drive is ready nothing', () => {
    const s = ready(); exitAt(s, 0); s.run.jumpCharge = 0.5; const n = seatNavigator(s, 0); run(s, 1); s.stations.cursor[n] = 0;
    run(s, 1, () => intents({ confirmPressed: true })); expect(s.run.sector).toBe(0);
    chargeJump(s); run(s, 1, () => intents({})); run(s, 1, () => intents({ confirmPressed: true })); expect([s.run.sector, s.run.column]).toEqual([1, 0]);
    const p = calm(2); mapM(p); exitAt(p, 0); const m = seatNavigator(p, 0); run(p, 1); p.stations.cursor[m] = 0; chargeJump(p);   // two crew: the second Confirm (spec Coop-ii section 3)
    run(p, 1, () => intents({ confirmPressed: true }, {})); expect([p.run.sector, p.run.jumpPending]).toEqual([0, EXIT_JUMP]);
    run(p, 1, () => intents({}, { confirmPressed: true })); expect([p.run.sector, p.run.jumpPending]).toEqual([1, -1]);
  });
  it('a sector jump (S4): a new map drawn from the map stream in the same order, the pursuit reset, arrival at column 0 with the jump bookkeeping', () => {
    const s = ready(2); const A = room(s, 'A'); exitAt(s, 0); s.run.pursuit = 3.75; placeEnemy(s); placeDebris(s, A, 600, 1); s.run.encounter = Encounter.Fighting;
    const ref = { s: s.rng.map.s }, expected = generateMap(ref), loot = s.rng.loot.s, scrap = s.run.scrap, t = s.tick;
    sectorJump(s);
    expect([Array.from(s.run.colNodes), Array.from(s.run.edgeMask), Array.from(s.run.nodeType)]).toEqual([Array.from(expected.colNodes), Array.from(expected.edgeMask), Array.from(expected.nodeType)]);
    expect(s.rng.map.s).toBe(ref.s); expect(s.rng.loot.s).toBe(loot);
    expect([s.run.sector, s.run.column, s.run.node, s.run.pursuit, s.run.nodesReached, s.telemetry.jumps, s.run.jumpCharge, s.run.encounter, s.enemy.present, s.enemy.nextArrivalTick, activeDebrisCount(s)]).toEqual([1, 0, 0, PURSUIT_START, 1, 1, 0, Encounter.None, 0, NEVER, 0]);
    expect(s.run.scrap - scrap).toBe(scrapPerJump(SECTOR_COLUMNS));   // depth 6: sector 2, column 0
    expect(s.boarders.nextArrivalTick).toBe(t + BOARDING_AFTER_JUMP * T);
  });
  it('the last sector exit leads to the final beacon (spec Loop-iv section 1); reaching the last column of a sector does not end the run; the exit is a fight on the way out except in the last sector', () => {
    const s = ready(); s.run.column = 4; s.run.node = 0; jumpShip(s, at(5, 0));
    expect([s.ended, s.run.column, s.run.encounter, s.enemy.nextArrivalTick]).toEqual([0, 5, Encounter.Pending, s.tick + ENCOUNTER_START * T]);
    const l = ready(); l.run.sector = 2; l.run.column = 4; l.run.node = 0; jumpShip(l, at(5, 0));
    expect([l.ended, l.run.encounter, l.enemy.nextArrivalTick]).toEqual([0, Encounter.None, NEVER]);
    chargeJump(l); const jumps = l.telemetry.jumps; sectorJump(l);
    expect([l.ended, l.run.finalBeacon, l.run.sector, l.run.fuel, l.telemetry.jumps, l.run.encounter, l.enemy.nextArrivalTick]).toEqual([0, 1, 2, 6, jumps + 1, Encounter.Pending, l.tick + ENCOUNTER_START * T]);
  });
  it('Wait for help: a seated Confirm starts 20 s; then the pursuit steps once and one loot draw gives 2 fuel below 0.6, else nothing and the crew can wait again', () => {
    const outcomes = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = calm(1, seed); mapM(s); s.run.fuel = 0; const n = seatNavigator(s, 0); run(s, 1); s.stations.cursor[n] = 0;
      run(s, 1, () => intents({ confirmPressed: true })); const start = s.tick - 1;
      expect(s.run.waitUntilTick).toBe(start + WAIT_SECONDS * T);
      expect(navRows(s).map((r) => [r.text, r.select, r.enabled])).toEqual([['Waiting for help  20s', 'wait', false], ['EVADE: Confirm', 'evade', true]]);
      run(s, 1, () => intents({ confirmPressed: true })); expect(s.run.waitUntilTick).toBe(start + WAIT_SECONDS * T);   // a Confirm while waiting changes nothing
      const ref = { s: s.rng.loot.s }; const u = nextFloat(ref);
      run(s, s.run.waitUntilTick - s.tick); expect([s.run.waitUntilTick, s.run.pursuit, s.run.fuel]).toEqual([start + WAIT_SECONDS * T, PURSUIT_START, 0]);
      run(s, 1); expect([s.run.waitUntilTick, s.run.pursuit, s.run.fuel]).toEqual([-1, PURSUIT_START + PURSUIT_STEP, u < WAIT_FUEL_CHANCE ? WAIT_FUEL : 0]); expect(s.rng.loot.s).toBe(ref.s);
      outcomes.add(s.run.fuel);
      if (s.run.fuel === 0) { expect(navRows(s)[0]!.text).toBe('Wait for help'); run(s, 1, () => intents({ confirmPressed: true })); expect(s.run.waitUntilTick).toBe(s.tick - 1 + WAIT_SECONDS * T); }
      else expect(navRows(s).filter((r) => r.select === 'jump').length).toBeGreaterThan(0);
    }
    expect([...outcomes].sort()).toEqual([0, 2]);
    const f = calm(1); mapM(f); expect(startWait(f)).toBe(false); expect(f.run.waitUntilTick).toBe(-1);   // with fuel there is no wait
  });
  it('the pursuit steps PURSUIT_STEP on every jump, forward or sideways', () => {
    const s = ready(); jumpShip(s, at(1, 0)); expect(s.run.pursuit).toBe(PURSUIT_START + PURSUIT_STEP);
    chargeJump(s); jumpShip(s, at(1, 1)); expect(s.run.pursuit).toBe(PURSUIT_START + 2 * PURSUIT_STEP);
  });
  it('depth (sector x 6 + column) scales the scrap and the enemy', () => {
    const s = ready(); s.run.sector = 1; s.run.column = 1; s.run.node = 0; const scrap = s.run.scrap; jumpShip(s, at(2, 0));
    expect(depthOf(s)).toBe(8); expect(s.run.scrap - scrap).toBe(scrapPerJump(8));
    run(s, ENCOUNTER_START * T + 1); expect([s.enemy.present, s.enemy.maxHull, s.enemy.shieldLayers]).toEqual([1, enemyMaxHull(8), enemyShieldMax(8)]);
  });
  it('fuel sources: a cleared asteroid field gives FIELD_FUEL', () => {
    const s = calm(2); mapM(s); setNodeTypes(s, { '1:0': NodeType.Asteroid }); chargeJump(s); jumpShip(s, at(1, 0)); s.boarders.nextArrivalTick = 1e9;
    const fuel = s.run.fuel; for (let i = 0; i < (ENCOUNTER_START + FIELD_SECONDS + 12) * T + 2; i++) { step(s, []); s.hull = HULL_MAX; for (const eid of s.crew) Health.cur[eid] = 100; }
    expect([s.run.encounter, s.run.fuel - fuel, FIELD_FUEL]).toEqual([Encounter.Won, 1, 1]);
  });
});

describe('the Pursuit (spec Loop-i section 3, amendments S5 and S7)', () => {
  const at2 = (players = 1) => { const s = calm(players); mapM(s); chargeJump(s); return s; };
  it('overrun by floor: a beacon is overrun when its column is at or behind floor(pursuit)', () => {
    const s = at2(); expect([PURSUIT_START, PURSUIT_STEP]).toEqual([-1.5, 0.75]);
    expect([0, 1].map((c) => overrun(s, c))).toEqual([false, false]);   // -1.5: floor -2
    s.run.pursuit = -0.75; expect(overrun(s, 0)).toBe(false);
    s.run.pursuit = 0; expect([overrun(s, 0), overrun(s, 1)]).toEqual([true, false]);
    s.run.pursuit = 1.5; expect([overrun(s, 1), overrun(s, 2)]).toEqual([true, false]);
    s.run.pursuit = 2.99; expect([overrun(s, 2), overrun(s, 3)]).toEqual([true, false]);
  });
  it('S7: column 0 is never overrun on first arrival: at the run start and after a sector jump the front is at -1.5, and two jumps bring it to 0', () => {
    const s = at2(); expect(overrun(s, 0)).toBe(false);
    s.run.column = SECTOR_COLUMNS - 1; s.run.pursuit = 4.5; sectorJump(s); expect([s.run.column, s.run.pursuit, overrun(s, 0)]).toEqual([0, PURSUIT_START, false]);
    chargeJump(s); jumpShip(s, reachable(s)[0]!); expect(overrun(s, 0)).toBe(false); chargeJump(s); jumpShip(s, reachable(s)[0]!); expect([s.run.pursuit, overrun(s, 0)]).toEqual([0, true]);
  });
  it('arriving at an overrun beacon starts one pursuit fight: the beacon\'s own content is replaced (no event, shop or field), contact at +8 s, an elite enemy', () => {
    for (const type of [NodeType.Hazard, NodeType.Event, NodeType.Shop, NodeType.Asteroid, NodeType.Empty]) {
      const s = at2(2); setNodeTypes(s, { '1:0': type }); s.run.pursuit = 0.25; const loot = s.rng.loot.s;   // the jump steps it to 1: column 1 overrun
      jumpShip(s, at(1, 0)); step(s, []);
      const t0 = s.tick - 1;
      expect([s.run.pursuitFought, s.run.encounter, s.enemy.nextArrivalTick, s.run.event]).toEqual([1, Encounter.Pending, t0 + ENCOUNTER_START * T, -1]);
      expect(s.rng.loot.s).toBe(loot);                                                       // no event id drawn
      expect(navRows(s).some((r) => r.select === 'buy')).toBe(false);                       // no shop
      run(s, ENCOUNTER_START * T); expect(s.enemy.present).toBe(1);
      expect(s.enemy.maxHull).toBe(Math.round(enemyMaxHull(depthOf(s)) * PURSUIT_HULL_MULT)); expect(s.run.fieldNextTick).toBe(-1);
    }
  });
  it('the pursuit overrunning the beacon where you stand (after a wait) starts the fight; one per visit: once fought, staying brings no second; the next jump resets it', () => {
    const s = at2(); s.run.column = 1; s.run.node = 0; s.run.pursuit = 0.5; s.run.fuel = 0; s.run.encounter = Encounter.Over; s.enemy.nextArrivalTick = NEVER;
    startWait(s); run(s, WAIT_SECONDS * T + 1);
    expect([s.run.pursuit, s.run.pursuitFought, s.run.encounter]).toEqual([1.25, 1, Encounter.Pending]);
    run(s, ENCOUNTER_START * T); expect(s.enemy.present).toBe(1); leave(s, true); expect(s.enemy.present).toBe(0);
    s.run.pursuit = 3; run(s, 120 * T); expect([s.enemy.present, s.telemetry.encounters]).toEqual([0, 1]);
    s.run.fuel = 1; chargeJump(s); s.run.encounter = Encounter.Over; jumpShip(s, at(2, 0));   // column 2 is overrun too: a new visit, a new fight
    expect([s.run.pursuitFought, s.run.encounter]).toEqual([1, Encounter.Pending]);
    const n = at2(); jumpShip(n, at(1, 0)); step(n, []); expect([n.run.pursuitFought, n.run.encounter]).toEqual([0, Encounter.Pending]);   // not overrun: the beacon's own Hazard fight
  });
  it('the pursuit fight waits for a present enemy to leave, and an overrun field stops at once with no reward', () => {
    const s = at2(2); s.run.column = 1; s.run.node = 0; placeEnemy(s); s.run.encounter = Encounter.Fighting; s.run.pursuit = 1;
    step(s, []); expect(s.run.pursuitFought).toBe(0); leave(s, false); step(s, []); expect([s.run.pursuitFought, s.run.encounter]).toEqual([1, Encounter.Pending]);
    const f = at2(2); setNodeTypes(f, { '1:0': NodeType.Asteroid }); jumpShip(f, at(1, 0)); f.boarders.nextArrivalTick = 1e9; run(f, (ENCOUNTER_START + 10) * T); expect(f.run.encounter).toBe(Encounter.Fighting);
    const won = f.telemetry.encountersWon; f.run.pursuit = 1; step(f, []); expect([f.run.pursuitFought, f.run.encounter, f.run.fieldNextTick]).toEqual([1, Encounter.Pending, -1]);
    run(f, 100 * T); expect(f.telemetry.encountersWon).toBe(won);
  });
  it('the pursuit enemy: hull x 1.5, fire interval x 0.75, no scrap or fuel for a kill or a surrender', () => {
    const s = at2(2); s.run.column = 1; s.run.node = 0; s.run.pursuitFought = 1; s.enemy.nextArrivalTick = s.tick; step(s, []);
    expect([s.enemy.present, s.enemy.maxHull, s.enemy.hull]).toEqual([1, Math.round(enemyMaxHull(1) * 1.5), Math.round(enemyMaxHull(1) * 1.5)]);
    const scrap = s.run.scrap, fuel = s.run.fuel, loot = s.rng.loot.s; leave(s, true);
    expect([s.run.scrap, s.run.fuel, s.rng.loot.s, s.telemetry.enemiesDestroyed]).toEqual([scrap, fuel, loot, 1]);
    const u = at2(2); u.run.column = 1; u.run.pursuitFought = 1; u.enemy.nextArrivalTick = u.tick; step(u, []); u.enemy.fleeing = 1; u.enemy.surrenderIntact = 1; const sc = u.run.scrap; leave(u, false); expect(u.run.scrap).toBe(sc);
    const a = at2(2), b = at2(2); for (const x of [a, b]) { x.run.column = 1; x.enemy.nextArrivalTick = x.tick; } b.run.pursuitFought = 1; step(a, []); step(b, []);
    for (const x of [a, b]) { x.enemy.nextShotTick = x.tick; x.rng.director.s = 99; }
    step(a, []); step(b, []);
    const gap = (x: typeof a) => x.enemy.nextShotTick - (x.tick - 1);
    expect(Math.abs(gap(b) - PURSUIT_FIRE_MULT * gap(a))).toBeLessThanOrEqual(1); expect(PURSUIT_FIRE_MULT).toBe(0.75);
  });
});
