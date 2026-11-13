import { describe, it, expect } from 'vitest';
import { DoorState } from '../src/renderer/src/sim/grid';
import { CONFIRM_SECONDS } from '../src/renderer/src/sim/tuning';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { generateMap, reachable, jumpShip, nodeLabel, assignNodeTypes, NodeType, navRows, NAV_TEXT_MAX } from '../src/renderer/src/sim/run';
import { Encounter } from '../src/renderer/src/sim/enemy';
import { deriveStreams } from '../src/renderer/src/sim/state';
import { Phase, enterPhase } from '../src/renderer/src/sim/director';
import { step } from '../src/renderer/src/sim/step';
import { EndReason, downCrew } from '../src/renderer/src/sim/crew';
import { Health, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { failStation } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, DT, RUN_COLUMNS, EDGE_CHANCE, SHOP_CHANCE, EVENT_CHANCE, ASTEROID_CHANCE, JUMP_CHARGE_TIME, BOARDING_AFTER_JUMP, DEBRIS_SLOTS, HULL_MAX, ENCOUNTER_START, ENCOUNTER_BOOST, NEVER } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, intents, teleport, placeDebris, placeShot, placeEnemy, placeBoarder, chargeJump, seatNavigator, setMap, room, setSkill, allHazard, mapM, setNodeTypes } from './helpers/sim';
import { Skill } from '../src/renderer/src/sim/skills';
import { fieldSystem, endField } from '../src/renderer/src/sim/run';
import { spawnFieldRock, ObjectKind, activeDebrisCount } from '../src/renderer/src/sim/debris';
import { FIELD_INTERVAL, FIELD_FLIGHT, FIELD_SECONDS, scrapField, scrapPerJump, FREQ_COUNT } from '../src/renderer/src/sim/tuning';
import { EVADE_WINDOW, EVADE_COOLDOWN } from '../src/renderer/src/sim/tuning';
import { botIntent } from '../src/renderer/src/sim/bot';

const T = TICK_HZ;
const calm = (players = 2, seed = 1) => { const s = makeState(players, seed); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; return s; };

/** The spec section 5 procedure, replayed on a reference stream. */
function replayMap(rng: { s: number }, columns: number) {
  const colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * 3);
  colNodes[0] = 1; colNodes[columns - 1] = 1;
  for (let c = 1; c < columns - 1; c++) colNodes[c] = 2 + nextInt(rng, 2);
  for (let c = 0; c < columns - 1; c++) {
    const next = colNodes[c + 1]!;
    for (let n = 0; n < colNodes[c]!; n++) { let mask = 0; for (let d = 0; d < next; d++) if (nextFloat(rng) < EDGE_CHANCE) mask |= 1 << d; if (mask === 0) mask = 1 << nextInt(rng, next); edgeMask[c * 3 + n] = mask; }
    for (let d = 0; d < next; d++) { let incoming = false; for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * 3 + n]! & (1 << d)) incoming = true; if (!incoming) { const n = nextInt(rng, colNodes[c]!); edgeMask[c * 3 + n] = edgeMask[c * 3 + n]! | (1 << d); } }
  }
  const nodeType = new Uint8Array(columns * 3);
  for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) { const u = nextFloat(rng); nodeType[c * 3 + n] = u < SHOP_CHANCE ? 2 : u < SHOP_CHANCE + EVENT_CHANCE ? 1 : u < SHOP_CHANCE + EVENT_CHANCE + ASTEROID_CHANCE ? 3 : 0; }
  let shop = false; for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) if (nodeType[c * 3 + n] === 2) shop = true;
  if (!shop) nodeType[Math.floor(columns / 2) * 3] = 2;
  return { colNodes, edgeMask, nodeType };
}

