import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Seated } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import {
  AVOID_MARGIN, AVOID_TICKS, bfsPath, createScriptedPair, goalTiles, MISSILE_GAP, ORBIT_GAIN, ORBIT_MAX, ORBIT_MIN, scriptedInput, SPEED_SLACK
} from '../src/renderer/src/sim/duel/scripted';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { BELT_OUTER, R_MAP } from '../src/renderer/src/sim/tactical/tuning';

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
    const d = createSeatedDuel(layout, 1), s = d.tactical.ships[0], pair = createScriptedPair(1);
    s.x = 0; s.y = -300; s.vx = 0; s.vy = 150; s.heading = 128;           // falling south onto the planet, nose south
    const input = scriptedInput(pair, d);
    expect(input.held[0]).toEqual({ moveX: 1, moveY: 0, interactHeld: false });   // dead astern of the away direction: clockwise
    expect(input.commands.filter((e) => e.id.player === 0).map((e) => e.command)).toEqual([{ kind: 'throttle', level: 3 }]);   // and full throttle: Engineering spike spec §10.2 (fallout a, Decision 16): the Engines cap at the start is 3 (was 4)
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
    const d = createSeatedDuel(layout, 3), pair = createScriptedPair(3), kinds = new Set<string>();   // seed 3: one whose duel uses every kind (seed 1 stopped sending laserLock with Feel-i's SHIELDS opener, SIM_VERSION 50; seed 5 stopped sitting and standing with homing torpedoes, SIM_VERSION 46; seed 4 stopped locking after the Hunter's grace)
    while (d.tactical.outcome === Outcome.Running) {
      const input = scriptedInput(pair, d);
      for (const e of input.commands) { kinds.add(e.command.kind); expect(e.requestedTick).toBe(d.interior.tick); }
      expect(stepDuelTick(d, input).every((r) => r.status === 'applied')).toBe(true);
    }
    expect([...kinds].sort()).toEqual(['laserLock', 'sit', 'stand', 'throttle', 'torpLock']);   // FTL targeting spec §3: the gunner fires by targets
    disposeDuel(d);
  });
});
