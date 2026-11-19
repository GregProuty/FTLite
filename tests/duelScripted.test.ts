import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Seated } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import {
  AVOID_MARGIN, AVOID_TICKS, bfsPath, createScriptedPair, goalTiles, MISSILE_GAP, ORBIT_GAIN, ORBIT_MAX, ORBIT_MIN, predictAxes, SCRIPTED_PEW_GAP, scriptedInput, SPEED_SLACK
} from '../src/renderer/src/sim/duel/scripted';
import { Outcome, placeMissile, removeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { pewLead } from '../src/renderer/src/sim/tactical/pew';
import type { DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelInput } from '../src/renderer/src/sim/duel/step';
import { BELT_OUTER, R_MAP } from '../src/renderer/src/sim/tactical/tuning';
import { RCS_TURN_BOOST } from '../src/renderer/src/sim/tactical/tuning';

const layout = parseShip(cutter);

describe('the scripted pair (H-0c-ii-a spec §3)', () => {
  it('draws its orbit radius once per seed from its own stream, inside the band outside the belt and inside the edge', () => {
    expect(ORBIT_MIN).toBeGreaterThanOrEqual(BELT_OUTER + 200);
    expect(ORBIT_MAX).toBeLessThanOrEqual(R_MAP - 600);
    expect([AVOID_TICKS, AVOID_MARGIN, ORBIT_GAIN, SPEED_SLACK, MISSILE_GAP].every((v) => v > 0)).toBe(true);
    for (let seed = 1; seed <= 10; seed++) {
      const r = createScriptedPair(seed).orbitR;
      expect(r).toBeGreaterThanOrEqual(ORBIT_MIN); expect(r).toBeLessThanOrEqual(ORBIT_MAX);
      expect(createScriptedPair(seed).orbitR).toBe(r);
    }
    const d = createSeatedDuel(layout, 3), rng = d.tactical.rng.s;
    createScriptedPair(3);
    expect(d.tactical.rng.s).toBe(rng);   // never rng.tactical
    disposeDuel(d);
  });
  it('walks four-way through walkable tiles only, and measures the Cutter walks to each repair point', () => {
    const d = createSeatedDuel(layout, 1), st = d.interior, w = st.derived.width;
    const walk = (station: number, room: number): number[] => {
      const p = d.points.find((q) => q.tacticalRoom === room)!, path = bfsPath(d, st.derived.stationTile[station]!, goalTiles(d, p.room, p.tile))!;
      let at = st.derived.stationTile[station]!;
      for (const next of path) {
        expect(Math.abs((next % w) - (at % w)) + Math.abs(Math.floor(next / w) - Math.floor(at / w))).toBe(1);
        expect(st.derived.wallTile[next]).toBe(0);   // Engineering spike spec §5: door tiles are walkable whatever their state
        at = next;
      }
      return path;
    };
    expect([Room.Weapons, Room.Shields, Room.Engines].map((r) => walk(d.nav, r).length)).toEqual([21, 11, 28]);
    expect([Room.Weapons, Room.Shields, Room.Engines].map((r) => walk(d.weapons, r).length)).toEqual([0, 9, 5]);
    disposeDuel(d);
  });
  it('the Helm turns away from the planet and sets full throttle when its predicted path meets it', () => {
    const d = createSeatedDuel(layout, 1, 0, 2, ShipClass.Valkyrn), s = d.tactical.ships[0], pair = createScriptedPair(1);
    s.x = 0; s.y = -300; s.vx = 0; s.vy = 150; s.heading = 128;           // falling south onto the planet, nose south
    const input = scriptedInput(pair, d);
    expect(input.held[0]).toEqual({ moveX: 1, moveY: 0, interactHeld: false });   // dead astern of the away direction: clockwise
    expect(input.commands.filter((e) => e.id.player === 0).map((e) => e.command)).toEqual([{ kind: 'throttle', level: 3 }]);   // and full throttle: Engineering spike spec §10.2 (fallout a, Decision 16): the Engines cap at the start is 3 (was 4)
    disposeDuel(d);
  });
  it('the Cutter twin: the Helm answers the same hazard by holding W (throttleHeld), never a throttle command', () => {
    const d = createSeatedDuel(layout, 1), s = d.tactical.ships[0], pair = createScriptedPair(1);
    s.x = 0; s.y = -300; s.vx = 0; s.vy = 150; s.heading = 128;
    const input = scriptedInput(pair, d);
    expect(input.held[0]).toEqual({ moveX: 0, moveY: 0, interactHeld: false, aim: 0, throttleHeld: 1 });   // playtest2feedback §4a: it steers by the aim (north, away from the planet), never moveX
    expect(input.commands.filter((e) => e.id.player === 0 && e.command.kind === 'throttle')).toEqual([]);
    disposeDuel(d);
  });
  it('the nearest free character (the gunner, 5 tiles away) walks to an Engines repair, fixes it and sits again', () => {
    const d = createSeatedDuel(layout, 1), pair = createScriptedPair(1), ship = d.tactical.systems[0];
    ship.rooms[Room.Engines] = 1;
    let stood = -1, done = -1, sat = -1;
    for (let k = 0; k < 900 && sat < 0; k++) {
      const results = stepDuelTick(d, scriptedInput(pair, d));
      expect(results.every((r) => r.status === 'applied')).toBe(true);
      if (stood < 0 && Seated.station[d.interior.crew[1]!]! < 0) stood = d.interior.tick;
      if (done < 0 && d.events.some((e) => e.kind === 'repairDone')) done = d.interior.tick;
      if (done >= 0 && Seated.station[d.interior.crew[1]!] === d.weapons) sat = d.interior.tick;
      expect(Seated.station[d.interior.crew[0]!]).toBe(d.nav);              // the Helm stays at its console
    }
    expect(stood).toBe(1);
    expect(ship.rooms[Room.Engines]).toBe(0);
    expect(done).toBeGreaterThan(240);                                     // the walk, then 240 ticks of work
    expect(sat).toBeGreaterThan(done);
    expect(pair.task).toEqual([-1, -1]);
    disposeDuel(d);
  });
  it('plays a whole duel with every command admitted: never a weapon command away from Weapons, never a refused sit', () => {
    const d = createSeatedDuel(layout, 2), pair = createScriptedPair(2), kinds = new Set<string>();   // seed 2: one whose duel uses every kind (merge with the Engineering spike, kind b: seed 1 stopped sending laserLock; seed 3 stopped sitting and standing with W-1's pew and duel hull ×1.75, SIM_VERSION 54; seed 1 stopped sending laserLock with Feel-i's SHIELDS opener, SIM_VERSION 50; seed 5 stopped sitting and standing with homing torpedoes, SIM_VERSION 46; seed 4 stopped locking after the Hunter's grace)
    while (d.tactical.outcome === Outcome.Running) {
      const input = scriptedInput(pair, d);
      for (const e of input.commands) { kinds.add(e.command.kind); expect(e.requestedTick).toBe(d.interior.tick); }
      expect(stepDuelTick(d, input).every((r) => r.status === 'applied')).toBe(true);
    }
    expect([...kinds].sort()).toEqual(['helmPower', 'laserLock', 'sit', 'stand', 'torpLock', 'weaponPower']);   // FTL targeting spec §3: the gunner fires by targets; Engineering spike Decision 20 (kept at the merge, brief decision 2): it moves pew pew's bar to the beam, so no pewFire (W-1 gave the gunner pewFire: kind a, replaced rule); playtest2feedback: no throttle commands on the Cutter, and helmPower (the Task 8 gate's knob 0, the compressor bar to ENGINE)
    disposeDuel(d);
  });
});

describe("the Helm's hazard prediction flies the sim's turn boost (playtest2feedback §4a)", () => {
  it('on the Cutter, the next tick predicts with exactly the boost the step flew the held input with, and some far turns are boosted', () => {
    const d = createSeatedDuel(layout, 3), pair = createScriptedPair(3);
    let seated = 0, boosted = 0;
    for (let k = 0; k < 6000 && d.tactical.outcome === Outcome.Running; k++) {
      const atHelm = Seated.station[d.interior.crew[0]!]! === d.nav, input = scriptedInput(pair, d);
      stepDuelTick(d, input);
      if (!atHelm || Seated.station[d.interior.crew[0]!]! !== d.nav) continue;
      const flew = d.helmVent.boosted ? RCS_TURN_BOOST : 1, next = predictAxes(pair, d).turnBoost;
      expect(next).toBe(flew);   // only ever exactly 1 or RCS_TURN_BOOST
      seated++; if (flew === RCS_TURN_BOOST) boosted++;
    }
    expect(seated).toBeGreaterThan(1000);
    expect(boosted).toBeGreaterThan(0);
    disposeDuel(d);
  });
});

/** The fine aim of the one pewFire command in a tick's input, or −1 when there is none. */
function pewAimOf(input: DuelInput): number {
  const fires = input.commands.map((e) => e.command).filter((c) => c.kind === 'pewFire');
  expect(fires.length).toBeLessThanOrEqual(1);
  const c = fires[0];
  return c && c.kind === 'pewFire' ? c.aim * 256 + c.aimAcc : -1;
}

/** Merge with the Engineering spike (kind a): the gunner moves pew pew's bar to the beam (Decision 20), so its pew fires only
 *  where a test gives pew pew a bar. This one gives the crew the spare reactor bar on Weapons ([1, 1, 1], 3 bars). */
function givePewBar(d: DuelState): void { const sys = d.tactical.systems[0]; sys.bars[1] = 3; sys.weaponPower = [1, 1, 1]; }
/** A scripted pair that has made its one bar move already (so it keeps pew pew's bar). */
const movedPair = (seed: number) => ({ ...createScriptedPair(seed), barMoved: true });

describe("the scripted gunner's pew (W-1 pew pew spec §1; Task 6 review)", () => {
  /** A seated duel, the crew still with its nose on heading 0; the Hunter 200 ahead, and (when `torp`) the Hunter's torpedo
   *  150 out, 11° off the nose: both inside the cone and in range. */
  function setup(torp: boolean): DuelState {
    const d = createSeatedDuel(layout, 2), t = d.tactical, s = t.ships[0], e = t.ships[1];
    givePewBar(d);
    Object.assign(s, { vx: 0, vy: 0, heading: 0, headingAcc: 0 });
    Object.assign(e, { x: s.x + hx(0) * 200, y: s.y + hy(0) * 200, vx: 0, vy: 0 });
    if (torp) placeMissile(t, 1, { x: s.x + hx(8) * 150, y: s.y + hy(8) * 150, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    return d;
  }
  it("defence first: with the Hunter's torpedo and the Hunter both in the cone it shoots the torpedo, else the Hunter", () => {
    const d = setup(true), t = d.tactical;
    try {
      const torpLead = pewLead(t, 0, t.ships[0].x + hx(8) * 150, t.ships[0].y + hy(8) * 150, 0, 0), shipLead = pewLead(t, 0, t.ships[1].x, t.ships[1].y, 0, 0);
      expect(torpLead).toBeGreaterThanOrEqual(0); expect(shipLead).toBeGreaterThanOrEqual(0); expect(torpLead).not.toBe(shipLead);
      expect(pewAimOf(scriptedInput(movedPair(2), d))).toBe(torpLead);
      removeMissile(t, 1);
      expect(pewAimOf(scriptedInput(movedPair(2), d))).toBe(shipLead);
    } finally { disposeDuel(d); }
  });
  it('spaces its rounds by at least SCRIPTED_PEW_GAP ticks: in place, and over a whole duel', () => {
    const d = setup(false), pair = movedPair(2);
    try {
      expect(pewAimOf(scriptedInput(pair, d))).toBeGreaterThanOrEqual(0);
      expect(pewAimOf(scriptedInput(pair, d))).toBe(-1);   // the same tick again: inside the gap, though the charge holds two more thirds
    } finally { disposeDuel(d); }
    const gaps: number[] = [];
    for (const seed of [1, 2, 4]) {   // whole scripted duels: every pair of successive rounds (merge with the Engineering spike: the pew on a bar of its own, givePewBar)
      const run = createSeatedDuel(layout, seed), p = movedPair(seed);
      givePewBar(run);
      let last = -1;
      try {
        for (let k = 0; run.tactical.outcome === Outcome.Running; k++) {
          const input = scriptedInput(p, run);
          if (pewAimOf(input) >= 0) { if (last >= 0) gaps.push(k - last); last = k; }
          stepDuelTick(run, input);
        }
      } finally { disposeDuel(run); }
    }
    expect(gaps.length).toBeGreaterThan(10);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(SCRIPTED_PEW_GAP);
  }, 60_000);
});