/** The Run-i replay: edges only, no node types. */
function oldReplay(rng: { s: number }, columns: number) {
  const colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * 3);
  colNodes[0] = 1; colNodes[columns - 1] = 1;
  for (let c = 1; c < columns - 1; c++) colNodes[c] = 2 + nextInt(rng, 2);
  for (let c = 0; c < columns - 1; c++) {
    const next = colNodes[c + 1]!;
    for (let n = 0; n < colNodes[c]!; n++) { let mask = 0; for (let d = 0; d < next; d++) if (nextFloat(rng) < EDGE_CHANCE) mask |= 1 << d; if (mask === 0) mask = 1 << nextInt(rng, next); edgeMask[c * 3 + n] = mask; }
    for (let d = 0; d < next; d++) { let incoming = false; for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * 3 + n]! & (1 << d)) incoming = true; if (!incoming) { const n = nextInt(rng, colNodes[c]!); edgeMask[c * 3 + n] = edgeMask[c * 3 + n]! | (1 << d); } }
  }
  return { colNodes, edgeMask };
}

describe('run: map generation', () => {
  it('is well-formed for seeds 1..50: one node at each end, 2 or 3 in the middle, every node has a way out and a way in, no bit past the next column, last masks 0', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { colNodes, edgeMask } = generateMap(createRng(seed), RUN_COLUMNS);
      expect(colNodes[0]).toBe(1); expect(colNodes[RUN_COLUMNS - 1]).toBe(1);
      for (let c = 1; c < RUN_COLUMNS - 1; c++) expect([2, 3]).toContain(colNodes[c]);
      for (let c = 0; c < RUN_COLUMNS - 1; c++) {
        const next = colNodes[c + 1]!;
        for (let n = 0; n < colNodes[c]!; n++) { const m = edgeMask[c * 3 + n]!; expect(m).toBeGreaterThan(0); expect(m >> next).toBe(0); }
        for (let d = 0; d < next; d++) { let incoming = 0; for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * 3 + n]! & (1 << d)) incoming++; expect(incoming).toBeGreaterThan(0); }
      }
      for (let n = 0; n < 3; n++) expect(edgeMask[(RUN_COLUMNS - 1) * 3 + n]).toBe(0);
    }
  });
  it('node types: equal to the replay for seeds 7, 1 and 23; Run-i colNodes/edgeMask unchanged for seeds 1-50; well-formed; the shop fallback', () => {
    for (const seed of [7, 1, 23]) { const s = makeState(2, seed); expect(Array.from(s.run.nodeType)).toEqual(Array.from(replayMap(deriveStreams(seed).map, RUN_COLUMNS).nodeType)); }
    for (let seed = 1; seed <= 50; seed++) {
      const old = oldReplay(createRng(seed), RUN_COLUMNS), g = generateMap(createRng(seed), RUN_COLUMNS);
      expect(Array.from(g.colNodes)).toEqual(Array.from(old.colNodes)); expect(Array.from(g.edgeMask)).toEqual(Array.from(old.edgeMask));
      const t = g.nodeType; let shops = 0;
      for (let c = 0; c < RUN_COLUMNS; c++) for (let n = 0; n < 3; n++) {
        const v = t[c * 3 + n]!;
        if (n >= g.colNodes[c]! || c === 0 || c === RUN_COLUMNS - 1) expect(v).toBe(NodeType.Hazard); else { expect([0, 1, 2, 3]).toContain(v); if (v === NodeType.Shop) shops++; }
      }
      expect(shops).toBeGreaterThanOrEqual(1);
    }
    const t = new Uint8Array(24); assignNodeTypes(createRng(1), makeState(2, 1).run.colNodes, t, () => 0.99);
    for (let c = 0; c < RUN_COLUMNS; c++) for (let n = 0; n < 3; n++) expect(t[c * 3 + n]).toBe(c * 3 + n === 4 * 3 ? NodeType.Shop : NodeType.Hazard);
    const all = makeState(2, 1); assignNodeTypes(createRng(1), all.run.colNodes, t, () => 0.1);
    for (let c = 1; c < RUN_COLUMNS - 1; c++) for (let n = 0; n < all.run.colNodes[c]!; n++) expect(t[c * 3 + n]).toBe(NodeType.Shop);
  });
  it('node type thresholds (spec Demo-viii section 1): Shop below 0.25, Event below 0.5, Asteroid below 0.65, else Hazard; one draw per middle node', () => {
    expect([SHOP_CHANCE, EVENT_CHANCE, ASTEROID_CHANCE]).toEqual([0.25, 0.25, 0.15]);
    const cn = makeState(2, 1).run.colNodes, middle = Array.from(cn).slice(1, -1).reduce((a, b) => a + b, 0);
    for (const [u, want] of [[0.24, NodeType.Shop], [0.26, NodeType.Event], [0.49, NodeType.Event], [0.5, NodeType.Asteroid], [0.64, NodeType.Asteroid], [0.65, NodeType.Hazard], [0.99, NodeType.Hazard]] as const) {
      const t = new Uint8Array(24); let draws = 0;
      assignNodeTypes(createRng(1), cn, t, () => { draws++; return draws === 1 ? 0.1 : u; });   // the first node a shop, so no fallback
      expect(draws).toBe(middle);
      expect(t[1 * 3 + 0]).toBe(NodeType.Shop);
      for (let c = 2; c < RUN_COLUMNS - 1; c++) for (let n = 0; n < cn[c]!; n++) expect(t[c * 3 + n]).toBe(want);
      for (let c = 1; c < 2; c++) for (let n = 1; n < cn[c]!; n++) expect(t[c * 3 + n]).toBe(want);
    }
  });
  it('the map draw count is unchanged by the asteroid type: the map stream ends where the Run-ii replay ends for seeds 1-3', () => {
    for (const seed of [1, 2, 3]) { const r = deriveStreams(seed).map, g = generateMap(r, RUN_COLUMNS), old = oldReplay(deriveStreams(seed).map, RUN_COLUMNS); expect(Array.from(g.edgeMask)).toEqual(Array.from(old.edgeMask)); expect(Array.from(g.colNodes)).toEqual(Array.from(old.colNodes)); const ref = deriveStreams(seed).map; replayMap(ref, RUN_COLUMNS); expect(r.s).toBe(ref.s); }
  });
  it('the Navigation row of an Asteroid destination names the field; other destinations keep the node label', () => {
    const s = calm(2); mapM(s); setNodeTypes(s, { '1:0': NodeType.Asteroid });
    const rows = navRows(s).filter((r) => r.select === 'jump');
    expect(rows.map((r) => r.text)).toEqual(reachable(s).map((d) => d === 0 ? 'Node 2a  Asteroid field' : nodeLabel(1, d)));
    for (const r of rows) expect(r.text.length).toBeLessThanOrEqual(NAV_TEXT_MAX);
  });
  it('createSimState draws the map from the map stream exactly as the section 5 replay does, leaves the other streams as before, and is seed-deterministic', () => {
    for (const seed of [1, 23]) { const r = deriveStreams(seed).map; replayMap(r, RUN_COLUMNS); expect(makeState(2, seed).rng.map.s).toBe(r.s); }
    const ref = deriveStreams(7).map; const expected = replayMap(ref, RUN_COLUMNS);
    const s = makeState(2, 7);
    expect(Array.from(s.run.colNodes)).toEqual(Array.from(expected.colNodes)); expect(Array.from(s.run.edgeMask)).toEqual(Array.from(expected.edgeMask)); expect(s.rng.map.s).toBe(ref.s);
    expect([s.run.column, s.run.node, s.run.nodesReached, s.run.jumpCharge]).toEqual([0, 0, 0, 0]);
    const one = deriveStreams(1);
    expect([one.hazards.s, one.director.s, one.combat.s]).toEqual([2693262067, 11749833, 2265367787]);   // the pre-feature values (Step 0): the five old streams keep their seeds
    expect(Array.from(makeState(2, 1).run.edgeMask)).toEqual(Array.from(makeState(3, 1).run.edgeMask));
    expect(Array.from(makeState(2, 1).run.edgeMask)).not.toEqual(Array.from(makeState(2, 2).run.edgeMask));
    expect(nodeLabel(0, 0)).toBe('Node 1a'); expect(nodeLabel(3, 2)).toBe('Node 4c');
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
    const MAP = { '0:0': 0b101, '1:0': 1, '1:1': 1, '1:2': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 };
    const s = calm(1); setMap(s, [1, 3, 2, 2, 2, 2, 2, 1], MAP);   // one player: the pilot's Confirm jumps (spec Coop-ii section 3)
    expect(reachable(s)).toEqual([0, 2]);
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
    expect(s.run.nodesReached).toBe(1); expect(s.run.column).toBe(1); expect(s.run.node).toBe(reachableBefore[1]); expect(s.run.node).toBe(2); expect(s.stations.cursor[n]).toBe(0);   // cursor 1 -> destination 2
    const h = calm(1); setMap(h, [1, 3, 2, 2, 2, 2, 2, 1], MAP);
    seatNavigator(h, 0); run(h, 1); h.run.jumpCharge = 1 - 1.5 * DT / JUMP_CHARGE_TIME;
    run(h, 3, () => intents({}, {}));                                                    // neutral intents: the dispatch only sends Confirm edges, and none is sent while the charge becomes ready
    expect(h.run.nodesReached).toBe(0); expect(h.run.jumpCharge).toBe(1);
    run(h, 1, () => intents({ confirmPressed: true }, {})); expect(h.run.nodesReached).toBe(1);
    const e = calm(1); setMap(e, [1, 3, 2, 2, 2, 2, 2, 1], MAP);
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
    expect([s.run.column, s.run.nodesReached, s.run.jumpCharge, s.telemetry.jumps]).toEqual([1, 1, 0, 1]); expect(s.run.node).toBe(reachableBefore[0]); expect(s.stations.cursor[nav]).toBe(0);
    expect(Array.from(s.debris.active)).toEqual(new Array(DEBRIS_SLOTS).fill(0)); expect(s.stations.cursor[s.derived.stationOfKind[StationKind.Weapons]!]).toBe(-1); expect(s.stations.cursor[sci]).toBe(-1); expect(s.science.scanning).toBe(0);
    expect([s.enemy.present, s.telemetry.enemiesDestroyed, s.enemy.nextArrivalTick]).toEqual([0, 0, s.run.nodeType[3 + s.run.node] === NodeType.Hazard ? tick + ENCOUNTER_START * T : NEVER]);
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
  it('victory: from column 6 (nodesReached 6, jumps 6) a jump gives column 7, both counters 7, ended, Victory; crewSystem does not overwrite it; the next step is a no-op', () => {
    const s = calm(2); s.run.column = 6; s.run.node = 0; s.run.nodesReached = 6; s.telemetry.jumps = 6; s.run.jumpCharge = 1;
    jumpShip(s, reachable(s)[0]!);
    expect([s.run.column, s.run.nodesReached, s.telemetry.jumps, s.ended, s.endReason]).toEqual([7, 7, 7, 1, EndReason.Victory]);
    const p = calm(2); allHazard(p); p.run.column = 6; p.run.node = 0; p.run.nodesReached = 6; p.telemetry.jumps = 6; chargeJump(p);
    seatNavigator(p, 0); run(p, 1); teleport(p, 1, 2.5, 2.5); downCrew(p, 1); Health.cur[p.crew[0]!] = 0.05; placeBoarder(p, room(p, 'A'));   // P2 down: the pilot jumps alone (spec Coop-ii section 3); a boarder in A will down the navigator later this tick
    run(p, 1, () => intents({ confirmPressed: true }, {}));
    expect(p.endReason).toBe(EndReason.Victory); expect(p.ended).toBe(1); expect(Life.state[p.crew[0]!]).toBe(LifeState.Downed); expect(p.telemetry.firstDownTick).toBe(p.tick - 1);
    const h = calm(1); allHazard(h); h.run.column = 6; h.run.nodesReached = 6; h.telemetry.jumps = 6; chargeJump(h); seatNavigator(h, 0); run(h, 1); h.hull = 0;   // hull already 0 when the jump tick runs
    run(h, 1, () => intents({ confirmPressed: true }, {})); expect(h.endReason).toBe(EndReason.Victory);
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
  const at = (type: number) => { const s = calm(2); mapM(s); setNodeTypes(s, { '1:0': type }); chargeJump(s); s.tick = 1000; jumpShip(s, 0); s.boarders.nextArrivalTick = 1e9; return s; };
  it('a jump to a Hazard node: encounter pending, the enemy at +8 s exactly, the fight starts on arrival', () => {
    const s = at(NodeType.Hazard), t0 = s.tick;
    expect([s.run.encounter, s.run.encounterTick, s.enemy.nextArrivalTick]).toEqual([Encounter.Pending, t0, t0 + ENCOUNTER_START * T]);
    expect(ENCOUNTER_START).toBe(8);
    run(s, ENCOUNTER_START * T); expect(s.enemy.present).toBe(0);
    run(s, 1); expect([s.enemy.present, s.run.encounter, s.run.encounterTick]).toEqual([1, Encounter.Fighting, t0 + ENCOUNTER_START * T]);
  });
  for (const [name, type] of [['Event', NodeType.Event], ['Shop', NodeType.Shop]] as const) {
    it(`a jump to an ${name} node is quiet: encounter 0, NEVER, no enemy over 600 s`, () => {
      const s = at(type);
      expect([s.run.encounter, s.enemy.nextArrivalTick]).toEqual([Encounter.None, NEVER]);
      run(s, 600 * T);
      expect([s.enemy.present, s.telemetry.encounters]).toEqual([0, 0]);
    });
  }
  it('a jump with the enemy present ends its encounter without reward and arms the next node', () => {
    const s = calm(2); mapM(s); placeEnemy(s); s.run.encounter = Encounter.Fighting; s.hull = 60; chargeJump(s); jumpShip(s, 0);
    expect([s.enemy.present, s.hull, s.run.driveBoost, s.telemetry.encountersWon, s.run.encounter, s.enemy.nextArrivalTick]).toEqual([0, 60, 0, 0, Encounter.Pending, s.tick + ENCOUNTER_START * T]);
  });
  it('the last column is not an encounter', () => {
    const s = calm(2); s.run.column = 6; s.run.node = 0; chargeJump(s); jumpShip(s, reachable(s)[0]!);
    expect([s.ended, s.run.encounter, s.enemy.nextArrivalTick]).toEqual([1, Encounter.None, NEVER]);
  });
  it('the drive boost charges ENCOUNTER_BOOST times as fast and the jump clears it', () => {
    const s = calm(2); mapM(s); s.run.quirk = 0; s.run.driveBoost = 1; run(s, 1);   // quirk 0 leaves the charge rate alone
    expect(s.run.jumpCharge).toBeCloseTo(ENCOUNTER_BOOST * DT / JUMP_CHARGE_TIME, 12);
    expect(ENCOUNTER_BOOST).toBe(4);
    run(s, (JUMP_CHARGE_TIME / ENCOUNTER_BOOST) * T + 1); expect(s.run.jumpCharge).toBe(1);
    jumpShip(s, 0); expect([s.run.driveBoost, s.run.jumpCharge]).toEqual([0, 0]);
    run(s, 1); expect(s.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
  });
});

describe('asteroid fields (spec Demo-viii section 1)', () => {
  const at = () => { const s = calm(2); mapM(s); setNodeTypes(s, { '1:0': NodeType.Asteroid }); chargeJump(s); s.tick = 1000; jumpShip(s, 0); s.boarders.nextArrivalTick = 1e9; return s; };
  /** Step with the ship and crew kept whole, so a minute of rocks never ends the run. */
  const steady = (s: ReturnType<typeof calm>, ticks: number, each: () => void = () => {}) => { for (let i = 0; i < ticks; i++) { step(s, []); s.hull = HULL_MAX; for (const eid of s.crew) Health.cur[eid] = 100; each(); } };
  it('the constants', () => {
    expect([FIELD_INTERVAL, FIELD_FLIGHT, FIELD_SECONDS, scrapField(1)]).toEqual([6, 10, 60, 20]);
  });
  it('a jump to an Asteroid node: pending with no enemy arrival; the field starts at +8 s with a rock on the start tick; no enemy ever', () => {
    const s = at(), t0 = s.tick;
    expect([s.run.encounter, s.run.encounterTick, s.enemy.nextArrivalTick, s.run.fieldNextTick]).toEqual([Encounter.Pending, t0, NEVER, -1]);
    steady(s, ENCOUNTER_START * T); expect([s.run.encounter, activeDebrisCount(s)]).toEqual([Encounter.Pending, 0]);
    steady(s, 1); expect([s.run.encounter, s.run.encounterTick, activeDebrisCount(s), s.enemy.present]).toEqual([Encounter.Fighting, t0 + ENCOUNTER_START * T, 1, 0]);
    steady(s, 90 * T); expect([s.enemy.present, s.telemetry.encounters]).toEqual([0, 0]);
  });
  it('one spawn: the three spawn draws (room, flight 10 +/- 2 s, frequency) then one hazards draw re-arms 6 s +/- 20%', () => {
    const s = at(); s.run.encounter = Encounter.Fighting; s.run.encounterTick = s.tick; s.run.fieldNextTick = s.tick;
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
    const s = at(); s.run.encounter = Encounter.Fighting; s.run.encounterTick = s.tick; s.run.fieldNextTick = s.tick;
    for (let i = 0; i < DEBRIS_SLOTS; i++) placeDebris(s, 0, 10000);
    const ref = { s: s.rng.hazards.s }, t = s.tick; fieldSystem(s);
    const u = nextFloat(ref); expect(s.rng.hazards.s).toBe(ref.s);
    expect(s.run.fieldNextTick).toBe(t + Math.round(FIELD_INTERVAL * T * (1 + 0.2 * (2 * u - 1))));
  });
  it('spawns every 6 s +/- 20% for 60 s, then stops; clears at +72 s with +20 scrap, the drive boost and a win', () => {
    const s = at(); steady(s, ENCOUNTER_START * T + 1);
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
    const a = at(), b = at(); steady(a, ENCOUNTER_START * T + 1); steady(b, ENCOUNTER_START * T + 1); expect(a.run.encounter).toBe(Encounter.Fighting);
    b.run.encounter = Encounter.None;
    for (const x of [a, b]) { x.director.nextSpawnTick = 0; enterPhase(x, Phase.BuildUp); }
    expect((a.director.nextSpawnTick - a.tick) / (b.director.nextSpawnTick - b.tick)).toBeCloseTo(2, 2);
  });
  it('an early jump: no reward, the rocks left behind, the field clock stopped; endField sets the encounter over', () => {
    const s = at(); steady(s, (ENCOUNTER_START + 30) * T);
    const scrap0 = s.run.scrap; chargeJump(s); jumpShip(s, 0);
    expect([s.run.scrap - scrap0, s.run.driveBoost, s.telemetry.encountersWon, s.run.fieldNextTick, activeDebrisCount(s)]).toEqual([scrapPerJump(2), 0, 0, -1, 0]);
    const f = at(); steady(f, (ENCOUNTER_START + 5) * T); endField(f);
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
    expect([s.run.column, s.run.jumpPending]).toEqual([0, dest]);
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect([s.run.column, s.run.node, s.run.jumpPending]).toEqual([1, dest, -1]);
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
