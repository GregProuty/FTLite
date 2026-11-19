// Feel-ii (spec 2026-11-18-feel-ii-design §1.1-§1.3, §1.6, §2.7, §2.8): the pure models. The collision warning and its tag
// time, the gravity rings' radii and SLINGSHOT, the held heading's marker, the status sentence's new priorities, the EVADE
// side, the enemy torpedo's path, the pings and their rate limit, and the dead-click reasons against the sim's own
// admission checks. Presentation only: none of it touches the sim's state.
import { describe, expect, it } from 'vitest';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { alertSentence, COLLISION_WARN_S, collisionIn, evadeDir, flightAlert, laserSituation, refusal, stateAxes } from '../src/renderer/src/render/duel/situationModel';
import { PING_GAP_MS, PING_S, PINGS_MAX, pingAllowed, pingDraws, pushPing, stepPings, type Ping } from '../src/renderer/src/render/duel/pingModel';
import { ARROW_MARGIN, collisionTag, gravityRadius, headingOf, tacticalModel, GRAVITY_RINGS } from '../src/renderer/src/render/tactical/tacticalModel';
import { STATUS_RESERVE } from '../src/renderer/src/render/duel/consoleLayout';
import { combatModel, TORPEDO_PATH_TICKS } from '../src/renderer/src/render/tactical/weaponsModel';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { initRocks } from '../src/renderer/src/sim/tactical/rocks';
import { predictFlight, predictMissile, predictPath } from '../src/renderer/src/sim/tactical/predict';
import { classOf, createTacticalState, missileOf, Outcome, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { canCharge, canLaunch } from '../src/renderer/src/sim/tactical/weapons';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { todaysCrewWeapons } from './helpers/crewWeapons';

const vp = { w: 1280, h: 720 };
/** Crew at rest far out, the enemy 2000 units north (out of every range), no asteroids. */
function open(seed = 5): TacticalState {
  const st = createTacticalState(seed), me = st.ships[0], e = st.ships[1];
  clearRocks(st);
  Object.assign(me, { x: 3000, y: 0, vx: 0, vy: 0, heading: 0 });
  Object.assign(e, { x: 3000, y: -2000, vx: 0, vy: 0 });
  return st;
}
const input = (st: TacticalState, console: 'helm' | 'weapons', extra: Record<string, unknown> = {}) => ({
  state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera: createCamera(st.ships[0].x, st.ships[0].y, 1), viewport: vp,
  console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 156, reserveLeft: 228, missilePrev: [null, null], fx: createFx(),
  infoBand: { left: 408, right: 1136 }, ...extra
}) as const;
/** An asteroid of radius r at (x, y), on the grid the contact check reads. */
function rock(st: TacticalState, x: number, y: number, r: number): void {
  st.map = { ...st.map, asteroids: [...st.map.asteroids, { x, y, r } as TacticalState['map']['asteroids'][number]] };
  st.grid = buildGrid(st.map.asteroids, st.map.rMap);
  st.rocks = initRocks(st.map);   // SPIKE (destructible asteroids): the live rock pool is what the sim and the models read
}
/** No asteroids (the map, its broad phase and the live rock pool). */
function clearRocks(st: TacticalState): void { st.map = { ...st.map, asteroids: [] }; st.grid = buildGrid([], st.map.rMap); st.rocks = initRocks(st.map); }

describe('the collision warning (Feel-ii §1.2)', () => {
  it('predictFlight is predictPath plus the contact: its point and tick, null when the path runs clear', () => {
    const st = createTacticalState(5), axes = { turn: 0, thrust: 1 };
    expect(predictFlight(st, 0, axes, 240, 4).points).toEqual(predictPath(st, 0, axes, 240, 4));
    const clear = open();
    expect(predictFlight(clear, 0, { turn: 0, thrust: 0 }, 120, 4).contact).toBeNull();
    const p = clear.map.planet, me = clear.ships[0];
    Object.assign(me, { x: p.x + p.r + 160, y: p.y, vx: -100, vy: 0 });   // drifting at the planet's surface, 160 units off
    const f = predictFlight(clear, 0, { turn: 0, thrust: 0 }, 240, 4);
    expect(f.contact).not.toBeNull();
    expect(f.points[f.points.length - 1]).toEqual({ x: f.contact!.x, y: f.contact!.y });
    const s = collisionIn(clear, { turn: 0, thrust: 0 }, 240)!;
    expect(s).toBeCloseTo(f.contact!.tick / 60, 9);
    expect(s).toBeGreaterThan(0.5); expect(s).toBeLessThan(2);
  });
  it('the map tags the contact `COLLISION 1.2s` with the path\'s own time, and an X at the point', () => {
    const st = open(), p = st.map.planet, me = st.ships[0];
    Object.assign(me, { x: p.x + p.r + 160, y: p.y, vx: -100, vy: 0 });
    const m = tacticalModel({ ...input(st, 'helm'), camera: createCamera(me.x, me.y, 1) });
    const co = m.helm!.collision!;
    expect(co.label.text).toBe(collisionTag(co.seconds));
    expect(collisionTag(2.14)).toBe('COLLISION 2.1s');
    expect(co.seconds).toBeCloseTo(collisionIn(st, { turn: 0, thrust: 0 }, 480)!, 9);
    expect(tacticalModel(input(open(), 'helm')).helm!.collision).toBeNull();
  });
  it('the status sentence leads with COLLISION under 2 s, then TORPEDO INBOUND, then the laser\'s words, on every seat', () => {
    const st = open(), p = st.map.planet, me = st.ships[0];
    expect(flightAlert(st, { turn: 0, thrust: 0 })).toBeNull();
    placeMissile(st, 1, { x: 3000, y: -1500, vx: 0, vy: 200, heading: 128, headingAcc: 0, age: 30 });
    expect(flightAlert(st, { turn: 0, thrust: 0 })).toEqual({ kind: 'torpedo' });
    Object.assign(me, { x: p.x + p.r + 160, y: p.y, vx: -100, vy: 0 });
    const a = flightAlert(st, { turn: 0, thrust: 0 });
    expect(a?.kind).toBe('collision');
    expect(alertSentence(a, laserSituation(st)).text).toBe('COLLISION: TURN OR BRAKE');
    expect(alertSentence({ kind: 'torpedo' }, laserSituation(st))).toEqual({ text: 'TORPEDO INBOUND: EVADE', tone: 'hot' });
    st.ships[1]!.x = me.x + 600; st.ships[1]!.y = me.y;   // Engineering spike §10.4: inside the 900 start range
    expect(alertSentence(null, laserSituation(st)).text).toBe('ENEMY OUT OF RANGE: CLOSE TO 450');
    // Both consoles draw the same sentence from the same alert.
    for (const c of ['helm', 'weapons'] as const) expect(combatModel({ ...input(st, c), alert: a }).status!.label.text).toBe('COLLISION: TURN OR BRAKE');
    // More than COLLISION_WARN_S away is no alert.
    Object.assign(me, { x: p.x + p.r + 600, y: p.y, vx: -100, vy: 0 });
    expect(collisionIn(st, { turn: 0, thrust: 0 })).toBeNull();
    expect(COLLISION_WARN_S).toBe(2);
    st.outcome = Outcome.CrewWins;
    expect(flightAlert(st, { turn: 0, thrust: 0 })).toBeNull();
  });
  it('stateAxes is the sim\'s axes from the state alone: the throttle and the held heading while the Helm is attended', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'throttle', level: 2 } }] });
      expect(stateAxes(d)).toEqual({ turn: 0, thrust: 0.5 });
      d.holdHeading = (d.tactical.ships[0].heading + 40) % 256;
      expect(stateAxes(d).turn).toBe(1);
      d.present[0] = false;
      expect(stateAxes(d)).toEqual({ turn: 0, thrust: 0 });
    } finally { disposeDuel(d); }
  });
});

