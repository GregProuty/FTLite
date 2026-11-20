// W-4 spec §13.4: the Hunter's own play is unchanged by W-4. A duel against a crew parked still at its spawn (its body
// written every tick, nobody at its consoles), on the Valkyrn class (W-4 leaves it bit-identical by its fences), hashed
// per tick on the Hunter's body, weapons and brain and on the crew ship's hull, shields and rooms only, so the new crew
// fields cannot reach the digest. The digests were recorded on the branch at W4_BASE (master's code, SIM V); re-recorded on master d2eb6377
// (SIM 62, after Asteroids-iii's rocks) at the W-4 merge, where the merged tree gives the same three.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { createTacticalState, Outcome } from '../src/renderer/src/sim/tactical/state';
import { UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';

const TICKS = 3000;
const DIGESTS: Readonly<Record<number, string>> = { 1: '3000:d28638b2cc4b604d', 2: '3000:bc99f85ea5a8593e', 3: '3000:d9324c2a0c606026' };

function run(seed: number): string {
  const st = createTacticalState(seed, 2, ShipClass.Valkyrn), h = createHash('sha256'), c = st.ships[0]!;
  const home = { x: c.x, y: c.y, heading: c.heading };
  for (let k = 0; k < TICKS && st.outcome === Outcome.Running; k++) {
    Object.assign(c, { x: home.x, y: home.y, vx: 0, vy: 0, heading: home.heading, headingAcc: 0 });
    stepDuel(st, UNCREWED_INPUT);
    const e = st.ships[1]!, s = st.systems[1]!, b = st.hunter, crew = st.systems[0]!;
    h.update(Buffer.from(Float64Array.from([
      e.x, e.y, e.vx, e.vy, e.heading, e.headingAcc, Number(e.active),
      s.hull, s.shields, s.shieldClock, s.laserCharge, s.laserHold, s.laserBurst, s.lock, s.pewCharge, s.magazine, s.magazineClock, s.shots, s.laserHits, s.pewShots, s.pewHits, s.missilesLaunched, s.missileHits,
      b.mode, b.room, b.timer, Number(b.working), b.fireAt, b.lastLaunch, b.pewBurst, b.pewClock,
      crew.hull, crew.shields, ...crew.rooms
    ]).buffer));
    h.update(JSON.stringify(st.events.filter((v) => 'ship' in v && v.ship === 1)));
  }
  return `${st.tick}:${h.digest('hex').slice(0, 16)}`;
}

describe("the Hunter's own play is unchanged by W-4 (W-4 spec §13.4)", () => {
  for (const seed of [1, 2, 3]) it(`seed ${seed}: the per-tick digest recorded at SIM V`, () => {
    expect(run(seed)).toBe(DIGESTS[seed]);
  }, 60_000);
});
