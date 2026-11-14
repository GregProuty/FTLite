import { describe, it, expect } from 'vitest';
import { cutterState, teleport, quiet, chargeJump } from './helpers/sim';
import { interactTarget, TargetKind } from '../src/renderer/src/sim/interact';
import { Position } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { downCrew } from '../src/renderer/src/sim/crew';
import { jumpShip, reachable } from '../src/renderer/src/sim/run';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { botIntent } from './helpers/bot';
import { CARRY_SPEED_MULT } from '../src/renderer/src/sim/tuning';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation, repairStation, shiftBar } from '../src/renderer/src/sim/power';
import { Seated } from '../src/renderer/src/sim/components';
import { DT, TORP_LOAD_TIME, TORP_REGEN_TIME, TORP_START, TORP_CAP } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, seconds, overdrive } from './helpers/sim';

const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;

describe('torpedo loading', () => {
  it('loads only while seated and online with stock and an empty tube; completion moves one from stock to the tube', () => {
    const s = makeState(1), i = wpn(s);
    s.director.nextSpawnTick = 1e9;
    expect(s.weapons.torpedoStock).toBe(TORP_START);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // nobody seated
    sitDown(s, 0, i);                                                           // starter level 2: output 0.5
    run(s, 1);
    expect(s.weapons.torpedoLoad).toBeCloseTo(DT * 0.5 / TORP_LOAD_TIME);
    run(s, seconds(TORP_LOAD_TIME / 0.5) + 2);                                  // 20 s
    expect(s.weapons.torpedoLoaded).toBe(1); expect(s.weapons.torpedoStock).toBe(TORP_START - 1); expect(s.weapons.torpedoLoad).toBe(0);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // tube full: no second load
    s.weapons.torpedoLoaded = 0; s.weapons.torpedoStock = 0;
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // no stock
  });
  it('standing or failing mid-load keeps progress and stock; a loaded torpedo survives both; level 1 and overdrive load in 40 s and 10 s', () => {
    const s = makeState(2), i = wpn(s);
    s.director.nextSpawnTick = 1e9; sitDown(s, 0, i);
    run(s, seconds(5));
    run(s, 1, () => intents({ cancelPressed: true }, {}));                       // loadTorpedo precedes the stand: this tick still loads once
    const partial = s.weapons.torpedoLoad; expect(partial).toBeGreaterThan(0);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(partial); expect(s.weapons.torpedoStock).toBe(TORP_START);
    sitDown(s, 0, i); failStation(s, i); run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(partial); expect(Seated.station[s.crew[0]!]).toBe(-1);
    repairStation(s, i); shiftBar(s, i, 1); shiftBar(s, i, 1);                 // back online at level 2 (the pool had 1 + 2 returned bars)
    s.weapons.torpedoLoaded = 1; sitDown(s, 0, i);
    run(s, 1, () => intents({ cancelPressed: true }, {})); failStation(s, i);
    expect(s.weapons.torpedoLoaded).toBe(1);
    const a = makeState(1), ia = wpn(a); a.director.nextSpawnTick = 1e9; a.stations.level[ia] = 1; sitDown(a, 0, ia);
    run(a, seconds(40) - 2); expect(a.weapons.torpedoLoaded).toBe(0);           // level 1 (output 0.25): 40 s
    run(a, 4); expect(a.weapons.torpedoLoaded).toBe(1);
    const b = makeState(1), ib = overdrive(b, StationKind.Weapons); b.director.nextSpawnTick = 1e9; b.stations.coolant[ib] = 2; sitDown(b, 0, ib);   // two units hold the overdrive (unassisted it would overheat on tick 595)
    run(b, seconds(10) + 2); expect(b.weapons.torpedoLoaded).toBe(1);
    run(a, seconds(39)); expect(a.weapons.torpedoLoaded).toBe(1); expect(a.weapons.torpedoLoad).toBe(0);   // tube full: nothing loads until it is fired
  });
});