describe('the gravity rings and SLINGSHOT (Feel-ii §1.3)', () => {
  it('sit where the planet\'s pull is half and all of the crew ship\'s full thrust, labelled G 0.5 and G 1, at the Helm only', () => {
    const st = createTacticalState(5), thrust = classOf(st, 0).thrust;
    for (const g of GRAVITY_RINGS) {
      const r = gravityRadius(g, thrust), [gx, gy] = gravityAccel(r, 0);
      expect(Math.hypot(gx, gy) / (g * thrust)).toBeCloseTo(1, 4);
    }
    expect(gravityRadius(0.5, thrust)).toBeGreaterThan(gravityRadius(1, thrust));
    const p = st.map.planet, at = { camera: createCamera(p.x, p.y, 0.5), gravity: true };
    const m = tacticalModel({ ...input(st, 'helm'), ...at });
    expect(m.gravity!.map((g) => g.label.text)).toEqual(['G 0.5', 'G 1']);
    expect(m.gravity![1]!.r).toBeCloseTo(gravityRadius(1, thrust) * 0.5, 6);
    expect(tacticalModel({ ...input(st, 'weapons'), ...at }).gravity).toBeUndefined();
    expect(tacticalModel({ ...input(st, 'helm'), camera: at.camera }).gravity).toBeUndefined();
  });
  it('SLINGSHOT shows on a fast pass inside G 1 with no collision, and not on a slow one or one that hits', () => {
    const st = createTacticalState(5), p = st.map.planet, me = st.ships[0], r1 = gravityRadius(1, classOf(st, 0).thrust);
    clearRocks(st);
    const pass = (speed: number, off: number) => {
      Object.assign(me, { x: p.x - 300, y: p.y - off, vx: speed, vy: 0, heading: 64 });
      return tacticalModel({ ...input(st, 'helm'), camera: createCamera(p.x, p.y, 0.3), gravity: true, t: 0 }).helm!;
    };
    const fast = pass(420, Math.min(r1 * 0.8, p.r + 80));
    expect(fast.collision).toBeNull();
    expect(fast.slingshot?.text).toBe('SLINGSHOT');
    expect(pass(120, Math.min(r1 * 0.8, p.r + 80)).slingshot ?? null).toBeNull();
    expect(pass(420, 0).slingshot ?? null).toBeNull();   // straight into the planet: a collision, no SLINGSHOT
  });
});

