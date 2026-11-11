import { describe, it, expect } from 'vitest';
import { generateMap, reachable, jumpShip, nodeLabel } from '../src/renderer/src/sim/run';
import { deriveStreams } from '../src/renderer/src/sim/state';
import { Phase } from '../src/renderer/src/sim/director';
import { EndReason, downCrew } from '../src/renderer/src/sim/crew';
import { Health, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { failStation } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, DT, RUN_COLUMNS, EDGE_CHANCE, JUMP_CHARGE_TIME, ENCOUNTER_AFTER_JUMP, BOARDING_AFTER_JUMP, DEBRIS_SLOTS, HULL_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, intents, teleport, placeDebris, placeShot, placeEnemy, placeBoarder, chargeJump, seatNavigator, setMap, room, setSkill } from './helpers/sim';
import { Skill } from '../src/renderer/src/sim/skills';

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
  it('createSimState draws the map from the map stream exactly as the section 5 replay does, leaves the other streams as before, and is seed-deterministic', () => {
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
    const r = calm(); seatNavigator(r, 0); run(r, 1); run(r, JUMP_CHARGE_TIME * T - 2, () => intents({}, {}));   // 1 + 3598 = 3599 ticks so far: charge just under 1
    expect(r.run.jumpCharge).toBeLessThan(1);
    run(r, 1, () => intents({ confirmPressed: true }, {}));                              // tick 3600 reaches 1 (jumpStep runs first) and the edge jumps
    expect(r.run.nodesReached).toBe(1); expect(r.run.jumpCharge).toBe(0);
    run(r, 1); expect(r.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
  });
  it('reachable, cycling with wrap, Left/Right ignored, Confirm before ready does nothing, a held Confirm does not jump at readiness, stick edge before Confirm, the seating Confirm never jumps', () => {
    const MAP = { '0:0': 0b101, '1:0': 1, '1:1': 1, '1:2': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 };
    const s = calm(); setMap(s, [1, 3, 2, 2, 2, 2, 2, 1], MAP);
    expect(reachable(s)).toEqual([0, 2]);
    const reachableBefore = reachable(s);
    const n = seatNavigator(s, 0); run(s, 1);
    const d0 = s.rng.director.s;
    run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(1);
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(0);           // wraps
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: -1 }, {})); expect(s.stations.cursor[n]).toBe(1);          // Up wraps the other way
    run(s, 1, () => intents({ moveX: 1 }, {})); run(s, 1, () => intents({ moveX: -1 }, {})); expect(s.stations.cursor[n]).toBe(1);
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.nodesReached).toBe(0); expect(s.rng.director.s).toBe(d0);   // not ready
    chargeJump(s); run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.run.nodesReached).toBe(1); expect(s.run.column).toBe(1); expect(s.run.node).toBe(reachableBefore[1]); expect(s.run.node).toBe(2); expect(s.stations.cursor[n]).toBe(0);   // cursor 1 -> destination 2
    const h = calm(); setMap(h, [1, 3, 2, 2, 2, 2, 2, 1], MAP);
    seatNavigator(h, 0); run(h, 1); h.run.jumpCharge = 1 - 1.5 * DT / JUMP_CHARGE_TIME;
    run(h, 3, () => intents({}, {}));                                                    // neutral intents: the dispatch only sends Confirm edges, and none is sent while the charge becomes ready
    expect(h.run.nodesReached).toBe(0); expect(h.run.jumpCharge).toBe(1);
    run(h, 1, () => intents({ confirmPressed: true }, {})); expect(h.run.nodesReached).toBe(1);
    const e = calm(); setMap(e, [1, 3, 2, 2, 2, 2, 2, 1], MAP);
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
  it('clears the encounter and keeps the ship: objects gone, cursors -1, scanning 0, enemy withdrawn (not destroyed) and re-armed, boarder kept, director in Build Up with stress kept, everything else untouched; two director draws with the enemy present, one without', () => {
    const { s, nav, sci, A } = loaded();
    const tick = s.tick, before = { stress: s.director.stress, boarderRoom: s.boarders.room[0], boarderHealth: s.boarders.health[0], boarderMove: s.boarders.nextMoveTick[0], boardArrival: s.boarders.nextArrivalTick, xp: s.skills.xp[Skill.Repair], hull: s.hull, h1: Health.cur[s.crew[1]!], charge: s.weapons.charge, loaded: s.weapons.torpedoLoaded, selector: s.weapons.selector, fire: s.rooms.fire[A], breach: s.breaches.active[6], failed: s.stations.failed[s.derived.stationOfKind[StationKind.Doors]!] };
    const dr = createRng(s.rng.director.s); nextFloat(dr); nextFloat(dr); const h0 = s.rng.hazards.s, c0 = s.rng.combat.s, m0 = s.rng.map.s;
    const reachableBefore = reachable(s);
    jumpShip(s);
    expect([s.run.column, s.run.nodesReached, s.run.jumpCharge, s.telemetry.jumps]).toEqual([1, 1, 0, 1]); expect(s.run.node).toBe(reachableBefore[0]); expect(s.stations.cursor[nav]).toBe(0);
    expect(Array.from(s.debris.active)).toEqual(new Array(DEBRIS_SLOTS).fill(0)); expect(s.stations.cursor[s.derived.stationOfKind[StationKind.Weapons]!]).toBe(-1); expect(s.stations.cursor[sci]).toBe(-1); expect(s.science.scanning).toBe(0);
    expect([s.enemy.present, s.telemetry.enemiesDestroyed, s.enemy.nextArrivalTick]).toEqual([0, 0, tick + ENCOUNTER_AFTER_JUMP * T]);
    expect([s.boarders.active[0], s.boarders.room[0], s.boarders.health[0], s.boarders.nextMoveTick[0], s.boarders.nextArrivalTick]).toEqual([1, before.boarderRoom, before.boarderHealth, before.boarderMove, before.boardArrival]);
    expect([s.director.phase, s.director.phaseTick, s.director.stress]).toEqual([Phase.BuildUp, tick, before.stress]);
    expect([s.hull, Health.cur[s.crew[1]!], s.skills.xp[Skill.Repair], s.weapons.charge, s.weapons.torpedoLoaded, s.weapons.selector, s.rooms.fire[A], s.breaches.active[6], s.stations.failed[s.derived.stationOfKind[StationKind.Doors]!]]).toEqual([before.hull, before.h1, before.xp, before.charge, before.loaded, before.selector, before.fire, before.breach, before.failed]);
    expect(Seated.station[s.crew[0]!]).toBe(nav); expect(Seated.station[s.crew[1]!]).toBe(sci);
    expect(s.rng.director.s).toBe(dr.s); expect([s.rng.hazards.s, s.rng.combat.s, s.rng.map.s]).toEqual([h0, c0, m0]);
    const q = calm(2); const d1 = createRng(q.rng.director.s); nextFloat(d1); q.run.jumpCharge = 1; const t1 = q.tick;
    jumpShip(q); expect(q.rng.director.s).toBe(d1.s); expect(q.boarders.nextArrivalTick).toBe(t1 + BOARDING_AFTER_JUMP * T);
    const sc = calm(2); const k = placeDebris(sc, room(sc, 'A'), 600, 1); const c2 = sc.derived.stationOfKind[StationKind.Science]!; sitDown(sc, 1, c2); sc.stations.cursor[c2] = k; sc.science.scanning = 1; sc.run.jumpCharge = 1;
    jumpShip(sc); expect(sc.science.scanning).toBe(0);                                  // no enemy: scanning still cleared
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
    const before = snap(); s.run.jumpCharge = 1; jumpShip(s); expect(snap()).toBe(before);
  });
  it('victory: from column 6 (nodesReached 6, jumps 6) a jump gives column 7, both counters 7, ended, Victory; crewSystem does not overwrite it; the next step is a no-op', () => {
    const s = calm(2); s.run.column = 6; s.run.node = 0; s.run.nodesReached = 6; s.telemetry.jumps = 6; s.run.jumpCharge = 1;
    jumpShip(s);
    expect([s.run.column, s.run.nodesReached, s.telemetry.jumps, s.ended, s.endReason]).toEqual([7, 7, 7, 1, EndReason.Victory]);
    const p = calm(2); p.run.column = 6; p.run.node = 0; p.run.nodesReached = 6; p.telemetry.jumps = 6; chargeJump(p);
    seatNavigator(p, 0); run(p, 1); teleport(p, 1, 2.5, 2.5); Health.cur[p.crew[0]!] = 0.05; placeBoarder(p, room(p, 'A'));   // a boarder in A will down the navigator later this tick
    run(p, 1, () => intents({ confirmPressed: true }, {}));
    expect(p.endReason).toBe(EndReason.Victory); expect(p.ended).toBe(1); expect(Life.state[p.crew[0]!]).toBe(LifeState.Downed); expect(p.telemetry.firstDownTick).toBe(p.tick - 1);
    const h = calm(2); h.run.column = 6; h.run.nodesReached = 6; h.telemetry.jumps = 6; chargeJump(h); seatNavigator(h, 0); run(h, 1); h.hull = 0;   // hull already 0 when the jump tick runs
    run(h, 1, () => intents({ confirmPressed: true }, {})); expect(h.endReason).toBe(EndReason.Victory);
    const t = h.tick; run(h, 3); expect(h.tick).toBe(t);
    void HULL_MAX;
  });
});