describe('torpedo regeneration', () => {
  it('adds one unit every TORP_REGEN_TIME s while Weapons is online, seated or not; holds at the cap; pauses offline', () => {
    const s = makeState(1), i = wpn(s);
    s.director.nextSpawnTick = 1e9;
    run(s, 1);
    expect(s.weapons.torpedoRegen).toBeCloseTo(DT / TORP_REGEN_TIME);
    run(s, seconds(TORP_REGEN_TIME) + 1);
    expect(s.weapons.torpedoStock).toBe(TORP_START + 1); expect(s.weapons.torpedoRegen).toBeLessThan(0.01);
    s.weapons.torpedoStock = TORP_CAP; s.weapons.torpedoRegen = 0.5;
    run(s, 60);
    expect(s.weapons.torpedoStock).toBe(TORP_CAP); expect(s.weapons.torpedoRegen).toBe(0.5);   // holds at the cap
    s.weapons.torpedoStock = 2; failStation(s, i);
    run(s, 60);
    expect(s.weapons.torpedoRegen).toBe(0.5);                                   // offline: paused
  });
});

describe('carried torpedoes (spec Coop-ii section 2, amendments D4-D5)', () => {
  type S = ReturnType<typeof cutterState>;
  const mag = (s: S): [number, number] => { const t = s.derived.magazineTile, w = s.derived.width; return [t % w + 0.5, Math.floor(t / w) + 0.5]; };
  const atMagazine = (s: S, pid: number) => { const [x, y] = mag(s); teleport(s, pid, x, y); };
  const atWeapons = (s: S, pid: number) => { const t = s.derived.stationTile[wpn(s)]!, w = s.derived.width; teleport(s, pid, t % w - 0.5, Math.floor(t / w) + 0.5); };   // the floor tile west of the console, inside Weapons
  const calm = () => { const s = cutterState(1, 2); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; return s; };
  it('on a magazine ship a seated, online gunner with stock never loads the tube by itself', () => {
    const s = calm(); sitDown(s, 1, wpn(s)); run(s, seconds(30));
    expect([s.weapons.torpedoLoaded, s.weapons.torpedoLoad, s.weapons.torpedoStock, s.weapons.torpedoFed]).toEqual([0, 0, TORP_START, 0]);
  });
  it('Interact at the magazine takes one from stock; a carrier cannot take a second; an empty magazine gives nothing', () => {
    const s = calm(); atMagazine(s, 0);
    expect(interactTarget(s, 0).kind).toBe(TargetKind.Pickup);
    run(s, 1, () => intents({ interactHeld: true }, {}));
    expect([s.weapons.torpedoStock, s.carrying[0]]).toEqual([TORP_START - 1, 1]);
    run(s, 30, () => intents({ interactHeld: true }, {}));
    expect([s.weapons.torpedoStock, s.carrying[0]]).toEqual([TORP_START - 1, 1]);
    const e = calm(); e.weapons.torpedoStock = 0; atMagazine(e, 0);
    expect(interactTarget(e, 0).kind).toBe(TargetKind.None);
    run(e, 5, () => intents({ interactHeld: true }, {})); expect(e.carrying[0]).toBe(0);
  });
  it('a carrier moves at CARRY_SPEED_MULT and cannot fight fires or repair', () => {
    const a = makeState(1), b = makeState(1); quiet(a); quiet(b); b.carrying[0] = 1;
    for (const s of [a, b]) teleport(s, 0, 1.5, 2.5);
    run(a, 20, () => intents({ moveX: 1 })); run(b, 20, () => intents({ moveX: 1 }));
    const da = Position.x[a.crew[0]!]! - 1.5, db = Position.x[b.crew[0]!]! - 1.5;
    expect(CARRY_SPEED_MULT).toBe(0.8); expect(db / da).toBeCloseTo(CARRY_SPEED_MULT, 9);
    const f = makeState(1); quiet(f); f.carrying[0] = 1; teleport(f, 0, 2.5, 2.5); igniteRoom(f, f.derived.roomOfTile[2 * f.derived.width + 2]!);
    expect(interactTarget(f, 0).kind).toBe(TargetKind.None);
    const p = makeState(1); quiet(p); failStation(p, wpn(p)); const t = p.derived.stationTile[wpn(p)]!; teleport(p, 0, t % p.derived.width + 0.5, Math.floor(t / p.derived.width) + 0.5);
    expect(interactTarget(p, 0).kind).toBe(TargetKind.Power); p.carrying[0] = 1; expect(interactTarget(p, 0).kind).toBe(TargetKind.None);
  });
  it('delivery at the Weapons console to an empty, idle tube starts the existing load timer; the stock was spent at the pickup', () => {
    const s = calm(); s.carrying[0] = 1; s.weapons.torpedoStock = 2; atWeapons(s, 0); sitDown(s, 1, wpn(s));
    expect(interactTarget(s, 0).kind).toBe(TargetKind.Deliver);
    run(s, 1, () => intents({ interactHeld: true }, {}));
    expect([s.carrying[0], s.weapons.torpedoFed, s.weapons.torpedoStock]).toEqual([0, 1, 2]);
    const out = stationOutput(s, wpn(s));
    run(s, seconds(TORP_LOAD_TIME / out) + 2);
    expect([s.weapons.torpedoLoaded, s.weapons.torpedoFed, s.weapons.torpedoLoad, s.weapons.torpedoStock]).toEqual([1, 0, 0, 2]);
  });
  it('no delivery while the tube is loaded or a delivered torpedo is loading', () => {
    const s = calm(); s.carrying[0] = 1; s.weapons.torpedoLoaded = 1; atWeapons(s, 0);
    run(s, 5, () => intents({ interactHeld: true }, {})); expect([s.carrying[0], s.weapons.torpedoFed]).toEqual([1, 0]);
    const t = calm(); t.carrying[0] = 1; t.weapons.torpedoFed = 1; atWeapons(t, 0);
    run(t, 5, () => intents({ interactHeld: true }, {})); expect(t.carrying[0]).toBe(1);
  });
  it('a downed carrier returns the torpedo to stock; at the cap it is lost and the drop is stamped', () => {
    const s = calm(); s.carrying[0] = 1; s.weapons.torpedoStock = 2; downCrew(s, 0);
    expect([s.carrying[0], s.weapons.torpedoStock, s.weapons.torpedoDropTick]).toEqual([0, 3, -1]);
    const c = calm(); run(c, 10); c.carrying[0] = 1; c.weapons.torpedoStock = TORP_CAP; downCrew(c, 0);
    expect([c.carrying[0], c.weapons.torpedoStock, c.weapons.torpedoDropTick]).toEqual([0, TORP_CAP, c.tick]);
  });
  it('a jump keeps the torpedo in hand; stock regenerates as today', () => {
    const s = calm(); s.carrying[0] = 1; chargeJump(s); jumpShip(s, reachable(s)[0]!); expect(s.carrying[0]).toBe(1);
    const r = calm(); r.weapons.torpedoStock = 1; run(r, seconds(TORP_REGEN_TIME) + 1); expect(r.weapons.torpedoStock).toBe(2);
  });
  it('the starter has no magazine: nothing to pick up, and the tube loads by itself as today', () => {
    const s = makeState(1); quiet(s); expect(s.derived.magazineTile).toBe(-1); sitDown(s, 0, wpn(s)); run(s, seconds(TORP_LOAD_TIME / 0.5) + 2);
    expect([s.weapons.torpedoLoaded, s.weapons.torpedoStock]).toEqual([1, TORP_START - 1]);
  });
  it('bots never pick up a torpedo', () => {
    const s = calm(); atMagazine(s, 1); run(s, 120, () => [intents({})[0]!, botIntent(s, 1)]);
    expect([s.carrying[1], s.weapons.torpedoStock]).toEqual([0, TORP_START]);
  });
});