describe('the held heading on the map (Feel-ii §1.1)', () => {
  it('headingOf is the screen bearing in heading steps; the chevron sits on the bearing ring, the line from the nose', () => {
    expect([headingOf(0, -1), headingOf(1, 0), headingOf(0, 1), headingOf(-1, 0)]).toEqual([0, 64, 128, 192]);
    const st = open(), m = tacticalModel({ ...input(st, 'helm'), holdHeading: 64 });
    const hold = m.helm!.hold!, o = m.helm!.origin;
    expect(hold.to.x - o.x).toBeCloseTo(118, 6); expect(hold.to.y - o.y).toBeCloseTo(0, 6);
    expect(hold.chevron).toHaveLength(6);
    expect(tacticalModel({ ...input(st, 'helm'), holdHeading: -1 }).helm!.hold).toBeNull();
  });
});

describe('the off-screen arrows keep clear of the status sentence (Feel-ii visual check)', () => {
  it('an arrow on the top edge sits STATUS_RESERVE further down on a console', () => {
    const st = open();
    st.ships[1].y = -9000;   // far north: the enemy's arrow is on the top edge
    const top = (reserveTop?: number) => tacticalModel({ ...input(st, 'helm'), ...(reserveTop !== undefined ? { reserveTop } : {}) }).arrows.find((a) => a.target === 'enemy')!.y;
    expect(top()).toBe(ARROW_MARGIN);
    expect(top(STATUS_RESERVE)).toBe(STATUS_RESERVE + ARROW_MARGIN);
  });
});

describe('the inbound torpedo (Feel-ii §1.6)', () => {
  it('predictMissile flies the sim\'s missile on a copy, leaving the state untouched', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      placeMissile(d.tactical, 1, { x: d.tactical.ships[1].x, y: d.tactical.ships[1].y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
      const before = hashDuel(d), path = predictMissile(d.tactical, 1, 30, 1);
      expect(hashDuel(d)).toBe(before);
      expect(path).toHaveLength(30);
      for (let k = 0; k < 30; k++) stepDuelTick(d, { held: [], commands: [] });
      const m = missileOf(d.tactical, 1);
      if (m) expect(Math.hypot(path[29]!.x - m.x, path[29]!.y - m.y)).toBeLessThan(60);   // the ships moved meanwhile: close, not exact
      expect(predictMissile(createTacticalState(5), 1, 30, 1)).toEqual([]);
    } finally { disposeDuel(d); }
  });
  it('the EVADE side is perpendicular to the approach, toward more room; ties go right; the Helm alone draws it', () => {
    const st = open(), me = st.ships[0];
    placeMissile(st, 1, { x: me.x, y: me.y - 800, vx: 0, vy: 300, heading: 128, headingAcc: 0, age: 30 });   // coming down from the north
    expect(evadeDir(st)).toEqual({ x: -1, y: 0 });   // the approach's right (screen y down): west
    rock(st, me.x - 200, me.y, 40);                 // a rock to the west
    const dir = evadeDir(st)!;
    expect(dir.x).toBeCloseTo(1, 9); expect(dir.y).toBeCloseTo(0, 9);
    const helm = combatModel(input(st, 'helm')), weapons = combatModel(input(st, 'weapons'));
    expect(helm.evade!.label.text).toBe('EVADE');
    expect(helm.evade!.x).toBeGreaterThan(640);
    expect(weapons.evade).toBeNull();
    expect(helm.torpedoPath!.length).toBe(TORPEDO_PATH_TICKS / 4);
    expect(weapons.torpedoPath!.length).toBe(TORPEDO_PATH_TICKS / 4);
    expect(evadeDir(open())).toBeNull();
  });
});

describe('crew pings (Feel-ii §2.7)', () => {
  it('one a second a player, a newer ping replaces its own, at most PINGS_MAX, gone after PING_S', () => {
    expect([pingAllowed(null, 0), pingAllowed(0, PING_GAP_MS - 1), pingAllowed(0, PING_GAP_MS)]).toEqual([true, false, true]);
    const list: Ping[] = [];
    pushPing(list, { x: 1, y: 2, target: false, player: 0 });
    pushPing(list, { x: 3, y: 4, target: true, player: 1 });
    pushPing(list, { x: 5, y: 6, target: false, player: 0 });
    expect(list.map((p) => [p.player, p.x])).toEqual([[1, 3], [0, 5]]);
    for (let k = 2; k < 10; k++) pushPing(list, { x: k, y: 0, target: false, player: k });
    expect(list).toHaveLength(PINGS_MAX);
    stepPings(list, PING_S - 0.01); expect(list).toHaveLength(PINGS_MAX);
    stepPings(list, 0.02); expect(list).toEqual([]);
  });
  it('draws HERE at its point and TARGET on the enemy\'s drawn marker', () => {
    const toS = (x: number, y: number) => ({ x: x * 2, y: y * 2 });
    const d = pingDraws([{ x: 10, y: 20, target: false, player: 0, age: 0 }, { x: 0, y: 0, target: true, player: 1, age: 0.5 }], toS, { x: 400, y: 300 });
    expect(d.map((p) => [p.label.text, p.x, p.y])).toEqual([['HERE', 20, 40], ['TARGET', 400, 300]]);
    expect(d[1]!.r).toBeGreaterThan(d[0]!.r);
  });
});

describe('never a dead click (Feel-ii §2.8): the reasons are the sim\'s own checks', () => {
  it('FIRE: NO GUNNER, TORPEDO FLYING (canCharge), WEAPONS OFFLINE; LAUNCH: canLaunch\'s order; the Helm: ENGINES OFFLINE', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      const t = d.tactical, sys = t.systems[0], me = t.ships[0], e = t.ships[1];
      todaysCrewWeapons(t);   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
      Object.assign(e, { x: me.x + 2000, y: me.y });
      expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual([null, 'OUT OF RANGE']);
      Object.assign(e, { x: me.x + 200, y: me.y });
      expect(refusal(d, 'launch')).toBeNull();
      expect(canLaunch(t, 0)).toBe(true);
      sys.magazine = 0; expect(refusal(d, 'launch')).toBe('NO TORPEDOES'); sys.magazine = 2;
      sys.weaponPower.fill(0); expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual(['WEAPONS OFFLINE', 'WEAPONS OFFLINE']); sys.weaponPower.splice(0, 3, 0, 2, 1);   // Engineering spike §10.3: the beam and the torpedo dark (then todaysCrewWeapons' bars back)
      placeMissile(t, 0, { x: me.x, y: me.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
      expect([refusal(d, 'fire'), refusal(d, 'launch'), canCharge(t, 0)]).toEqual(['TORPEDO FLYING', 'TORPEDO FLYING', false]);
      d.present[1] = false;
      expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual(['NO GUNNER', 'NO GUNNER']);
      expect(refusal(d, 'turn')).toBeNull();
      sys.rooms[Room.Engines] = 2;
      expect(['turn', 'auto-face', 'throttle', 'heading'].map((c) => refusal(d, c as 'turn'))).toEqual(Array(4).fill('ENGINES OFFLINE'));
    } finally { disposeDuel(d); }
  });
  it('Engineering spike §10.2 (final review): the Helm reads the Engines bars: 0 bars is ENGINES UNPOWERED, a level-2 Room ENGINES OFFLINE', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const sys = d.tactical.systems[0];
      expect(refusal(d, 'turn')).toBeNull();
      sys.bars[DuelSystem.Engines] = 0;   // no bar (an overheat failure clamps the bars to 0 the same way)
      expect(['turn', 'auto-face', 'throttle', 'heading'].map((c) => refusal(d, c as 'turn'))).toEqual(Array(4).fill('ENGINES UNPOWERED'));
      sys.rooms[Room.Engines] = 2;
      expect(refusal(d, 'turn')).toBe('ENGINES OFFLINE');
      sys.bars[DuelSystem.Engines] = 3; sys.rooms[Room.Engines] = 1;   // damaged but flying (5 - 3 slots: 2 effective bars)
      expect(refusal(d, 'turn')).toBeNull();
    } finally { disposeDuel(d); }
  });
  it('LAUNCH is refused exactly when canLaunch says no, over many states', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const t = d.tactical, sys = t.systems[0], me = t.ships[0], e = t.ships[1];
      for (let k = 0; k < 64; k++) {
        sys.magazine = k % 3; sys.rooms[Room.Weapons] = (k >> 2) % 3; Object.assign(e, { x: me.x + ((k >> 4) % 2 ? 200 : 900), y: me.y });
        if ((k >> 5) % 2) placeMissile(t, 0, { x: me.x, y: me.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
        else for (const m of t.missiles) if (m.owner === 0) m.active = false;
        expect(refusal(d, 'launch') === null, `k ${k}`).toBe(canLaunch(t, 0));
        expect(refusal(d, 'fire') === 'TORPEDO FLYING', `k ${k}`).toBe(!canCharge(t, 0));
      }
    } finally { disposeDuel(d); }
  });
});
